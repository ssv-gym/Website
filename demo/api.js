/* ==========================================================================
   SSV GYM — DEMO API (replaces js/api.js on the demo pages)          v1.6.0
   The same functions as js/api.js, but nothing leaves the browser. Every
   visit starts from demo/data.js. Changes are kept in this browser tab
   (sessionStorage), so the demo website and the demo admin panel share them
   while the visitor moves between the pages; a refresh, or closing the tab,
   starts again from the sample data. Any password signs in.
   ========================================================================== */
const API = (() => {
  const VERSION = '1.6.0';
  const STATE_KEY = 'ssv_demo_state_v3';
  const TOKEN_KEY = 'ssv_demo_token';
  const LIKED_KEY = 'ssv_liked_reviews';   // likes remembered by js/main.js
  const BASE = 'SSV-Gym';
  const SECTIONS = { general: `${BASE}/Home`, facilities: `${BASE}/Facilities`, trainers: `${BASE}/Trainers`, gallery: `${BASE}/Gallery`, announcements: `${BASE}/Events` };
  const TABS = { facilities: 'Facilities', plans: 'Membership Plans', services: 'Services', trainers: 'Trainers', gallery: 'Gallery', reviews: 'Reviews', announcements: 'Announcements' };
  /* The columns each list keeps, as in the Google Sheet. */
  const FIELDS = {
    facilities: ['name', 'tags', 'description', 'image_url', 'category', 'active', 'display_order'],
    plans: ['name', 'duration', 'price', 'description', 'features', 'featured', 'active', 'display_order'],
    services: ['name', 'price', 'price_note', 'description', 'active', 'display_order'],
    trainers: ['name', 'role', 'specialization', 'bio', 'image_url', 'active', 'display_order'],
    gallery: ['image_url', 'title', 'category', 'active', 'display_order'],
    reviews: ['name', 'rating', 'review', 'status'],
    announcements: ['title', 'description', 'image_url', 'date', 'expiry', 'active', 'priority']
  };
  const PREFIX = { facilities: 'fac', plans: 'plan', services: 'svc', trainers: 'tr', gallery: 'img', reviews: 'rev', announcements: 'ann', enquiries: 'enq' };
  const REQUIRED = {
    facilities: { name: 'Name' }, plans: { name: 'Plan name', duration: 'Duration' }, services: { name: 'Name' }, trainers: { name: 'Name' },
    gallery: { image_url: 'Photo or video' }, reviews: { name: 'Name', review: 'Review' }, announcements: { title: 'Title' }
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
  const number = v => (String(v ?? '').trim() === '' || isNaN(Number(v)) ? '' : Number(v));
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  const orderOf = v => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? Infinity : Number(v));
  const byOrder = (a, b) => { const x = orderOf(a.display_order), y = orderOf(b.display_order); return x === y ? 0 : (x < y ? -1 : 1); };
  const isVideoFile = file => Boolean(file) && /^video\//.test(file.type);

  /* ---------- this tab's copy of the demo data ---------- */
  function load() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STATE_KEY));
      if (saved && saved.general && Array.isArray(saved.media)) return saved;
    } catch { /* nothing kept in this tab */ }
    return null;
  }
  const read = () => load() || clone(DEMO_DATA);
  function persist() {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify(db)); }
    catch { throw new ApiError('This browser tab can\'t hold more demo changes. Refresh the page to start again.', 'STORAGE_FULL'); }
  }
  const rows = key => (Array.isArray(db[key]) ? db[key] : (db[key] = []));

  /* Likes on demo reviews are forgotten when the demo starts again. */
  function forgetLikes(ids) {
    try {
      const drop = new Set(ids);
      const liked = JSON.parse(localStorage.getItem(LIKED_KEY)) || [];
      const keep = liked.filter(id => !drop.has(id));
      if (keep.length !== liked.length) localStorage.setItem(LIKED_KEY, JSON.stringify(keep));
    } catch { /* storage unavailable */ }
  }

  /* A refresh starts the demo again; moving between the demo pages keeps the changes. */
  const reloaded = (() => {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      return nav ? nav.type === 'reload' : Boolean(performance.navigation && performance.navigation.type === 1);
    } catch { return false; }
  })();
  const kept = load();
  if (reloaded || !kept) {
    forgetLikes([...((kept && kept.reviews) || []), ...DEMO_DATA.reviews].map(r => r.id));
    try { sessionStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
  }
  let db = read();

  const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = token => { try { if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

  /* Admin calls: a short delay like a real server, then the sign-in check. */
  async function admin(fn, ms) {
    await pause(ms);
    if (!getToken()) throw new ApiError('Please sign in.', 'AUTH_REQUIRED');
    db = read();
    return fn();
  }

  function newId(key, label) {
    const taken = new Set(rows(key).map(r => r.id));
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
    const active = key => clone(rows(key).filter(r => truthy(r.active)).sort(byOrder));
    return {
      general: clone(db.general), google: clone(db.google || null),
      facilities: active('facilities'), plans: active('plans'), services: active('services'), trainers: active('trainers'), gallery: active('gallery'),
      announcements: clone(rows('announcements').filter(a => truthy(a.active) && (!a.expiry || String(a.expiry).slice(0, 10) >= t))
        .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(b.date).localeCompare(String(a.date)))),
      reviews: rows('reviews').filter(r => r.status === 'Published' && String(r.review || '').trim())
        .map(r => ({ id: r.id, name: r.name, rating: Number(r.rating) || 0, review: r.review, likes: Number(r.likes) || 0, date: r.date }))
        .sort((a, b) => b.likes - a.likes || String(b.date).localeCompare(String(a.date)))
    };
  }

  let listener = null, shown = '';
  async function getContent({ onUpdate = null } = {}) {
    await pause(120);
    listener = typeof onUpdate === 'function' ? onUpdate : null;
    db = read();
    const c = content();
    shown = JSON.stringify(c);
    return { source: 'live', ...c };
  }
  /* Back and Forward can show a page kept in memory: bring it up to date with this tab's changes. */
  window.addEventListener('pageshow', e => {
    if (!e.persisted || !listener) return;
    db = read();
    const c = content(), s = JSON.stringify(c);
    if (s !== shown) { shown = s; listener({ source: 'live', ...c }); }
  });

  async function submitEnquiry(q = {}) {
    await pause(400);
    if (q.website) return { received: true };
    const name = String(q.name || '').trim().slice(0, 80), phone = String(q.phone || '').trim().slice(0, 20);
    const digits = phone.replace(/\D/g, '');
    if (name.length < 2) throw new ApiError('Enter your name.', 'VALIDATION');
    if (digits.length < 10 || digits.length > 13) throw new ApiError('Enter a valid phone number.', 'VALIDATION');
    db = read();
    rows('enquiries').push({ id: newId('enquiries'), name, phone, message: String(q.message || '').trim().slice(0, 1000), date: stamp(), status: 'New' });
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
    if (rows('reviews').some(r => String(r.review).toLowerCase().replace(/\s+/g, ' ').trim() === same)) throw new ApiError('This review has already been posted.', 'DUPLICATE');
    const pending = truthy(db.general.review_approval);
    const row = { id: newId('reviews', name), name, rating, review, likes: 0, date: stamp(), source: 'Website', status: pending ? 'Pending' : 'Published' };
    rows('reviews').push(row);
    persist();
    return { received: true, status: row.status, review: pending ? null : { id: row.id, name, rating, review, likes: 0, date: row.date } };
  }

  async function likeReview(id, like) {
    await pause(150);
    db = read();
    const r = rows('reviews').find(x => x.id === id && x.status === 'Published');
    if (!r) throw new ApiError('This review is no longer available.', 'NOT_FOUND');
    r.likes = Math.max(0, (Number(r.likes) || 0) + (like === false ? -1 : 1));
    persist();
    return { id, likes: r.likes };
  }

  /* ---------- admin ---------- */
  const googleStatus = () => {
    const g = db.google || {};
    return { placeId: g.placeId || '', keySet: true, name: g.name || '', rating: g.rating || 0, count: g.count || 0, reviews: (g.reviews || []).length, error: '', url: g.reviewsUrl || '' };
  };

  function adminData() {
    const out = { general: clone(db.general), enquiries: clone(rows('enquiries')) };
    Object.keys(TABS).forEach(key => { out[key] = clone(rows(key)); });
    out.meta = {
      version: VERSION, timeZone: 'Asia/Kolkata', sheetUrl: '', cloudinaryConfigured: true,
      notifyEmail: 'owner@example.com (demo: no emails are sent)',
      media: { base: BASE, sections: SECTIONS }, google: googleStatus(),
      secrets: { ADMIN_PASSWORD: true, CLOUDINARY_API_KEY: true, CLOUDINARY_API_SECRET: true, GOOGLE_PLACES_API_KEY: true }
    };
    return out;
  }

  /* Where each photo is used: url -> labels such as "Trainers: Aman Verma". */
  function usage() {
    const entries = [];
    const friendly = { hero_image: 'Top photo', about_image: 'About photo' };
    Object.keys(db.general).forEach(k => { const v = db.general[k]; if (typeof v === 'string' && v) entries.push([v, `General information: ${friendly[k] || k}`]); });
    ['facilities', 'trainers', 'gallery', 'announcements'].forEach(key => rows(key).forEach(r => {
      if (r.image_url) entries.push([r.image_url, `${TABS[key]}: ${r.name || r.title || r.id}${truthy(r.active) ? '' : ' (hidden)'}`]);
    }));
    return url => entries.filter(([v]) => v === url).map(([, label]) => label);
  }

  /* As on the real backend: a replaced or deleted photo leaves the media library when nothing else uses it. */
  function dropUnused(urls) {
    const used = usage();
    const drop = new Set(urls.filter(u => u && !used(u).length));
    if (drop.size) db.media = db.media.filter(i => !drop.has(i.url));
  }

  function saveRecord(collection, input) {
    if (!FIELDS[collection]) throw new ApiError('Unknown collection.', 'BAD_REQUEST');
    if (!input || typeof input !== 'object') throw new ApiError('Missing record.', 'BAD_REQUEST');
    const list = rows(collection), rec = {};
    FIELDS[collection].forEach(k => { if (Object.prototype.hasOwnProperty.call(input, k)) rec[k] = input[k] ?? ''; });
    ['active', 'featured'].forEach(k => { if (k in rec) rec[k] = truthy(rec[k]); });
    ['display_order', 'priority'].forEach(k => { if (k in rec) rec[k] = number(rec[k]); });
    if ('price' in rec && /^\d+(\.\d+)?$/.test(String(rec.price).trim())) rec.price = Number(rec.price);
    if ('rating' in rec) { const n = Math.round(Number(rec.rating)); rec.rating = n >= 1 && n <= 5 ? n : ''; }
    if ('category' in rec) rec.category = String(rec.category).trim().toLowerCase();
    if ('status' in rec && !['Published', 'Pending', 'Hidden'].includes(rec.status)) throw new ApiError('Status must be Published, Pending or Hidden.', 'VALIDATION');
    const id = String(input.id || '').trim();
    const existing = id ? list.find(r => r.id === id) : null;
    if (id && !existing) throw new ApiError('That item no longer exists. Refresh and try again.', 'NOT_FOUND');
    const merged = existing ? { ...existing, ...rec } : { ...rec, id: newId(collection, rec.name || rec.title) };
    if (!existing && collection === 'reviews') Object.assign(merged, { likes: 0, date: stamp(), source: 'Admin', status: rec.status || 'Published' });
    for (const [key, label] of Object.entries(REQUIRED[collection] || {})) {
      if (!String(merged[key] ?? '').trim()) throw new ApiError(`${label} is required.`, 'VALIDATION');
    }
    const replaced = existing && 'image_url' in rec && existing.image_url !== rec.image_url ? [existing.image_url] : [];
    if (existing) Object.assign(existing, merged); else list.push(merged);
    dropUnused(replaced);
    persist();
    return clone(merged);
  }

  function removeRows(collection, ids) {
    if (!FIELDS[collection] && collection !== 'enquiries') throw new ApiError('Unknown collection.', 'BAD_REQUEST');
    const want = new Set((Array.isArray(ids) ? ids : []).map(String));
    const list = rows(collection);
    const gone = list.filter(r => want.has(r.id));
    if (!gone.length) throw new ApiError('That item no longer exists. Refresh and try again.', 'NOT_FOUND');
    db[collection] = list.filter(r => !want.has(r.id));
    dropUnused(gone.map(r => r.image_url));
    persist();
    return gone.map(r => r.id);
  }

  function reorder(collection, ids) {
    if (!FIELDS[collection]) throw new ApiError('Unknown collection.', 'BAD_REQUEST');
    const list = Array.isArray(ids) ? ids : [], position = {};
    list.forEach((id, i) => { position[id] = i + 1; });
    let next = list.length;
    rows(collection).slice().sort(byOrder).forEach(r => { r.display_order = position[r.id] || ++next; });
    persist();
    return { reordered: list.length };
  }

  function saveGeneral(general) {
    const replaced = [];
    Object.keys(general || {}).forEach(k => {
      if (!/^[A-Za-z0-9_]{1,64}$/.test(k)) return;
      const value = ['review_form', 'review_approval'].includes(k) ? truthy(general[k]) : general[k];
      if (typeof db.general[k] === 'string' && db.general[k] !== value) replaced.push(db.general[k]);
      db.general[k] = value;
    });
    dropUnused(replaced);
    persist();
    return clone(db.general);
  }

  /* ---------- admin: photos, kept in the tab as small JPEG copies ---------- */
  function removeImages(list) {
    const used = usage(), deleted = [], kept = [];
    (Array.isArray(list) ? list : []).forEach(v => {
      const file = db.media.find(i => i.url === v || i.id === v);
      if (!file) return;
      if (used(file.url).length) kept.push(file.id);
      else { deleted.push(file.id); db.media = db.media.filter(i => i !== file); }
    });
    persist();
    return { deleted, kept };
  }

  async function shrink(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    return { url: canvas.toDataURL('image/jpeg', 0.72), width: canvas.width, height: canvas.height };
  }

  async function uploadMedia(file, { folder = SECTIONS.general, onProgress = null } = {}) {
    if (!getToken()) throw new ApiError('Please sign in.', 'AUTH_REQUIRED');
    if (isVideoFile(file)) throw new ApiError('Videos can\'t be uploaded in the demo (the real admin panel sends them to Cloudinary). Use Add by link with a YouTube link instead.', 'INVALID_FILE');
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new ApiError('Choose a JPG, PNG or WebP photo.', 'INVALID_FILE');
    for (const p of [15, 45, 80]) { if (onProgress) onProgress(p); await pause(120); }
    let pic;
    try { pic = await shrink(file); } catch { throw new ApiError('This photo could not be read.', 'INVALID_FILE'); }
    const name = slug(String(file.name || '').replace(/\.[^.]+$/, '')) || 'photo';
    const id = `${folder}/${name}-${Date.now().toString(36)}`;
    db = read();
    db.media.push({ id, type: 'image', url: pic.url, folder, bytes: Math.round(pic.url.length * 0.75), width: pic.width, height: pic.height, created: new Date().toISOString() });
    persist();
    if (onProgress) onProgress(100);
    return { url: pic.url, publicId: id, width: pic.width, height: pic.height, kind: 'image' };
  }

  async function login(password) {
    await pause(300);
    if (!String(password || '').length) throw new ApiError('Type any password: this is the demo.', 'AUTH_FAILED');
    const token = `demo-${Date.now().toString(36)}`;
    setToken(token);
    return { token, expiresIn: 21600 };
  }

  return {
    ApiError, isVideoFile, getToken, setToken,
    isConfigured: () => true,
    clearCache: () => {},

    /* website */
    getContent, submitEnquiry, submitReview, likeReview,
    setReviewLikes: () => {}, addReview: () => {},
    health: async () => ({ status: 'ok', version: `${VERSION} (demo)` }),

    /* admin */
    login,
    logout: async () => { setToken(null); },
    verifySession: () => admin(() => ({ valid: true, version: VERSION })),
    getAdminData: () => admin(adminData),
    getInbox: () => admin(() => ({ enquiries: clone(rows('enquiries')), reviews: clone(rows('reviews')) })),
    updateEnquiryStatus: (id, status) => admin(() => {
      if (!['New', 'Contacted', 'Closed'].includes(status)) throw new ApiError('Status must be New, Contacted or Closed.', 'BAD_REQUEST');
      const e = rows('enquiries').find(x => x.id === id);
      if (!e) throw new ApiError('Enquiry not found. Refresh and try again.', 'NOT_FOUND');
      e.status = status;
      persist();
      return { id, status };
    }),
    saveGeneralData: general => admin(() => saveGeneral(general)),
    saveRecord: (collection, record) => admin(() => saveRecord(collection, record)),
    deleteRecord: (collection, id) => admin(() => ({ deleted: removeRows(collection, [id])[0] })),
    deleteRecords: (collection, ids) => admin(() => ({ deleted: removeRows(collection, ids) })),
    reorder: (collection, ids) => admin(() => reorder(collection, ids)),
    uploadMedia,
    uploadImage: uploadMedia,
    mediaLibrary: () => admin(() => {
      const used = usage();
      return { base: BASE, sections: SECTIONS, folders: [BASE, ...Object.values(SECTIONS)], images: db.media.map(i => ({ type: 'image', ...i, usedIn: used(i.url) })), truncated: false };
    }),
    deleteImages: images => admin(() => removeImages(images)),
    deleteImagesOnExit: images => { try { db = read(); removeImages(images); } catch { /* ignore */ } return true; },
    refreshGoogle: () => admin(googleStatus, 700)
  };
})();
