/* ==========================================================================
   SSV GYM — ADMIN PANEL                                              v1.6.0
   Signs in with the password checked by Apps Script, then edits the Google
   Sheet through the API: general information, collections, reviews, photos
   and videos (Cloudinary) and enquiries. Lists reorder by dragging (or the
   arrows) and ticked items can be deleted together. Uploads always go into
   their section's folder (Home, Facilities, Trainers, Gallery, Events).
   Works on phones too.
   ========================================================================== */
(() => {
  'use strict';
  const BACKEND_VERSION = '1.6.0';   // the Code.gs version this panel expects
  const { esc, text, truthy, splitList, isoDate, formatDate, timeAgo, formatPrice, byOrder, cld, safeUrl, realPhone, mediaKind, videoPoster } = Utils;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.1l-5.62 2.99 1.07-6.27L2.9 9.4l6.3-.9z"/></svg>';
  const PLAY = '<span class="play-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></span>';
  const GRIP = '<svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2" cy="2" r="1.4"/><circle cx="8" cy="2" r="1.4"/><circle cx="2" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="2" cy="14" r="1.4"/><circle cx="8" cy="14" r="1.4"/></svg>';
  const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
  const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';
  const DEFAULT_CATEGORIES = ['Gym', 'CrossFit', 'Training', 'Equipment', 'Events'];
  const NOUNS = { enquiries: ['enquiry', 'enquiries'], media: ['file', 'files'] };
  /* Keys kept in Script Properties: key, label, where to set it. */
  const SECRETS = [
    ['ADMIN_PASSWORD', 'Admin password', 'SSV Admin › Set admin password'],
    ['CLOUDINARY_API_KEY', 'Cloudinary API key', 'SSV Admin › Set Cloudinary keys'],
    ['CLOUDINARY_API_SECRET', 'Cloudinary API secret', 'SSV Admin › Set Cloudinary keys'],
    ['GOOGLE_PLACES_API_KEY', 'Google Places API key', 'SSV Admin › Set Google Places key']
  ];
  const SHORTCUTS = [
    ['Add photos or videos to the gallery', '#gallery'],
    ['Post an announcement or event', '#announcements'],
    ['Update opening hours or contact details', '#general'],
    ['Edit membership plans', '#plans']
  ];

  /* Each collection: labels and the fields of its editor. */
  const COLLECTIONS = {
    facilities: {
      one: 'facility', many: 'facilities', ordered: true, media: 'facilities',
      intro: 'Main areas show as large photo cards. "Also at SSV" items show as a short list under them.',
      fields: [
        { key: 'name', label: 'Name', required: true },
        { key: 'category', label: 'Shown as', type: 'select', options: [['major', 'Main area (large photo card)'], ['additional', 'Also at SSV (short list)']] },
        { key: 'tags', label: 'Tags', full: true, hint: 'Short words under the name, separated by |' },
        { key: 'description', label: 'Description', type: 'textarea', full: true },
        { key: 'image_url', label: 'Photo', type: 'image', hint: 'Used on large photo cards.' },
        { key: 'active', label: 'Show on the website', type: 'check' }
      ]
    },
    plans: {
      one: 'plan', many: 'plans', ordered: true, media: 'general',
      fields: [
        { key: 'name', label: 'Plan name', required: true },
        { key: 'duration', label: 'Duration', required: true, placeholder: '3 Months' },
        { key: 'price', label: 'Price (₹)', placeholder: '3000', hint: 'Numbers only. Empty shows "Price on enquiry".' },
        { key: 'description', label: 'Short description' },
        { key: 'features', label: 'Included', type: 'list', hint: 'One item per line.' },
        { key: 'featured', label: 'Highlight this plan', type: 'check' },
        { key: 'active', label: 'Show on the website', type: 'check' }
      ]
    },
    services: {
      one: 'service', many: 'services', ordered: true, media: 'general',
      intro: 'Shown under the membership plans, for example personal training and diet plans. The heading above them is in General information › Membership.',
      fields: [
        { key: 'name', label: 'Name', required: true, placeholder: 'Personal Training' },
        { key: 'price', label: 'Price (₹)', placeholder: '5000', hint: 'Numbers only. Empty shows "Price on enquiry".' },
        { key: 'price_note', label: 'Under the price', placeholder: 'Starting price', hint: 'For example "Starting price" or "Per session".' },
        { key: 'description', label: 'Description', type: 'textarea', full: true },
        { key: 'active', label: 'Show on the website', type: 'check' }
      ]
    },
    trainers: {
      one: 'trainer', many: 'trainers', ordered: true, media: 'trainers',
      fields: [
        { key: 'name', label: 'Name', required: true },
        { key: 'role', label: 'Role', placeholder: 'Head Trainer' },
        { key: 'specialization', label: 'Specialisation', full: true },
        { key: 'bio', label: 'Short bio', type: 'textarea', full: true },
        { key: 'image_url', label: 'Photo', type: 'image', hint: 'A portrait photo works best.' },
        { key: 'active', label: 'Show on the website', type: 'check' }
      ]
    },
    gallery: {
      one: 'item', many: 'items', ordered: true, media: 'gallery',
      fields: [
        { key: 'image_url', label: 'Photo or video', type: 'image', video: true, required: true, hint: 'Upload a photo or a video (MP4, MOV or WebM, up to 100 MB), or paste a YouTube link under "Link".' },
        { key: 'title', label: 'Title', full: true, hint: 'Shown when a visitor opens the photo.' },
        { key: 'category', label: 'Category', type: 'category' },
        { key: 'active', label: 'Show on the website', type: 'check' }
      ]
    },
    reviews: {
      one: 'review', many: 'reviews', media: 'general',
      fields: [
        { key: 'name', label: 'Name', required: true },
        { key: 'rating', label: 'Rating', type: 'select', options: [['5', '5 stars'], ['4', '4 stars'], ['3', '3 stars'], ['2', '2 stars'], ['1', '1 star']] },
        { key: 'review', label: 'Review', type: 'textarea', full: true, required: true, max: 800, rows: 5 },
        { key: 'status', label: 'Status', type: 'select', options: [['Published', 'Published'], ['Pending', 'Waiting for approval'], ['Hidden', 'Hidden']] }
      ]
    },
    announcements: {
      one: 'announcement', many: 'announcements', media: 'announcements',
      intro: 'Without a photo, an announcement shows as a short notice near the top of the website. With a photo, it shows as an event card (tournaments, competitions) in the Events section.',
      fields: [
        { key: 'title', label: 'Title', required: true, full: true },
        { key: 'description', label: 'Details', type: 'textarea', full: true, rows: 4 },
        { key: 'image_url', label: 'Photo (for events)', type: 'image', hint: 'A poster or photo of the event. Leave empty for a short notice.' },
        { key: 'date', label: 'Date', type: 'date', hint: 'For events: the day of the event.' },
        { key: 'expiry', label: 'Show until', type: 'date', hint: 'Empty = no end date.' },
        { key: 'priority', label: 'Priority', type: 'number', placeholder: '1', hint: 'Higher shows first.' },
        { key: 'active', label: 'Show on the website', type: 'check' }
      ]
    }
  };

  /* General information, grouped like the website. */
  const GENERAL = [
    { title: 'Gym name', fields: [
      { key: 'gym_name', label: 'Short name', required: true },
      { key: 'full_name', label: 'Full name' },
      { key: 'tagline', label: 'Footer line', hint: 'Empty = hidden.' },
      { key: 'description', label: 'Summary for Google search', type: 'textarea', full: true }
    ] },
    { title: 'Top of the page', fields: [
      { key: 'hero_heading', label: 'Big heading', full: true, hint: 'A | starts a new line.' },
      { key: 'hero_subtitle', label: 'Text under the heading', type: 'textarea', full: true },
      { key: 'hero_image', label: 'Top photo', type: 'image' },
      { key: 'facility_strip', label: 'Words under the photo', full: true, hint: 'Separated by |. Empty = hidden.' }
    ] },
    { title: 'Statistics', note: 'Figures under the top photo, such as "5+" with "Years in Virar". Leave a pair empty to hide it.', fields: [
      { key: 'stat_1_value', label: 'Figure 1' }, { key: 'stat_1_label', label: 'Label 1' },
      { key: 'stat_2_value', label: 'Figure 2' }, { key: 'stat_2_label', label: 'Label 2' },
      { key: 'stat_3_value', label: 'Figure 3' }, { key: 'stat_3_label', label: 'Label 3' },
      { key: 'stat_4_value', label: 'Figure 4' }, { key: 'stat_4_label', label: 'Label 4' }
    ] },
    { title: 'About', fields: [
      { key: 'about_heading', label: 'Heading', full: true },
      { key: 'about_text', label: 'Text', type: 'textarea', full: true, rows: 5, hint: 'A | starts a new paragraph.' },
      { key: 'about_highlights', label: 'Short points', type: 'list', hint: 'One point per line.' },
      { key: 'about_image', label: 'About photo', type: 'image' },
      { key: 'facilities_intro', label: 'Text next to the Facilities heading', type: 'textarea', full: true }
    ] },
    { title: 'Membership', fields: [
      { key: 'featured_badge_text', label: 'Label on highlighted plans', placeholder: 'Best value' },
      { key: 'services_heading', label: 'Heading above personal training and diet plans', placeholder: 'Personal training and diet plans' }
    ] },
    { title: 'Contact', fields: [
      { key: 'phone', label: 'Gym phone', placeholder: '+91 77588 78588', hint: 'Used for the Call buttons.' },
      { key: 'phone_2', label: "Owner's phone", placeholder: '+91 75586 08585', hint: 'Shown as a second number. Empty = hidden.' },
      { key: 'whatsapp', label: 'WhatsApp', hint: 'Empty = the gym phone is used.' },
      { key: 'address', label: 'Address', type: 'textarea', rows: 4, hint: 'A | starts a new line.' },
      { key: 'opening_hours', label: 'Opening hours', type: 'textarea', full: true, rows: 3, hint: 'One line per group of days, separated by |, e.g. "Monday – Saturday: 6:00 AM – 11:00 PM | Sunday: 4:00 PM – 9:00 PM". The website highlights today and shows whether the gym is open now.' }
    ] },
    { title: 'Map and social links', fields: [
      { key: 'maps_url', label: 'Google Maps link', full: true, hint: 'Google Maps › Share › Copy link.' },
      { key: 'maps_embed_url', label: 'Map on the website', type: 'textarea', full: true, hint: 'Google Maps › Share › Embed a map › Copy HTML. Paste the whole code or just the link.' },
      { key: 'instagram_url', label: 'Instagram', placeholder: 'https://www.instagram.com/ssvgym2021/' },
      { key: 'facebook_url', label: 'Facebook' }
    ] }
  ];

  const VIEWS = {
    dashboard: 'Dashboard', general: 'General information', facilities: 'Facilities', plans: 'Membership plans',
    services: 'Personal training & diet', trainers: 'Trainers', gallery: 'Gallery', reviews: 'Reviews',
    announcements: 'Announcements & events', media: 'Media library', enquiries: 'Enquiries', settings: 'Settings'
  };

  const state = {
    data: null, view: 'dashboard', dirty: false, lib: null, libFolder: '',
    reviewFilter: 'all', enquiryFilter: 'all', pending: new Set(), lastHash: '', selected: new Set()
  };

  /* ---------------------------------------------------------------- helpers */
  const meta = () => (state.data && state.data.meta) || {};
  const general = () => (state.data && state.data.general) || {};
  const list = key => {
    if (!state.data) return [];
    if (!Array.isArray(state.data[key])) state.data[key] = [];
    return state.data[key];
  };
  const cloudinaryReady = () => Boolean(meta().cloudinaryConfigured);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const nouns = key => (COLLECTIONS[key] ? [COLLECTIONS[key].one, COLLECTIONS[key].many] : (NOUNS[key] || ['item', 'items']));
  const olderThan = (a, b) => {
    const x = String(a).split('.').map(n => parseInt(n, 10) || 0), y = String(b).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
    return false;
  };
  /* Small picture for a photo, video or YouTube link. */
  const thumb = (url, w = 200) => {
    const u = safeUrl(url);
    if (!u) return '';
    const kind = mediaKind(u);
    const src = kind === 'image' ? cld(u, w) : videoPoster(u, w);
    return (src ? `<img src="${esc(src)}" alt="" loading="lazy">` : '') + (kind === 'image' ? '' : PLAY);
  };
  const pill = (label, kind = '') => `<span class="pill${kind ? ' pill--' + kind : ''}">${esc(label)}</span>`;
  const stars = n => {
    const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return `<span class="stars-mini" role="img" aria-label="${r} out of 5">${[1, 2, 3, 4, 5].map(i => `<span${i <= r ? ' class="is-on"' : ''}>${STAR}</span>`).join('')}</span>`;
  };
  const sizeText = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b || 0} B`);
  const statusText = s => { const v = text(s) || 'New'; return `<span class="status status--${esc(v.toLowerCase())}">${esc(v)}</span>`; };

  /* Tick boxes for selecting several rows or cards. */
  const selectAllCell = () => '<th class="col-select"><input class="check" type="checkbox" data-select-all aria-label="Select all"></th>';
  const selectCell = (id, label = 'Select') => `<td class="col-select"><input class="check" type="checkbox" data-select="${esc(id)}"${state.selected.has(id) ? ' checked' : ''} aria-label="${esc(label)}"></td>`;
  const pickBox = (id, label) => `<label class="media-card__pick"><input class="check" type="checkbox" data-select="${esc(id)}"${state.selected.has(id) ? ' checked' : ''} aria-label="${esc(label)}"></label>`;
  const handle = () => `<span class="drag" data-drag title="Drag to reorder">${GRIP}</span>`;
  const rowClass = (muted, id) => [muted ? 'is-muted' : '', state.selected.has(id) ? 'is-selected' : ''].filter(Boolean).join(' ');

  /* Gallery categories: names in filter order, kept in General › gallery_categories. */
  function galleryCategories() {
    const names = splitList(general().gallery_categories);
    return names.length ? names : DEFAULT_CATEGORIES.slice();
  }
  const categoryOptions = () => galleryCategories().map(n => [n.toLowerCase(), n]);
  const catLabel = c => {
    const k = text(c).toLowerCase();
    const hit = galleryCategories().find(n => n.toLowerCase() === k);
    return hit || (k ? k.replace(/\b[a-z]/g, ch => ch.toUpperCase()) : 'No category');
  };

  function toast(message, type = 'ok') {
    const box = $('#modal').open ? $('#modal-toasts') : $('#toasts');
    const el = document.createElement('div');
    el.className = `toast${type === 'ok' ? '' : ' toast--' + type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 350); }, type === 'error' ? 8000 : 3800);
  }

  function fail(err, fallback) {
    if (err && err.code === 'AUTH_REQUIRED') { signOut(err.message); return; }
    toast((err && err.message) || fallback || 'Something went wrong.', 'error');
  }

  /* Uploads made in a form that hasn't been saved yet. They are deleted if the form is abandoned. */
  function cleanupPending(keep = []) {
    const drop = [...state.pending].filter(u => !keep.includes(u));
    state.pending.clear();
    if (drop.length) API.deleteImages(drop).catch(() => { /* can be removed later in the media library */ });
  }

  /* ---------------------------------------------------------- sign in / out */
  function showLogin(message = '') {
    $('#app').hidden = true;
    $('#login-view').hidden = false;
    const configured = API.isConfigured();
    $('#login-form').hidden = !configured;
    $('#login-setup').hidden = configured;
    $('#login-msg').textContent = message;
    if (configured) setTimeout(() => $('#login-form').elements.password.focus(), 50);
  }

  async function signOut(message = '') {
    cleanupPending();
    state.data = null; state.dirty = false; state.lib = null; state.selected.clear();
    await API.logout();
    showLogin(message);
  }

  async function startApp() {
    $('#login-view').hidden = true;
    $('#app').hidden = false;
    $('#view').innerHTML = '<p class="loading">Loading the website content…</p>';
    if (!await loadData()) return;
    state.lastHash = location.hash;
    route();
  }

  async function loadData() {
    try {
      state.data = await API.getAdminData();
      setConn(true);
      updateBadges();
      return true;
    } catch (err) {
      setConn(false);
      if (err.code === 'AUTH_REQUIRED') { signOut(err.message); return false; }
      $('#view').innerHTML = `<div class="empty"><p>${esc(err.message || 'Could not load the website content.')}</p><button class="btn btn--primary" type="button" data-action="retry">Try again</button></div>`;
      return false;
    }
  }

  function setConn(ok) {
    const el = $('#conn-status');
    el.classList.toggle('is-live', ok);
    el.textContent = ok ? 'Connected' : 'Not connected';
  }

  function updateBadges() {
    const badge = (sel, n) => { const el = $(sel); el.hidden = !n; el.textContent = n; };
    badge('#nav-enquiries-badge', list('enquiries').filter(e => (text(e.status) || 'New') === 'New').length);
    badge('#nav-reviews-badge', list('reviews').filter(r => text(r.status) === 'Pending').length);
  }

  /* ---------------------------------------------------------------- routing */
  function route() {
    const name = location.hash.replace('#', '');
    const next = VIEWS[name] ? name : 'dashboard';
    if (next !== state.view) state.selected.clear();
    state.view = next;
    $$('.sidebar__nav a').forEach(a => { if (a.dataset.view === state.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#view-title').textContent = VIEWS[state.view];
    document.title = `${VIEWS[state.view]} · SSV Admin`;
    closeSidebar();
    if (state.data) render();
  }

  function render() {
    const root = $('#view'), v = state.view;
    if (v === 'dashboard') renderDashboard(root);
    else if (v === 'general') renderGeneral(root);
    else if (v === 'gallery') renderGallery(root);
    else if (v === 'reviews') renderReviews(root);
    else if (v === 'media') renderMedia(root);
    else if (v === 'enquiries') renderEnquiries(root);
    else if (v === 'settings') renderSettings(root);
    else renderCollection(root, v);
    syncSelection();
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    $('#sidebar-toggle').setAttribute('aria-expanded', 'false');
  }

  function versionWarning() {
    const v = meta().version;
    return v && olderThan(v, BACKEND_VERSION)
      ? `<p class="hint-box hint-box--warn">The Apps Script backend is version ${esc(v)}; this panel expects ${BACKEND_VERSION}. Paste the new Code.gs, run SSV Admin › Set up / repair sheets, then Deploy › Manage deployments › Edit › Version: New version › Deploy.</p>`
      : '';
  }

  /* ------------------------------------------------------- select & delete */
  /* Keeps the "N selected" bar and the select-all box in step with the ticked items. */
  function syncSelection() {
    const root = $('#view');
    const boxes = $$('[data-select]', root);
    const present = new Set(boxes.map(b => b.dataset.select));
    [...state.selected].forEach(id => { if (!present.has(id)) state.selected.delete(id); });
    const n = state.selected.size;
    $('#bulk-bar').hidden = !n;
    $('#bulk-count').textContent = `${n} selected`;
    document.body.classList.toggle('has-bulk', n > 0);
    const all = $('[data-select-all]', root);
    if (all) { all.checked = n > 0 && n === boxes.length; all.indeterminate = n > 0 && n < boxes.length; }
  }

  function select(box, on) {
    box.checked = on;
    if (on) state.selected.add(box.dataset.select); else state.selected.delete(box.dataset.select);
    const item = box.closest('tr, .media-card');
    if (item) item.classList.toggle('is-selected', on);
  }

  async function bulkDelete() {
    const key = state.view, ids = [...state.selected], n = ids.length;
    if (!n) return;
    const [one, many] = nouns(key);
    if (!confirm(`Delete ${n} ${n === 1 ? one : many}? This can't be undone.`)) return;
    const btn = $('#bulk-delete');
    btn.disabled = true;
    try {
      if (key === 'media') {
        const res = await API.deleteImages(ids);
        const gone = (res.deleted || []).length, kept = (res.kept || []).length;
        state.selected.clear();
        toast(kept ? `${gone} deleted. ${kept} used on the website, so kept.` : `${gone} ${gone === 1 ? one : many} deleted.`, kept ? 'warn' : 'ok');
        await renderMedia($('#view'), true);
        return;
      }
      const res = await API.deleteRecords(key, ids);
      const gone = new Set(res.deleted || []);
      state.data[key] = list(key).filter(r => !gone.has(r.id));
      state.selected.clear();
      toast(`${gone.size} ${gone.size === 1 ? one : many} deleted.`);
      updateBadges();
      render();
    } catch (err) {
      fail(err, 'Could not delete.');
    } finally {
      btn.disabled = false;
    }
  }

  /* ----------------------------------------------------- drag to reorder */
  /* With a mouse, drag the row or card itself. On touch screens, drag the ⠿ handle,
     so the page still scrolls normally. */
  function enableSort(root, key) {
    const box = $('[data-sortable]', root);
    if (!box) return;
    const grid = box.dataset.sortable === 'grid';
    const ids = () => $$('[data-sort-id]', box).map(el => el.dataset.sortId);
    let drag = null;
    const hit = () => {
      const over = document.elementFromPoint(drag.x, drag.y);
      const target = over && over.closest('[data-sort-id]');
      if (!target || target === drag.item || target.parentNode !== box) return;
      const r = target.getBoundingClientRect();
      const after = grid ? drag.x > r.left + r.width / 2 : drag.y > r.top + r.height / 2;
      box.insertBefore(drag.item, after ? target.nextSibling : target);
    };
    const tick = () => {   // scrolls the page while dragging near its top or bottom edge
      if (!drag) return;
      if (drag.on) {
        const edge = 80, y = drag.y, h = window.innerHeight;
        const dy = y < edge ? -(edge - y) / 5 : (y > h - edge ? (y - h + edge) / 5 : 0);
        if (dy) { window.scrollBy(0, dy); hit(); }
      }
      drag.raf = requestAnimationFrame(tick);
    };
    const move = e => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.x = e.clientX; drag.y = e.clientY;
      if (!drag.on) {
        if (Math.abs(drag.x - drag.x0) + Math.abs(drag.y - drag.y0) < 6) return;
        drag.on = true;
        drag.item.classList.add('is-dragging');
        document.body.classList.add('is-sorting');
      }
      e.preventDefault();
      hit();
    };
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      cancelAnimationFrame(d.raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      d.item.classList.remove('is-dragging');
      document.body.classList.remove('is-sorting');
      if (!d.on) return;
      const now = ids();
      if (now.join('\n') !== d.start.join('\n')) applyOrder(key, now);
    };
    box.addEventListener('pointerdown', e => {
      const item = e.target.closest('[data-sort-id]');
      if (drag || !item || item.parentNode !== box || e.button > 0) return;
      const onHandle = e.target.closest('[data-drag]');
      if (!onHandle && (e.pointerType !== 'mouse' || e.target.closest('button, a, input, select, textarea, label, summary'))) return;
      e.preventDefault();
      drag = { item, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false, start: ids() };
      drag.raf = requestAnimationFrame(tick);
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
  }

  /* Saves a new order: ids from first to last. */
  async function applyOrder(key, ids) {
    const byId = new Map(list(key).map(r => [r.id, r]));
    ids.forEach((id, n) => { const r = byId.get(id); if (r) r.display_order = n + 1; });
    render();
    try { await API.reorder(key, ids); }
    catch (err) { fail(err, 'Could not change the order.'); if (await loadData()) render(); }
  }

  function move(key, id, dir) {
    const ids = sortedRows(key).map(r => r.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    applyOrder(key, ids);
  }

  /* -------------------------------------------------------------- dashboard */
  function todo() {
    const m = meta(), items = [];
    const active = key => list(key).filter(r => truthy(r.active));
    if (!cloudinaryReady()) items.push(['Set up photo uploads (Cloudinary)', '#settings']);
    if (!m.notifyEmail) items.push(['Get an email for every enquiry and review', '#settings']);
    if (m.google && !m.google.keySet) items.push(['Show your Google rating and reviews', '#settings']);
    if (!active('plans').length) items.push(['Add membership plans', '#plans']);
    else if (active('plans').some(p => !text(p.price))) items.push(['Add membership prices', '#plans']);
    if (!active('gallery').length) items.push(['Add photos to the gallery', '#gallery']);
    return items;
  }

  function renderDashboard(root) {
    const enquiries = list('enquiries').slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const newCount = enquiries.filter(e => (text(e.status) || 'New') === 'New').length;
    const waiting = list('reviews').filter(r => text(r.status) === 'Pending').length;
    const google = meta().google || {};
    const items = todo();
    const card = (label, value, href, alert) => `<a class="stat-card${alert ? ' stat-card--alert' : ''}" href="${href}"><span class="stat-card__label">${label}</span><span class="stat-card__value">${value}</span></a>`;
    const links = (rows, cls) => `<ul class="checklist${cls}">${rows.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul>`;
    root.innerHTML = `${versionWarning()}
      <div class="stat-cards">
        ${card('New enquiries', newCount, '#enquiries', newCount > 0)}
        ${card('Reviews waiting', waiting, '#reviews', waiting > 0)}
        ${google.rating ? card(`Google rating · ${esc(String(google.count || 0))} reviews`, Number(google.rating).toFixed(1), '#settings') : card('Membership plans', list('plans').filter(p => truthy(p.active)).length, '#plans')}
        ${card('Gallery items', list('gallery').filter(p => truthy(p.active)).length, '#gallery')}
      </div>
      <div class="dash-grid">
        <section class="panel">
          <div class="panel__head"><h2>Recent enquiries</h2><a href="#enquiries">See all</a></div>
          ${enquiries.length ? `<ul class="lead-list">${enquiries.slice(0, 5).map(e => `<li>
              <div class="lead-list__row"><strong>${esc(e.name)}</strong><span>${esc(timeAgo(e.date) || formatDate(e.date))}</span></div>
              ${text(e.message) ? `<p>${esc(e.message)}</p>` : ''}
              <div class="lead-list__row"><span>${esc(e.phone)}</span>${statusText(e.status)}</div>
            </li>`).join('')}</ul>`
            : '<p class="muted">No enquiries yet. They appear here when visitors send the form on the website.</p>'}
        </section>
        <section class="panel">
          ${items.length
            ? `<div class="panel__head"><h2>To set up</h2><small>${items.length} left</small></div>${links(items, '')}`
            : `<div class="panel__head"><h2>Shortcuts</h2></div>${links(SHORTCUTS, ' checklist--links')}`}
        </section>
      </div>`;
  }

  /* ---------------------------------------------------------------- fields */
  function fieldHtml(f, value, section) {
    const v = value === undefined || value === null ? '' : value;
    const id = `f-${f.key}`;
    const full = f.full || f.type === 'list' || f.type === 'image' ? ' field--full' : '';
    const hint = f.hint ? `<small class="field__hint">${esc(f.hint)}</small>` : '';
    const label = `<span class="field__label">${esc(f.label)}${f.required ? ' *' : ''}</span>`;
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
    switch (f.type) {
      case 'check':
        return `<label class="field field--check"><input type="checkbox" name="${f.key}"${truthy(v) ? ' checked' : ''}> ${esc(f.label)}</label>`;
      case 'textarea':
        return `<label class="field${full}" for="${id}">${label}<textarea id="${id}" name="${f.key}" rows="${f.rows || 3}"${f.max ? ` maxlength="${f.max}"` : ''}${ph}>${esc(v)}</textarea>${hint}</label>`;
      case 'list':
        return `<label class="field${full}" for="${id}">${label}<textarea id="${id}" name="${f.key}" rows="4">${esc(splitList(v).join('\n'))}</textarea>${hint}</label>`;
      case 'select':
      case 'category': {
        const opts = f.type === 'category' ? categoryOptions() : f.options.slice();
        if (text(v) && !opts.some(([k]) => String(k) === String(v).toLowerCase() || String(k) === String(v))) opts.unshift([String(v), catLabel(v)]);
        const current = f.type === 'category' ? String(v).toLowerCase() : String(v);
        const extra = f.type === 'category' ? '<option value="__new">+ New category…</option>' : '';
        return `<label class="field${full}" for="${id}">${label}<select id="${id}" name="${f.key}"${f.type === 'category' ? ' data-category' : ''}>${opts.map(([k, l]) => `<option value="${esc(k)}"${String(k) === current ? ' selected' : ''}>${esc(l)}</option>`).join('')}${extra}</select>${hint}</label>`;
      }
      case 'date':
        return `<label class="field${full}" for="${id}">${label}<input id="${id}" type="date" name="${f.key}" value="${esc(isoDate(v))}">${hint}</label>`;
      case 'number':
        return `<label class="field${full}" for="${id}">${label}<input id="${id}" type="number" name="${f.key}" value="${esc(v)}"${ph}>${hint}</label>`;
      case 'image':
        return imageFieldHtml(f, v, section);
      default:
        return `<label class="field${full}" for="${id}">${label}<input id="${id}" type="text" name="${f.key}" value="${esc(v)}"${ph}>${hint}</label>`;
    }
  }

  function imageFieldHtml(f, value, section) {
    const v = text(value);
    const noun = f.video ? 'photo or video' : 'photo';
    return `<div class="field field--full image-field" data-image-field data-section="${esc(section)}"${f.video ? ' data-video="1"' : ''}>
      <span class="field__label">${esc(f.label)}${f.required ? ' *' : ''}</span>
      <div class="image-field__row">
        <div class="image-field__preview">${v ? thumb(v, 300) : '<span>Nothing yet</span>'}</div>
        <div class="image-field__controls">
          <div class="image-field__actions">
            <button class="btn btn--ghost btn--sm" type="button" data-upload${cloudinaryReady() ? '' : ' disabled title="Set up photo uploads in Settings first"'}>${v ? `Replace ${noun}` : `Upload ${noun}`}</button>
          </div>
          <div class="progress" hidden><span></span></div>
          <details class="image-field__link"${v && !/res\.cloudinary\.com|^data:/i.test(v) ? ' open' : ''}><summary>Link</summary><input type="url" name="${f.key}" value="${esc(v)}" placeholder="https://…" inputmode="url"></details>
          ${f.hint ? `<small class="field__hint">${esc(f.hint)}</small>` : ''}
        </div>
      </div>
    </div>`;
  }

  /* Values of a form, checked for required fields. null when something is missing. */
  function readForm(form, fields) {
    const out = {};
    for (const f of fields) {
      const el = form.elements[f.key];
      if (!el) continue;
      let v;
      if (f.type === 'check') v = el.checked;
      else if (f.type === 'list') v = splitList(el.value).join(' | ');
      else v = text(el.value);
      if (f.type === 'category' && v === '__new') v = '';
      if (f.required && v === '') {
        const details = el.closest && el.closest('details');
        if (details) details.open = true;
        el.focus();
        toast(`${f.label} is required.`, 'error');
        return null;
      }
      out[f.key] = v;
    }
    return out;
  }

  /* ---------------------------------------------------------------- uploads */
  function sectionFolder(section) {
    const media = meta().media || {};
    const s = media.sections || {};
    return s[section] || s.general || `${media.base || 'SSV-Gym'}/Home`;
  }

  /* One hidden file input serves every upload button. */
  let pickResolve = null;
  function pickFiles(multiple, accept = IMAGE_ACCEPT) {
    return new Promise(resolve => {
      if (pickResolve) pickResolve([]);   // an earlier picker was closed without a choice
      pickResolve = resolve;
      const picker = $('#file-picker');
      picker.multiple = Boolean(multiple);
      picker.accept = accept;
      picker.value = '';
      picker.click();
    });
  }
  $('#file-picker').addEventListener('change', e => { const r = pickResolve; pickResolve = null; if (r) r(Array.from(e.target.files || [])); });
  $('#file-picker').addEventListener('cancel', () => { const r = pickResolve; pickResolve = null; if (r) r([]); });

  function bindImageFields(root) {
    $$('[data-image-field]', root).forEach(box => {
      const input = $('input[type="url"]', box), preview = $('.image-field__preview', box), btn = $('[data-upload]', box);
      const noun = box.dataset.video ? 'photo or video' : 'photo';
      input.addEventListener('input', () => {
        const v = text(input.value);
        preview.innerHTML = v ? thumb(v, 300) : '<span>Nothing yet</span>';
        btn.textContent = v ? `Replace ${noun}` : `Upload ${noun}`;
      });
      btn.addEventListener('click', async () => {
        const files = await pickFiles(false, box.dataset.video ? MEDIA_ACCEPT : IMAGE_ACCEPT);
        if (!files.length) return;
        uploadInto(box, files[0], sectionFolder(box.dataset.section));
      });
    });
  }

  async function uploadInto(box, file, folder) {
    const input = $('input[type="url"]', box), bar = $('.progress', box), fill = $('.progress span', box), btn = $('[data-upload]', box);
    const noun = box.dataset.video ? 'photo or video' : 'photo';
    bar.hidden = false;
    fill.style.width = '0%';
    btn.disabled = true;
    btn.textContent = 'Uploading…';
    try {
      const res = await API.uploadMedia(file, { folder, onProgress: p => { fill.style.width = `${p}%`; } });
      state.pending.add(res.url);
      input.value = res.url;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      toast(`${res.kind === 'video' ? 'Video' : 'Photo'} uploaded. Save to use it.`);
    } catch (err) {
      fail(err, 'Upload failed.');
    } finally {
      bar.hidden = true;
      btn.disabled = false;
      btn.textContent = text(input.value) ? `Replace ${noun}` : `Upload ${noun}`;
    }
  }

  /* Choosing "+ New category…" in a category list asks for the name and adds it. */
  async function addCategory(select) {
    const name = (prompt('Name of the new category:') || '').replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) { select.value = select.options[0] ? select.options[0].value : ''; return; }
    const names = galleryCategories();
    if (!names.some(n => n.toLowerCase() === name.toLowerCase())) {
      names.push(name);
      try { state.data.general = await API.saveGeneralData({ gallery_categories: names.join(' | ') }); }
      catch (err) { fail(err, 'Could not save the new category.'); return; }
    }
    const key = name.toLowerCase();
    if (![...select.options].some(o => o.value === key)) select.add(new Option(name, key), select.options[select.options.length - 1]);
    select.value = key;
    toast(`Category "${name}" added.`);
  }

  function editCategories() {
    openModal({
      title: 'Gallery categories',
      body: `<div class="form-grid">${fieldHtml({ key: 'gallery_categories', label: 'Categories', type: 'list', hint: 'One per line, in the order of the filter buttons on the gallery page. Renaming or removing one here does not change photos that already use it.' }, galleryCategories().join(' | '))}</div>`,
      saveLabel: 'Save categories',
      onSave: async form => {
        const names = splitList(form.elements.gallery_categories.value.replace(/\|/g, '\n'));
        if (!names.length) { toast('Add at least one category.', 'error'); return false; }
        state.data.general = await API.saveGeneralData({ gallery_categories: names.join(' | ') });
        toast('Categories saved.');
        render();
        return true;
      }
    });
  }

  /* ---------------------------------------------------- general information */
  function setDirty(on) {
    state.dirty = on;
    const note = $('#dirty-note'), btn = $('#general-save');
    if (note) note.hidden = !on;
    if (btn) btn.disabled = !on;
  }
  function discardChanges() { state.dirty = false; cleanupPending(); }

  function renderGeneral(root) {
    const g = general();
    root.innerHTML = `<form id="general-form" class="stack" novalidate>
      ${GENERAL.map(sec => `<section class="panel">
        <div class="panel__head"><h2>${esc(sec.title)}</h2></div>
        ${sec.note ? `<p class="panel__note panel__note--top">${esc(sec.note)}</p>` : ''}
        <div class="form-grid">${sec.fields.map(f => fieldHtml(f, g[f.key], 'general')).join('')}</div>
      </section>`).join('')}
      <div class="form-actions"><span class="dirty-note" id="dirty-note" hidden>Unsaved changes</span><button class="btn btn--primary" type="submit" id="general-save" disabled>Save changes</button></div>
    </form>`;
    const form = $('#general-form');
    bindImageFields(form);
    form.addEventListener('input', () => setDirty(true));
    form.addEventListener('change', () => setDirty(true));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const values = readForm(form, GENERAL.flatMap(s => s.fields));
      if (!values) return;
      const btn = $('#general-save');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        state.data.general = await API.saveGeneralData(values);
        cleanupPending(Object.values(values));
        setDirty(false);
        toast('Saved. The website shows the changes within a few minutes.');
      } catch (err) {
        fail(err, 'Could not save.');
        btn.disabled = false;
      } finally {
        btn.textContent = 'Save changes';
      }
    });
  }

  /* ------------------------------------------------------------ edit dialog */
  let modalSave = null;
  function openModal({ title, body, saveLabel = 'Save', onSave }) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = body;
    $('#modal-save').textContent = saveLabel;
    $('#modal-save').disabled = false;
    modalSave = onSave;
    bindImageFields($('#modal-body'));
    $('#modal').showModal();
    const first = $('#modal-body input[type="text"], #modal-body textarea, #modal-body select');
    if (first) first.focus();
  }
  function closeModal() { if ($('#modal').open) $('#modal').close(); }

  $('#modal').addEventListener('close', () => { cleanupPending(); modalSave = null; $('#modal-body').innerHTML = ''; });
  $('#modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
  $('#modal').addEventListener('change', e => { if (e.target.matches('select[data-category]') && e.target.value === '__new') addCategory(e.target); });
  $('#modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!modalSave) return;
    const btn = $('#modal-save'), label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try { if (await modalSave($('#modal-form'))) closeModal(); }
    catch (err) { fail(err, 'Could not save.'); }
    finally { btn.disabled = false; btn.textContent = label; }
  });

  /* ------------------------------------------------------------ collections */
  function sortedRows(key) {
    const rows = list(key).slice();
    if (key === 'announcements') return rows.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(b.date).localeCompare(String(a.date)));
    if (key === 'reviews') return rows;
    return rows.sort(byOrder);
  }

  function columns(key) {
    const withThumb = ['facilities', 'trainers', 'announcements'].includes(key);
    const name = r => `<div class="cell-main">${withThumb ? `<span class="thumb">${thumb(r.image_url, 120)}</span>` : ''}<strong>${esc(r.name || r.title || 'Untitled')}</strong></div>`;
    const price = r => (text(r.price) ? esc(formatPrice(r.price)) : '<span class="muted">On enquiry</span>');
    switch (key) {
      case 'facilities': return [{ label: 'Name', cell: name }, { label: 'Shown as', cell: r => (text(r.category).toLowerCase() === 'additional' ? 'Also at SSV' : 'Main area') }];
      case 'plans': return [{ label: 'Plan', cell: name }, { label: 'Duration', cell: r => esc(r.duration) }, { label: 'Price', cell: price }, { label: 'Highlight', cell: r => (truthy(r.featured) ? pill('Highlighted', 'on') : '') }];
      case 'services': return [{ label: 'Name', cell: name }, { label: 'Price', cell: price }, { label: 'Under the price', cell: r => esc(r.price_note) }];
      case 'trainers': return [{ label: 'Name', cell: name }, { label: 'Role', cell: r => esc(r.role) }];
      case 'announcements': return [{ label: 'Title', cell: name }, { label: 'Shown as', cell: r => (text(r.image_url) ? pill('Event card') : pill('Notice')) }, { label: 'Date', cell: r => esc(formatDate(r.date)) }, { label: 'Until', cell: r => (text(r.expiry) ? esc(formatDate(r.expiry)) : '<span class="muted">No end</span>') }];
      default: return [{ label: 'Name', cell: name }];
    }
  }

  function renderCollection(root, key) {
    const c = COLLECTIONS[key];
    const rows = sortedRows(key);
    const shown = rows.filter(r => truthy(r.active)).length;
    const cols = columns(key);
    const order = (r, i) => `<td class="col-order">${handle()}<button class="icon-btn" type="button" data-move="-1" data-id="${esc(r.id)}" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button><button class="icon-btn" type="button" data-move="1" data-id="${esc(r.id)}" aria-label="Move down"${i === rows.length - 1 ? ' disabled' : ''}>↓</button></td>`;
    root.innerHTML = `${c.intro ? `<p class="hint-box">${esc(c.intro)}</p>` : ''}
      <div class="toolbar">
        <p class="toolbar__info">${rows.length} ${rows.length === 1 ? c.one : c.many} · ${shown} shown on the website${c.ordered && rows.length > 1 ? ' · drag to reorder' : ''}</p>
        <div class="toolbar__actions"><button class="btn btn--primary btn--sm" type="button" data-add="${key}">Add ${c.one}</button></div>
      </div>
      ${rows.length ? `<div class="table-wrap"><table class="table">
        <thead><tr>${selectAllCell()}${c.ordered ? '<th class="col-order">Order</th>' : ''}${cols.map(col => `<th>${col.label}</th>`).join('')}<th>Status</th><th class="col-actions"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody${c.ordered ? ' data-sortable="list"' : ''}>${rows.map((r, i) => `<tr class="${rowClass(!truthy(r.active), r.id)}"${c.ordered ? ` data-sort-id="${esc(r.id)}"` : ''}>
          ${selectCell(r.id, `Select ${r.name || r.title || ''}`)}
          ${c.ordered ? order(r, i) : ''}
          ${cols.map(col => `<td>${col.cell(r)}</td>`).join('')}
          <td>${truthy(r.active) ? pill('Shown', 'on') : pill('Hidden')}</td>
          <td class="col-actions"><button class="btn btn--ghost btn--xs" type="button" data-edit="${esc(r.id)}">Edit</button><button class="btn btn--danger btn--xs" type="button" data-delete="${esc(r.id)}">Delete</button></td>
        </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty"><p>No ${c.many} yet.</p><button class="btn btn--primary" type="button" data-add="${key}">Add ${c.one}</button></div>`}`;
    if (c.ordered) enableSort(root, key);
  }

  function nextOrder(key) { return list(key).reduce((m, r) => Math.max(m, Number(r.display_order) || 0), 0) + 1; }

  function openEditor(key, record) {
    const c = COLLECTIONS[key], isNew = !record;
    const r = record || { active: true, category: key === 'facilities' ? 'major' : (key === 'gallery' ? photoCategory : ''), status: 'Published', rating: '5', date: isoDate(new Date()), priority: 1 };
    openModal({
      title: isNew ? `Add ${c.one}` : `Edit ${c.one}`,
      body: `<div class="form-grid">${c.fields.map(f => fieldHtml(f, r[f.key], c.media)).join('')}</div>`,
      saveLabel: isNew ? `Add ${c.one}` : 'Save',
      onSave: async form => {
        const values = readForm(form, c.fields);
        if (!values) return false;
        if (isNew && c.ordered) values.display_order = nextOrder(key);
        if (!isNew) values.id = record.id;
        const saved = await API.saveRecord(key, values);
        const rows = list(key);
        const i = rows.findIndex(x => x.id === saved.id);
        if (i >= 0) rows[i] = saved; else rows.push(saved);
        cleanupPending(c.fields.filter(f => f.type === 'image').map(f => values[f.key]));
        toast(isNew ? `${cap(c.one)} added.` : 'Saved.');
        updateBadges();
        render();
        return true;
      }
    });
  }

  async function removeRecord(key, id) {
    const c = COLLECTIONS[key];
    const r = list(key).find(x => x.id === id);
    if (!r) return;
    const label = r.name || r.title;
    if (!confirm(`Delete this ${c.one}${label ? ` ("${label}")` : ''}? This can't be undone.`)) return;
    try {
      await API.deleteRecord(key, id);
      state.data[key] = list(key).filter(x => x.id !== id);
      state.selected.delete(id);
      toast(`${cap(c.one)} deleted.`);
      updateBadges();
      render();
    } catch (err) { fail(err, 'Could not delete.'); }
  }

  /* ------------------------------------------------- gallery (photos & videos) */
  /* Category given to items added with "Add photos or videos" (remembered while the panel is open). */
  let photoCategory = 'gym';

  function galleryCard(r, i, n) {
    const kind = mediaKind(r.image_url), on = state.selected.has(r.id);
    const badge = !truthy(r.active) ? '<span class="pill media-card__state">Hidden</span>' : (kind !== 'image' ? '<span class="pill media-card__state">Video</span>' : '');
    return `<article class="media-card${truthy(r.active) ? '' : ' is-muted'}${on ? ' is-selected' : ''}" data-sort-id="${esc(r.id)}">
      <div class="media-card__img">${thumb(r.image_url, 500) || 'No photo'}${pickBox(r.id, `Select ${r.title || 'item'}`)}<span class="pill media-card__cat">${esc(catLabel(r.category))}</span>${badge}</div>
      <div class="media-card__body"><strong>${esc(r.title || (kind === 'image' ? 'Untitled photo' : 'Untitled video'))}</strong></div>
      <div class="media-card__actions">
        ${handle()}
        <button class="icon-btn" type="button" data-move="-1" data-id="${esc(r.id)}" aria-label="Move earlier"${i === 0 ? ' disabled' : ''}>←</button>
        <button class="icon-btn" type="button" data-move="1" data-id="${esc(r.id)}" aria-label="Move later"${i === n - 1 ? ' disabled' : ''}>→</button>
        <span class="spacer"></span>
        <button class="btn btn--ghost btn--xs" type="button" data-edit="${esc(r.id)}">Edit</button>
        <button class="btn btn--danger btn--xs" type="button" data-delete="${esc(r.id)}">Delete</button>
      </div>
    </article>`;
  }

  function renderGallery(root) {
    const rows = sortedRows('gallery');
    const shown = rows.filter(r => truthy(r.active)).length;
    if (!categoryOptions().some(([k]) => k === photoCategory)) photoCategory = (categoryOptions()[0] || ['gym'])[0];
    root.innerHTML = `
      <div class="toolbar">
        <p class="toolbar__info">${rows.length} item${rows.length === 1 ? '' : 's'} · ${shown} shown on the website${rows.length > 1 ? ' · drag to reorder' : ''}</p>
        <div class="toolbar__actions">
          ${cloudinaryReady() ? `<label class="folder-pick"><span class="folder-pick__label">Category for new items</span><select id="new-photo-category">${categoryOptions().map(([k, l]) => `<option value="${esc(k)}"${k === photoCategory ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
          <button class="btn btn--primary btn--sm" type="button" data-add-photos${cloudinaryReady() ? '' : ' disabled'}>Add photos or videos</button>
          <button class="btn btn--ghost btn--sm" type="button" data-add="gallery">Add by link</button>
          <button class="btn btn--ghost btn--sm" type="button" data-action="edit-categories">Categories</button>
        </div>
      </div>
      <p class="hint-box">The first six shown items appear on the home page; the gallery page shows them all. Videos: MP4, MOV or WebM up to 100 MB, or <b>Add by link</b> with a YouTube link for longer ones.</p>
      ${cloudinaryReady() ? '' : '<p class="hint-box hint-box--warn">Uploads are not set up yet, so items can only be added by link. See Settings.</p>'}
      ${rows.length ? '<div class="toolbar"><label class="folder-pick"><input class="check" type="checkbox" data-select-all> Select all</label></div>' : ''}
      <ul class="upload-list" id="upload-list"></ul>
      ${rows.length ? `<div class="media-grid" data-sortable="grid">${rows.map((r, i) => galleryCard(r, i, rows.length)).join('')}</div>`
        : '<div class="empty"><p>Nothing in the gallery yet. Add photos and videos of the gym floor, the CrossFit zone, training and events.</p></div>'}`;
    enableSort(root, 'gallery');
  }

  const titleFromFile = name => String(name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, ch => ch.toUpperCase()).slice(0, 80) || 'Gallery item';

  /* Uploads several photos or videos into the Gallery folder and adds each one to the gallery. */
  async function addPhotos() {
    const pick = $('#new-photo-category');
    if (pick) photoCategory = pick.value;
    const category = photoCategory;
    const files = await pickFiles(true, MEDIA_ACCEPT);
    if (!files.length) return;
    const folder = sectionFolder('gallery');
    const rows = list('gallery');
    let order = nextOrder('gallery') - 1, added = 0;
    for (const file of files) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${esc(file.name)}</span><em>Uploading…</em>`;
      const box = $('#upload-list');
      if (box) box.appendChild(li);
      const status = $('em', li);
      try {
        const up = await API.uploadMedia(file, { folder, onProgress: p => { status.textContent = `${p}%`; } });
        status.textContent = 'Saving…';
        rows.push(await API.saveRecord('gallery', { image_url: up.url, title: titleFromFile(file.name), category, active: true, display_order: ++order }));
        li.classList.add('is-done');
        status.textContent = 'Added';
        added++;
      } catch (err) {
        li.classList.add('is-error');
        status.textContent = err.message || 'Failed';
        if (err.code === 'AUTH_REQUIRED') { fail(err); return; }
      }
    }
    if (state.view === 'gallery') {
      const log = ($('#upload-list') || {}).innerHTML || '';
      render();
      $('#upload-list').innerHTML = log;
    }
    toast(`${added} item${added === 1 ? '' : 's'} added to the gallery.`, added ? 'ok' : 'warn');
  }

  /* ---------------------------------------------------------------- reviews */
  const reviewStatus = r => text(r.status) || 'Published';
  function statusPill(s) {
    return s === 'Pending' ? pill('Waiting', 'warn') : s === 'Hidden' ? pill('Hidden') : pill('Published', 'on');
  }
  function reviewActions(r) {
    const id = esc(r.id), s = reviewStatus(r);
    const b = (status, label, kind = 'ghost') => `<button class="btn btn--${kind} btn--xs" type="button" data-review-status="${status}" data-id="${id}">${label}</button>`;
    const quick = s === 'Pending' ? b('Published', 'Approve', 'primary') + b('Hidden', 'Hide') : s === 'Hidden' ? b('Published', 'Publish') : b('Hidden', 'Hide');
    return `${quick}<button class="btn btn--ghost btn--xs" type="button" data-edit="${id}">Edit</button><button class="btn btn--danger btn--xs" type="button" data-delete="${id}">Delete</button>`;
  }

  function renderReviews(root) {
    const g = general();
    const rows = list('reviews').slice().sort((a, b) => (reviewStatus(a) === 'Pending' ? 0 : 1) - (reviewStatus(b) === 'Pending' ? 0 : 1) || String(b.date).localeCompare(String(a.date)));
    const count = s => rows.filter(r => reviewStatus(r) === s).length;
    const f = state.reviewFilter;
    const shown = f === 'all' ? rows : rows.filter(r => reviewStatus(r) === f);
    const seg = (key, label, n) => `<button class="seg" type="button" data-review-filter="${key}" aria-pressed="${f === key}">${label}<span>${n}</span></button>`;
    const formOn = g.review_form === undefined || g.review_form === '' || truthy(g.review_form);
    root.innerHTML = `
      <section class="panel review-settings">
        <div class="panel__head"><h2>Reviews written on the website</h2></div>
        <div class="switches">
          <label class="switch"><input type="checkbox" data-setting="review_form"${formOn ? ' checked' : ''}> Visitors can write reviews on the website</label>
          <label class="switch"><input type="checkbox" data-setting="review_approval"${truthy(g.review_approval) ? ' checked' : ''}> New reviews wait for my approval before they appear</label>
        </div>
        <p class="panel__note">Google reviews are shown next to these automatically. They are managed on Google, not here.</p>
      </section>
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Show reviews">${seg('all', 'All', rows.length)}${seg('Pending', 'Waiting', count('Pending'))}${seg('Published', 'Published', count('Published'))}${seg('Hidden', 'Hidden', count('Hidden'))}</div>
        <div class="toolbar__actions"><button class="btn btn--primary btn--sm" type="button" data-add="reviews">Add a review</button></div>
      </div>
      ${shown.length ? `<div class="table-wrap"><table class="table">
        <thead><tr>${selectAllCell()}<th>Rating</th><th>Review</th><th>Likes</th><th>Date</th><th>Status</th><th class="col-actions"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${shown.map(r => `<tr class="${rowClass(reviewStatus(r) === 'Hidden', r.id)}">
          ${selectCell(r.id, `Select the review by ${r.name}`)}
          <td class="nowrap">${stars(r.rating)}</td>
          <td><strong>${esc(r.name)}</strong>${text(r.source) === 'Admin' ? ' <span class="muted">(added by you)</span>' : ''}<div class="msg">${esc(r.review)}</div></td>
          <td>${Number(r.likes) || 0}</td>
          <td class="nowrap">${esc(formatDate(r.date))}</td>
          <td>${statusPill(reviewStatus(r))}</td>
          <td class="col-actions">${reviewActions(r)}</td>
        </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty"><p>${rows.length ? 'No reviews in this list.' : 'No reviews yet. Reviews written on the website appear here.'}</p></div>`}`;
  }

  async function setReviewStatus(id, status) {
    try {
      const saved = await API.saveRecord('reviews', { id, status });
      const rows = list('reviews');
      const i = rows.findIndex(r => r.id === id);
      if (i >= 0) rows[i] = saved;
      updateBadges();
      render();
      toast(status === 'Published' ? 'Review published.' : 'Review hidden.');
    } catch (err) { fail(err, 'Could not update the review.'); }
  }

  async function saveSetting(input) {
    const key = input.dataset.setting, value = input.checked;
    input.disabled = true;
    try {
      state.data.general = await API.saveGeneralData({ [key]: value });
      toast('Saved.');
    } catch (err) {
      input.checked = !value;
      fail(err, 'Could not save the setting.');
    } finally {
      input.disabled = false;
    }
  }

  /* -------------------------------------------------------------- enquiries */
  function renderEnquiries(root) {
    const rows = list('enquiries').slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const status = e => text(e.status) || 'New';
    const count = s => rows.filter(e => status(e) === s).length;
    const f = state.enquiryFilter;
    const shown = f === 'all' ? rows : rows.filter(e => status(e) === f);
    const seg = (key, label, n) => `<button class="seg" type="button" data-enquiry-filter="${key}" aria-pressed="${f === key}">${label}<span>${n}</span></button>`;
    const gym = text(general().gym_name) || 'SSV Gym';
    root.innerHTML = `
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Show enquiries">${seg('all', 'All', rows.length)}${seg('New', 'New', count('New'))}${seg('Contacted', 'Contacted', count('Contacted'))}${seg('Closed', 'Closed', count('Closed'))}</div>
        <div class="toolbar__actions"><button class="btn btn--ghost btn--sm" type="button" data-action="refresh-inbox">Check for new</button></div>
      </div>
      ${shown.length ? `<div class="table-wrap"><table class="table">
        <thead><tr>${selectAllCell()}<th>Name</th><th>Phone</th><th>Message</th><th>Received</th><th>Status</th></tr></thead>
        <tbody>${shown.map(e => {
          const intl = realPhone(e.phone), s = status(e);
          const wa = `https://wa.me/${intl}?text=${encodeURIComponent(`Hi ${text(e.name)}, thank you for contacting ${gym}.`)}`;
          return `<tr class="${rowClass(false, e.id)}">
            ${selectCell(e.id, `Select the enquiry from ${e.name}`)}
            <td><strong>${esc(e.name)}</strong></td>
            <td class="nowrap">${esc(e.phone)}${intl ? `<div><a href="tel:+${intl}">Call</a> · <a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a></div>` : ''}</td>
            <td><div class="msg">${text(e.message) ? esc(e.message) : '<span class="muted">No message</span>'}</div></td>
            <td class="nowrap" title="${esc(formatDate(e.date))}">${esc(timeAgo(e.date) || formatDate(e.date))}</td>
            <td><select class="status-select status--${s.toLowerCase()}" data-enquiry="${esc(e.id)}" aria-label="Status for ${esc(e.name)}">${['New', 'Contacted', 'Closed'].map(o => `<option${o === s ? ' selected' : ''}>${o}</option>`).join('')}</select></td>
          </tr>`;
        }).join('')}</tbody></table></div>`
        : `<div class="empty"><p>${rows.length ? 'No enquiries in this list.' : 'No enquiries yet. They appear here when visitors send the form on the website.'}</p></div>`}`;
  }

  async function setEnquiryStatus(sel) {
    const id = sel.dataset.enquiry, status = sel.value;
    sel.disabled = true;
    try {
      await API.updateEnquiryStatus(id, status);
      const e = list('enquiries').find(x => x.id === id);
      if (e) e.status = status;
      updateBadges();
      render();
      toast(`Marked as ${status.toLowerCase()}.`);
    } catch (err) {
      fail(err, 'Could not update the status.');
      render();
    }
  }

  async function refreshInbox() {
    try {
      const d = await API.getInbox();
      state.data.enquiries = d.enquiries || [];
      state.data.reviews = d.reviews || [];
      updateBadges();
      render();
      toast('Up to date.');
    } catch (err) { fail(err, 'Could not check for new enquiries.'); }
  }

  /* --------------------------------------------------------------- settings */
  function googlePanel(g) {
    if (!g.placeId) return '<p>Put the gym\'s Google Place ID next to GOOGLE_PLACE_ID in the Config tab of the Google Sheet.</p>';
    if (!g.keySet) return '<p>Not connected yet. In the Google Sheet, run <strong>SSV Admin › Set Google Places key</strong> and paste your Google Places API key. The website then shows the Google rating, the number of reviews and recent Google reviews.</p>';
    if (g.error) return `<p class="field__warn">Google says: ${esc(g.error)}</p><p class="panel__note">Check that Places API (New) is enabled for the key's project and that billing is on, then Refresh from Google.</p>`;
    return `<div class="google-score"><strong>${Number(g.rating || 0).toFixed(1)}</strong><span>${stars(g.rating)}</span></div>
      <p>${esc(String(g.count || 0))} reviews on Google. The website shows the rating and ${g.reviews ? `${g.reviews} recent reviews` : 'a link to the reviews'}.</p>
      <p class="panel__note">Google is asked again every 6 hours. Replies and removals happen on Google.</p>`;
  }

  function renderSettings(root) {
    const m = meta();
    const base = (m.media && m.media.base) || 'SSV-Gym';
    const g = m.google || {};
    const secrets = m.secrets || {};
    root.innerHTML = `${versionWarning()}<div class="settings-grid">
      <section class="panel">
        <div class="panel__head"><h2>Google rating and reviews</h2></div>
        ${googlePanel(g)}
        <div class="panel__actions">
          ${g.keySet ? '<button class="btn btn--ghost btn--sm" type="button" data-action="google-refresh">Refresh from Google</button>' : ''}
          ${g.url ? `<a class="btn btn--ghost btn--sm" href="${esc(g.url)}" target="_blank" rel="noopener">Open the reviews on Google</a>` : ''}
        </div>
      </section>
      <section class="panel">
        <div class="panel__head"><h2>Keys and passwords</h2></div>
        <p class="panel__note panel__note--top">Kept in Apps Script › Project Settings › Script properties, never in the sheet or the website. The Config tab of the Google Sheet lists the same.</p>
        <dl class="kv">${SECRETS.map(([key, label, how]) => `<div><dt>${esc(label)}</dt><dd>${secrets[key] ? pill('Stored', 'on') : `${pill('Not set', 'warn')}<small>${esc(how)}</small>`}</dd></div>`).join('')}</dl>
      </section>
      <section class="panel">
        <div class="panel__head"><h2>Connection</h2></div>
        <dl class="kv">
          <div><dt>Google Sheet</dt><dd>${m.sheetUrl ? `<a href="${esc(m.sheetUrl)}" target="_blank" rel="noopener">Open the Google Sheet</a>` : 'Connected'}</dd></div>
          <div><dt>Backend version</dt><dd>${esc(m.version || 'unknown')}</dd></div>
          <div><dt>Time zone</dt><dd>${esc(m.timeZone || '')}</dd></div>
        </dl>
      </section>
      <section class="panel">
        <div class="panel__head"><h2>Email alerts</h2></div>
        ${m.notifyEmail ? `<p>New enquiries and reviews are emailed to <strong>${esc(m.notifyEmail)}</strong>.</p>` : '<p>Email alerts are off.</p>'}
        <p class="panel__note">To change the addresses, edit NOTIFY_EMAIL in the Config tab of the Google Sheet. Separate several with commas. These addresses only receive alerts; they don't give access to this panel.</p>
      </section>
      <section class="panel">
        <div class="panel__head"><h2>Photos and videos</h2></div>
        ${m.cloudinaryConfigured
          ? `<p>Uploads are ready. Files are stored in Cloudinary, in the <strong>${esc(base)}</strong> folder.</p>`
          : '<p>Uploads are not set up yet.</p><ul class="notes"><li>Put your Cloudinary cloud name next to CLOUDINARY_CLOUD_NAME in the Config tab.</li><li>In the Google Sheet, run SSV Admin › Set Cloudinary keys and paste the API key and secret.</li></ul>'}
      </section>
      <section class="panel">
        <div class="panel__head"><h2>Password and sign-in</h2></div>
        <ul class="notes">
          <li>Anyone with the admin password can edit the website. Change it in the Google Sheet: SSV Admin › Set admin password. Everyone signed in is then signed out.</li>
          <li>After 5 wrong passwords, sign-in locks for 15 minutes. Unlock it with SSV Admin › Unlock admin sign-in.</li>
        </ul>
        <div class="panel__actions"><button class="btn btn--ghost btn--sm" type="button" data-action="logout">Sign out</button></div>
      </section>
    </div>
    <p class="version-note">Admin panel ${BACKEND_VERSION} · backend ${esc(m.version || 'unknown')}</p>`;
  }

  async function refreshGoogle(btn) {
    btn.disabled = true;
    btn.textContent = 'Asking Google…';
    try {
      const g = await API.refreshGoogle();
      state.data.meta.google = g;
      render();
      if (g.error) toast(`Google says: ${g.error}`, 'error'); else toast('Google rating and reviews updated.');
    } catch (err) {
      fail(err, 'Could not reach Google.');
      btn.disabled = false;
      btn.textContent = 'Refresh from Google';
    }
  }

  /* ---------------------------------------------------------- media library */
  async function renderMedia(root, fresh = false) {
    if (!cloudinaryReady()) {
      root.innerHTML = '<div class="empty"><p>Uploads are not set up yet, so there is no media library.</p><a class="btn btn--primary" href="#settings">Open Settings</a></div>';
      return;
    }
    if (!state.lib || fresh) {
      if (!fresh || !state.lib) root.innerHTML = '<p class="loading">Loading photos and videos…</p>';
      try {
        state.lib = await API.mediaLibrary();
      } catch (err) {
        if (err.code === 'AUTH_REQUIRED') { fail(err); return; }
        if (state.view !== 'media') return;
        root.innerHTML = `<div class="empty"><p>${esc(err.message || 'Could not load the media library.')}</p><p class="muted">If this keeps happening, open the Google Sheet and run SSV Admin › Set Cloudinary keys once, allowing access when Google asks.</p><button class="btn btn--primary" type="button" data-action="media-refresh">Try again</button></div>`;
        return;
      }
      if (state.view !== 'media') return;
    }
    drawMedia(root);
  }

  /* The website's folders only: All, then Home, Facilities, Trainers, Gallery and Events. */
  function drawMedia(root) {
    const lib = state.lib;
    const folders = lib.folders && lib.folders.length ? lib.folders : [lib.base];
    const cur = folders.includes(state.libFolder) ? state.libFolder : lib.base;
    state.libFolder = cur;
    const within = p => i => i.folder === p || i.folder.startsWith(p + '/');
    const count = p => lib.images.filter(within(p)).length;
    const images = lib.images.filter(within(cur)).sort((a, b) => String(b.created).localeCompare(String(a.created)));
    const isSection = cur !== lib.base;
    const unused = images.filter(i => !(i.usedIn || []).length).length;
    const folderName = p => (p === lib.base ? 'All' : p.split('/').pop());
    root.innerHTML = `<div class="media-lib">
      <nav class="folder-tree" aria-label="Folders"><ul>${folders.map(p => `<li><button type="button" data-folder-open="${esc(p)}" style="--depth:${p === lib.base ? 0 : 1}"${p === cur ? ' aria-current="true"' : ''}><span class="folder-tree__icon" aria-hidden="true"></span><span class="folder-tree__name">${esc(folderName(p))}</span><span class="folder-tree__count">${count(p)}</span></button></li>`).join('')}</ul></nav>
      <div class="media-lib__main">
        <div class="media-lib__head">
          <h2>${esc(isSection ? folderName(cur) : 'All photos and videos')}</h2>
          <div class="toolbar__actions">
            ${unused ? '<label class="folder-pick"><input class="check" type="checkbox" data-select-all> Select all unused</label>' : ''}
            ${isSection ? '<button class="btn btn--primary btn--sm" type="button" data-action="media-upload">Upload here</button>' : ''}
            <button class="btn btn--ghost btn--sm" type="button" data-action="media-refresh">Refresh</button>
          </div>
        </div>
        ${lib.truncated ? '<p class="hint-box hint-box--warn">There are more files than can be listed at once. Only the newest are shown.</p>' : ''}
        ${isSection ? '' : '<p class="panel__note panel__note--top">To upload, choose Home, Facilities, Trainers, Gallery or Events.</p>'}
        <ul class="upload-list" id="upload-list"></ul>
        ${images.length ? `<div class="media-grid">${images.map(mediaCard).join('')}</div>` : '<div class="empty"><p>Nothing in this folder yet.</p></div>'}
      </div>
    </div>`;
    syncSelection();
  }

  function mediaCard(file) {
    const used = file.usedIn || [];
    const video = file.type === 'video', on = state.selected.has(file.url);
    const where = file.folder !== state.libFolder ? ` · ${esc(file.folder.split('/').pop())}` : '';
    const size = file.width && file.height ? `${file.width} × ${file.height} · ` : '';
    const length = video && file.duration ? `${Math.round(file.duration)} s · ` : '';
    return `<article class="media-card${used.length ? '' : ' is-unused'}${on ? ' is-selected' : ''}">
      <div class="media-card__img">${thumb(file.url, 500)}${used.length ? (video ? '<span class="pill media-card__state">Video</span>' : '') : `${pickBox(file.url, 'Select this file')}<span class="pill pill--warn media-card__state">Not used</span>`}</div>
      <div class="media-card__body">
        <strong title="${esc(file.id)}">${esc(file.id.split('/').pop())}</strong>
        <small class="media-card__use">${used.length ? `Used in: ${esc(used.join(', '))}` : 'Not used on the website'}</small>
        <small>${size}${length}${sizeText(file.bytes)}${where}</small>
      </div>
      <div class="media-card__actions">
        <button class="btn btn--ghost btn--xs" type="button" data-copy="${esc(file.url)}">Copy link</button>
        ${/^data:/i.test(file.url) ? '' : `<a class="btn btn--ghost btn--xs" href="${esc(file.url)}" target="_blank" rel="noopener">Open</a>`}
        <span class="spacer"></span>
        ${used.length ? '' : `<button class="btn btn--danger btn--xs" type="button" data-delete-image="${esc(file.url)}">Delete</button>`}
      </div>
    </article>`;
  }

  async function mediaUpload() {
    const folder = state.libFolder;
    const videosAllowed = /\/(Gallery|Events)$/.test(folder);
    const files = await pickFiles(true, videosAllowed ? MEDIA_ACCEPT : IMAGE_ACCEPT);
    if (!files.length) return;
    let done = 0;
    for (const file of files) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${esc(file.name)}</span><em>Uploading…</em>`;
      const box = $('#upload-list');
      if (box) box.appendChild(li);
      const status = $('em', li);
      try {
        await API.uploadMedia(file, { folder, onProgress: p => { status.textContent = `${p}%`; } });
        li.classList.add('is-done');
        status.textContent = 'Uploaded';
        done++;
      } catch (err) {
        li.classList.add('is-error');
        status.textContent = err.message || 'Failed';
        if (err.code === 'AUTH_REQUIRED') { fail(err); return; }
      }
    }
    toast(`${done} file${done === 1 ? '' : 's'} uploaded. Use Copy link to put one in a field.`, done ? 'ok' : 'warn');
    if (state.view === 'media') renderMedia($('#view'), true);
  }

  async function deleteImage(url) {
    if (!confirm('Delete this file from Cloudinary? This can\'t be undone.')) return;
    try {
      const res = await API.deleteImages([url]);
      const gone = res.deleted && res.deleted.length;
      state.selected.delete(url);
      toast(gone ? 'Deleted.' : 'This file is used on the website, so it was kept.', gone ? 'ok' : 'warn');
      renderMedia($('#view'), true);
    } catch (err) { fail(err, 'Could not delete the file.'); }
  }

  async function copyLink(url) {
    try { await navigator.clipboard.writeText(url); toast('Link copied.'); }
    catch { prompt('Copy this link:', url); }
  }

  /* ----------------------------------------------------------------- events */
  $('#view').addEventListener('click', e => {
    const t = e.target.closest('button, a[data-action]');
    if (!t || t.disabled) return;
    const d = t.dataset, key = state.view;
    if (d.add) openEditor(d.add, null);
    else if (d.edit) { const r = list(key).find(x => x.id === d.edit); if (r) openEditor(key, r); }
    else if (d.delete) removeRecord(key, d.delete);
    else if (d.move) move(key, d.id, Number(d.move));
    else if ('addPhotos' in d) addPhotos();
    else if (d.reviewStatus) setReviewStatus(d.id, d.reviewStatus);
    else if (d.reviewFilter) { state.reviewFilter = d.reviewFilter; render(); }
    else if (d.enquiryFilter) { state.enquiryFilter = d.enquiryFilter; render(); }
    else if (d.folderOpen) { state.libFolder = d.folderOpen; state.selected.clear(); drawMedia($('#view')); }
    else if (d.copy) copyLink(d.copy);
    else if (d.deleteImage) deleteImage(d.deleteImage);
    else if (d.action === 'retry') { loadData().then(ok => { if (ok) route(); }); }
    else if (d.action === 'logout') confirmSignOut();
    else if (d.action === 'refresh-inbox') refreshInbox();
    else if (d.action === 'edit-categories') editCategories();
    else if (d.action === 'google-refresh') refreshGoogle(t);
    else if (d.action === 'media-refresh') renderMedia($('#view'), true);
    else if (d.action === 'media-upload') mediaUpload();
  });

  $('#view').addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-select]')) { select(t, t.checked); syncSelection(); }
    else if (t.matches('[data-select-all]')) { $$('[data-select]', $('#view')).forEach(b => select(b, t.checked)); syncSelection(); }
    else if (t.matches('[data-enquiry]')) setEnquiryStatus(t);
    else if (t.matches('[data-setting]')) saveSetting(t);
    else if (t.id === 'new-photo-category') photoCategory = t.value;
  });

  $('#bulk-delete').addEventListener('click', bulkDelete);
  $('#bulk-clear').addEventListener('click', () => {
    $$('[data-select]', $('#view')).forEach(b => select(b, false));
    syncSelection();
  });

  window.addEventListener('hashchange', () => {
    if (!state.data) return;
    if (state.dirty) {
      if (!confirm('You have unsaved changes. Leave without saving?')) { history.replaceState(null, '', state.lastHash || '#general'); return; }
      discardChanges();
    }
    state.lastHash = location.hash;
    route();
    $('#view-title').focus();
  });

  window.addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('pagehide', () => { if (state.pending.size) API.deleteImagesOnExit([...state.pending]); });

  /* A picture that fails to load leaves an empty box instead of a broken image. */
  document.addEventListener('error', e => {
    const el = e.target;
    if (el && el.tagName === 'IMG' && el.closest('.image-field__preview, .thumb, .media-card__img')) el.remove();
  }, true);

  $('#sidebar-toggle').addEventListener('click', () => {
    const open = document.body.classList.toggle('sidebar-open');
    $('#sidebar-toggle').setAttribute('aria-expanded', String(open));
  });
  $('#scrim').addEventListener('click', closeSidebar);

  function confirmSignOut() {
    if (state.dirty && !confirm('You have unsaved changes. Sign out and lose them?')) return;
    signOut();
  }
  $('#logout-btn').addEventListener('click', confirmSignOut);

  $('#refresh-btn').addEventListener('click', async () => {
    if (state.dirty && !confirm('You have unsaved changes. Refresh and lose them?')) return;
    if (state.dirty) discardChanges();
    const btn = $('#refresh-btn');
    btn.disabled = true;
    btn.textContent = 'Refreshing…';
    state.lib = null;
    if (await loadData()) {
      render();
      toast('Up to date.');
    }
    btn.disabled = false;
    btn.textContent = 'Refresh';
  });

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget, btn = $('button[type="submit"]', form), password = form.elements.password.value;
    if (!password) { $('#login-msg').textContent = 'Enter the admin password.'; return; }
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    $('#login-msg').textContent = '';
    try {
      await API.login(password);
      form.reset();
      await startApp();
    } catch (err) {
      $('#login-msg').textContent = err.message || 'Could not sign in.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  /* ------------------------------------------------------------------- boot */
  async function boot() {
    if (!API.isConfigured()) { showLogin(); return; }
    if (API.getToken()) {
      $('#login-view').hidden = true;
      try { await API.verifySession(); await startApp(); return; }
      catch (err) { API.setToken(null); }
    }
    showLogin();
  }
  boot();
})();
