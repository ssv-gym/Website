/* ==========================================================================
   SSV GYM — WEBSITE LOGIC                                            v1.5.0
   Renders every section from the Google Sheet via API.getContent(). Saved
   content shows at once and is refreshed in the background. If the sheet
   can't be reached on a first visit, the details built into index.html stay.
   ========================================================================== */
(() => {
  'use strict';
  const { esc, text, truthy, isFalse, splitList, isPlaceholder, realPhone, linkUrl, instagramUrl, mapEmbedSrc,
    pad2, toDate, isoDate, formatDate, timeAgo, formatPrice, durationMonths, activeSorted, initials, img, media } = Utils;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.1l-5.62 2.99 1.07-6.27L2.9 9.4l6.3-.9z"/></svg>';
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3l-1.2-1.1C6 14.9 3 12.2 3 8.9 3 6.2 5.1 4.2 7.7 4.2c1.5 0 2.9.7 3.8 1.8l.5.6.5-.6c.9-1.1 2.3-1.8 3.8-1.8 2.6 0 4.7 2 4.7 4.7 0 3.3-3 6-7.8 10.3z"/></svg>';
  const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="currentColor"/></svg>';
  const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const GYM_TIME_ZONE = 'Asia/Kolkata';
  const LIKED_KEY = 'ssv_liked_reviews';
  const TOP_REVIEWS = 3, PAGE_SIZE = 10, CLAMP_CHARS = 280;
  const LINK_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|info|biz|xyz|ru|top|shop|site|online|click|link)\b)/i;

  const state = { general: {}, gymName: 'SSV Gym', links: {}, reviews: [], reviewForm: false, sort: 'top', listCount: PAGE_SIZE, openedFrom: null };

  /* ---------- small DOM helpers ---------- */
  function setText(key, value) {
    $$(`[data-g="${key}"]`).forEach(el => {
      const v = text(value);
      if (el.hasAttribute('data-optional')) el.hidden = !v;
      if (v) el.textContent = v;
    });
  }
  function setLines(key, value) {
    const lines = splitList(value);
    $$(`[data-g-lines="${key}"]`).forEach(el => {
      const row = el.closest('[data-row]');
      if (row) row.hidden = !lines.length;
      el.innerHTML = lines.map(esc).join('<br>');
    });
  }
  function setList(key, value) {
    const items = splitList(value);
    $$(`[data-g-list="${key}"]`).forEach(el => {
      el.hidden = !items.length;
      el.innerHTML = items.map(i => `<li>${esc(i)}</li>`).join('');
    });
  }
  function setParagraphs(el, value) {
    const paras = splitList(value);
    if (paras.length) el.innerHTML = paras.map(p => `<p>${esc(p)}</p>`).join('');
  }
  function setBg(el, url, alt) {
    if (!el) return;
    const tag = img(url, alt, { sizes: '100vw', eager: true, widths: [800, 1200, 1600, 2400] });
    el.classList.toggle('has-img', Boolean(tag));
    el.innerHTML = tag;
  }
  function setMediaBox(el, url, alt) {
    if (!el) return;
    const tag = img(url, alt, { sizes: '(min-width: 920px) 50vw, 100vw' });
    el.classList.toggle('has-img', Boolean(tag));
    el.innerHTML = tag;
  }
  /* A missing section is hidden, together with every link and button that points to it. */
  function toggleSection(id, show) {
    const section = document.getElementById(id);
    if (section) section.hidden = !show;
    const key = id === 'membership' ? 'plans' : id;
    $$(`a[href="#${id}"]`).forEach(a => {
      const li = a.closest('.nav__list li, .footer__nav li');
      (li || a).hidden = !show;
    });
    $$(`[data-requires="${key}"], [data-requires="${id}"]`).forEach(el => { el.hidden = !show; });
  }
  const starRow = (n, label) => {
    const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return `<div class="review__stars" role="img" aria-label="${esc(label || `Rated ${r} out of 5`)}">${[1, 2, 3, 4, 5].map(i => `<span${i <= r ? ' class="is-on"' : ''}>${STAR}</span>`).join('')}</div>`;
  };
  const liked = () => { try { return JSON.parse(localStorage.getItem(LIKED_KEY)) || []; } catch { return []; } };
  const setLiked = (id, on) => {
    const list = liked().filter(x => x !== id);
    if (on) list.push(id);
    try { localStorage.setItem(LIKED_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  };

  /* Details built into index.html, used when the sheet can't be reached. */
  function readFallback() {
    try { return JSON.parse($('#fallback-general').textContent) || {}; } catch { return {}; }
  }

  /* ---------- opening hours ----------
     One line per group of days, "Monday – Saturday: 6:00 AM – 11:00 PM", lines separated by |.
     A line without "Days: " is shown as it is. Times follow the gym's clock (India). */
  const dayIndex = word => {
    const s = String(word || '').trim().toLowerCase().slice(0, 3);
    return s.length === 3 ? DAYS.findIndex(d => d.toLowerCase().startsWith(s)) : -1;
  };
  function parseDays(label) {
    const s = label.toLowerCase();
    if (/daily|every ?day|all (7|seven) days|7 days/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
    const days = new Set();
    s.split(/,|&|\band\b/).forEach(part => {
      const ends = part.split(/\s*(?:–|—|-|\bto\b)\s*/).map(x => x.trim()).filter(Boolean);
      const a = dayIndex(ends[0]), b = ends.length > 1 ? dayIndex(ends[ends.length - 1]) : a;
      if (a < 0 || b < 0) return;
      for (let d = a; ; d = (d + 1) % 7) { days.add(d); if (d === b) break; }
    });
    return [...days];
  }
  const toMinutes = t => {
    const m = String(t).trim().toLowerCase().replace(/\./g, '').match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!m) return null;
    let h = Number(m[1]);
    if (m[3]) { h %= 12; if (m[3] === 'pm') h += 12; }
    return h * 60 + Number(m[2] || 0);
  };
  function parseTimes(value) {
    if (/closed/i.test(value)) return { closed: true };
    const parts = value.split(/\s*(?:–|—|-|\bto\b)\s*/i);
    if (parts.length !== 2) return null;
    const open = toMinutes(parts[0]), close = toMinutes(parts[1]);
    return open === null || close === null ? null : { open, close };
  }
  function parseHours(value) {
    return splitList(value).map(line => {
      const i = line.indexOf(': ');
      const label = i > 0 ? line.slice(0, i).trim() : '';
      const time = i > 0 ? line.slice(i + 2).trim() : line.trim();
      return { label, time, days: label ? parseDays(label) : [], times: label ? parseTimes(time) : null };
    });
  }
  const clock = m => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${h % 12 || 12}:${pad2(mm)} ${h < 12 ? 'AM' : 'PM'}`; };
  const hhmm = m => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
  function gymNow() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: GYM_TIME_ZONE, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
      const get = type => (parts.find(p => p.type === type) || {}).value;
      return { day: dayIndex(get('weekday')), minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
    } catch {
      const d = new Date();
      return { day: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() };
    }
  }
  /* "Open now · until 11:00 PM", "Closed now · opens at 4:00 PM", or null when it can't be told. */
  function openStatus(rows) {
    const now = gymNow();
    const rowFor = d => rows.find(r => r.days.includes(d) && r.times);
    const today = rowFor(now.day);
    if (!today) return null;
    if (!today.times.closed) {
      const { open, close } = today.times;
      const isOpen = close > open ? now.minutes >= open && now.minutes < close : (now.minutes >= open || now.minutes < close);
      if (isOpen) return { open: true, text: `Open now · until ${clock(close)}` };
      if (now.minutes < open) return { open: false, text: `Closed now · opens at ${clock(open)}` };
    }
    for (let i = 1; i <= 7; i++) {
      const d = (now.day + i) % 7, row = rowFor(d);
      if (row && !row.times.closed) return { open: false, text: `Closed now · opens ${i === 1 ? 'tomorrow' : DAYS[d]} at ${clock(row.times.open)}` };
    }
    return { open: false, text: 'Closed now' };
  }
  function renderHours(g) {
    const rows = parseHours(g.opening_hours);
    const today = gymNow().day;
    const html = rows.map(r => (r.label
      ? `<li${r.days.includes(today) ? ' class="is-today"' : ''}><span>${esc(r.label)}${r.days.includes(today) ? '<em>Today</em>' : ''}</span><span>${esc(r.time)}</span></li>`
      : `<li class="hours__note"><span>${esc(r.time)}</span></li>`)).join('');
    $$('[data-hours]').forEach(el => { el.innerHTML = html; el.hidden = !rows.length; });
    const row = $('[data-row="hours"]');
    if (row) row.hidden = !rows.length;
    const status = openStatus(rows);
    $$('[data-hours-status]').forEach(el => {
      el.hidden = !status;
      if (status) { el.textContent = status.text; el.classList.toggle('is-open', status.open); }
    });
    return rows;
  }

  /* ---------- general content ---------- */
  function renderGeneral(g) {
    state.general = g;
    state.gymName = text(g.gym_name) || 'SSV Gym';
    ['gym_name', 'full_name', 'tagline', 'hero_subtitle', 'about_heading', 'facilities_intro', 'services_heading'].forEach(k => setText(k, g[k]));
    setLines('address', g.address);
    setList('facility_strip', g.facility_strip);

    const heading = splitList(g.hero_heading);
    if (heading.length) $('#hero-heading').innerHTML = heading.map(l => `<span class="hero__line">${esc(l)}</span>`).join('');
    setBg($('#hero-media'), g.hero_image, `Inside ${state.gymName}`);
    setMediaBox($('#about-media'), g.about_image, `Training at ${state.gymName}`);
    if (text(g.about_text)) setParagraphs($('#about-text'), g.about_text);
    const hl = splitList(g.about_highlights);
    const hlEl = $('#about-highlights');
    hlEl.hidden = !hl.length;
    if (hl.length) hlEl.innerHTML = hl.map(h => `<li>${esc(h)}</li>`).join('');
    const desc = text(g.description);
    if (desc) $('meta[name="description"]').setAttribute('content', desc);

    renderStats(g);
    const hours = renderHours(g);
    setupLinks(g);
    setupMap(g);
    updateStructuredData(g, hours);
  }

  /* Up to six figures from the General tab (stat_1_value / stat_1_label …). Hidden while empty. */
  function renderStats(g) {
    const items = [];
    for (let i = 1; i <= 6; i++) {
      const value = text(g[`stat_${i}_value`]), label = text(g[`stat_${i}_label`]);
      if (value && label) items.push({ value, label });
    }
    $('#stats-grid').innerHTML = items.map(s => {
      const m = s.value.match(/^(\d+)(.*)$/);
      const shown = m ? `<span data-count="${m[1]}">${m[1]}</span><span class="stat__affix">${esc(m[2])}</span>` : esc(s.value);
      return `<div class="stat"><dt class="stat__label">${esc(s.label)}</dt><dd class="stat__value">${shown}</dd></div>`;
    }).join('');
    $('#stats').hidden = !items.length;
    countUp();
  }

  function setupLinks(g) {
    const call = realPhone(g.phone);
    const call2 = realPhone(g.phone_2);
    const wa = realPhone(g.whatsapp) || call;
    const L = {
      phone: call ? `tel:+${call}` : '',
      phone2: call2 ? `tel:+${call2}` : '',
      whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${state.gymName}, I'd like to know more about membership.`)}` : '',
      maps: linkUrl(g.maps_url),
      instagram: instagramUrl(g.instagram_url),
      facebook: linkUrl(g.facebook_url)
    };
    state.links = L;
    $$('[data-link]').forEach(a => {
      const url = L[a.dataset.link];
      const li = a.closest('.footer__links li');
      const target = li || a;
      if (!url) { target.hidden = true; a.removeAttribute('href'); return; }
      target.hidden = false;
      a.href = url;
      if (/^https?:/i.test(url)) { a.target = '_blank'; a.rel = 'noopener'; } else { a.removeAttribute('target'); a.removeAttribute('rel'); }
    });
    const shown = {
      phone: call ? text(g.phone) : '',
      phone2: call2 ? text(g.phone_2) : '',
      whatsapp: wa ? text(g.whatsapp) || text(g.phone) : '',
      instagram: L.instagram ? '@' + (L.instagram.match(/instagram\.com\/([^/?#]+)/i) || [])[1] : '',
      facebook: L.facebook ? `${state.gymName} on Facebook` : ''
    };
    $$('[data-show]').forEach(el => {
      const key = el.dataset.show;
      const row = el.closest('[data-row]');
      if (row) row.hidden = !shown[key];
      if (shown[key]) el.textContent = shown[key];
    });
    const connect = $('#footer-connect');
    if (connect) connect.hidden = !$$('.footer__links li', connect).some(li => !li.hidden);
    const google = $('#google-reviews');
    google.hidden = !L.maps;
    if (L.maps) google.href = L.maps;
    // The quick-contact bar only appears on phones when there is a real number to call.
    $('#mobile-bar').hidden = !L.phone && !L.whatsapp;
    document.body.classList.toggle('has-mobile-bar', Boolean(L.phone || L.whatsapp));
  }

  /* Map card: the embedded Google map (dark to match the site, normal colours on hover),
     with the gym's name, address and a directions button. */
  function setupMap(g) {
    const box = $('#map-embed');
    const wrap = box.closest('.contact__map') || box;
    const src = mapEmbedSrc(g.maps_embed_url);
    if (!src) { wrap.hidden = true; box.innerHTML = ''; delete box.dataset.key; return; }
    const address = splitList(g.address).join(', ');
    const maps = state.links.maps;
    const key = [src, address, maps, state.gymName].join('|');
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      box.innerHTML = `<div class="map__frame"><iframe src="${esc(src)}" title="Map showing the location of ${esc(state.gymName)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
        <figcaption class="map__card">
          <span class="map__pin" aria-hidden="true">${PIN}</span>
          <span class="map__text"><strong>${esc(state.gymName)}</strong>${address ? `<span>${esc(address)}</span>` : ''}</span>
          ${maps ? `<a class="btn btn--primary btn--sm" href="${esc(maps)}" target="_blank" rel="noopener">Get directions</a>` : ''}
        </figcaption>`;
    }
    wrap.hidden = false;
  }

  /* Keeps the business details for search engines in step with the sheet. */
  function updateStructuredData(g, hours) {
    const el = $('#ld-business');
    if (!el) return;
    let data;
    try { data = JSON.parse(el.textContent); } catch { return; }
    const call = realPhone(g.phone);
    const set = (k, v) => { if (v) data[k] = v; else delete data[k]; };
    set('name', state.gymName);
    set('alternateName', text(g.full_name));
    set('description', text(g.description));
    set('telephone', call ? '+' + call : '');
    set('hasMap', state.links.maps);
    set('image', text(g.hero_image) && !isPlaceholder(g.hero_image) ? text(g.hero_image) : '');
    const lines = splitList(g.address);
    if (lines.length) {
      const last = lines[lines.length - 1];
      const pin = (last.match(/\b\d{6}\b/) || [])[0];
      const parts = last.replace(/\b\d{6}\b/, '').split(',').map(s => s.trim()).filter(Boolean);
      data.address = { '@type': 'PostalAddress', streetAddress: lines.slice(0, -1).join(', ') || last, addressLocality: parts[0] || '', addressRegion: parts[1] || '', postalCode: pin || '', addressCountry: 'IN' };
      Object.keys(data.address).forEach(k => { if (!data.address[k]) delete data.address[k]; });
    }
    const specs = (hours || []).filter(r => r.days.length && r.times && !r.times.closed)
      .map(r => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: r.days.map(d => DAYS[d]), opens: hhmm(r.times.open), closes: hhmm(r.times.close) }));
    set('openingHoursSpecification', specs.length ? specs : '');
    const same = [state.links.instagram, state.links.facebook].filter(Boolean);
    set('sameAs', same.length ? same : '');
    el.textContent = JSON.stringify(data, null, 2);
  }

  /* ---------- announcements: short notices in the strip, photo ones as event cards ---------- */
  const byPriority = (a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(b.date).localeCompare(String(a.date));

  function renderAnnouncements(list) {
    const today = isoDate(new Date());
    const live = (Array.isArray(list) ? list : []).filter(a => truthy(a.active) && (!text(a.expiry) || isoDate(a.expiry) >= today));
    const notices = live.filter(a => !text(a.image_url)).sort(byPriority);
    $('#announcements').hidden = !notices.length;
    $('#notice-list').innerHTML = notices.map(a => `
      <li class="notice__item">
        ${toDate(a.date) ? `<time datetime="${esc(isoDate(a.date))}">${esc(formatDate(a.date))}</time>` : '<span></span>'}
        <div><h3>${esc(a.title)}</h3>${text(a.description) ? `<p>${esc(a.description)}</p>` : ''}</div>
      </li>`).join('');

    // Events: upcoming first (soonest first), then past ones (most recent first).
    const upcoming = e => !toDate(e.date) || isoDate(e.date) >= today;
    const events = live.filter(a => text(a.image_url)).sort((a, b) => {
      const ua = upcoming(a) ? 0 : 1, ub = upcoming(b) ? 0 : 1;
      if (ua !== ub) return ua - ub;
      const da = String(isoDate(a.date) || '9999'), db = String(isoDate(b.date) || '9999');
      return (ua === 0 ? da.localeCompare(db) : db.localeCompare(da)) || byPriority(a, b);
    });
    toggleSection('events', events.length > 0);
    $('#event-grid').innerHTML = events.map((e, i) => {
      const d = toDate(e.date), past = !upcoming(e);
      const badge = d ? `<span class="event__date"><b>${d.getDate()}</b>${esc(d.toLocaleDateString('en-IN', { month: 'short' }))}</span>` : '';
      return `<article class="event${past ? ' is-past' : ''}">
        <div class="event__media">${media(e.image_url, e.title, e.title, { cls: `event__img tone-${(i % 3) + 1}`, sizes: '(min-width: 1024px) 33vw, (min-width: 700px) 50vw, 100vw', widths: [480, 800, 1200] })}${badge}</div>
        <div class="event__body">
          ${past ? '<p class="event__tag">Past event</p>' : (d ? `<p class="event__tag">${esc(d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>` : '')}
          <h3 class="event__title">${esc(e.title)}</h3>
          ${text(e.description) ? `<p class="event__desc">${esc(e.description)}</p>` : ''}
          ${past ? '' : `<a class="btn btn--ghost btn--sm" href="#contact" data-enquire="${esc(`I'd like to know more about: ${text(e.title)}.`)}">Ask about this</a>`}
        </div>
      </article>`;
    }).join('');
  }

  /* ---------- facilities: information cards (no links) ---------- */
  function renderFacilities(list) {
    const items = activeSorted(list);
    const major = items.filter(f => text(f.category).toLowerCase() !== 'additional');
    const extra = items.filter(f => text(f.category).toLowerCase() === 'additional');
    toggleSection('facilities', items.length > 0);
    $('#facility-grid').innerHTML = major.map((f, i) => {
      const tags = splitList(f.tags).map(esc).join(' <i>/</i> ');
      return `<article class="facility-card">
        ${media(f.image_url, f.name, f.name, { cls: `facility-card__media tone-${(i % 3) + 1}`, sizes: '(min-width: 1024px) 33vw, (min-width: 760px) 50vw, 100vw' })}
        <div class="facility-card__body">
          <h3 class="facility-card__title">${esc(f.name)}</h3>
          ${tags ? `<p class="facility-card__tags">${tags}</p>` : ''}
          ${text(f.description) ? `<p class="facility-card__desc">${esc(f.description)}</p>` : ''}
        </div>
      </article>`;
    }).join('');
    $('#facility-grid').hidden = !major.length;
    const tag = $('.about__tag');
    if (tag) { tag.hidden = !major.length; $('#zone-count').textContent = major.length; }
    $('#facility-extra').hidden = !extra.length;
    $('#facility-extra-list').innerHTML = extra.map(f => `<li><div><h4>${esc(f.name)}</h4>${text(f.description) ? `<p>${esc(f.description)}</p>` : ''}</div></li>`).join('');
  }

  /* ---------- membership plans, then personal training and diet plans ---------- */
  function renderPlans(list, general) {
    const items = activeSorted(list);
    const board = $('#plan-grid');
    board.hidden = !items.length;
    $('#plans-note').hidden = !items.length;
    board.style.setProperty('--cols', Math.min(Math.max(items.length, 1), 4));
    const badge = text(general.featured_badge_text) || 'Best value';
    board.innerHTML = items.map(p => {
      const featured = truthy(p.featured);
      const price = text(p.price);
      const months = durationMonths(p.duration);
      const amount = Number(price.replace(/[₹,\s]/g, ''));
      const perMonth = price && months > 1 && amount > 0 ? `₹${Math.round(amount / months).toLocaleString('en-IN')} / month` : '';
      const features = splitList(p.features);
      const enquire = `I'm interested in the ${text(p.name)} plan${text(p.duration) ? ` (${text(p.duration)})` : ''}.`;
      return `<article class="plan${featured ? ' plan--featured' : ''}">
        <div class="plan__top"><h3 class="plan__name">${esc(p.name)}</h3>${featured ? `<span class="plan__badge">${esc(badge)}</span>` : ''}</div>
        ${price ? `<p class="plan__price">${esc(formatPrice(price))}</p>` : '<p class="plan__price plan__price--ask">Price on enquiry</p>'}
        <p class="plan__duration">${esc(p.duration)}${perMonth ? `<span class="plan__per">${perMonth}</span>` : ''}</p>
        <div class="plan__body">
          ${text(p.description) ? `<p class="plan__desc">${esc(p.description)}</p>` : ''}
          ${features.length ? `<ul class="plan__features">${features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        </div>
        <a class="btn ${featured ? 'btn--primary' : 'btn--ghost'} btn--block" href="#contact" data-enquire="${esc(enquire)}">Enquire</a>
      </article>`;
    }).join('');
    return items.length;
  }

  function renderServices(list) {
    const items = activeSorted(list);
    $('#services').hidden = !items.length;
    $('#service-grid').innerHTML = items.map(s => {
      const price = text(s.price);
      return `<article class="service">
        <h4 class="service__name">${esc(s.name)}</h4>
        ${price ? `<p class="service__price">${esc(formatPrice(price))}${text(s.price_note) ? `<span>${esc(s.price_note)}</span>` : ''}</p>` : '<p class="service__price service__price--ask">Price on enquiry</p>'}
        ${text(s.description) ? `<p class="service__desc">${esc(s.description)}</p>` : ''}
        <a class="text-link" href="#contact" data-enquire="${esc(`I'm interested in ${text(s.name)}.`)}">Enquire</a>
      </article>`;
    }).join('');
    return items.length;
  }

  function renderTrainers(list) {
    const items = activeSorted(list);
    toggleSection('trainers', items.length > 0);
    $('#trainer-grid').innerHTML = items.map((t, i) => `
      <article class="trainer">
        ${media(t.image_url, t.name, t.name, { cls: `trainer__media tone-${(i % 3) + 1}`, sizes: '(min-width: 1100px) 25vw, (min-width: 600px) 45vw, 100vw', widths: [400, 700, 1000] })}
        <div class="trainer__body">
          <h3 class="trainer__name">${esc(t.name)}</h3>
          ${text(t.role) ? `<p class="trainer__role">${esc(t.role)}</p>` : ''}
          ${text(t.specialization) ? `<p class="trainer__spec">${esc(t.specialization)}</p>` : ''}
          ${text(t.bio) ? `<p class="trainer__bio">${esc(t.bio)}</p>` : ''}
        </div>
      </article>`).join('');
  }

  function renderGallery(list, general) {
    const items = activeSorted(list).filter(i => text(i.image_url));
    toggleSection('gallery', items.length > 0);
    Gallery.init(items, splitList(general.gallery_categories));
  }

  /* ---------- reviews ---------- */
  const avatar = name => `<span class="avatar" aria-hidden="true">${esc(initials(name))}</span>`;
  const byTop = (a, b) => (Number(b.likes) || 0) - (Number(a.likes) || 0) || String(b.date).localeCompare(String(a.date));
  const byNew = (a, b) => String(b.date).localeCompare(String(a.date)) || (Number(b.likes) || 0) - (Number(a.likes) || 0);

  function reviewHtml(r) {
    const words = String(r.review || '');
    const long = words.length > CLAMP_CHARS;
    const likes = Number(r.likes) || 0;
    const on = liked().includes(r.id);
    return `<article class="review" data-id="${esc(r.id)}">
      <div class="review__top">${starRow(r.rating)}${toDate(r.date) ? `<time datetime="${esc(isoDate(r.date))}">${esc(timeAgo(r.date))}</time>` : ''}</div>
      <blockquote class="review__text${long ? ' is-clamped' : ''}"><p>${esc(words)}</p></blockquote>
      ${long ? '<button class="review__more" type="button" aria-expanded="false">Read more</button>' : ''}
      <div class="review__foot">
        <div class="review__who">${avatar(r.name)}<span>${esc(r.name)}</span></div>
        <button class="like" type="button" data-like="${esc(r.id)}" aria-pressed="${on}" aria-label="${on ? 'Remove like' : 'Like this review'}">${HEART}<span class="like__count">${likes}</span></button>
      </div>
    </article>`;
  }

  function renderReviews(list, general) {
    state.reviews = (Array.isArray(list) ? list : []).filter(r => text(r.review));
    state.reviewForm = !isFalse(general.review_form);
    const items = state.reviews.slice().sort(byTop);
    const total = items.length;
    toggleSection('reviews', total > 0 || state.reviewForm);
    $('#write-review').hidden = !state.reviewForm;

    const rated = items.filter(r => Number(r.rating) > 0);
    $('#reviews-summary').hidden = !rated.length;
    if (rated.length) {
      const avg = rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length;
      $('#reviews-avg').textContent = avg.toFixed(1);
      $('#reviews-avg-stars').innerHTML = starRow(avg, `Average rating ${avg.toFixed(1)} out of 5`);
      $('#reviews-count').textContent = `${rated.length} review${rated.length === 1 ? '' : 's'}`;
    }

    $('#review-grid').innerHTML = total
      ? items.slice(0, TOP_REVIEWS).map(reviewHtml).join('')
      : `<p class="reviews__empty">No reviews yet.${state.reviewForm ? ' Trained at SSV? Be the first to share your experience.' : ''}</p>`;
    $('#reviews-more').hidden = total <= TOP_REVIEWS;
    $('#all-reviews-count').textContent = total;
    if ($('#reviews-dialog').open) renderReviewList();
  }

  function renderReviewList() {
    const items = state.reviews.slice().sort(state.sort === 'new' ? byNew : byTop);
    $('#review-list').innerHTML = items.slice(0, state.listCount).map(reviewHtml).join('');
    const more = $('#review-list-more');
    more.hidden = items.length <= state.listCount;
    more.textContent = `Show more reviews (${items.length - state.listCount} more)`;
    $$('#reviews-dialog [data-sort]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));
  }

  function openDialog(dlg, from) {
    state.openedFrom = from || document.activeElement;
    document.body.classList.add('dialog-open');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (typeof dlg.close === 'function') dlg.close();
    else { dlg.removeAttribute('open'); dlg.dispatchEvent(new Event('close')); }
  }

  async function toggleLike(btn) {
    const id = btn.dataset.like;
    const on = btn.getAttribute('aria-pressed') !== 'true';
    const r = state.reviews.find(x => x.id === id);
    const before = r ? Number(r.likes) || 0 : Number(btn.textContent) || 0;
    const optimistic = Math.max(0, before + (on ? 1 : -1));
    const paint = (count, pressed) => $$(`[data-like="${CSS.escape(id)}"]`).forEach(b => {
      b.setAttribute('aria-pressed', String(pressed));
      b.setAttribute('aria-label', pressed ? 'Remove like' : 'Like this review');
      $('.like__count', b).textContent = count;
    });
    setLiked(id, on);
    if (r) r.likes = optimistic;
    paint(optimistic, on);
    $$(`[data-like="${CSS.escape(id)}"]`).forEach(b => { b.disabled = true; });
    try {
      const res = await API.likeReview(id, on);
      if (r) r.likes = res.likes;
      API.setReviewLikes(id, res.likes);
      paint(res.likes, on);
    } catch (err) {
      setLiked(id, !on);
      if (r) r.likes = before;
      paint(before, !on);
    } finally {
      $$(`[data-like="${CSS.escape(id)}"]`).forEach(b => { b.disabled = false; });
    }
  }

  function bindReviews() {
    document.addEventListener('click', e => {
      const like = e.target.closest('[data-like]');
      if (like) { toggleLike(like); return; }
      const more = e.target.closest('.review__more');
      if (more) {
        const quote = more.previousElementSibling;
        const open = quote.classList.toggle('is-clamped') === false;
        more.textContent = open ? 'Show less' : 'Read more';
        more.setAttribute('aria-expanded', String(open));
      }
    });
    const all = $('#reviews-dialog'), write = $('#review-dialog');
    $('#all-reviews').addEventListener('click', e => { state.listCount = PAGE_SIZE; renderReviewList(); openDialog(all, e.currentTarget); });
    $('#review-list-more').addEventListener('click', () => { state.listCount += PAGE_SIZE; renderReviewList(); });
    $$('#reviews-dialog [data-sort]').forEach(b => b.addEventListener('click', () => { state.sort = b.dataset.sort; state.listCount = PAGE_SIZE; renderReviewList(); }));
    $('#write-review').addEventListener('click', e => { openDialog(write, e.currentTarget); setTimeout(() => $('#rate-5').focus(), 60); });
    [all, write].forEach(dlg => {
      dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) closeDialog(dlg); });
      dlg.addEventListener('close', () => {
        document.body.classList.remove('dialog-open');
        if (state.openedFrom && document.contains(state.openedFrom)) state.openedFrom.focus();
      });
    });
    setupReviewForm();
  }

  function setupReviewForm() {
    const form = $('#review-form'), status = $('#review-status');
    const note = (msg, ok) => { status.textContent = msg; status.className = `enquiry__status ${ok ? 'is-success' : 'is-error'}`; };
    $$('input[name="rating"]', form).forEach(r => r.addEventListener('change', () => { $('#rating-text').textContent = RATING_WORDS[Number(r.value)]; }));
    $('#rev-text').addEventListener('input', e => { $('#rev-count').textContent = e.target.value.length; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const name = text(data.name), review = text(data.review), rating = Number(data.rating);
      $$('[aria-invalid]', form).forEach(el => el.removeAttribute('aria-invalid'));
      if (!rating) { note('Tap a star to rate SSV.', false); $('#rate-5').focus(); return; }
      if (name.length < 2) { $('#rev-name').setAttribute('aria-invalid', 'true'); $('#rev-name').focus(); note('Enter your name.', false); return; }
      if (review.length < 5) { $('#rev-text').setAttribute('aria-invalid', 'true'); $('#rev-text').focus(); note('Write a few words about your experience.', false); return; }
      if (LINK_PATTERN.test(name + ' ' + review)) { note('Please remove links from your review.', false); return; }
      if (!API.isConfigured()) { note('Reviews can\'t be sent right now. Please try again later.', false); return; }
      const btn = $('button[type="submit"]', form);
      btn.disabled = true; btn.textContent = 'Posting…'; status.textContent = '';
      try {
        const res = await API.submitReview({ name, rating, review, website: data.website || '' });
        form.reset();
        $('#rev-count').textContent = '0';
        $('#rating-text').textContent = 'Tap a star';
        closeDialog($('#review-dialog'));
        const msg = $('#reviews-note');
        if (res.review) {
          state.reviews.unshift(res.review);
          API.addReview(res.review);
          renderReviews(state.reviews, state.general);
          msg.textContent = 'Thank you! Your review is now on the website.';
        } else {
          msg.textContent = 'Thank you! Your review will appear once the gym approves it.';
        }
        msg.hidden = false;
        $('#reviews').scrollIntoView({ block: 'start' });
      } catch (err) {
        note(err.code === 'CLOSED' || err.code === 'VALIDATION' || err.code === 'DUPLICATE' || err.code === 'RATE_LIMITED'
          ? err.message : 'Your review could not be sent. Please try again in a moment.', false);
      } finally {
        btn.disabled = false; btn.textContent = 'Post review';
      }
    });
  }

  /* ---------- count-up for stats ---------- */
  function countUp() {
    const nums = $$('[data-count]');
    if (!nums.length) return;
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const el = entry.target, end = Number(el.dataset.count);
      if (!end) return;
      const t0 = performance.now(), dur = 1100;
      const tick = t => {
        const p = Math.min((t - t0) / dur, 1);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), { threshold: 0.6 });
    nums.forEach(n => io.observe(n));
  }

  /* ---------- navigation & interactions ---------- */
  function setupNav() {
    const header = $('.site-header');
    const toggle = $('.nav-toggle');
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const close = () => { document.body.classList.remove('nav-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); };
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    $$('#site-nav a').forEach(a => a.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { close(); toggle.focus(); } });
    matchMedia('(min-width: 1081px)').addEventListener('change', e => { if (e.matches) close(); });

    // Highlight the menu link of the section on screen.
    if ('IntersectionObserver' in window) {
      const links = $$('.nav__link');
      const spy = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        links.forEach(l => l.classList.toggle('is-active', l.getAttribute('href') === `#${entry.target.id}`));
      }), { rootMargin: '-45% 0px -50% 0px' });
      links.forEach(l => { const s = document.querySelector(l.getAttribute('href')); if (s) spy.observe(s); });
    }

    // Plan, service and event buttons prefill the enquiry message.
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-enquire]');
      if (!btn) return;
      const msg = $('#enq-message');
      if (msg && !msg.value.trim()) msg.value = btn.dataset.enquire;
    });
  }

  function setupReveal() {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('reveal-on');
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
  }

  /* ---------- enquiry form ---------- */
  function setupEnquiry() {
    const form = $('#enquiry-form');
    const status = $('#enquiry-status');
    const note = (msg, ok) => { status.textContent = msg; status.className = `enquiry__status ${ok ? 'is-success' : 'is-error'}`; };
    const noteWithWhatsApp = msg => {
      note(msg, false);
      if (state.links.whatsapp) status.insertAdjacentHTML('beforeend', ` <a href="${esc(state.links.whatsapp)}" target="_blank" rel="noopener">Message us on WhatsApp</a>`);
    };
    const invalid = (input, msg) => { input.setAttribute('aria-invalid', 'true'); input.focus(); note(msg, false); };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      $$('[aria-invalid]', form).forEach(el => el.removeAttribute('aria-invalid'));
      if (text(data.name).length < 2) return invalid(form.elements.name, 'Please enter your name.');
      const phoneDigits = String(data.phone || '').replace(/\D/g, '');
      if (phoneDigits.length < 10 || phoneDigits.length > 13) return invalid(form.elements.phone, 'Please enter a valid phone number.');
      if (!API.isConfigured()) return noteWithWhatsApp('Online enquiries are not available right now.');

      const btn = $('button[type="submit"]', form);
      btn.disabled = true;
      btn.textContent = 'Sending…';
      status.textContent = '';
      try {
        await API.submitEnquiry({ name: text(data.name), phone: text(data.phone), message: text(data.message), website: data.website || '' });
        form.reset();
        note('Thank you. The gym will contact you soon.', true);
      } catch (err) {
        if (err.code === 'DUPLICATE' || err.code === 'RATE_LIMITED' || err.code === 'VALIDATION') note(err.message, false);
        else noteWithWhatsApp('Your enquiry could not be sent.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send enquiry';
      }
    });
  }

  /* ---------- boot ---------- */
  function render(c) {
    const offline = c.source === 'offline';
    const g = offline ? readFallback() : { ...readFallback(), ...c.general };
    renderGeneral(g);
    renderAnnouncements(c.announcements);
    renderFacilities(c.facilities);
    const plans = renderPlans(c.plans, g);
    const services = renderServices(c.services);
    toggleSection('membership', plans + services > 0);
    renderTrainers(c.trainers);
    renderGallery(c.gallery, g);
    renderReviews(c.reviews, g);
  }

  async function init() {
    $('#year').textContent = new Date().getFullYear();
    setupNav();
    bindReviews();
    setupEnquiry();
    document.body.classList.add('is-loading');
    let content;
    try {
      content = await API.getContent({ onUpdate: fresh => { render(fresh); $$('.reveal').forEach(el => el.classList.add('is-visible')); } });
    } catch (err) {
      console.error('[SSV] Could not load content:', err);
      content = { source: 'offline', general: {}, facilities: [], plans: [], services: [], trainers: [], gallery: [], reviews: [], announcements: [] };
    }
    document.body.classList.remove('is-loading');
    render(content);
    setupReveal();
    setInterval(() => renderHours(state.general), 60000); // keeps "Open now" correct while the page is open
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
