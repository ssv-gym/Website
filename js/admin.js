/* ==========================================================================
   SSV GYM — ADMIN PANEL                                              v1.4.1
   Signs in with the password checked by Apps Script, then edits the Google
   Sheet through the API: general information, collections, reviews, photos
   (Cloudinary) and enquiries. Works on phones too. Photos always go into
   their section's folder (Home, Facilities, Trainers, Gallery).
   ========================================================================== */
(() => {
  'use strict';
  const BACKEND_VERSION = '1.4.1';   // the Code.gs version this panel expects
  const { esc, text, truthy, splitList, isoDate, formatDate, timeAgo, formatPrice, byOrder, cld, safeUrl, realPhone } = Utils;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.1l-5.62 2.99 1.07-6.27L2.9 9.4l6.3-.9z"/></svg>';

  /* Sample content written by the sheet setup, to be replaced with the gym's own. */
  const SAMPLE = {
    trainers: ['tr-aman-verma', 'tr-neha-kulkarni', 'tr-vikram-singh'],
    prices: { 'plan-monthly': '1200', 'plan-quarterly': '3000', 'plan-half-yearly': '5500', 'plan-yearly': '9000' },
    stats: { stat_1_value: '5+', stat_2_value: '40+', stat_3_value: '3', stat_4_value: '7' }
  };
  const isStock = url => /images\.unsplash\.com/i.test(String(url || ''));
  const CATEGORY_OPTIONS = [['gym', 'Gym'], ['crossfit', 'CrossFit'], ['training', 'Training'], ['equipment', 'Equipment'], ['events', 'Events']];

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
      one: 'photo', many: 'photos', ordered: true, media: 'gallery',
      fields: [
        { key: 'image_url', label: 'Photo', type: 'image', required: true },
        { key: 'title', label: 'Title' },
        { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS },
        { key: 'caption', label: 'Caption', type: 'textarea', full: true },
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
      one: 'announcement', many: 'announcements', media: 'general',
      intro: 'Shown in a strip near the top of the website. Higher priority shows first.',
      fields: [
        { key: 'title', label: 'Title', required: true, full: true },
        { key: 'description', label: 'Details', type: 'textarea', full: true },
        { key: 'date', label: 'Date', type: 'date' },
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
      { key: 'featured_badge_text', label: 'Label on the highlighted plan', placeholder: 'Best value' },
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
      { key: 'facilities_intro', label: 'Text under the Facilities heading', type: 'textarea', full: true }
    ] },
    { title: 'Contact', fields: [
      { key: 'phone', label: 'Phone', placeholder: '+91 75586 08585' },
      { key: 'whatsapp', label: 'WhatsApp', hint: 'Empty = the phone number is used.' },
      { key: 'address', label: 'Address', type: 'textarea', hint: 'A | starts a new line.' },
      { key: 'opening_hours', label: 'Opening hours', type: 'textarea', hint: 'A | starts a new line.' }
    ] },
    { title: 'Map and social links', fields: [
      { key: 'maps_url', label: 'Google Maps link', full: true, hint: 'Google Maps › Share › Copy link.' },
      { key: 'maps_embed_url', label: 'Map on the website', type: 'textarea', full: true, hint: 'Google Maps › Share › Embed a map › Copy HTML. Paste the whole code or just the link.' },
      { key: 'instagram_url', label: 'Instagram', placeholder: 'https://www.instagram.com/ssvgym2021/' },
      { key: 'facebook_url', label: 'Facebook' }
    ] }
  ];

  const VIEWS = {
    dashboard: 'Dashboard', general: 'General information', facilities: 'Facilities', plans: 'Membership plans', trainers: 'Trainers',
    gallery: 'Gallery', reviews: 'Reviews', announcements: 'Announcements', media: 'Media library', enquiries: 'Enquiries', settings: 'Settings'
  };

  const state = {
    data: null, view: 'dashboard', dirty: false, folders: null, foldersLoading: null, lib: null, libFolder: '',
    reviewFilter: 'all', enquiryFilter: 'all', pending: new Set(), lastHash: ''
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
  const plain = v => text(v).replace(/[₹,\s]/g, '');
  const olderThan = (a, b) => {
    const x = String(a).split('.').map(n => parseInt(n, 10) || 0), y = String(b).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
    return false;
  };
  const thumb = (url, w = 200) => { const u = safeUrl(url); return u ? `<img src="${esc(cld(u, w))}" alt="" loading="lazy">` : ''; };
  const pill = (label, kind = '') => `<span class="pill${kind ? ' pill--' + kind : ''}">${esc(label)}</span>`;
  const stars = n => {
    const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return `<span class="stars-mini" role="img" aria-label="${r} out of 5">${[1, 2, 3, 4, 5].map(i => `<span${i <= r ? ' class="is-on"' : ''}>${STAR}</span>`).join('')}</span>`;
  };
  const sizeText = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b || 0} B`);
  const catLabel = c => (CATEGORY_OPTIONS.find(([k]) => k === text(c).toLowerCase()) || [null, text(c) || 'Photo'])[1];
  const statusText = s => { const v = text(s) || 'New'; return `<span class="status status--${esc(v.toLowerCase())}">${esc(v)}</span>`; };

  function toast(message, type = 'ok') {
    const box = $('#modal').open ? $('#modal-toasts') : $('#toasts');
    const el = document.createElement('div');
    el.className = `toast${type === 'ok' ? '' : ' toast--' + type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 350); }, type === 'error' ? 7000 : 3800);
  }

  function fail(err, fallback) {
    if (err && err.code === 'AUTH_REQUIRED') { signOut(err.message); return; }
    toast((err && err.message) || fallback || 'Something went wrong.', 'error');
  }

  /* Photos uploaded in a form that hasn't been saved yet. They are deleted if the form is abandoned. */
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
    state.data = null; state.dirty = false; state.lib = null; state.folders = null; state.foldersLoading = null;
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
    state.view = VIEWS[name] ? name : 'dashboard';
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

  /* -------------------------------------------------------------- dashboard */
  function todo() {
    const g = general(), items = [];
    const active = key => list(key).filter(r => truthy(r.active));
    if (!cloudinaryReady()) items.push(['Set up photo uploads (Cloudinary)', '#settings']);
    if (!meta().notifyEmail) items.push(['Get an email for every enquiry and review', '#settings']);
    const photos = [g.hero_image, g.about_image, ...list('facilities').map(f => f.image_url), ...list('trainers').map(t => t.image_url), ...list('gallery').map(p => p.image_url)];
    if (photos.some(isStock)) items.push(['Replace the stand-in photos with photos of SSV', '#gallery']);
    if (!active('trainers').length) items.push(['Add your trainers', '#trainers']);
    else if (list('trainers').some(t => SAMPLE.trainers.includes(t.id))) items.push(['Replace the sample trainers with your own team', '#trainers']);
    const plans = active('plans');
    if (plans.some(p => !text(p.price))) items.push(['Add membership prices', '#plans']);
    else if (plans.some(p => SAMPLE.prices[p.id] !== undefined && plain(p.price) === SAMPLE.prices[p.id])) items.push(['Replace the sample membership prices', '#plans']);
    if (Object.keys(SAMPLE.stats).every(k => text(g[k]) === SAMPLE.stats[k])) items.push(['Check the sample statistics', '#general']);
    if (!active('gallery').length) items.push(['Add photos to the gallery', '#gallery']);
    return items;
  }

  function renderDashboard(root) {
    const enquiries = list('enquiries').slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const newCount = enquiries.filter(e => (text(e.status) || 'New') === 'New').length;
    const waiting = list('reviews').filter(r => text(r.status) === 'Pending').length;
    const items = todo();
    const card = (label, value, href, alert) => `<a class="stat-card${alert ? ' stat-card--alert' : ''}" href="${href}"><span class="stat-card__label">${label}</span><span class="stat-card__value">${value}</span></a>`;
    root.innerHTML = `${versionWarning()}
      <div class="stat-cards">
        ${card('New enquiries', newCount, '#enquiries', newCount > 0)}
        ${card('Reviews waiting', waiting, '#reviews', waiting > 0)}
        ${card('Membership plans', list('plans').filter(p => truthy(p.active)).length, '#plans')}
        ${card('Gallery photos', list('gallery').filter(p => truthy(p.active)).length, '#gallery')}
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
          <div class="panel__head"><h2>Finish your website</h2><small>${items.length ? `${items.length} to do` : 'All done'}</small></div>
          ${items.length ? `<ul class="checklist">${items.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul>` : '<p class="muted">Everything is set up.</p>'}
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
      case 'select': {
        const opts = f.options.slice();
        if (text(v) && !opts.some(([k]) => String(k) === String(v))) opts.unshift([String(v), String(v)]);
        return `<label class="field${full}" for="${id}">${label}<select id="${id}" name="${f.key}">${opts.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint}</label>`;
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
    return `<div class="field field--full image-field" data-image-field data-section="${esc(section)}">
      <span class="field__label">${esc(f.label)}${f.required ? ' *' : ''}</span>
      <div class="image-field__row">
        <div class="image-field__preview">${v ? thumb(v, 300) : '<span>No photo yet</span>'}</div>
        <div class="image-field__controls">
          <div class="image-field__actions">
            <button class="btn btn--ghost btn--sm" type="button" data-upload${cloudinaryReady() ? '' : ' disabled title="Set up photo uploads in Settings first"'}>${v ? 'Replace photo' : 'Upload photo'}</button>
          </div>
          <div class="progress" hidden><span></span></div>
          <details class="image-field__link"${v && !/res\.cloudinary\.com/i.test(v) ? ' open' : ''}><summary>Photo link</summary><input type="url" name="${f.key}" value="${esc(v)}" placeholder="https://…" inputmode="url"></details>
          ${f.hint ? `<small class="field__hint">${esc(f.hint)}</small>` : ''}
          ${isStock(v) ? '<small class="field__warn">Stand-in photo. Replace it with a photo of SSV.</small>' : ''}
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

  /* ------------------------------------------------------ folders & uploads */
  function sectionFolder(section) {
    const media = meta().media || {};
    const s = media.sections || {};
    return s[section] || s.general || `${media.base || 'SSV-Gym'}/Home`;
  }

  /* One hidden file input serves every upload button. */
  let pickResolve = null;
  function pickFiles(multiple) {
    return new Promise(resolve => {
      if (pickResolve) pickResolve([]);   // an earlier picker was closed without a choice
      pickResolve = resolve;
      const picker = $('#file-picker');
      picker.multiple = Boolean(multiple);
      picker.value = '';
      picker.click();
    });
  }
  $('#file-picker').addEventListener('change', e => { const r = pickResolve; pickResolve = null; if (r) r(Array.from(e.target.files || [])); });
  $('#file-picker').addEventListener('cancel', () => { const r = pickResolve; pickResolve = null; if (r) r([]); });

  function bindImageFields(root) {
    $$('[data-image-field]', root).forEach(box => {
      const input = $('input[type="url"]', box), preview = $('.image-field__preview', box), btn = $('[data-upload]', box);
      input.addEventListener('input', () => {
        const v = text(input.value);
        preview.innerHTML = v ? thumb(v, 300) : '<span>No photo yet</span>';
        btn.textContent = v ? 'Replace photo' : 'Upload photo';
      });
      btn.addEventListener('click', async () => {
        const files = await pickFiles(false);
        if (!files.length) return;
        uploadInto(box, files[0], sectionFolder(box.dataset.section));
      });
    });
  }

  async function uploadInto(box, file, folder) {
    const input = $('input[type="url"]', box), bar = $('.progress', box), fill = $('.progress span', box), btn = $('[data-upload]', box);
    bar.hidden = false;
    fill.style.width = '0%';
    btn.disabled = true;
    btn.textContent = 'Uploading…';
    try {
      const res = await API.uploadImage(file, { folder, onProgress: p => { fill.style.width = `${p}%`; } });
      state.pending.add(res.url);
      input.value = res.url;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      toast('Photo uploaded. Save to use it.');
    } catch (err) {
      fail(err, 'Upload failed.');
    } finally {
      bar.hidden = true;
      btn.disabled = false;
      btn.textContent = text(input.value) ? 'Replace photo' : 'Upload photo';
    }
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
    const mark = e => { if (!e.target.matches('[data-folder]')) setDirty(true); };
    form.addEventListener('input', mark);
    form.addEventListener('change', mark);
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

  function isSample(key, r) {
    return (key === 'trainers' && SAMPLE.trainers.includes(r.id)) || isStock(r.image_url)
      || (key === 'plans' && SAMPLE.prices[r.id] !== undefined && plain(r.price) === SAMPLE.prices[r.id]);
  }

  function columns(key) {
    const name = r => `<div class="cell-main">${key === 'plans' || key === 'announcements' ? '' : `<span class="thumb">${thumb(r.image_url, 120)}</span>`}<div><strong>${esc(r.name || r.title || 'Untitled')}</strong>${isSample(key, r) ? ` ${pill('Sample', 'warn')}` : ''}</div></div>`;
    switch (key) {
      case 'facilities': return [{ label: 'Name', cell: name }, { label: 'Shown as', cell: r => (text(r.category).toLowerCase() === 'additional' ? 'Also at SSV' : 'Main area') }];
      case 'plans': return [{ label: 'Plan', cell: name }, { label: 'Duration', cell: r => esc(r.duration) }, { label: 'Price', cell: r => (text(r.price) ? esc(formatPrice(r.price)) : '<span class="muted">On enquiry</span>') }, { label: 'Highlight', cell: r => (truthy(r.featured) ? pill('Highlighted', 'on') : '') }];
      case 'trainers': return [{ label: 'Name', cell: name }, { label: 'Role', cell: r => esc(r.role) }];
      case 'announcements': return [{ label: 'Title', cell: name }, { label: 'Date', cell: r => esc(formatDate(r.date)) }, { label: 'Until', cell: r => (text(r.expiry) ? esc(formatDate(r.expiry)) : '<span class="muted">No end</span>') }, { label: 'Priority', cell: r => esc(r.priority) }];
      default: return [{ label: 'Name', cell: name }];
    }
  }

  function renderCollection(root, key) {
    const c = COLLECTIONS[key];
    const rows = sortedRows(key);
    const shown = rows.filter(r => truthy(r.active)).length;
    const cols = columns(key);
    root.innerHTML = `${c.intro ? `<p class="hint-box">${esc(c.intro)}</p>` : ''}
      <div class="toolbar">
        <p class="toolbar__info">${rows.length} ${rows.length === 1 ? c.one : c.many} · ${shown} shown on the website</p>
        <div class="toolbar__actions"><button class="btn btn--primary btn--sm" type="button" data-add="${key}">Add ${c.one}</button></div>
      </div>
      ${rows.length ? `<div class="table-wrap"><table class="table">
        <thead><tr>${c.ordered ? '<th class="col-order">Order</th>' : ''}${cols.map(col => `<th>${col.label}</th>`).join('')}<th>Status</th><th class="col-actions"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="${truthy(r.active) ? '' : 'is-muted'}">
          ${c.ordered ? `<td class="col-order"><button class="icon-btn" type="button" data-move="-1" data-id="${esc(r.id)}" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button><button class="icon-btn" type="button" data-move="1" data-id="${esc(r.id)}" aria-label="Move down"${i === rows.length - 1 ? ' disabled' : ''}>↓</button></td>` : ''}
          ${cols.map(col => `<td>${col.cell(r)}</td>`).join('')}
          <td>${truthy(r.active) ? pill('Shown', 'on') : pill('Hidden')}</td>
          <td class="col-actions"><button class="btn btn--ghost btn--xs" type="button" data-edit="${esc(r.id)}">Edit</button><button class="btn btn--danger btn--xs" type="button" data-delete="${esc(r.id)}">Delete</button></td>
        </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty"><p>No ${c.many} yet.</p><button class="btn btn--primary" type="button" data-add="${key}">Add ${c.one}</button></div>`}`;
  }

  function nextOrder(key) { return list(key).reduce((m, r) => Math.max(m, Number(r.display_order) || 0), 0) + 1; }

  function openEditor(key, record) {
    const c = COLLECTIONS[key], isNew = !record;
    const r = record || { active: true, category: key === 'facilities' ? 'major' : 'gym', status: 'Published', rating: '5', date: isoDate(new Date()), priority: 1 };
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
      toast(`${cap(c.one)} deleted.`);
      updateBadges();
      render();
    } catch (err) { fail(err, 'Could not delete.'); }
  }

  async function move(key, id, dir) {
    const rows = sortedRows(key);
    const i = rows.findIndex(r => r.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    rows.forEach((r, n) => { r.display_order = n + 1; });
    render();
    try { await API.reorder(key, rows.map(r => r.id)); }
    catch (err) { fail(err, 'Could not change the order.'); if (await loadData()) render(); }
  }

  /* ---------------------------------------------------------------- gallery */
  function renderGallery(root) {
    const rows = sortedRows('gallery');
    const shown = rows.filter(r => truthy(r.active)).length;
    root.innerHTML = `
      <div class="toolbar">
        <p class="toolbar__info">${rows.length} photo${rows.length === 1 ? '' : 's'} · ${shown} shown on the website</p>
        <div class="toolbar__actions">${cloudinaryReady() ? `<label class="folder-pick"><span class="folder-pick__label">Category for new photos</span><select id="new-photo-category">${CATEGORY_OPTIONS.map(([k, l]) => `<option value="${k}"${k === photoCategory ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}<button class="btn btn--primary btn--sm" type="button" data-add-photos${cloudinaryReady() ? '' : ' disabled'}>Add photos</button><button class="btn btn--ghost btn--sm" type="button" data-add="gallery">Add by link</button></div>
      </div>
      ${cloudinaryReady() ? '' : '<p class="hint-box hint-box--warn">Photo uploads are not set up yet, so photos can only be added by link. See Settings.</p>'}
      <ul class="upload-list" id="upload-list"></ul>
      ${rows.length ? `<div class="media-grid">${rows.map((r, i) => `<article class="media-card${truthy(r.active) ? '' : ' is-muted'}">
          <div class="media-card__img">${thumb(r.image_url, 500) || 'No photo'}<span class="pill media-card__cat">${esc(catLabel(r.category))}</span>${!truthy(r.active) ? '<span class="pill media-card__state">Hidden</span>' : (isStock(r.image_url) ? '<span class="pill pill--warn media-card__state">Sample</span>' : '')}</div>
          <div class="media-card__body"><strong>${esc(r.title || 'Untitled photo')}</strong>${text(r.caption) ? `<small>${esc(r.caption)}</small>` : ''}</div>
          <div class="media-card__actions">
            <button class="icon-btn" type="button" data-move="-1" data-id="${esc(r.id)}" aria-label="Move earlier"${i === 0 ? ' disabled' : ''}>←</button>
            <button class="icon-btn" type="button" data-move="1" data-id="${esc(r.id)}" aria-label="Move later"${i === rows.length - 1 ? ' disabled' : ''}>→</button>
            <span class="spacer"></span>
            <button class="btn btn--ghost btn--xs" type="button" data-edit="${esc(r.id)}">Edit</button>
            <button class="btn btn--danger btn--xs" type="button" data-delete="${esc(r.id)}">Delete</button>
          </div>
        </article>`).join('')}</div>`
        : '<div class="empty"><p>No photos yet. Add photos of the gym floor, the CrossFit zone, training and events.</p></div>'}`;
  }

  const titleFromFile = name => String(name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, ch => ch.toUpperCase()).slice(0, 80) || 'Gallery photo';
  /* Category given to photos added with "Add photos" (remembered while the panel is open). */
  let photoCategory = 'gym';

  /* Uploads several photos into the Gallery folder and adds each one to the gallery. */
  async function addPhotos() {
    const pick = $('#new-photo-category');
    if (pick) photoCategory = pick.value;
    const category = photoCategory;
    const files = await pickFiles(true);
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
        const up = await API.uploadImage(file, { folder, onProgress: p => { status.textContent = `${p}%`; } });
        status.textContent = 'Saving…';
        rows.push(await API.saveRecord('gallery', { image_url: up.url, title: titleFromFile(file.name), category, caption: '', active: true, display_order: ++order }));
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
      renderGallery($('#view'));
      $('#upload-list').innerHTML = log;
    }
    toast(`${added} photo${added === 1 ? '' : 's'} added to the gallery.`);
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
        <div class="panel__head"><h2>Review settings</h2></div>
        <div class="switches">
          <label class="switch"><input type="checkbox" data-setting="review_form"${formOn ? ' checked' : ''}> Visitors can write reviews on the website</label>
          <label class="switch"><input type="checkbox" data-setting="review_approval"${truthy(g.review_approval) ? ' checked' : ''}> New reviews wait for my approval before they appear</label>
        </div>
      </section>
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Show reviews">${seg('all', 'All', rows.length)}${seg('Pending', 'Waiting', count('Pending'))}${seg('Published', 'Published', count('Published'))}${seg('Hidden', 'Hidden', count('Hidden'))}</div>
        <div class="toolbar__actions"><button class="btn btn--primary btn--sm" type="button" data-add="reviews">Add a review</button></div>
      </div>
      ${shown.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Rating</th><th>Review</th><th>Likes</th><th>Date</th><th>Status</th><th class="col-actions"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${shown.map(r => `<tr class="${reviewStatus(r) === 'Hidden' ? 'is-muted' : ''}">
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
        <thead><tr><th>Name</th><th>Phone</th><th>Message</th><th>Received</th><th>Status</th></tr></thead>
        <tbody>${shown.map(e => {
          const intl = realPhone(e.phone), s = status(e);
          const wa = `https://wa.me/${intl}?text=${encodeURIComponent(`Hi ${text(e.name)}, thank you for contacting ${gym}.`)}`;
          return `<tr>
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
  function renderSettings(root) {
    const m = meta();
    const base = (m.media && m.media.base) || 'SSV-Gym';
    root.innerHTML = `${versionWarning()}<div class="settings-grid">
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
        <div class="panel__head"><h2>Photos</h2></div>
        ${m.cloudinaryConfigured
          ? `<p>Photo uploads are ready. Photos are stored in Cloudinary, in the <strong>${esc(base)}</strong> folder.</p>`
          : '<p>Photo uploads are not set up yet.</p><ul class="notes"><li>Put your Cloudinary cloud name next to CLOUDINARY_CLOUD_NAME in the Config tab.</li><li>In the Google Sheet, run SSV Admin › Set Cloudinary keys and paste the API key and secret.</li></ul>'}
        <p class="panel__note">If the media library shows an error about permission, run SSV Admin › Set Cloudinary keys once and allow access when Google asks.</p>
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

  /* ---------------------------------------------------------- media library */
  function sectionOf(path) {
    const s = (state.lib && state.lib.sections) || (meta().media && meta().media.sections) || {};
    return Object.values(s).find(p => path === p || path.startsWith(p + '/')) || '';
  }

  async function renderMedia(root, fresh = false) {
    if (!cloudinaryReady()) {
      root.innerHTML = '<div class="empty"><p>Photo uploads are not set up yet, so there is no media library.</p><a class="btn btn--primary" href="#settings">Open Settings</a></div>';
      return;
    }
    if (!state.lib || fresh) {
      if (!fresh || !state.lib) root.innerHTML = '<p class="loading">Loading photos…</p>';
      try {
        state.lib = await API.mediaLibrary(fresh);
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

  function drawMedia(root) {
    const lib = state.lib;
    const all = lib.folders || [];
    const cur = all.includes(state.libFolder) ? state.libFolder : lib.base;
    state.libFolder = cur;
    const within = p => i => i.folder === p || i.folder.startsWith(p + '/');
    const count = p => lib.images.filter(within(p)).length;
    const images = lib.images.filter(within(cur)).sort((a, b) => String(b.created).localeCompare(String(a.created)));
    const baseDepth = lib.base.split('/').length;
    const tree = all.filter(p => p === lib.base || p.startsWith(lib.base + '/'));
    const legacy = all.filter(p => (lib.legacy || []).some(l => p === l || p.startsWith(l + '/')));
    const item = (p, depth, label) => `<li><button type="button" data-folder-open="${esc(p)}" style="--depth:${depth}"${p === cur ? ' aria-current="true"' : ''}><span class="folder-tree__icon" aria-hidden="true"></span><span class="folder-tree__name">${esc(label || p.split('/').pop())}</span><span class="folder-tree__count">${count(p)}</span></button></li>`;
    const section = sectionOf(cur);
    const depthIn = section ? cur.split('/').length - section.split('/').length : -1;
    const isLegacy = legacy.includes(cur);
    const canDelete = (depthIn >= 1 || isLegacy) && !count(cur);
    const title = cur === lib.base ? 'All photos' : (cur.startsWith(lib.base + '/') ? cur.slice(lib.base.length + 1) : cur);
    root.innerHTML = `<div class="media-lib">
      <nav class="folder-tree" aria-label="Folders">
        <ul>${tree.map(p => item(p, p.split('/').length - baseDepth, p === lib.base ? 'All photos' : '')).join('')}</ul>
        ${legacy.length ? `<p class="folder-tree__group">Older uploads</p><ul>${legacy.map(p => item(p, p.split('/').length - 1)).join('')}</ul>` : ''}
      </nav>
      <div class="media-lib__main">
        <div class="media-lib__head">
          <h2>${esc(title)}</h2>
          <div class="toolbar__actions">
            ${section && depthIn === 0 ? '<button class="btn btn--primary btn--sm" type="button" data-action="media-upload">Upload here</button>' : ''}
            ${canDelete ? '<button class="btn btn--danger btn--sm" type="button" data-action="media-delete-folder">Delete folder</button>' : ''}
            <button class="btn btn--ghost btn--sm" type="button" data-action="media-refresh">Refresh</button>
          </div>
        </div>
        ${lib.truncated ? '<p class="hint-box hint-box--warn">There are more photos than can be listed at once. Only the newest are shown.</p>' : ''}
        ${section && depthIn === 0 ? '' : '<p class="panel__note panel__note--top">To upload photos here, choose Home, Facilities, Trainers or Gallery on the left.</p>'}
        <ul class="upload-list" id="upload-list"></ul>
        ${images.length ? `<div class="media-grid">${images.map(mediaCard).join('')}</div>` : '<div class="empty"><p>No photos in this folder yet.</p></div>'}
      </div>
    </div>`;
  }

  function mediaCard(photo) {
    const used = photo.usedIn || [];
    const where = photo.folder !== state.libFolder ? ` · ${esc(photo.folder.split('/').pop())}` : '';
    return `<article class="media-card${used.length ? '' : ' is-unused'}">
      <div class="media-card__img">${thumb(photo.url, 500)}${used.length ? '' : '<span class="pill pill--warn media-card__state">Not used</span>'}</div>
      <div class="media-card__body">
        <strong title="${esc(photo.id)}">${esc(photo.id.split('/').pop())}</strong>
        <small class="media-card__use">${used.length ? `Used in: ${esc(used.join(', '))}` : 'Not used on the website'}</small>
        <small>${photo.width && photo.height ? `${photo.width} × ${photo.height} · ` : ''}${sizeText(photo.bytes)}${where}</small>
      </div>
      <div class="media-card__actions">
        <button class="btn btn--ghost btn--xs" type="button" data-copy="${esc(photo.url)}">Copy link</button>
        <a class="btn btn--ghost btn--xs" href="${esc(photo.url)}" target="_blank" rel="noopener">Open</a>
        <span class="spacer"></span>
        ${used.length ? '' : `<button class="btn btn--danger btn--xs" type="button" data-delete-image="${esc(photo.id)}">Delete</button>`}
      </div>
    </article>`;
  }

  async function mediaUpload() {
    const files = await pickFiles(true);
    if (!files.length) return;
    const folder = state.libFolder;
    let done = 0;
    for (const file of files) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${esc(file.name)}</span><em>Uploading…</em>`;
      const box = $('#upload-list');
      if (box) box.appendChild(li);
      const status = $('em', li);
      try {
        await API.uploadImage(file, { folder, onProgress: p => { status.textContent = `${p}%`; } });
        li.classList.add('is-done');
        status.textContent = 'Uploaded';
        done++;
      } catch (err) {
        li.classList.add('is-error');
        status.textContent = err.message || 'Failed';
        if (err.code === 'AUTH_REQUIRED') { fail(err); return; }
      }
    }
    toast(`${done} photo${done === 1 ? '' : 's'} uploaded. Use Copy link to put a photo in a field.`);
    if (state.view === 'media') renderMedia($('#view'), true);
  }

  /* Only for emptying out old folders (such as ssv-gym). New folders can't be made here. */
  async function deleteFolder() {
    const path = state.libFolder;
    if (!confirm(`Delete the empty folder "${path.split('/').pop()}"?`)) return;
    try {
      await API.deleteFolder(path);
      state.libFolder = path.split('/').slice(0, -1).join('/');
      toast('Folder deleted.');
      await renderMedia($('#view'), true);
    } catch (err) { fail(err, 'Could not delete the folder.'); }
  }

  async function deleteImage(id) {
    if (!confirm('Delete this photo from Cloudinary? This can\'t be undone.')) return;
    try {
      const res = await API.deleteImages([id]);
      const gone = res.deleted && res.deleted.length;
      toast(gone ? 'Photo deleted.' : 'This photo is used on the website, so it was kept.', gone ? 'ok' : 'warn');
      renderMedia($('#view'), true);
    } catch (err) { fail(err, 'Could not delete the photo.'); }
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
    else if (d.folderOpen) { state.libFolder = d.folderOpen; drawMedia($('#view')); }
    else if (d.copy) copyLink(d.copy);
    else if (d.deleteImage) deleteImage(d.deleteImage);
    else if (d.action === 'retry') { loadData().then(ok => { if (ok) render(); }); }
    else if (d.action === 'logout') confirmSignOut();
    else if (d.action === 'refresh-inbox') refreshInbox();
    else if (d.action === 'media-refresh') renderMedia($('#view'), true);
    else if (d.action === 'media-upload') mediaUpload();
    else if (d.action === 'media-delete-folder') deleteFolder();
  });

  $('#view').addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-enquiry]')) setEnquiryStatus(t);
    else if (t.matches('[data-setting]')) saveSetting(t);
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

  /* A photo that fails to load leaves an empty box instead of a broken image. */
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
