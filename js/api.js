/* ==========================================================================
   SSV GYM — API SERVICE LAYER                                        v1.3.0
   All communication with the Google Apps Script backend and Cloudinary goes
   through this file. Visitors read content and send enquiries, reviews and
   likes. Everything else needs the admin session token that the backend
   issues after checking the password.
   ========================================================================== */
const API = (() => {
  const CONTENT_KEY = 'ssv_content_v2';
  const TOKEN_KEY = 'ssv_admin_token';
  const COLLECTIONS = ['facilities', 'plans', 'trainers', 'gallery', 'reviews', 'announcements'];
  const PUBLIC_ACTIONS = ['submitEnquiry', 'submitReview', 'likeReview', 'login'];   // sent without the admin token
  let memo = null;
  try { localStorage.removeItem('ssv_content_v1'); } catch { /* copy saved by older versions */ }

  class ApiError extends Error {
    constructor(message, code = 'ERROR') { super(message); this.name = 'ApiError'; this.code = code; }
  }

  const isConfigured = () => Boolean(CONFIG.API_URL) && !/^YOUR_/i.test(String(CONFIG.API_URL).trim());

  /* ---------- admin session token (kept for this browser tab only) ---------- */
  const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = token => {
    try { token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  };

  /* ---------- low-level request ---------- */
  async function request(method, action, payload = {}) {
    if (!isConfigured()) throw new ApiError('API_URL is not set in js/config.js.', 'NOT_CONFIGURED');
    const ctrl = new AbortController();
    const base = CONFIG.REQUEST_TIMEOUT_MS || 10000;
    // Visitors fall back quickly. Other calls wait longer: Apps Script can take several
    // seconds to start, and photo calls also wait for Cloudinary.
    const timer = setTimeout(() => ctrl.abort(), method === 'GET' ? base : Math.max(base, 45000));
    try {
      const auth = PUBLIC_ACTIONS.includes(action) ? {} : { token: getToken() };
      const res = method === 'GET'
        ? await fetch(`${CONFIG.API_URL}?${new URLSearchParams({ ...payload, action })}`, { signal: ctrl.signal })
        // text/plain keeps this a "simple" CORS request (no preflight), which Apps Script needs.
        : await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ ...payload, action, ...auth }),
            signal: ctrl.signal
          });
      if (!res.ok) throw new ApiError(`Server responded with ${res.status}.`, `HTTP_${res.status}`);
      const json = await res.json().catch(() => { throw new ApiError('Unexpected response from the server.', 'BAD_RESPONSE'); });
      if (!json.ok) throw new ApiError(json.error || 'Request failed.', json.code || 'ERROR');
      return json.data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err.name === 'AbortError') throw new ApiError('The server took too long to respond.', 'TIMEOUT');
      throw new ApiError('Could not reach the server. Check the connection and try again.', 'NETWORK');
    } finally {
      clearTimeout(timer);
    }
  }

  /* Fire-and-forget request that still goes out while the page is closing. */
  function beacon(action, payload = {}) {
    if (!isConfigured() || !navigator.sendBeacon) return false;
    try {
      const body = new Blob([JSON.stringify({ ...payload, action, token: getToken() })], { type: 'text/plain;charset=utf-8' });
      return navigator.sendBeacon(CONFIG.API_URL, body);
    } catch { return false; }
  }

  /* ---------- website content ---------- */
  const ttl = () => (CONFIG.CACHE_MINUTES ?? 5) * 60000;
  const readCache = () => { try { return JSON.parse(localStorage.getItem(CONTENT_KEY)); } catch { return null; } };
  const writeCache = data => { try { localStorage.setItem(CONTENT_KEY, JSON.stringify({ t: Date.now(), data })); } catch { /* quota / private mode */ } };
  function clearCache() { memo = null; try { localStorage.removeItem(CONTENT_KEY); } catch { /* ignore */ } }
  /* Same content, ignoring the server's "generated at" time. */
  const sameContent = (a, b) => JSON.stringify({ ...a, updated: null }) === JSON.stringify({ ...b, updated: null });

  /* Content from the sheet, used as it is. "offline" means the sheet couldn't be reached
     and nothing was saved: the page then shows its own built-in details. */
  function merge(live, source) {
    const out = { source, general: { ...(live.general || {}) } };
    COLLECTIONS.forEach(key => { out[key] = Array.isArray(live[key]) ? live[key] : []; });
    return out;
  }

  /* Returns content as fast as possible:
     - saved copy newer than CACHE_MINUTES: used at once;
     - older saved copy: used at once, then refreshed in the background, and
       onUpdate(content) is called only if something changed;
     - nothing saved: waits for the server. */
  async function getContent({ force = false, onUpdate = null } = {}) {
    if (memo && !force) return memo;
    const cached = readCache();
    const saved = cached && cached.data ? cached.data : null;
    if (!force && saved) {
      const fresh = Date.now() - (cached.t || 0) < ttl();
      memo = merge(saved, fresh ? 'cache' : 'stale');
      if (!fresh) {
        request('GET', 'content').then(data => {
          writeCache(data);
          if (sameContent(data, saved)) return;
          memo = merge(data, 'live');
          if (typeof onUpdate === 'function') onUpdate(memo);
        }).catch(err => console.warn('[SSV] Could not refresh content; showing the saved copy.', err.message));
      }
      return memo;
    }
    try {
      const data = await request('GET', 'content');
      writeCache(data);
      return (memo = merge(data, 'live'));
    } catch (err) {
      if (saved) return (memo = merge(saved, 'stale'));
      console.warn('[SSV] The Google Sheet could not be reached; showing the built-in details.', err.message);
      return (memo = merge({}, 'offline'));
    }
  }

  /* Changes the in-memory content and the browser's saved copy together. */
  function patchContent(fn) {
    if (memo) fn(memo);
    try {
      const cached = readCache();
      if (cached && cached.data) { fn(cached.data); localStorage.setItem(CONTENT_KEY, JSON.stringify(cached)); }
    } catch { /* ignore */ }
  }
  const setReviewLikes = (id, likes) => patchContent(d => { (d.reviews || []).forEach(r => { if (r.id === id) r.likes = likes; }); });
  const addReview = review => patchContent(d => { d.reviews = [review, ...(d.reviews || []).filter(r => r.id !== review.id)]; });

  /* ---------- Cloudinary upload (admin) ---------- */

  /* Large JPEG photos are resized in the browser and re-encoded, which also drops their
     metadata, including GPS location. Anything else is sent as it is. */
  async function prepareImage(file) {
    if (file.type !== 'image/jpeg' || typeof createImageBitmap !== 'function') return file;
    const maxEdge = CONFIG.IMAGE_MAX_EDGE || 2400;
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { return file; }
    try {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size <= 1.5 * 1048576) return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', CONFIG.IMAGE_QUALITY || 0.85));
      if (!blob || (scale === 1 && blob.size >= file.size)) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch {
      return file;
    } finally {
      if (bitmap && bitmap.close) bitmap.close();
    }
  }

  /* A clean file name, so photo names in Cloudinary read well: "IMG 2041 (1).JPG" -> "img-2041-1.jpg". */
  function cleanFile(file) {
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type] || 'jpg';
    const name = String(file.name || '').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'photo';
    try { return new File([file], `${name}.${ext}`, { type: file.type }); } catch { return file; }
  }

  /* Uploads one photo into `folder`, e.g. "SSV-Gym/Gallery/Events". The backend checks the
     folder belongs to the website and signs the upload; the API secret never reaches the browser. */
  async function uploadImage(original, { folder = '', onProgress = null } = {}) {
    if (!original || !/^image\/(jpeg|png|webp)$/.test(original.type)) throw new ApiError('Choose a JPG, PNG or WebP photo.', 'INVALID_FILE');
    const file = cleanFile(await prepareImage(original));
    const maxMb = CONFIG.MAX_UPLOAD_MB || 10;
    if (file.size > maxMb * 1048576) throw new ApiError(`This photo is larger than ${maxMb} MB. Resize it and try again.`, 'FILE_TOO_LARGE');
    const sig = await request('POST', 'getUploadSignature', { folder });
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', sig.apiKey);
    form.append('signature', sig.signature);
    Object.keys(sig.params || {}).forEach(k => form.append(k, String(sig.params[k])));

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(sig.cloudName)}/image/upload`);
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        let r = {};
        try { r = JSON.parse(xhr.responseText); } catch { /* keep empty */ }
        if (xhr.status >= 200 && xhr.status < 300 && r.secure_url) resolve({ url: r.secure_url, publicId: r.public_id, width: r.width, height: r.height });
        else reject(new ApiError((r.error && r.error.message) || 'Upload failed.', 'UPLOAD_FAILED'));
      };
      xhr.onerror = () => reject(new ApiError('Upload failed because of a network error.', 'NETWORK'));
      xhr.send(form);
    });
  }

  return {
    ApiError, isConfigured, getToken, setToken, clearCache,

    /* website */
    getContent, setReviewLikes, addReview,
    health: () => request('GET', 'health'),
    submitEnquiry: enquiry => request('POST', 'submitEnquiry', { enquiry }),
    submitReview: review => request('POST', 'submitReview', { review }),
    likeReview: (id, like) => request('POST', 'likeReview', { id, like }),

    /* admin: every call below is checked again by the backend */
    login: async password => { const d = await request('POST', 'login', { password }); setToken(d.token); return d; },
    logout: async () => { try { await request('POST', 'logout'); } catch { /* already expired */ } finally { setToken(null); } },
    verifySession: () => request('POST', 'verify'),
    getAdminData: () => request('POST', 'adminGetAll'),
    getInbox: () => request('POST', 'getInbox'),
    updateEnquiryStatus: (id, status) => request('POST', 'updateEnquiryStatus', { id, status }),
    saveGeneralData: general => request('POST', 'saveGeneral', { general }),
    saveRecord: (collection, record) => request('POST', 'saveRecord', { collection, record }),
    deleteRecord: (collection, id) => request('POST', 'deleteRecord', { collection, id }),
    reorder: (collection, ids) => request('POST', 'reorder', { collection, ids }),
    uploadImage,
    mediaFolders: fresh => request('POST', 'mediaFolders', { fresh: Boolean(fresh) }),
    mediaLibrary: fresh => request('POST', 'mediaLibrary', { fresh: Boolean(fresh) }),
    deleteFolder: path => request('POST', 'deleteFolder', { path }),
    deleteImages: images => request('POST', 'deleteImages', { images }),
    deleteImagesOnExit: images => beacon('deleteImages', { images })
  };
})();
