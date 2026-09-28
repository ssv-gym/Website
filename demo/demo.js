/* SSV GYM — demo pages only: the "Demo" note, and fresh data after Back or Forward. v1.6.0 */
(() => {
  'use strict';
  const MIN_KEY = 'ssv_demo_note_min';

  /* The note folds down to a small pill and stays folded while the visitor moves between pages. */
  const note = document.getElementById('demo-note');
  const toggle = note && note.querySelector('[data-demo-toggle]');
  if (toggle) {
    const set = min => {
      note.classList.toggle('is-min', min);
      toggle.textContent = min ? '+' : '–';
      toggle.setAttribute('aria-expanded', String(!min));
      toggle.setAttribute('aria-label', min ? 'Show more about the demo' : 'Show less');
    };
    let min = false;
    try { min = sessionStorage.getItem(MIN_KEY) === '1'; } catch { /* storage unavailable */ }
    set(min);
    toggle.addEventListener('click', () => {
      min = !min;
      set(min);
      try { sessionStorage.setItem(MIN_KEY, min ? '1' : '0'); } catch { /* ignore */ }
    });
  }

  /* Admin panel: a page brought back by Back or Forward loads this tab's demo data again. */
  window.addEventListener('pageshow', e => {
    const app = document.getElementById('app'), refresh = document.getElementById('refresh-btn');
    if (e.persisted && app && !app.hidden && refresh) refresh.click();
  });
})();
