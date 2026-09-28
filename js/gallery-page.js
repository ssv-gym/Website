/* SSV GYM — the full gallery page (gallery.html): every photo and video in a
   masonry layout, with category filters and the viewer. v1.6.0 */
(() => {
  'use strict';
  const { text, splitList, realPhone, activeSorted } = Utils;
  const $ = sel => document.querySelector(sel);

  /* Call and WhatsApp buttons use the gym's numbers from the sheet. */
  function links(g) {
    const name = text(g.gym_name) || 'SSV Gym';
    const call = realPhone(g.phone), wa = realPhone(g.whatsapp) || call;
    const L = {
      phone: call ? `tel:+${call}` : '',
      whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${name}, I'd like to know more about membership.`)}` : ''
    };
    document.querySelectorAll('[data-link]').forEach(a => {
      const url = L[a.dataset.link];
      a.hidden = !url;
      if (url) a.href = url;
    });
    const bar = $('#mobile-bar');
    bar.hidden = !L.phone && !L.whatsapp;
    document.body.classList.toggle('has-mobile-bar', !bar.hidden);
  }

  function render(c) {
    const g = c.general || {};
    if (Object.keys(g).length) links(g);
    const items = activeSorted(c.gallery).filter(i => text(i.image_url));
    const empty = $('#gallery-empty');
    empty.hidden = items.length > 0;
    empty.textContent = c.source === 'offline' ? 'The gallery could not be loaded right now. Please try again in a moment.' : 'No photos yet.';
    Gallery.init(items, splitList(g.gallery_categories), { masonry: true });
  }

  async function init() {
    $('#year').textContent = new Date().getFullYear();
    document.body.classList.add('is-loading');
    let content;
    try { content = await API.getContent({ onUpdate: render }); }
    catch { content = { source: 'offline', general: {}, gallery: [] }; }
    document.body.classList.remove('is-loading');
    render(content);
    let wanted = '';   // gallery.html#crossfit opens one category
    try { wanted = decodeURIComponent(location.hash.slice(1)).trim().toLowerCase(); } catch { /* ignore */ }
    if (wanted) Gallery.setFilter(wanted);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
