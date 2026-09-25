/* ==========================================================================
   SSV GYM — DEMO API (replaces js/api.js on the demo pages)          v1.4.0
   Same functions as js/api.js, but everything is kept in this browser
   (localStorage), so the demo website and demo admin share the same data.
   Nothing reaches the real Google Sheet or Cloudinary. Any password signs in.
   ========================================================================== */
const API = (() => {
  const STATE_KEY = 'ssv_demo_state';
  const TOKEN_KEY = 'ssv_demo_token';
  const BASE = 'SSV-Gym';
  const SECTIONS = { general: `${BASE}/Home`, facilities: `${BASE}/Facilities`, trainers: `${BASE}/Trainers`, gallery: `${BASE}/Gallery` };
  const TABS = { facilities: 'Facilities', plans: 'Membership Plans', trainers: 'Trainers', gallery: 'Gallery', reviews: 'Reviews', announcements: 'Announcements' };
  const PREFIX = { facilities: 'fac', plans: 'plan', trainers: 'tr', gallery: 'img', reviews: 'rev', announcements: 'ann', enquiries: 'enq' };
  const REQUIRED = {
    facilities: { name: 'Name' }, plans: { name: 'Plan name', duration: 'Duration' }, trainers: { name: 'Name' },
    gallery: { image_url: 'Image' }, reviews: { name: 'Name', review: 'Review' }, announcements: { title: 'Title' }
  };
  const LINK_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|info|biz|xyz|ru|top|shop|site|online|click|link)\b)/i;

  class ApiError extends Error {
    constructor(message, code = 'ERROR') { super(message); this.name = 'ApiError'; this.code = code; }
  }

  const clone = v => JSON.parse(JSON.stringify(v));
  const pause = (ms = 200) => new Promise(r => setTimeout(r, ms));
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const stamp = () => { const d = new Date(); return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const truthy = v => v === true || /^(true|yes|y|1)$/i.test(String(v ?? '').trim());
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  const orderOf = v => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? Infinity : Number(v));
  const byOrder = (a, b) => (orderOf(a.display_order) - orderOf(b.display_order)) || 0;

  /* ---------- stored data ---------- */
  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY));
      if (saved && saved.general && saved.media) return saved;
    } catch { /* use the sample data */ }
    return clone(DEMO_DATA);
  }
  let db = read();
  function persist() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(db)); }
    catch { throw new ApiError('The demo storage in this browser is full. Use Reset to start again.', 'STORAGE_FULL'); }
  }
  function reset() {
    try { localStorage.removeItem(STATE_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    db = clone(DEMO_DATA);
  }
  window.addEventListener('storage', e => { if (e.key === STATE_KEY) db = read(); });

  const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = token => { try { if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

  /* Admin calls: short delay like a real server, then the sign-in check. */
  async function admin(fn) {
    await pause();
    if (!getToken()) throw new ApiError('Please sign in.', 'AUTH_REQUIRED');
    db = read();
    return fn();
  }

  function newId(key, label) {
    const taken = new Set((db[key] || []).map(r => r.id));
    const numbered = key === 'enquiries';
    const base = slug(numbered ? today() : label);
    const stem = base ? `${PREFIX[key]}-${base}` : PREFIX[key];
    if (base && !numbered && !taken.has(stem)) return stem;
    let n = base && !numbered ? 2 : 1;
    while (taken.has(`${stem}-${n}`)) n++;
    return `${stem}-${n}`;
  }

  /* ---------- website ---------- */
  function content() {
    const t = today();
    const active = key => clone((db[key] || []).filter(r => truthy(r.active)).sort(byOrder));
    return {
      general: clone(db.general),
      facilities: active('facilities'), plans: active('plans'), trainers: active('trainers'), gallery: active('gallery'),
      announcements: clone(db.announcements.filter(a => truthy(a.active) && (!a.expiry || String(a.expiry).slice(0, 10) >= t))
        .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(b.date).localeCompare(String(a.date)))),
      reviews: db.reviews.filter(r => r.status === 'Published' && String(r.review || '').trim())
        .map(r => ({ id: r.id, name: r.name, rating: Number(r.rating) || 0, review: r.review, likes: Number(r.likes) || 0, date: r.date }))
        .sort((a, b) => b.likes - a.likes || String(b.date).localeCompare(String(a.date)))
    };
  }

  async function getContent() {
    await pause(120);
    db = read();
    return { source: 'live', ...content() };
  }

  async function submitEnquiry(q = {}) {
    await pause(400);
    if (q.website) return { received: true };
    const name = String(q.name || '').trim().slice(0, 80), phone = String(q.phone || '').trim().slice(0, 20);
    const digits = phone.replace(/\D/g, '');
    if (name.length < 2) throw new ApiError('Enter your name.', 'VALIDATION');
    if (digits.length < 10 || digits.length > 13) throw new ApiError('Enter a valid phone number.', 'VALIDATION');
    db = read();
    db.enquiries.push({ id: newId('enquiries'), name, phone, message: String(q.message || '').trim().slice(0, 1000), date: stamp(), status: 'New' });
    persist();
    return { received: true };
  }

  async function submitReview(q = {}) {
    await pause(400);
    db = read();
    if (q.website) return { received: true, status: 'Pending', review: null };
    if (/^(false|no|n|0)$/i.test(String(db.general.review_form))) throw new ApiError('Reviews are closed at the moment.', 'CLOSED');
    const name = String(q.name || '').trim().slice(0, 60), rating = Math.round(Number(q.rating)), review = String(q.review || '').trim().slice(0, 800);
    if (name.length < 2) throw new ApiError('Enter your name.', 'VALIDATION');
    if (!(rating >= 1 && rating <= 5)) throw new ApiError('Choose a rating from 1 to 5 stars.', 'VALIDATION');
    if (review.length < 5) throw new ApiError('Write a few words about your experience.', 'VALIDATION');
    if (LINK_PATTERN.test(`${name} ${review}`)) throw new ApiError('Please remove links from your review.', 'VALIDATION');
    const same = review.toLowerCase().replace(/\s+/g, ' ');
    if (db.reviews.some(r => String(r.review).toLowerCase().replace(/\s+/g, ' ').trim() === same)) throw new ApiError('This review has already been posted.', 'DUPLICATE');
    const pending = truthy(db.general.review_approval);
    const row = { id: newId('reviews', name), name, rating, review, likes: 0, date: stamp(), source: 'Website', status: pending ? 'Pending' : 'Published' };
    db.reviews.push(row);
    persist();
    return { received: true, status: row.status, review: pending ? null : { id: row.id, name, rating, review, likes: 0, date: row.date } };
  }

  async function likeReview(id, like) {
    await pause(150);
    db = read();
    const r = db.reviews.find(x => x.id === id && x.status === 'Published');
    if (!r) throw new ApiError('This review is no longer available.', 'NOT_FOUND');
    r.likes = Math.max(0, (Number(r.likes) || 0) + (like === false ? -1 : 1));
    persist();
    return { id, likes: r.likes };
  }

  /* ---------- admin: content ---------- */
  function adminData() {
    return {
      general: clone(db.general), enquiries: clone(db.enquiries),
      facilities: clone(db.facilities), plans: clone(db.plans), trainers: clone(db.trainers),
      gallery: clone(db.gallery), reviews: clone(db.reviews), announcements: clone(db.announcements),
      meta: {
        version: '1.4.1', timeZone: 'Asia/Kolkata', sheetUrl: '', cloudinaryConfigured: true,
        notifyEmail: 'owner@example.com (demo: no emails are sent)', media: { base: BASE, sections: SECTIONS }
      }
    };
  }

  function saveRecord(collection, input) {
    if (!TABS[collection]) throw new ApiError('Unknown collection.', 'BAD_REQUEST');
    const rows = db[collection];
    const rec = { ...(input || {}) };
    ['active', 'featured'].forEach(k => { if (k in rec) rec[k] = truthy(rec[k]); });
    if ('rating' in rec) rec.rating = Number(rec.rating) || '';
    if ('price' in rec && /^\d+(\.\d+)?$/.test(String(rec.price))) rec.price = Number(rec.price);
    const existing = rec.id ? rows.find(r => r.id === rec.id) : null;
    if (rec.id && !existing) throw new ApiError('That item no longer exists. Refresh and try again.', 'NOT_FOUND');
    if (collection === 'reviews') { delete rec.likes; delete rec.source; delete rec.date; }
    const merged = existing ? { ...existing, ...rec } : { ...rec, id: newId(collection, rec.name || rec.title) };
    if (!existing && collection === 'reviews') Object.assign(merged, { likes: 0, date: stamp(), source: 'Admin', status: rec.status || 'Published' });
    for (const [key, label] of Object.entries(REQUIRED[collection] || {})) {
      if (!String(merged[key] ?? '').trim()) throw new ApiError(`${label} is required.`, 'VALIDATION');
    }
    if (existing) Object.assign(existing, merged); else rows.push(merged);
    persist();
    return clone(merged);
  }

  function reorder(collection, ids) {
    const position = {};
    ids.forEach((id, i) => { position[id] = i + 1; });
    let next = ids.length;
    db[collection].slice().sort(byOrder).forEach(r => { r.display_order = position[r.id] || ++next; });
    persist();
    return { reordered: ids.length };
  }

  /* ---------- admin: photos (kept as small copies in the browser) ---------- */
  function usage() {
    const entries = [];
    const friendly = { hero_image: 'Top photo', about_image: 'About photo' };
    Object.keys(db.general).forEach(k => { const v = db.general[k]; if (typeof v === 'string' && v) entries.push([v, `General information: ${friendly[k] || k}`]); });
    ['facilities', 'trainers', 'gallery'].forEach(key => (db[key] || []).forEach(r => {
      if (r.image_url) entries.push([r.image_url, `${TABS[key]}: ${r.name || r.title || r.id}${truthy(r.active) ? '' : ' (hidden)'}`]);
    }));
    return url => entries.filter(([v]) => v === url).map(([, label]) => label);
  }

  function removeImages(list) {
    const used = usage(), deleted = [], kept = [];
    (Array.isArray(list) ? list : []).forEach(v => {
      const img = db.media.images.find(i => i.url === v || i.id === v);
      if (!img) return;
      if (used(img.url).length) kept.push(img.id);
      else { deleted.push(img.id); db.media.images = db.media.images.filter(i => i !== img); }
    });
    persist();
    return { deleted, kept };
  }

  async function shrink(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    return { url: canvas.toDataURL('image/jpeg', 0.8), width: canvas.width, height: canvas.height };
  }

  async function uploadImage(file, { folder = SECTIONS.general, onProgress = null } = {}) {
    if (!getToken()) throw new ApiError('Please sign in.', 'AUTH_REQUIRED');
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new ApiError('Choose a JPG, PNG or WebP photo.', 'INVALID_FILE');
    for (const p of [15, 45, 80]) { if (onProgress) onProgress(p); await pause(120); }
    let img;
    try { img = await shrink(file); } catch { throw new ApiError('This photo could not be read.', 'INVALID_FILE'); }
    const name = slug(String(file.name || '').replace(/\.[^.]+$/, '')) || 'photo';
    const id = `${folder}/${name}-${Date.now().toString(36)}`;
    db = read();
    db.media.images.push({ id, url: img.url, folder, bytes: Math.round(img.url.length * 0.75), width: img.width, height: img.height, created: new Date().toISOString() });
    persist();
    if (onProgress) onProgress(100);
    return { url: img.url, publicId: id, width: img.width, height: img.height };
  }

  const folderList = () => db.media.folders.slice().sort();
  const sectionOf = path => Object.values(SECTIONS).find(s => path === s || String(path).startsWith(s + '/')) || '';

  function deleteFolder(path) {
    const section = sectionOf(path);
    if (!section || path === section) throw new ApiError('The main website folders can\'t be deleted.', 'VALIDATION');
    if (db.media.images.some(i => i.folder === path || i.folder.startsWith(path + '/'))) throw new ApiError('This folder still has photos. Delete them first.', 'VALIDATION');
    db.media.folders = db.media.folders.filter(f => f !== path && !f.startsWith(path + '/'));
    persist();
    return { deleted: path };
  }

  /* ---------- sign in ---------- */
  async function login(password) {
    await pause(300);
    if (!String(password || '').length) throw new ApiError('Type any password: this is the demo.', 'AUTH_FAILED');
    const token = `demo-${Date.now().toString(36)}`;
    setToken(token);
    return { token, expiresIn: 21600 };
  }

  return {
    ApiError, getToken, setToken, reset,
    isConfigured: () => true,
    clearCache: () => {},

    /* website */
    getContent, submitEnquiry, submitReview, likeReview,
    setReviewLikes: () => {}, addReview: () => {},
    health: async () => ({ status: 'ok', version: '1.4.0 (demo)' }),

    /* admin */
    login,
    logout: async () => { setToken(null); },
    verifySession: () => admin(() => ({ valid: true, version: '1.4.0' })),
    getAdminData: () => admin(adminData),
    getInbox: () => admin(() => ({ enquiries: clone(db.enquiries), reviews: clone(db.reviews) })),
    updateEnquiryStatus: (id, status) => admin(() => {
      const e = db.enquiries.find(x => x.id === id);
      if (!e) throw new ApiError('Enquiry not found. Refresh and try again.', 'NOT_FOUND');
      e.status = status;
      persist();
      return { id, status };
    }),
    saveGeneralData: general => admin(() => {
      Object.keys(general || {}).forEach(k => {
        if (!/^[A-Za-z0-9_]{1,64}$/.test(k)) return;
        db.general[k] = ['review_form', 'review_approval'].includes(k) ? truthy(general[k]) : general[k];
      });
      persist();
      return clone(db.general);
    }),
    saveRecord: (collection, record) => admin(() => saveRecord(collection, record)),
    deleteRecord: (collection, id) => admin(() => {
      const rows = db[collection] || [];
      const i = rows.findIndex(r => r.id === id);
      if (i < 0) throw new ApiError('That item no longer exists. Refresh and try again.', 'NOT_FOUND');
      rows.splice(i, 1);
      persist();
      return { deleted: id };
    }),
    reorder: (collection, ids) => admin(() => reorder(collection, ids)),
    uploadImage,
    mediaFolders: () => admin(() => ({ base: BASE, sections: SECTIONS, folders: folderList() })),
    mediaLibrary: () => admin(() => {
      const used = usage();
      return { base: BASE, sections: SECTIONS, legacy: [], folders: folderList(), images: db.media.images.map(i => ({ ...i, usedIn: used(i.url) })), truncated: false };
    }),
    deleteFolder: path => admin(() => deleteFolder(path)),
    deleteImages: images => admin(() => removeImages(images)),
    deleteImagesOnExit: images => { try { db = read(); removeImages(images); } catch { /* ignore */ } return true; }
  };
})();
