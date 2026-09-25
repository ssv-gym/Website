/* SSV GYM — small shared helpers used by the website and the admin panel. v1.4.0 */
const Utils = (() => {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
  const text = v => String(v ?? '').trim();
  const truthy = v => v === true || /^(true|yes|y|1)$/i.test(text(v));
  const isFalse = v => v === false || /^(false|no|n|0)$/i.test(text(v));

  /* Lists in the sheet are separated with "|" or new lines. */
  const splitList = v => String(v ?? '').split(/\s*(?:\r?\n|\|)\s*/).map(s => s.trim()).filter(Boolean);

  /* True for empty values and obvious placeholders. */
  const isPlaceholder = v => {
    const s = text(v);
    return !s || /^YOUR_|X{4,}|will appear here/i.test(s);
  };

  const digits = v => String(v ?? '').replace(/\D/g, '');
  /* International number without "+". 10-digit numbers are assumed to be Indian (+91). */
  const intlPhone = v => {
    const d = digits(v);
    if (d.length === 10) return '91' + d;
    if (d.length === 11 && d[0] === '0') return '91' + d.slice(1);
    return d.length >= 11 && d.length <= 15 ? d : '';
  };
  /* Obvious dummy numbers: all zeros, one repeated digit, 1234567890, 9876543210. */
  const isDummyPhone = v => {
    const d = digits(v).replace(/^(91|0)(?=\d{10}$)/, '');
    return d.length > 0 && (/^(\d)\1+$/.test(d) || /^(0123456789|1234567890|9876543210)$/.test(d));
  };
  /* The gym's own number for Call / WhatsApp links, or '' when it is missing or a dummy. */
  const realPhone = v => (isDummyPhone(v) ? '' : intlPhone(v));

  /* Only allow http(s)/tel/mailto/blob URLs, relative paths, and embedded photos (used by the demo). */
  const safeUrl = v => {
    const s = text(v);
    if (!s || /^YOUR_/i.test(s)) return '';
    if (/^(https?:|mailto:|tel:|blob:)/i.test(s)) return s;
    if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(s)) return s;
    if (!/^[a-z][\w+.-]*:/i.test(s) && /^(#|\.{0,2}\/|[\w-]+\/)/.test(s)) return s;
    return '';
  };

  /* A link typed without https:// (www.instagram.com/…, maps.app.goo.gl/…) gets it added. */
  const linkUrl = v => {
    const s = text(v);
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]\S*)?$/i.test(s) && !/\.(jpe?g|png|webp|gif|svg|html?)$/i.test(s)) return 'https://' + s;
    return safeUrl(s);
  };

  /* Instagram profile link from a URL or an @handle. A bare instagram.com link counts as missing. */
  const instagramUrl = v => {
    const s = text(v);
    if (!s || /^YOUR_/i.test(s)) return '';
    if (!/[/:]/.test(s) && !/instagram\./i.test(s)) {
      const handle = s.replace(/^@/, '');
      return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}/` : '';
    }
    const u = linkUrl(s);
    return /instagram\.com\/?$/i.test(u.split(/[?#]/)[0]) ? '' : u;
  };

  /* Google Maps embed link. Accepts the link itself or the whole <iframe …> code Google gives you. */
  const mapEmbedSrc = v => {
    let s = text(v);
    const m = s.match(/src\s*=\s*["']([^"']+)["']/i);
    if (m) s = m[1];
    s = s.replace(/&amp;/g, '&');
    return /^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed\?/i.test(s) ? s : '';
  };

  const pad2 = n => String(n).padStart(2, '0');
  const toDate = v => {
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (!v) return null;
    const s = text(v);
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s.replace(' ', 'T'));
    return isNaN(d) ? null : d;
  };
  /* yyyy-MM-dd for <input type="date">. Also accepts "2026-09-24 10:30" and other parseable dates. */
  const isoDate = v => {
    const s = text(v), m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = s ? new Date(s) : null;
    return d && !isNaN(d) ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : '';
  };
  const formatDate = v => {
    const d = toDate(v);
    return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : String(v ?? '');
  };
  /* "Just now", "3 hours ago", "Yesterday", "5 days ago", then the date itself. */
  const timeAgo = v => {
    const d = toDate(v);
    if (!d) return '';
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text(v));
    const now = new Date();
    if (!dateOnly) {
      const s = (now - d) / 1000;
      if (s < 3600) return 'Just now';
      if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h === 1 ? '' : 's'} ago`; }
    }
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    return formatDate(d);
  };
  const formatPrice = v => {
    const s = text(v);
    return /^₹?\s*[\d,]+(\.\d+)?$/.test(s) ? '₹' + Number(s.replace(/[₹,\s]/g, '')).toLocaleString('en-IN') : s;
  };
  /* Months in a plan duration: "3 Months" -> 3, "1 Year" / "Yearly" -> 12, "Half Yearly" -> 6. 0 if unknown. */
  const durationMonths = v => {
    const s = text(v).toLowerCase();
    const n = Number((s.match(/\d+(\.\d+)?/) || [])[0]) || 1;
    if (/year|annual/.test(s)) return /half/.test(s) ? 6 : n * 12;
    if (/quarter/.test(s)) return n * 3;
    if (/month/.test(s)) return n;
    return 0;
  };

  /* Lower display_order first; rows without one go last. */
  const orderOf = v => { const n = Number(v); return v === '' || v === null || v === undefined || isNaN(n) ? Infinity : n; };
  const byOrder = (a, b) => { const x = orderOf(a.display_order), y = orderOf(b.display_order); return x === y ? 0 : (x < y ? -1 : 1); };
  const activeSorted = list => (Array.isArray(list) ? list : []).filter(i => truthy(i.active)).sort(byOrder);
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

  /* Resize hosted images: Cloudinary uploads, and the Unsplash stand-in photos. */
  const CLD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;
  const UNSPLASH = /^https:\/\/images\.unsplash\.com\//;
  const cld = (url, width) => {
    const s = String(url || '');
    const m = s.match(CLD);
    if (m) return `${m[1]}f_auto,q_auto,c_limit,w_${width}/${m[2]}`;
    if (UNSPLASH.test(s)) {
      try {
        const u = new URL(s);
        u.searchParams.set('auto', 'format');
        u.searchParams.set('fit', 'crop');
        u.searchParams.set('q', '75');
        u.searchParams.set('w', String(width));
        return u.toString();
      } catch { return url; }
    }
    return url;
  };

  /* <img> with lazy loading and a responsive srcset for Cloudinary / Unsplash images. */
  const img = (url, alt, { sizes = '100vw', widths = [480, 800, 1200, 1600], eager = false } = {}) => {
    const u = safeUrl(url);
    if (!u) return '';
    const hosted = CLD.test(u) || UNSPLASH.test(u);
    const srcset = hosted ? ` srcset="${widths.map(w => `${esc(cld(u, w))} ${w}w`).join(', ')}" sizes="${esc(sizes)}"` : '';
    const src = hosted ? cld(u, widths[Math.min(1, widths.length - 1)]) : u;
    return `<img src="${esc(src)}"${srcset} alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  };

  /* Image box that shows a designed placeholder until a photo URL exists. */
  const media = (url, alt, label, opts = {}) => {
    const tag = img(url, alt, opts);
    return `<div class="media ${opts.cls || ''}${tag ? ' has-img' : ''}" data-label="${esc(label)}">${tag}</div>`;
  };

  /* Broken image? Fall back to the placeholder instead of a broken icon. */
  document.addEventListener('error', event => {
    const el = event.target;
    if (!el || el.tagName !== 'IMG') return;
    const box = el.parentElement;
    if (box && box.classList.contains('media')) box.classList.remove('has-img');
    el.remove();
  }, true);

  return {
    esc, text, truthy, isFalse, splitList, isPlaceholder, digits, intlPhone, isDummyPhone, realPhone, safeUrl, linkUrl,
    instagramUrl, mapEmbedSrc, pad2, toDate, isoDate, formatDate, timeAgo, formatPrice, durationMonths, byOrder,
    activeSorted, initials, cld, img, media
  };
})();
