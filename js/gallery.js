/* SSV GYM — gallery grid (photos and videos), category filter and lightbox. v1.5.0 */
const Gallery = (() => {
  const { esc, media, pad2, mediaKind, videoPoster, videoSrc, youtubeId } = Utils;
  const SIZES = ['tall', '', 'wide', '', '', 'tall', '', '', '', 'wide']; // repeating layout rhythm
  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const el = id => document.getElementById(id);
  const keyOf = v => String(v || '').trim().toLowerCase();
  const titleCase = s => s.replace(/\b[a-z]/g, c => c.toUpperCase());
  let items = [], view = [], filter = 'all', current = 0, trigger = null, bound = false, labels = {}, order = [];

  const labelOf = key => labels[key] || (key ? titleCase(key) : 'Photo');
  const titleOf = it => it.title || (mediaKind(it.image_url) === 'image' ? 'Gallery photo' : 'Gallery video');

  /* list: gallery rows. categories: names in filter order (General tab: gallery_categories).
     Safe to call again when fresher content arrives. */
  function init(list, categories) {
    items = Array.isArray(list) ? list : [];
    labels = {};
    order = [];
    (categories || []).forEach(name => { const k = keyOf(name); if (k && !(k in labels)) { labels[k] = String(name).trim(); order.push(k); } });
    items.forEach(i => { const k = keyOf(i.category); if (k && !(k in labels)) { labels[k] = titleCase(k); order.push(k); } });
    if (!items.some(i => keyOf(i.category) === filter)) filter = 'all';
    renderFilters();
    render();
    if (!bound) bind();
    if (el('lightbox').open) {
      if (view.length) { current = Math.min(current, view.length - 1); show(); } else close();
    }
  }

  function renderFilters() {
    const present = new Set(items.map(i => keyOf(i.category)));
    const keys = order.filter(k => present.has(k));
    const bar = el('gallery-filters');
    bar.innerHTML = [['all', 'All'], ...keys.map(k => [k, labelOf(k)])]
      .map(([k, label]) => `<button type="button" class="chip" data-filter="${esc(k)}" aria-pressed="${k === filter}">${esc(label)}</button>`)
      .join('');
    bar.hidden = keys.length < 2; // filters only help with two or more categories
  }

  function setFilter(key) {
    filter = key !== 'all' && items.some(i => keyOf(i.category) === key) ? key : 'all';
    el('gallery-filters').querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    render();
  }

  function render() {
    view = filter === 'all' ? items : items.filter(i => keyOf(i.category) === filter);
    const grid = el('gallery-grid');
    grid.innerHTML = view.map((it, i) => {
      const size = SIZES[i % SIZES.length];
      const kind = mediaKind(it.image_url);
      const title = titleOf(it);
      const still = kind === 'image' ? it.image_url : videoPoster(it.image_url, 800);
      return `<figure class="g-item${size ? ' g-item--' + size : ''}" style="--i:${i}">
        <button type="button" class="g-item__btn${kind === 'image' ? '' : ' is-video'}" data-index="${i}" aria-label="${kind === 'image' ? 'View larger' : 'Play video'}: ${esc(title)}">
          ${media(still, title, title, { cls: `g-item__media tone-${(i % 3) + 1}`, sizes: '(min-width: 1100px) 25vw, (min-width: 760px) 33vw, 50vw', widths: [400, 700, 1000] })}
          ${kind === 'image' ? '' : `<span class="g-item__play" aria-hidden="true">${PLAY}</span>`}
          <span class="g-item__overlay"><span class="g-item__cat">${esc(labelOf(keyOf(it.category)))}${kind === 'image' ? '' : ' · Video'}</span><span class="g-item__title">${esc(title)}</span></span>
        </button>
      </figure>`;
    }).join('');
    grid.classList.remove('is-animating');
    void grid.offsetWidth; // restart the fade
    grid.classList.add('is-animating');
    const videos = view.filter(i => mediaKind(i.image_url) !== 'image').length, photos = view.length - videos;
    el('gallery-count').textContent = [photos ? `${photos} ${photos === 1 ? 'photo' : 'photos'}` : '', videos ? `${videos} ${videos === 1 ? 'video' : 'videos'}` : ''].filter(Boolean).join(' · ');
  }

  function bind() {
    bound = true;
    const dlg = el('lightbox');
    el('gallery-filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) setFilter(b.dataset.filter); });
    el('gallery-grid').addEventListener('click', e => { const b = e.target.closest('[data-index]'); if (b) open(Number(b.dataset.index), b); });
    dlg.addEventListener('click', e => {
      const act = e.target.closest('[data-lb]');
      if (act) { if (act.dataset.lb === 'close') close(); else step(act.dataset.lb === 'next' ? 1 : -1); return; }
      if (e.target === dlg || e.target.classList.contains('lightbox__inner')) close();
    });
    dlg.addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('video')) return; // arrow keys seek inside a video
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    });
    dlg.addEventListener('close', () => {
      el('lb-media').innerHTML = ''; // stops any playing video
      document.body.classList.remove('lb-open');
      if (trigger && document.contains(trigger)) trigger.focus();
    });
    let x0 = null; // swipe on touch screens
    dlg.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50 && !(e.target.closest && e.target.closest('video, iframe'))) step(dx < 0 ? 1 : -1);
    });
  }

  function open(index, from) {
    const dlg = el('lightbox');
    trigger = from;
    current = index;
    show();
    document.body.classList.add('lb-open');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  function close() {
    const dlg = el('lightbox');
    if (typeof dlg.close === 'function') dlg.close();
    else { dlg.removeAttribute('open'); dlg.dispatchEvent(new Event('close')); }
  }

  function step(dir) {
    if (view.length < 2) return;
    current = (current + dir + view.length) % view.length;
    show();
  }

  function show() {
    const it = view[current];
    if (!it) return;
    const kind = mediaKind(it.image_url);
    const title = titleOf(it);
    const box = el('lb-media');
    if (kind === 'youtube') {
      box.innerHTML = `<div class="lightbox__video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(youtubeId(it.image_url))}?autoplay=1&amp;rel=0&amp;playsinline=1" title="${esc(title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
    } else if (kind === 'video') {
      const poster = videoPoster(it.image_url, 1400);
      box.innerHTML = `<div class="lightbox__video"><video src="${esc(videoSrc(it.image_url))}"${poster ? ` poster="${esc(poster)}"` : ''} controls autoplay playsinline preload="metadata">This browser can't play the video.</video></div>`;
    } else {
      box.innerHTML = media(it.image_url, title, title, { cls: 'lightbox__img', sizes: '90vw', widths: [800, 1400, 2000], eager: true });
    }
    el('lb-title').textContent = title;
    el('lb-caption').textContent = it.caption || '';
    el('lb-count').textContent = `${pad2(current + 1)} / ${pad2(view.length)}`;
    el('lightbox').classList.toggle('is-single', view.length < 2);
  }

  return { init, setFilter };
})();
