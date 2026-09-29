/**
 * ===========================================================================
 *  SSV GYM — Google Apps Script backend (Google Sheets CMS API)       v1.6.2
 * ===========================================================================
 *  First time
 *    1. Open the "SSV Gym CMS" spreadsheet > Extensions > Apps Script.
 *    2. Paste this file (the default appsscript.json needs no changes), save,
 *       and reload the sheet.
 *    3. Sheet menu: SSV Admin > Set up / repair sheets, Set admin password,
 *       Set Cloudinary keys, then Set Google Places key.
 *    4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *    5. Paste the /exec URL into js/config.js > API_URL.
 *  Updating
 *    Paste, save, reload the sheet, run SSV Admin > Set up / repair sheets,
 *    then Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy.
 *
 *  SECRETS live in Script Properties (Project Settings > Script properties) and
 *  are set from the sheet menu. The Config tab lists each one with "Stored in
 *  Script Properties" or "Not set", never the value itself:
 *    ADMIN_PASSWORD_HASH / ADMIN_PASSWORD_SALT   SSV Admin > Set admin password
 *    CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET   SSV Admin > Set Cloudinary keys
 *    GOOGLE_PLACES_API_KEY                       SSV Admin > Set Google Places key
 *    SHEET_ID       (optional)  only if this script is NOT bound to the sheet
 *  Email alerts go to NOTIFY_EMAIL in the Config tab (several addresses
 *  separated by commas). They only receive alerts; editing needs the password.
 * ===========================================================================
 */

const VERSION = '1.6.2';
const SEED_LEVEL = '1.6.2';            // level of the starting content (see setupSheets)
const NOTIFY_DEFAULT = 'ssvgym2021@gmail.com, laxman19.sawant@gmail.com';
const PLACE_ID_DEFAULT = 'ChIJD77n3Dup5zsROuYZWtEYmmQ';   // SSV Gym on Google Maps
const DESCRIPTION_DEFAULT = 'SSV Gym (Shree Siddhi Vinayak Gym) in Virar West: gym floor, CrossFit, cardio, personal training, diet plans, a steam room, and pool and carrom.';
const SESSION_SECONDS = 6 * 60 * 60;   // admin session, extended on each use (CacheService maximum)
const CONTENT_CACHE_SECONDS = 300;     // public content cache
const CONTENT_CACHE_KEY = 'public_content_v2';
const GOOGLE_CACHE_SECONDS = 6 * 60 * 60;   // Google rating and reviews: asked at most every 6 hours
const GOOGLE_REVIEWS_MAX = 5;
const MAX_LOGIN_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;
const UPLOAD_FORMATS = 'jpg,png,webp'; // photos: Cloudinary refuses any other file type
const VIDEO_FORMATS = 'mp4,mov,webm';  // videos (gallery)
const MAX_PUBLIC_REVIEWS = 300;
const REVIEW_MAX_CHARS = 800;
/** Config/General keys that look like this are secrets, which don't belong in the sheet. */
const SECRET_KEY_PATTERN = /pass|secret|api.?key|token/i;
/** Links in reviews are almost always spam. */
const LINK_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|info|biz|xyz|ru|top|shop|site|online|click|link)\b)/i;

/** Uploads are filed as <CLOUDINARY_FOLDER>/<section>, e.g. SSV-Gym/Trainers. */
const MEDIA_SECTIONS = { general: 'Home', facilities: 'Facilities', trainers: 'Trainers', gallery: 'Gallery', announcements: 'Events' };

/** The General tab, in the order of the website. The category shows on the first row of each group. */
const GENERAL_LAYOUT = [
  ['Basic', ['gym_name', 'full_name', 'tagline', 'description']],
  ['Top of page', ['hero_heading', 'hero_subtitle', 'hero_image', 'facility_strip']],
  ['Statistics', ['stat_1_value', 'stat_1_label', 'stat_2_value', 'stat_2_label', 'stat_3_value', 'stat_3_label', 'stat_4_value', 'stat_4_label', 'stat_5_value', 'stat_5_label', 'stat_6_value', 'stat_6_label']],
  ['About', ['about_heading', 'about_text', 'about_image', 'about_highlights']],
  ['Facilities', ['facilities_intro']],
  ['Membership', ['featured_badge_text', 'services_heading']],
  ['Gallery', ['gallery_categories']],
  ['Reviews', ['review_form', 'review_approval']],
  ['Contact', ['phone', 'phone_2', 'whatsapp', 'address', 'opening_hours']],
  ['Map & social', ['maps_url', 'maps_embed_url', 'instagram_url', 'facebook_url']]
];
const GENERAL_CATEGORY = {};
GENERAL_LAYOUT.forEach(group => group[1].forEach(key => { GENERAL_CATEGORY[key] = group[0]; }));

/** Keys kept in Script Properties. The Config tab has one row for each, showing only its status. */
const SECRETS = {
  ADMIN_PASSWORD: { props: ['ADMIN_PASSWORD_HASH', 'ADMIN_PASSWORD_SALT'], menu: 'Set admin password' },
  CLOUDINARY_API_KEY: { props: ['CLOUDINARY_API_KEY'], menu: 'Set Cloudinary keys' },
  CLOUDINARY_API_SECRET: { props: ['CLOUDINARY_API_SECRET'], menu: 'Set Cloudinary keys' },
  GOOGLE_PLACES_API_KEY: { props: ['GOOGLE_PLACES_API_KEY'], menu: 'Set Google Places key' }
};
const SECRET_STORED = 'Stored in Script Properties';
/** What a real key looks like. Any other text in its Config cell (such as a note) is never taken for a key. */
const KEY_FORMATS = {
  CLOUDINARY_API_KEY: /^\d{10,20}$/,
  CLOUDINARY_API_SECRET: /^[A-Za-z0-9_-]{20,}$/,
  GOOGLE_PLACES_API_KEY: /^AIza[\w-]{30,}$/
};

/** Sheet tab -> columns (internal names). Headers are matched by name, so columns may be reordered. */
const SCHEMA = {
  General:            ['category', 'key', 'value'],
  Facilities:         ['id', 'name', 'tags', 'description', 'image_url', 'category', 'active', 'display_order'],
  'Membership Plans': ['id', 'name', 'duration', 'price', 'description', 'features', 'featured', 'active', 'display_order'],
  Services:           ['id', 'name', 'price', 'price_note', 'description', 'active', 'display_order'],
  Trainers:           ['id', 'name', 'role', 'specialization', 'bio', 'image_url', 'active', 'display_order'],
  Gallery:            ['id', 'image_url', 'title', 'category', 'active', 'display_order'],
  Reviews:            ['id', 'name', 'rating', 'review', 'likes', 'date', 'source', 'status'],
  Announcements:      ['id', 'title', 'description', 'image_url', 'date', 'expiry', 'active', 'priority'],
  Enquiries:          ['id', 'name', 'phone', 'message', 'date', 'status'],
  Config:             ['key', 'value', 'notes']
};
/** Columns earlier versions had. Set up / repair sheets deletes them. */
const DROPPED_COLUMNS = { Gallery: ['caption'], General: ['notes'] };
/** How each column is titled in the sheet. */
const LABELS = {
  id: 'ID', key: 'Key', value: 'Value', notes: 'Notes', name: 'Name', tags: 'Tags', description: 'Description',
  image_url: 'Image URL', category: 'Category', active: 'Active', display_order: 'Display Order', duration: 'Duration',
  price: 'Price', price_note: 'Price Note', features: 'Features', featured: 'Featured', role: 'Role', specialization: 'Specialization',
  bio: 'Bio', title: 'Title', rating: 'Rating', review: 'Review', likes: 'Likes', date: 'Date', source: 'Source',
  status: 'Status', expiry: 'Expiry', priority: 'Priority', phone: 'Phone', message: 'Message'
};
/** Column width in pixels and alignment. All text is clipped to one line; click a cell to read it all. */
const COLUMN_STYLE = {
  id: [170, 'left'], key: [190, 'left'], value: [420, 'left'], notes: [380, 'left'],
  name: [190, 'left'], title: [230, 'left'], tags: [220, 'left'], description: [340, 'left'],
  image_url: [240, 'left'], category: [110, 'center'], active: [80, 'center'], featured: [90, 'center'],
  display_order: [120, 'center'], duration: [110, 'center'], price: [100, 'center'], price_note: [150, 'left'],
  features: [300, 'left'], role: [170, 'left'], specialization: [220, 'left'], bio: [340, 'left'],
  rating: [80, 'center'], review: [400, 'left'], likes: [80, 'center'], date: [150, 'center'],
  expiry: [120, 'center'], priority: [90, 'center'], source: [100, 'center'], status: [120, 'center'],
  phone: [150, 'left'], message: [360, 'left']
};
const COLLECTIONS = { facilities: 'Facilities', plans: 'Membership Plans', services: 'Services', trainers: 'Trainers', gallery: 'Gallery', reviews: 'Reviews', announcements: 'Announcements' };
const ID_PREFIX = { Facilities: 'fac', 'Membership Plans': 'plan', Services: 'svc', Trainers: 'tr', Gallery: 'img', Reviews: 'rev', Announcements: 'ann', Enquiries: 'enq' };
const BOOLEAN_COLUMNS = ['active', 'featured'];
const BOOLEAN_KEYS = ['review_form', 'review_approval'];
const DATE_COLUMNS = ['date', 'expiry'];
const ENQUIRY_STATUSES = ['New', 'Contacted', 'Closed'];
const REVIEW_STATUSES = ['Published', 'Pending', 'Hidden'];
/** Columns that must not be empty, with the name used in error messages. */
const REQUIRED = {
  Facilities: { name: 'Name' },
  'Membership Plans': { name: 'Plan name', duration: 'Duration' },
  Services: { name: 'Name' },
  Trainers: { name: 'Name' },
  Gallery: { image_url: 'Photo or video' },
  Reviews: { name: 'Name', review: 'Review' },
  Announcements: { title: 'Title' }
};
/** Filled in when a row is typed straight into the sheet. */
const NEW_ROW_DEFAULTS = {
  Reviews: () => ({ status: 'Published', likes: 0, date: today_(), source: 'Admin' }),
  Enquiries: () => ({ status: 'New', date: today_() })
};

/* ============================== HTTP entry points ============================== */

function doGet(e) {
  return respond_(() => {
    const action = String((e && e.parameter && e.parameter.action) || 'content');
    if (action === 'health') return { status: 'ok', version: VERSION };
    const content = getPublicContent_();
    if (action === 'content') return content;
    if (Object.prototype.hasOwnProperty.call(content, action)) return content[action]; // e.g. ?action=plans
    throw apiError_('Unknown action: ' + action, 'BAD_REQUEST');
  });
}

function doPost(e) {
  return respond_(() => {
    let body;
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (err) { throw apiError_('Request body must be JSON.', 'BAD_REQUEST'); }
    if (!body || typeof body !== 'object') throw apiError_('Request body must be JSON.', 'BAD_REQUEST');
    const action = String(body.action || '');

    // Public actions
    if (action === 'submitEnquiry') return submitEnquiry_(body.enquiry);
    if (action === 'submitReview') return submitReview_(body.review);
    if (action === 'likeReview') return likeReview_(body.id, body.like);
    if (action === 'login') return login_(body.password);

    // Everything below needs a valid admin session. Signed-in admins see the real
    // reason for an unexpected error instead of a generic message.
    requireSession_(body.token);
    try { return adminAction_(action, body); }
    catch (err) {
      if (err.code) throw err;
      console.error(err && err.stack ? err.stack : err);
      throw apiError_('Something went wrong: ' + (err && err.message ? err.message : err), 'SERVER_ERROR');
    }
  });
}

function adminAction_(action, body) {
  switch (action) {
    case 'verify':              return { valid: true, version: VERSION };
    case 'logout':              CacheService.getScriptCache().remove('sess_' + body.token); return { signedOut: true };
    case 'adminGetAll':         return getAdminData_();
    case 'getInbox':            return { enquiries: readTable_('Enquiries') || [], reviews: readTable_('Reviews') || [] };
    case 'saveGeneral': {
      const out = write_(() => saveKeyValues_('General', body.general));
      removeUnusedImages_(out.replaced);
      return out.values;
    }
    case 'saveRecord': {
      const out = write_(() => saveRecord_(tabFor_(body.collection), body.record));
      removeUnusedImages_(out.replaced);
      return out.record;
    }
    case 'deleteRecord':
    case 'deleteRecords': {
      const single = action === 'deleteRecord';
      const out = write_(() => deleteRecords_(tabFor_(body.collection, true), single ? [body.id] : body.ids));
      if (!out.ids.length) throw apiError_('That item no longer exists. Refresh and try again.', 'NOT_FOUND');
      removeUnusedImages_(out.replaced);
      return { deleted: single ? out.ids[0] : out.ids };
    }
    case 'reorder':             return write_(() => reorder_(tabFor_(body.collection), body.ids));
    case 'updateEnquiryStatus': return withLock_(() => updateEnquiryStatus_(body.id, body.status));
    case 'getUploadSignature':  return getUploadSignature_(body.folder, body.kind);
    case 'mediaLibrary':        return mediaLibrary_();
    case 'deleteImages':        return deleteImages_(body.images);
    case 'refreshGoogle':
      clearGoogleCache_();
      CacheService.getScriptCache().remove(CONTENT_CACHE_KEY);
      return googleStatus_();
    default: throw apiError_('Unknown action: ' + action, 'BAD_REQUEST');
  }
}

function respond_(fn) {
  let out;
  try { out = { ok: true, data: fn() }; }
  catch (err) {
    if (!err.code) console.error(err && err.stack ? err.stack : err);
    out = { ok: false, error: err.code ? err.message : 'Server error. Check the Apps Script executions log.', code: err.code || 'SERVER_ERROR' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function apiError_(message, code) { const e = new Error(message); e.code = code; return e; }

/* One writer at a time. Re-entrant within a request; changes are flushed before the lock is released. */
let IN_LOCK_ = false;
function withLock_(fn, waitMs) {
  if (IN_LOCK_) return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 20000)) throw apiError_('The sheet is busy. Try again in a moment.', 'BUSY');
  IN_LOCK_ = true;
  try { return fn(); }
  finally {
    IN_LOCK_ = false;
    try { SpreadsheetApp.flush(); } catch (err) { /* nothing pending */ }
    lock.releaseLock();
  }
}

/** Content write: locked, and the public cache is cleared afterwards. */
function write_(fn) {
  return withLock_(() => {
    const result = fn();
    CacheService.getScriptCache().remove(CONTENT_CACHE_KEY);
    return result;
  });
}

/** Sheet tab of a collection. Enquiries only where deleting them is allowed. */
function tabFor_(collection, withEnquiries) {
  const tab = COLLECTIONS[collection] || (withEnquiries && collection === 'enquiries' ? 'Enquiries' : '');
  if (!tab) throw apiError_('Unknown collection: ' + collection, 'BAD_REQUEST');
  return tab;
}

/* ================================ sheet helpers ================================ */

let SS_ = null, TZ_ = null;
function ss_() {
  if (SS_) return SS_;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  SS_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!SS_) throw apiError_('Spreadsheet not found. Bind the script to the sheet or set SHEET_ID in Script Properties.', 'NOT_CONFIGURED');
  return SS_;
}
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw apiError_('The "' + name + '" tab is missing. In the sheet, run SSV Admin > Set up / repair sheets.', 'NOT_CONFIGURED');
  return sh;
}
/** Column title -> internal name: "Image URL" -> "image_url". Older lower-case titles match too. */
function normHeader_(h) { return String(h === null || h === undefined ? '' : h).trim().toLowerCase().replace(/[\s-]+/g, '_'); }
function headers_(values) { return (values[0] || []).map(normHeader_); }
function headerRow_(sh) { return sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(normHeader_); }
/** Dates in the sheet belong to the spreadsheet's time zone (File > Settings). */
function tz_() {
  if (TZ_) return TZ_;
  try { TZ_ = ss_().getSpreadsheetTimeZone(); } catch (err) { TZ_ = null; }
  return (TZ_ = TZ_ || Session.getScriptTimeZone() || 'Asia/Kolkata');
}
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function isTrue_(v) { return v === true || /^(true|yes|y|1)$/i.test(String(v).trim()); }
function isFalse_(v) { return v === false || /^(false|no|n|0)$/i.test(String(v === null || v === undefined ? '' : v).trim()); }
/** Empty for content purposes. Tick boxes (true/false) alone don't count as content. */
function isBlank_(v) { return v === null || v === undefined || typeof v === 'boolean' || String(v).trim() === ''; }
function hex_(bytes) { return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join(''); }
function sha256Hex_(text) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)); }
function isCheckbox_(rule) { return Boolean(rule) && rule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.CHECKBOX; }
function unique_(list) { return list.filter((v, i) => list.indexOf(v) === i); }
function isCloudinaryUrl_(v) { return /^https?:\/\/res\.cloudinary\.com\//i.test(String(v === null || v === undefined ? '' : v).trim()); }
function oneLine_(v) { return String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function sameText_(a, b) {
  const s = v => { const o = cellOut_(v); return String(o === null || o === undefined ? '' : o).trim(); };
  return s(a) === s(b);
}

/** Sheets refuses to delete the last row under a frozen header, so that row is cleared instead. */
function deleteRowSafe_(sh, row) {
  if (sh.getMaxRows() - sh.getFrozenRows() > 1) sh.deleteRow(row);
  else sh.getRange(row, 1, 1, Math.max(sh.getLastColumn(), 1)).clearContent();
}

/**
 * Makes sure row n exists, adding rows at the bottom when the tab is full. With copyRules,
 * the new rows get the dropdowns and tick boxes of the last row (lists such as Enquiries).
 */
function ensureRow_(sh, n, copyRules) {
  const max = sh.getMaxRows();
  if (n <= max) return;
  sh.insertRowsAfter(max, Math.max(50, n - max));
  const cols = Math.max(sh.getLastColumn(), 1);
  if (copyRules && max >= 2) sh.getRange(max, 1, 1, cols).copyTo(sh.getRange(max + 1, 1, sh.getMaxRows() - max, cols), SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
}

/** Lower display_order first; rows without one go last. */
function orderOf_(v) { const n = Number(v); return v === '' || v === null || v === undefined || isNaN(n) ? Infinity : n; }
function cmp_(a, b) { return a === b ? 0 : (a < b ? -1 : 1); }
function byOrder_(a, b) { return cmp_(orderOf_(a.display_order), orderOf_(b.display_order)); }
function byPriority_(a, b) { return (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(b.date).localeCompare(String(a.date)); }
/** Most liked first, then newest. */
function byLikes_(a, b) { return (Number(b.likes) || 0) - (Number(a.likes) || 0) || String(b.date).localeCompare(String(a.date)); }

/** Value read from a cell -> JSON-friendly value. Dates become yyyy-MM-dd (plus HH:mm if a time is set). */
function cellOut_(v) {
  if (v instanceof Date) {
    const tz = tz_(), time = Utilities.formatDate(v, tz, 'HH:mm');
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd') + (time === '00:00' ? '' : ' ' + time);
  }
  return v;
}

/** Value to write. Blocks formula injection (=, +, -, @) and keeps leading zeros. */
function cellIn_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  let s = String(v).trim().slice(0, 5000);
  if (/^[=+\-@]/.test(s) || /^0\d+$/.test(s)) s = "'" + s;
  return s;
}

/** "Rahul Sharma!" -> "rahul-sharma" */
function slug_(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

/**
 * A readable id for a new row: the tab's prefix plus the row's name or title,
 * e.g. "tr-rahul-sharma". A name already in use gets -2, -3…; rows without a
 * usable name are numbered ("img-13"), and enquiries are numbered per day
 * ("enq-2026-09-25-1"). The id then never changes, even if the item is renamed.
 */
function readableId_(name, label, taken) {
  const prefix = ID_PREFIX[name] || 'row';
  const numbered = name === 'Enquiries';
  const base = slug_(numbered ? today_() : label);
  const stem = base ? prefix + '-' + base : prefix;   // only a-z, 0-9 and "-"
  if (base && !numbered && !taken[stem]) return stem;
  const pattern = new RegExp('^' + stem + '-(\\d+)$');
  let max = base && !numbered ? 1 : 0;
  Object.keys(taken).forEach(id => { const m = id.match(pattern); if (m) max = Math.max(max, Number(m[1])); });
  return stem + '-' + (max + 1);
}

/** Ids already used in a tab, as a lookup object. */
function takenIds_(sh) {
  const taken = {}, lastRow = sh.getLastRow();
  if (lastRow < 2) return taken;
  const idCol = headerRow_(sh).indexOf('id');
  if (idCol < 0) return taken;
  sh.getRange(2, idCol + 1, lastRow - 1, 1).getValues().forEach(r => { const id = String(r[0]).trim(); if (id) taken[id] = true; });
  return taken;
}

/** What a row is called: its name, else its title. */
function labelOf_(row, head) {
  const cell = h => { const i = head.indexOf(h); return i >= 0 && row[i] !== null && row[i] !== undefined ? String(row[i]).trim() : ''; };
  return cell('name') || cell('title');
}

/** True for a row that has content but no id yet (typed or pasted straight into the sheet). */
function needsId_(row, idCol) {
  return isBlank_(row[idCol]) && row.some((c, i) => i !== idCol && !isBlank_(c));
}

/**
 * Gives id-less rows an id (plus sensible defaults) and puts tick boxes in their
 * active/featured cells, keeping anything typed there. Rows first..last (default: all).
 */
function repairTab_(sh, name, first, last) {
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return 0;
  const head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(normHeader_);
  const idCol = head.indexOf('id');
  if (idCol < 0) return 0;
  first = Math.max(first || 2, 2);
  last = Math.min(last || lastRow, lastRow);
  if (last < first) return 0;
  const count = last - first + 1;
  const rows = sh.getRange(first, 1, count, lastCol).getValues();
  let fixed = 0, taken = null;
  rows.forEach((row, n) => {
    if (!needsId_(row, idCol)) return;
    taken = taken || takenIds_(sh);
    row[idCol] = readableId_(name, labelOf_(row, head), taken);
    taken[row[idCol]] = true;
    sh.getRange(first + n, idCol + 1).setValue(row[idCol]);
    const defaults = NEW_ROW_DEFAULTS[name] ? NEW_ROW_DEFAULTS[name]() : {};
    Object.keys(defaults).forEach(col => {
      const c = head.indexOf(col);
      if (c >= 0 && isBlank_(row[c])) sh.getRange(first + n, c + 1).setValue(cellIn_(defaults[col]));
    });
    fixed++;
  });
  BOOLEAN_COLUMNS.forEach(c => {
    const col = head.indexOf(c);
    if (col < 0) return;
    const rules = sh.getRange(first, col + 1, count, 1).getDataValidations();
    rows.forEach((row, n) => {
      if (isBlank_(row[idCol]) || isCheckbox_(rules[n][0])) return;
      const cell = sh.getRange(first + n, col + 1), ticked = isTrue_(row[col]);
      cell.insertCheckboxes();            // resets the cell to unticked
      if (ticked) cell.setValue(true);
    });
  });
  return fixed;
}

function readTable_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) return null;
  let values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  let head = headers_(values);
  const idCol = head.indexOf('id');
  if (idCol >= 0 && values.some((r, i) => i > 0 && needsId_(r, idCol))) {
    try {
      withLock_(() => repairTab_(sh, name), 3000);
      values = sh.getDataRange().getValues();
      head = headers_(values);
    } catch (err) { /* sheet busy: those rows get their id on the next read */ }
  }
  const keyCol = idCol >= 0 ? idCol : Math.max(head.indexOf('key'), 0);
  return values.slice(1)
    .filter(row => String(row[keyCol]).trim() !== '')
    .map(row => { const o = {}; head.forEach((h, i) => { if (h) o[h] = cellOut_(row[i]); }); return o; });
}

/** Key/value tabs as an object. If a key appears twice, the first row counts (as when saving). */
function readKeyValues_(name) {
  const rows = readTable_(name);
  if (!rows) return null;
  const out = {};
  rows.forEach(r => {
    const key = String(r.key).trim();
    if (!(key in out)) out[key] = r.value === undefined ? '' : r.value;
  });
  return out;
}

/* ================================= public reads ================================= */

function getPublicContent_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CONTENT_CACHE_KEY);
  if (hit) return JSON.parse(hit);

  const today = today_();
  const out = { general: readKeyValues_('General') || {}, updated: new Date().toISOString() };
  Object.keys(COLLECTIONS).forEach(key => {
    const rows = readTable_(COLLECTIONS[key]) || [];
    if (key === 'reviews') {
      out.reviews = rows.filter(r => String(r.status).trim() === 'Published' && String(r.review || '').trim())
        .map(publicReview_).sort(byLikes_).slice(0, MAX_PUBLIC_REVIEWS);
      return;
    }
    let list = rows.filter(r => isTrue_(r.active));
    if (key === 'announcements') list = list.filter(r => !r.expiry || String(r.expiry).slice(0, 10) >= today).sort(byPriority_);
    else list.sort(byOrder_);
    out[key] = list;
  });
  const google = googleData_();
  if (google) delete google.error;   // Google's error messages are for the admin panel only
  out.google = google;
  try { cache.put(CONTENT_CACHE_KEY, JSON.stringify(out), CONTENT_CACHE_SECONDS); } catch (err) { /* over 100 KB: skip cache */ }
  return out;
}

/** The parts of a review visitors see. */
function publicReview_(r) {
  return {
    id: String(r.id), name: String(r.name || '').trim(),
    rating: Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0))),
    review: String(r.review || ''), likes: Math.max(0, Number(r.likes) || 0), date: String(r.date || '')
  };
}

function getAdminData_() {
  const out = { general: readKeyValues_('General') || {}, enquiries: readTable_('Enquiries') || [] };
  Object.keys(COLLECTIONS).forEach(key => { out[key] = readTable_(COLLECTIONS[key]) || []; });
  const cfg = readKeyValues_('Config') || {};
  const base = baseFolder_(cfg);
  out.meta = {
    version: VERSION, timeZone: tz_(), sheetUrl: ss_().getUrl(),
    cloudinaryConfigured: cloudinaryConfigured_(cfg), notifyEmail: notifyEmail_(cfg),
    media: { base: base, sections: sectionFolders_(base) },
    google: googleStatus_(cfg), secrets: secretStatus_()
  };
  return out;
}

/**
 * Address(es) told about new enquiries and reviews: NOTIFY_EMAIL in the Config
 * tab, or the NOTIFY_EMAIL Script Property when the tab has none. Only valid
 * addresses are kept, separated by commas.
 */
function notifyEmail_(cfg) {
  cfg = cfg || readKeyValues_('Config') || {};
  let to = String(cfg.NOTIFY_EMAIL || '').trim();
  if (!to) to = String(PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || '').trim();
  return to.split(/[\s,;]+/).filter(a => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)).join(', ');
}

/* ============================ Google rating and reviews ============================ */

function googlePlaceId_(cfg) {
  const id = String((cfg || readKeyValues_('Config') || {}).GOOGLE_PLACE_ID || '').trim();
  return /^[\w-]{10,}$/.test(id) ? id : '';
}
function googleCacheKey_(placeId) { return 'google_place_v1:' + placeId; }
function clearGoogleCache_() {
  const id = googlePlaceId_();
  if (id) CacheService.getScriptCache().remove(googleCacheKey_(id));
}

/**
 * What the website shows from Google: review links (from the Place ID alone) and,
 * with a Places API key, the rating, the number of reviews and up to five reviews.
 * Google is asked at most every 6 hours; a failed request is retried after 15 minutes.
 */
function googleData_(cfg) {
  const placeId = googlePlaceId_(cfg);
  if (!placeId) return null;
  const q = encodeURIComponent(placeId);
  const out = {
    placeId: placeId,
    reviewsUrl: 'https://search.google.com/local/reviews?placeid=' + q,
    writeUrl: 'https://search.google.com/local/writereview?placeid=' + q
  };
  const key = PropertiesService.getScriptProperties().getProperty('GOOGLE_PLACES_API_KEY');
  if (!key) return out;
  const cache = CacheService.getScriptCache(), ck = googleCacheKey_(placeId);
  let info = null;
  const hit = cache.get(ck);
  if (hit) {
    try { info = JSON.parse(hit); } catch (err) { info = null; }
  }
  if (!info) {
    try {
      info = fetchGooglePlace_(placeId, key);
      cache.put(ck, JSON.stringify(info), GOOGLE_CACHE_SECONDS);
    } catch (err) {
      console.warn('Google reviews: ' + err.message);
      info = { error: String(err.message || err).slice(0, 300) };
      try { cache.put(ck, JSON.stringify(info), 900); } catch (e) { /* ignore */ }
    }
  }
  return Object.assign(out, info);
}

/** Place Details from the Places API (New): name, rating, number of ratings, reviews, Maps link. */
function fetchGooglePlace_(placeId, key) {
  let res;
  try {
    res = UrlFetchApp.fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId), {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'displayName,rating,userRatingCount,reviews,googleMapsUri' },
      muteHttpExceptions: true
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/permission|authori[sz]|external_request/i.test(msg)) throw apiError_('Apps Script is not allowed to connect to Google Places yet. In the Google Sheet, run SSV Admin > Set Google Places key and allow access.', 'NEEDS_PERMISSION');
    throw apiError_('Could not reach Google: ' + msg, 'GOOGLE_ERROR');
  }
  let d = {};
  try { d = JSON.parse(res.getContentText() || '{}'); } catch (err) { d = {}; }
  if (res.getResponseCode() !== 200) throw apiError_((d.error && d.error.message) || ('HTTP ' + res.getResponseCode()), 'GOOGLE_ERROR');
  const text = t => String((t && t.text) || '').trim();
  return {
    name: text(d.displayName),
    rating: Math.round((Number(d.rating) || 0) * 10) / 10,
    count: Math.max(0, Number(d.userRatingCount) || 0),
    mapsUrl: String(d.googleMapsUri || ''),
    reviews: (d.reviews || []).map(r => {
      const a = r.authorAttribution || {};
      return {
        name: String(a.displayName || 'Google user').slice(0, 80),
        profile: String(a.uri || ''),
        photo: String(a.photoUri || ''),
        rating: Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0))),
        text: (text(r.originalText) || text(r.text)).slice(0, 1500),
        time: String(r.relativePublishTimeDescription || ''),
        date: String(r.publishTime || '').slice(0, 10)
      };
    }).filter(r => r.text).slice(0, GOOGLE_REVIEWS_MAX)
  };
}

/** For the admin panel: is Google connected, and what does it say. */
function googleStatus_(cfg) {
  const g = googleData_(cfg) || {};
  return {
    placeId: g.placeId || '', keySet: Boolean(PropertiesService.getScriptProperties().getProperty('GOOGLE_PLACES_API_KEY')),
    name: g.name || '', rating: g.rating || 0, count: g.count || 0, reviews: (g.reviews || []).length,
    error: g.error || '', url: g.reviewsUrl || ''
  };
}

/* ============================= keys in Script Properties ============================= */

function secretStatus_() {
  const props = PropertiesService.getScriptProperties(), out = {};
  Object.keys(SECRETS).forEach(k => { out[k] = SECRETS[k].props.every(p => Boolean(props.getProperty(p))); });
  return out;
}

/**
 * Keeps one Config row per key with "Stored in Script Properties" or "Not set".
 * Only text that looks like a real Cloudinary or Google key (KEY_FORMATS) is
 * moved into Script Properties; anything else typed there, such as "present in
 * script properties", is simply replaced by the status. The admin password is
 * only ever set from the menu.
 */
function refreshSecretRows_() {
  const sh = ss_().getSheetByName('Config');
  if (!sh) return;
  const status = k => (secretStatus_()[k] ? SECRET_STORED : 'Not set: SSV Admin > ' + SECRETS[k].menu);
  appendMissingKeys_(sh, Object.keys(SECRETS).map(k => [k, status(k), configNoteFor_(k)]));
  updateKeyValues_(sh, (key, value) => {
    if (!SECRETS[key]) return undefined;
    const v = String(value === null || value === undefined ? '' : value).trim();
    if (KEY_FORMATS[key] && KEY_FORMATS[key].test(v)) PropertiesService.getScriptProperties().setProperty(key, v);
    return status(key);
  });
}

function savePassword_(password) {
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_PASSWORD_SALT: salt,
    ADMIN_PASSWORD_HASH: sha256Hex_(salt + password),
    SESSION_EPOCH: String(Date.now())
  });
  CacheService.getScriptCache().remove('login_failures');
}

/* ==================================== writes ==================================== */

/** Saves key/value pairs. Only cells whose value changed are written. Returns the replaced photo links too. */
function saveKeyValues_(name, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw apiError_('Nothing to save.', 'BAD_REQUEST');
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const keyCol = Math.max(head.indexOf('key'), 0);
  const valCol = head.indexOf('value') >= 0 ? head.indexOf('value') : 1;
  const rowOf = {};
  values.forEach((r, i) => { const k = String(r[keyCol]).trim(); if (i > 0 && k && !(k in rowOf)) rowOf[k] = i; });
  const replaced = [];
  let next = sh.getLastRow() + 1;
  Object.keys(data).forEach(key => {
    if (!/^[A-Za-z0-9_]{1,64}$/.test(key)) return;
    let value = data[key];
    if (BOOLEAN_KEYS.indexOf(key) >= 0) value = isTrue_(value);
    if (key in rowOf) {
      const old = values[rowOf[key]][valCol];
      if (sameText_(old, value)) return;
      if (isCloudinaryUrl_(old)) replaced.push(String(old).trim());
      sh.getRange(rowOf[key] + 1, valCol + 1).setValue(cellIn_(value));
    } else {
      ensureRow_(sh, next, false);
      sh.getRange(next, keyCol + 1).setValue(key);
      const cell = sh.getRange(next, valCol + 1);
      if (BOOLEAN_KEYS.indexOf(key) >= 0) cell.insertCheckboxes();
      cell.setValue(cellIn_(value));
      next++;
    }
  });
  return { values: readKeyValues_(name), replaced: replaced };
}

/** Review text: normal line breaks, no control characters, at most REVIEW_MAX_CHARS. */
function cleanReviewText_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, REVIEW_MAX_CHARS);
}

/** Keeps known columns only and tidies values: tick boxes, dates, numbers, ratings, categories, image links. */
function cleanRecord_(name, input) {
  const out = {};
  (SCHEMA[name] || []).forEach(col => {
    if (col === 'id' || !Object.prototype.hasOwnProperty.call(input, col)) return;
    if (name === 'Reviews' && ['likes', 'date', 'source'].indexOf(col) >= 0) return;   // set by the system, not the admin
    let v = input[col];
    if (v === null || v === undefined) v = '';
    if (BOOLEAN_COLUMNS.indexOf(col) >= 0) v = isTrue_(v);
    else if (DATE_COLUMNS.indexOf(col) >= 0) { const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})/); v = m ? m[1] : String(v).trim(); }
    else if (col === 'display_order' || col === 'priority') v = String(v).trim() === '' || isNaN(Number(v)) ? '' : Number(v);
    else if (col === 'rating') { const n = Math.round(Number(v)); v = n >= 1 && n <= 5 ? n : ''; }
    else if (col === 'category') v = String(v).trim().toLowerCase();
    else if (col === 'image_url') v = cleanImageUrl_(v);
    else if (col === 'status') {
      v = String(v).trim();
      if (REVIEW_STATUSES.indexOf(v) < 0) throw apiError_('Status must be Published, Pending or Hidden.', 'VALIDATION');
    }
    else if (col === 'review') v = cleanReviewText_(v);
    else if (typeof v !== 'number') v = String(v);
    out[col] = v;
  });
  return out;
}

function cleanImageUrl_(v) {
  const s = String(v || '').trim();
  if (!s || /^https?:\/\//i.test(s)) return s;
  if (!/^[a-z][\w+.-]*:/i.test(s) && /^(\.{0,2}\/|[\w-]+\/)/.test(s)) return s; // a file on the website, e.g. assets/hero.jpg
  throw apiError_('Links must start with https://', 'VALIDATION');
}

/**
 * Creates a row (no id) or updates one. Only the columns sent are changed, so
 * edits made in the sheet meanwhile are kept. An unknown id is an error, not a new row.
 * Returns the saved row and any photo links it replaced.
 */
function saveRecord_(name, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw apiError_('Missing record.', 'BAD_REQUEST');
  const record = cleanRecord_(name, input);
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const idCol = head.indexOf('id');
  if (idCol < 0) throw apiError_('The "' + name + '" tab needs an "ID" column.', 'NOT_CONFIGURED');

  let id = String(input.id || '').trim(), rowIndex = -1;
  if (id) {
    rowIndex = values.findIndex((r, i) => i > 0 && String(r[idCol]).trim() === id);
    if (rowIndex < 1) throw apiError_('That item no longer exists. Refresh and try again.', 'NOT_FOUND');
  } else {
    const taken = {};
    values.slice(1).forEach(r => { const v = String(r[idCol]).trim(); if (v) taken[v] = true; });
    id = readableId_(name, record.name || record.title || '', taken);
    if (name === 'Reviews') {   // added by the owner in the admin panel
      record.likes = 0;
      record.date = today_();
      record.source = 'Admin';
      if (!record.status) record.status = 'Published';
    }
  }
  const existing = rowIndex > 0 ? values[rowIndex] : null;

  const row = head.map((h, i) => {
    if (h === 'id') return id;
    if (h in record) return BOOLEAN_COLUMNS.indexOf(h) >= 0 ? record[h] : cellIn_(record[h]);
    if (existing) return cellIn_(existing[i]);
    return BOOLEAN_COLUMNS.indexOf(h) >= 0 ? false : '';
  });

  const required = REQUIRED[name] || {};
  Object.keys(required).forEach(col => {
    const i = head.indexOf(col);
    if (i >= 0 && isBlank_(String(row[i]).replace(/^'/, ''))) throw apiError_(required[col] + ' is required.', 'VALIDATION');
  });

  const replaced = [];
  if (existing) head.forEach((h, i) => {
    if (h in record && isCloudinaryUrl_(existing[i]) && String(existing[i]).trim() !== String(record[h]).trim()) replaced.push(String(existing[i]).trim());
  });

  const rowNumber = existing ? rowIndex + 1 : sh.getLastRow() + 1;
  if (!existing) {
    ensureRow_(sh, rowNumber, true);
    // Add tick boxes first: insertCheckboxes() resets cells to FALSE.
    BOOLEAN_COLUMNS.forEach(c => { const i = head.indexOf(c); if (i >= 0) sh.getRange(rowNumber, i + 1).insertCheckboxes(); });
  }
  sh.getRange(rowNumber, 1, 1, row.length).setValues([row]);

  const written = sh.getRange(rowNumber, 1, 1, head.length).getValues()[0];
  const saved = {};
  head.forEach((h, i) => { if (h) saved[h] = cellOut_(written[i]); });
  return { record: saved, replaced: replaced };
}

/** Deletes the rows with these ids (bottom row first). Returns the ids deleted and the photo links in those rows. */
function deleteRecords_(name, ids) {
  if (!Array.isArray(ids) || !ids.length) throw apiError_('Nothing to delete.', 'BAD_REQUEST');
  const want = {};
  ids.slice(0, 500).forEach(id => { const k = String(id === null || id === undefined ? '' : id).trim(); if (k) want[k] = true; });
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const idCol = headers_(values).indexOf('id');
  if (idCol < 0) throw apiError_('The "' + name + '" tab needs an "ID" column.', 'NOT_CONFIGURED');
  const rows = [], done = [], replaced = [];
  values.forEach((r, i) => {
    const id = String(r[idCol]).trim();
    if (i < 1 || !want[id]) return;
    want[id] = false;
    rows.push(i + 1);
    done.push(id);
    r.forEach(v => { if (isCloudinaryUrl_(v)) replaced.push(String(v).trim()); });
  });
  rows.reverse().forEach(n => deleteRowSafe_(sh, n));
  return { ids: done, replaced: replaced };
}

/** Sets display_order 1..n in the given order. Rows not listed keep their relative order after them. */
function reorder_(name, ids) {
  if (!Array.isArray(ids) || !ids.length) throw apiError_('Nothing to reorder.', 'BAD_REQUEST');
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const idCol = head.indexOf('id'), orderCol = head.indexOf('display_order');
  if (idCol < 0 || orderCol < 0) throw apiError_('The "' + name + '" tab has no Display Order column.', 'BAD_REQUEST');
  if (values.length < 2) return { reordered: 0 };
  const position = {};
  ids.forEach((id, i) => { const k = String(id).trim(); if (k && !(k in position)) position[k] = i + 1; });
  let next = ids.length;
  values.slice(1)
    .map((r, i) => ({ i: i, id: String(r[idCol]).trim(), order: orderOf_(r[orderCol]) }))
    .filter(x => x.id && !(x.id in position))
    .sort((a, b) => cmp_(a.order, b.order) || a.i - b.i)
    .forEach(x => { position[x.id] = ++next; });
  const column = values.slice(1).map(r => { const id = String(r[idCol]).trim(); return [id ? position[id] : r[orderCol]]; });
  sh.getRange(2, orderCol + 1, column.length, 1).setValues(column);
  return { reordered: ids.length };
}

function updateEnquiryStatus_(id, status) {
  if (ENQUIRY_STATUSES.indexOf(status) < 0) throw apiError_('Status must be New, Contacted or Closed.', 'BAD_REQUEST');
  const sh = sheet_('Enquiries');
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const idCol = head.indexOf('id'), statusCol = head.indexOf('status');
  if (idCol < 0 || statusCol < 0) throw apiError_('The "Enquiries" tab needs "ID" and "Status" columns.', 'NOT_CONFIGURED');
  const i = values.findIndex((r, n) => n > 0 && String(r[idCol]).trim() === String(id).trim());
  if (i < 1) throw apiError_('Enquiry not found. Refresh and try again.', 'NOT_FOUND');
  sh.getRange(i + 1, statusCol + 1).setValue(status);
  return { id: String(id), status: status };
}

/** Adds one row, matching values to columns by name. */
function appendRecord_(sh, obj) {
  const head = headerRow_(sh);
  const row = sh.getLastRow() + 1;
  ensureRow_(sh, row, true);
  BOOLEAN_COLUMNS.forEach(c => { const i = head.indexOf(c); if (i >= 0) sh.getRange(row, i + 1).insertCheckboxes(); });
  sh.getRange(row, 1, 1, head.length).setValues([head.map(c => (c && c in obj ? cellIn_(obj[c]) : (BOOLEAN_COLUMNS.indexOf(c) >= 0 ? false : '')))]);
}

/* =================================== enquiries =================================== */

function submitEnquiry_(q) {
  if (!q || typeof q !== 'object') throw apiError_('Missing enquiry.', 'BAD_REQUEST');
  if (q.website) return { received: true };   // honeypot filled in: quietly ignore bots
  const name = oneLine_(q.name).slice(0, 80);
  const phone = oneLine_(q.phone).slice(0, 20);
  const message = String(q.message || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, 1000);
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2) throw apiError_('Enter your name.', 'VALIDATION');
  if (digits.length < 10 || digits.length > 13) throw apiError_('Enter a valid phone number.', 'VALIDATION');

  const cache = CacheService.getScriptCache();
  if (cache.get('enq_' + digits)) throw apiError_('An enquiry from this number arrived a few minutes ago. The gym will be in touch.', 'DUPLICATE');
  const hourKey = 'enq_hour_' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  const count = Number(cache.get(hourKey) || 0);
  if (count >= 30) throw apiError_('Too many enquiries right now. Please call or WhatsApp the gym instead.', 'RATE_LIMITED');

  withLock_(() => {
    const sh = sheet_('Enquiries');
    appendRecord_(sh, { id: readableId_('Enquiries', '', takenIds_(sh)), name: name, phone: phone, message: message, date: new Date(), status: 'New' });
  });
  cache.put('enq_' + digits, '1', 600);
  cache.put(hourKey, String(count + 1), 3600);
  notifyEnquiry_(name, phone, message);
  return { received: true };
}

/** International number without "+". 10-digit numbers are treated as Indian (+91). */
function intlPhone_(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  if (d.length === 11 && d[0] === '0') return '91' + d.slice(1);
  return d.length >= 11 && d.length <= 15 ? d : '';
}

function notifyEnquiry_(name, phone, message) {
  const to = notifyEmail_();
  if (!to) return;
  const intl = intlPhone_(phone);
  const lines = ['Name: ' + name, 'Phone: ' + phone];
  if (intl) lines.push('Call: tel:+' + intl, 'WhatsApp: https://wa.me/' + intl);
  lines.push('', 'Message:', message || '(none)', '', 'Manage enquiries in the admin panel.');
  try { MailApp.sendEmail(to, 'New SSV Gym enquiry from ' + name, lines.join('\n')); }
  catch (err) { console.warn('Could not send the enquiry email: ' + err); }
}

/* ==================================== reviews ==================================== */

/** A visitor's review. Published at once, or held for approval when review_approval is ticked. */
function submitReview_(q) {
  if (!q || typeof q !== 'object') throw apiError_('Missing review.', 'BAD_REQUEST');
  if (q.website) return { received: true, status: 'Pending', review: null };   // honeypot: quietly ignore bots
  const general = readKeyValues_('General') || {};
  if (isFalse_(general.review_form)) throw apiError_('Reviews are closed at the moment.', 'CLOSED');
  const name = oneLine_(q.name).slice(0, 60);
  const rating = Math.round(Number(q.rating));
  const review = cleanReviewText_(q.review);
  if (name.length < 2) throw apiError_('Enter your name.', 'VALIDATION');
  if (!(rating >= 1 && rating <= 5)) throw apiError_('Choose a rating from 1 to 5 stars.', 'VALIDATION');
  if (review.length < 5) throw apiError_('Write a few words about your experience.', 'VALIDATION');
  if (LINK_PATTERN.test(name + ' ' + review)) throw apiError_('Please remove links from your review.', 'VALIDATION');

  const cache = CacheService.getScriptCache();
  const hourKey = 'rev_hour_' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  const count = Number(cache.get(hourKey) || 0);
  if (count >= 20) throw apiError_('Too many reviews right now. Please try again later.', 'RATE_LIMITED');

  const pending = isTrue_(general.review_approval);
  const status = pending ? 'Pending' : 'Published';
  const saved = withLock_(() => {
    const sh = sheet_('Reviews');
    const values = sh.getDataRange().getValues(), col = headers_(values).indexOf('review');
    const same = review.toLowerCase().replace(/\s+/g, ' ');
    if (col >= 0 && values.some((r, i) => i > 0 && String(r[col]).toLowerCase().replace(/\s+/g, ' ').trim() === same)) {
      throw apiError_('This review has already been posted.', 'DUPLICATE');
    }
    const row = { id: readableId_('Reviews', name, takenIds_(sh)), name: name, rating: rating, review: review, likes: 0, date: new Date(), source: 'Website', status: status };
    appendRecord_(sh, row);
    return row;
  });
  cache.put(hourKey, String(count + 1), 3600);
  if (!pending) cache.remove(CONTENT_CACHE_KEY);
  notifyReview_(saved, pending);
  return {
    received: true, status: status,
    review: pending ? null : publicReview_({ id: saved.id, name: name, rating: rating, review: review, likes: 0, date: cellOut_(saved.date) })
  };
}

/** Adds (like = true) or removes (like = false) one like. Returns the new count. */
function likeReview_(id, like) {
  id = String(id || '').trim();
  if (!/^[\w-]{1,80}$/.test(id)) throw apiError_('Unknown review.', 'BAD_REQUEST');
  const add = !(like === false || isFalse_(like));
  const cache = CacheService.getScriptCache();
  const slot = 'likes_' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHHmm').slice(0, 11);   // 10-minute window
  const count = Number(cache.get(slot) || 0);
  if (count >= 200) throw apiError_('Too many likes right now. Try again in a few minutes.', 'RATE_LIMITED');
  const likes = withLock_(() => {
    const sh = sheet_('Reviews');
    const values = sh.getDataRange().getValues(), head = headers_(values);
    const idCol = head.indexOf('id'), likesCol = head.indexOf('likes'), statusCol = head.indexOf('status');
    const i = values.findIndex((r, n) => n > 0 && String(r[idCol]).trim() === id);
    if (i < 1 || likesCol < 0 || String(values[i][statusCol]).trim() !== 'Published') throw apiError_('This review is no longer available.', 'NOT_FOUND');
    const next = Math.max(0, (Number(values[i][likesCol]) || 0) + (add ? 1 : -1));
    sh.getRange(i + 1, likesCol + 1).setValue(next);
    return next;
  });
  cache.put(slot, String(count + 1), 900);
  patchCachedReview_(id, likes);
  return { id: id, likes: likes };
}

/** Updates one like count in the cached website content instead of rebuilding it. */
function patchCachedReview_(id, likes) {
  try {
    const cache = CacheService.getScriptCache(), hit = cache.get(CONTENT_CACHE_KEY);
    if (!hit) return;
    const content = JSON.parse(hit);
    const r = (content.reviews || []).find(x => x.id === id);
    if (!r) return;
    r.likes = likes;
    content.reviews.sort(byLikes_);
    cache.put(CONTENT_CACHE_KEY, JSON.stringify(content), CONTENT_CACHE_SECONDS);
  } catch (err) { /* the cache rebuilds itself */ }
}

function notifyReview_(row, pending) {
  const to = notifyEmail_();
  if (!to) return;
  const stars = '★★★★★'.slice(0, row.rating) + '☆☆☆☆☆'.slice(0, 5 - row.rating);
  const lines = [row.name + ' rated SSV Gym ' + row.rating + '/5 ' + stars, '', row.review, '',
    pending ? 'It is waiting for your approval: admin panel > Reviews.' : 'It is live on the website. To hide or delete it: admin panel > Reviews.'];
  try { MailApp.sendEmail(to, 'New review on the SSV Gym website (' + row.rating + '/5)', lines.join('\n')); }
  catch (err) { console.warn('Could not send the review email: ' + err); }
}

/* ================================ authentication ================================ */

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function login_(password) {
  const cache = CacheService.getScriptCache();
  const failures = Number(cache.get('login_failures') || 0);
  if (failures >= MAX_LOGIN_FAILURES) throw apiError_('Too many incorrect attempts. Sign-in is locked for 15 minutes. The owner can unlock it in the Google Sheet: SSV Admin > Unlock admin sign-in.', 'LOCKED');
  const props = PropertiesService.getScriptProperties();
  const hash = props.getProperty('ADMIN_PASSWORD_HASH'), salt = props.getProperty('ADMIN_PASSWORD_SALT');
  if (!hash || !salt) throw apiError_('No admin password is set yet. In the Google Sheet, use SSV Admin > Set admin password.', 'NOT_CONFIGURED');
  if (!password || !safeEqual_(sha256Hex_(salt + String(password)), hash)) {
    cache.put('login_failures', String(failures + 1), LOCK_SECONDS);
    Utilities.sleep(700);
    throw apiError_('Incorrect password.', 'AUTH_FAILED');
  }
  cache.remove('login_failures');
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('sess_' + token, sessionEpoch_(), SESSION_SECONDS);
  return { token: token, expiresIn: SESSION_SECONDS };
}

function requireSession_(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) throw apiError_('Please sign in.', 'AUTH_REQUIRED');
  const cache = CacheService.getScriptCache();
  const epoch = sessionEpoch_();
  if (cache.get('sess_' + token) !== epoch) throw apiError_('Your session has expired. Please sign in again.', 'AUTH_REQUIRED');
  cache.put('sess_' + token, epoch, SESSION_SECONDS);
}

/** Changing SESSION_EPOCH signs out every existing session. */
function sessionEpoch_() { return PropertiesService.getScriptProperties().getProperty('SESSION_EPOCH') || '1'; }

/* ================================== Cloudinary ================================== */

function cloudName_(cfg) {
  cfg = cfg || readKeyValues_('Config') || {};
  const name = String(cfg.CLOUDINARY_CLOUD_NAME || PropertiesService.getScriptProperties().getProperty('CLOUDINARY_CLOUD_NAME') || '').trim();
  return /^YOUR_/i.test(name) ? '' : name;
}

/** Folder path with only letters, digits, spaces, "-" and "_" in each part. */
function cleanFolderPath_(value) {
  return String(value || '').split('/')
    .map(part => part.replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean).join('/');
}

/** "SSV-Gym" unless CLOUDINARY_FOLDER in the Config tab says otherwise. */
function baseFolder_(cfg) { return cleanFolderPath_((cfg || {}).CLOUDINARY_FOLDER) || 'SSV-Gym'; }
function sectionNames_() { return Object.keys(MEDIA_SECTIONS).map(k => MEDIA_SECTIONS[k]); }
function sectionFolders_(base) {
  const out = {};
  Object.keys(MEDIA_SECTIONS).forEach(k => { out[k] = base + '/' + MEDIA_SECTIONS[k]; });
  return out;
}

/** True when a public ID or folder is inside the website's main folder, in any letter case (older uploads used "ssv-gym"). */
function inBase_(path, base) {
  const p = String(path || '').toLowerCase(), b = base.toLowerCase();
  return p === b || p.indexOf(b + '/') === 0;
}

/** The section folder a file belongs to (Home, Facilities…), matched in any letter case; the main folder otherwise. */
function sectionOf_(folder, base) {
  if (!inBase_(folder, base)) return base;
  const first = String(folder).slice(base.length + 1).split('/')[0].toLowerCase();
  const name = sectionNames_().filter(s => s.toLowerCase() === first)[0];
  return name ? base + '/' + name : base;
}

/** Cloudinary settings, or null while the cloud name, API key or secret is missing. */
function cloudinary_(cfg) {
  cfg = cfg || readKeyValues_('Config') || {};
  const p = PropertiesService.getScriptProperties();
  const apiKey = p.getProperty('CLOUDINARY_API_KEY'), secret = p.getProperty('CLOUDINARY_API_SECRET'), cloud = cloudName_(cfg);
  if (!apiKey || !secret || !cloud) return null;
  const base = baseFolder_(cfg);
  return { cloud: cloud, apiKey: apiKey, secret: secret, base: base, roots: unique_([base, base.toLowerCase()]) };
}

function requireCloudinary_(cfg) {
  const c = cloudinary_(cfg);
  if (!c) throw apiError_('Photo uploads are not set up. Put CLOUDINARY_CLOUD_NAME in the Config tab, then use SSV Admin > Set Cloudinary keys in the Google Sheet.', 'NOT_CONFIGURED');
  return c;
}

function cloudinaryConfigured_(cfg) { return Boolean(cloudinary_(cfg)); }

/**
 * Cloudinary Admin API call. The API key and secret never leave Apps Script.
 * A missing Google permission (the script may not reach other websites yet) is
 * reported with the fix instead of a generic server error.
 */
function cloudinaryApi_(cld, method, path, query) {
  const qs = [];
  Object.keys(query || {}).forEach(k => {
    [].concat(query[k]).forEach(v => {
      if (v !== undefined && v !== null && v !== '') qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
  });
  const url = 'https://api.cloudinary.com/v1_1/' + encodeURIComponent(cld.cloud) + '/' + path + (qs.length ? '?' + qs.join('&') : '');
  let res;
  try {
    res = UrlFetchApp.fetch(url, {
      method: method,
      headers: { Authorization: 'Basic ' + Utilities.base64Encode(cld.apiKey + ':' + cld.secret) },
      muteHttpExceptions: true
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/permission|authori[sz]|external_request/i.test(msg)) {
      throw apiError_('Apps Script is not allowed to connect to Cloudinary yet. In the Google Sheet, run SSV Admin > Set Cloudinary keys and allow access when Google asks, then try again.', 'NEEDS_PERMISSION');
    }
    throw apiError_('Could not reach Cloudinary: ' + msg, 'CLOUDINARY_ERROR');
  }
  const status = res.getResponseCode();
  let json = {};
  try { json = JSON.parse(res.getContentText() || '{}'); } catch (err) { json = {}; }
  if (status >= 200 && status < 300) return json;
  const message = (json && json.error && json.error.message) || ('HTTP ' + status);
  throw apiError_('Cloudinary: ' + message, status === 404 ? 'CLOUDINARY_NOT_FOUND' : (status === 401 || status === 403 ? 'CLOUDINARY_AUTH' : 'CLOUDINARY_ERROR'));
}

/**
 * The folder an upload goes into: exactly one of the section folders
 * (<base>/Home, Facilities, Trainers, Gallery or Events). The admin panel
 * can't create any other folder.
 */
function uploadFolder_(requested, base) {
  const path = cleanFolderPath_(requested);
  const allowed = sectionNames_().map(s => base + '/' + s);
  if (allowed.indexOf(path) < 0) throw apiError_('Uploads go into one of the website folders: ' + allowed.join(', ') + '.', 'VALIDATION');
  return path;
}

/** Signs one upload into a section folder: a photo (JPG, PNG, WebP) or, with kind "video", a video (MP4, MOV, WebM). */
function getUploadSignature_(requested, kind) {
  const cld = requireCloudinary_();
  const folder = uploadFolder_(requested || cld.base + '/' + MEDIA_SECTIONS.general, cld.base);
  const video = kind === 'video';
  const params = { allowed_formats: video ? VIDEO_FORMATS : UPLOAD_FORMATS, folder: folder, timestamp: Math.floor(Date.now() / 1000), unique_filename: 'true', use_filename: 'true' };
  const toSign = Object.keys(params).sort().map(k => k + '=' + params[k]).join('&');
  const signature = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, toSign + cld.secret, Utilities.Charset.UTF_8));
  return { cloudName: cld.cloud, apiKey: cld.apiKey, params: params, signature: signature, resourceType: video ? 'video' : 'image' };
}

/**
 * Photos and videos in the website's folders, each filed under its section
 * (Home, Facilities, Trainers, Gallery, Events) and listed with the places in
 * the sheet that use it. Files from earlier versions ("ssv-gym/…") are filed
 * under the same sections.
 */
function mediaLibrary_() {
  const cld = requireCloudinary_();
  const sections = sectionFolders_(cld.base);
  const usedIn = imageUsage_(cld.roots);
  const images = [], seen = {};
  let truncated = false;
  cld.roots.forEach(root => {
    ['image', 'video'].forEach(type => {
      let cursor = null, pages = 0;
      do {
        const res = cloudinaryApi_(cld, 'get', 'resources/' + type + '/upload', { prefix: root + '/', max_results: 500, next_cursor: cursor });
        (res.resources || []).forEach(r => {
          const id = String(r.public_id || '');
          if (seen[type + ':' + id] || !inBase_(id, cld.base)) return;
          seen[type + ':' + id] = true;
          const byAsset = sectionOf_(typeof r.asset_folder === 'string' ? r.asset_folder : '', cld.base);
          const folder = byAsset !== cld.base ? byAsset : sectionOf_(id.slice(0, id.lastIndexOf('/')), cld.base);
          images.push({ id: id, type: type, url: r.secure_url || r.url || '', folder: folder, bytes: r.bytes || 0, width: r.width || 0, height: r.height || 0, duration: r.duration || 0, created: r.created_at || '', usedIn: usedIn(id) });
        });
        cursor = res.next_cursor || null;
      } while (cursor && ++pages < 4);
      if (cursor) truncated = true;
    });
  });
  return { base: cld.base, sections: sections, folders: [cld.base].concat(Object.keys(MEDIA_SECTIONS).map(k => sections[k])), images: images, truncated: truncated };
}

/** Deletes files (links or public IDs) that nothing in the sheet uses. Files in use are kept and reported. */
function deleteImages_(list) {
  const cld = requireCloudinary_();
  if (!Array.isArray(list) || !list.length) throw apiError_('Nothing to delete.', 'BAD_REQUEST');
  const assets = uniqueAssets_(list.slice(0, 500).map(v => assetOf_(v, cld)).filter(Boolean));
  const usedIn = imageUsage_(cld.roots);
  const kept = assets.filter(a => usedIn(a.id).length > 0);
  const gone = assets.filter(a => kept.indexOf(a) < 0);
  deleteAssets_(cld, gone);
  return { deleted: gone.map(a => a.id), kept: kept.map(a => a.id) };
}

/** After a save or delete: removes the files it replaced if nothing else uses them. Never fails the save. */
function removeUnusedImages_(urls) {
  if (!urls || !urls.length) return;
  try {
    const cld = cloudinary_();
    if (!cld) return;
    const assets = uniqueAssets_(urls.map(u => assetOf_(u, cld)).filter(Boolean));
    if (!assets.length) return;
    const usedIn = imageUsage_(cld.roots);
    const unused = assets.filter(a => usedIn(a.id).length === 0);
    if (unused.length) deleteAssets_(cld, unused);
  } catch (err) {
    console.warn('Clean-up skipped: ' + (err && err.message));
  }
}

function uniqueAssets_(list) {
  const seen = {};
  return list.filter(a => { const k = a.type + ':' + a.id; if (seen[k]) return false; seen[k] = true; return true; });
}

function deleteAssets_(cld, assets) {
  ['image', 'video'].forEach(type => {
    const ids = assets.filter(a => a.type === type).map(a => a.id);
    for (let i = 0; i < ids.length; i += 100) {
      cloudinaryApi_(cld, 'delete', 'resources/' + type + '/upload', { 'public_ids[]': ids.slice(i, i + 100), invalidate: 'true' });
    }
  });
}

/** { id, type } of a photo or video in this Cloudinary account inside the website's folder, or null. */
function assetOf_(value, cld) {
  let id = String(value || '').trim(), type = 'image';
  const m = id.match(/^https?:\/\/res\.cloudinary\.com\/([^/]+)\/(image|video)\/upload\/([^?#]+)/i);
  if (m) {
    if (m[1] !== cld.cloud) return null;
    type = m[2].toLowerCase();
    const parts = m[3].split('/');
    const v = parts.findIndex(p => /^v\d+$/.test(p));
    try { id = decodeURIComponent((v >= 0 ? parts.slice(v + 1) : parts).join('/')); } catch (err) { return null; }
    id = id.replace(/\.[a-z0-9]{2,5}$/i, '');
  } else if (/^[a-z][\w+.-]*:/i.test(id)) {
    return null;
  }
  return id.indexOf('..') < 0 && inBase_(id, cld.base) && id.indexOf('/') > 0 ? { id: id, type: type } : null;
}

/**
 * Where each file is used. Returns a lookup: public ID -> labels such as
 * "Trainers: Rahul" or "General information: Top photo". Hidden rows count
 * too, so a file in use is never deleted.
 */
function imageUsage_(roots) {
  const ss = ss_(), entries = [];
  const markers = [];
  roots.forEach(r => { markers.push(r + '/'); markers.push(encodeURI(r) + '/'); });
  const friendly = { hero_image: 'Top photo', about_image: 'About photo' };
  const scan = (tab, labelOf) => {
    const sh = ss.getSheetByName(tab);
    if (!sh) return;
    const values = sh.getDataRange().getValues();
    const head = headers_(values);
    values.slice(1).forEach(row => {
      const text = row.map(v => String(v)).join('\n');
      if (markers.some(m => text.indexOf(m) >= 0)) entries.push({ text: text, label: labelOf(row, head) });
    });
  };
  scan('General', (row, head) => { const key = String(row[Math.max(head.indexOf('key'), 0)]).trim(); return 'General information: ' + (friendly[key] || key); });
  Object.keys(COLLECTIONS).forEach(key => {
    const tab = COLLECTIONS[key];
    if (tab === 'Reviews') return;
    scan(tab, (row, head) => {
      const cell = h => { const i = head.indexOf(h); return i >= 0 ? String(row[i]).trim() : ''; };
      const hidden = head.indexOf('active') >= 0 && !isTrue_(row[head.indexOf('active')]);
      return tab + ': ' + (cell('name') || cell('title') || cell('id') || 'untitled') + (hidden ? ' (hidden)' : '');
    });
  });
  return id => {
    const alt = encodeURI(id);
    return entries.filter(e => e.text.indexOf(id) >= 0 || e.text.indexOf(alt) >= 0).map(e => e.label);
  };
}

/* ============================ sheet menu & setup ============================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('SSV Admin')
    .addItem('Set up / repair sheets', 'setupSheets')
    .addItem('Set admin password', 'setAdminPassword')
    .addItem('Set Cloudinary keys', 'setCloudinaryKeys')
    .addItem('Set Google Places key', 'setGooglePlacesKey')
    .addItem('Update Google rating now', 'updateGoogleNow')
    .addSeparator()
    .addItem('Clear website cache', 'clearWebsiteCache')
    .addItem('Unlock admin sign-in', 'unlockSignIn')
    .addItem('Sign out all admin sessions', 'signOutAllSessions')
    .addToUi();
}

/**
 * Simple trigger. Sheet edits show on the website straight away (after the
 * visitor's short browser cache), and rows typed in by hand get an id and tick boxes.
 */
function onEdit(e) {
  try { CacheService.getScriptCache().remove(CONTENT_CACHE_KEY); } catch (err) { /* ignore */ }
  try {
    const range = e && e.range;
    if (!range) return;
    const sh = range.getSheet(), name = sh.getName();
    if (!ID_PREFIX[name] || range.getNumRows() > 500) return;
    repairTab_(sh, name, range.getRow(), range.getLastRow());
  } catch (err) { /* a simple trigger must never interrupt editing */ }
}

/**
 * Creates, repairs and styles every tab. Safe to run any time: creates missing
 * tabs and columns, deletes columns no longer used, puts the General tab in
 * order, keeps the key list in the Config tab up to date, and runs one-time
 * upgrades. Values you changed are kept.
 */
function setupSheets() {
  const ss = ss_();
  const scriptTz = Session.getScriptTimeZone();
  if (scriptTz && ss.getSpreadsheetTimeZone() !== scriptTz) ss.setSpreadsheetTimeZone(scriptTz);
  TZ_ = null;
  const props = PropertiesService.getScriptProperties();
  const level = ss.getSheetByName('General') ? (props.getProperty('SEED_VERSION') || '1.5.0') : SEED_LEVEL;
  const seeds = seedRows_();
  let repaired = 0;
  Object.keys(SCHEMA).forEach(name => {
    const cols = SCHEMA[name];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols.map(c => LABELS[c] || c)]);
      sh.setFrozenRows(1);
      writeRows_(sh, cols, seeds[name] || []);
    } else {
      if (DROPPED_COLUMNS[name]) dropColumns_(sh, DROPPED_COLUMNS[name]);
      if (name === 'General') ensureFirstColumn_(sh, 'category');
      relabelHeaders_(sh, cols);
      if (ID_PREFIX[name]) repaired += withLock_(() => repairTab_(sh, name));
    }
  });
  if (olderThan_(level, '1.6.0')) upgradeTo160_(ss, seeds);
  if (olderThan_(level, '1.6.2')) upgradeTo162_(ss);
  props.setProperty('SEED_VERSION', SEED_LEVEL);
  withLock_(() => arrangeGeneral_(ss.getSheetByName('General')));
  refreshSecretRows_();
  fillNotes_(ss.getSheetByName('Config'), configNoteFor_);
  BOOLEAN_KEYS.forEach(k => makeCheckbox_(ss.getSheetByName('General'), k));
  statusDropdown_(ss.getSheetByName('Enquiries'), ENQUIRY_STATUSES);
  statusDropdown_(ss.getSheetByName('Reviews'), REVIEW_STATUSES);
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  Object.keys(SCHEMA).forEach(name => { const sh = ss.getSheetByName(name); if (sh) styleTab_(sh); });
  styleGeneral_(ss.getSheetByName('General'));
  orderTabs_(ss);
  CacheService.getScriptCache().remove(CONTENT_CACHE_KEY);
  clearGoogleCache_();
  try { removeSecretRows_(SpreadsheetApp.getUi()); } catch (err) { /* run from the editor: no dialogs */ }
  toast_('Sheets are ready' + (repaired ? ' (' + repaired + ' rows got an ID)' : '') + '. Keys still to set show "Not set" in the Config tab.');
}

function olderThan_(a, b) {
  const x = String(a).split('.').map(n => parseInt(n, 10) || 0), y = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
}

/**
 * One-time step (1.6): the changing room and the gaming area join Facilities
 * ("Also at SSV"), texts listing the areas mention pool and carrom (only where
 * they still read as before), and the Config tab gets GOOGLE_PLACE_ID.
 */
function upgradeTo160_(ss, seeds) {
  const fac = ss.getSheetByName('Facilities');
  if (fac) {
    const rows = readTable_('Facilities') || [];
    const names = rows.map(r => String(r.name).trim().toLowerCase());
    let order = rows.reduce((m, r) => Math.max(m, Number(r.display_order) || 0), 0);
    seeds.Facilities
      .filter(r => ['fac-changing-room', 'fac-gaming-area'].indexOf(r.id) >= 0 && names.indexOf(r.name.toLowerCase()) < 0)
      .forEach(r => appendRecord_(fac, Object.assign({}, r, { display_order: ++order })));
  }
  const fresh = generalDefaults_();
  const before = {
    facility_strip: 'Main Gym | CrossFit | Cardio | Steam Room',
    facilities_intro: 'A full gym floor, a CrossFit and functional training zone, cardio equipment and a steam room for recovery.'
  };
  updateKeyValues_(ss.getSheetByName('General'), (key, value) => (key in before && sameText_(value, before[key]) ? fresh[key] : undefined));
  appendMissingKeys_(ss.getSheetByName('Config'), seeds.Config.filter(r => r[0] === 'GOOGLE_PLACE_ID'));
}

/** One-time step (1.6.2): the summary for Google search becomes short enough to show in full (only if it still reads as before). */
function upgradeTo162_(ss) {
  const old = [
    'SSV Gym (Shree Siddhi Vinayak Gym) in Virar West: gym floor, CrossFit and functional training, cardio, personal training, diet plans, weight loss and weight gain programmes, and a steam room.',
    'SSV Gym (Shree Siddhi Vinayak Gym) in Virar West: gym floor, CrossFit and functional training, cardio, personal training, diet plans, weight loss and weight gain programmes, a steam room, and pool and carrom.'
  ];
  updateKeyValues_(ss.getSheetByName('General'), (key, value) => (key === 'description' && old.some(o => sameText_(value, o)) ? DESCRIPTION_DEFAULT : undefined));
}

/** Adds a column at the start of the tab (the General tab's Category) when it is missing. */
function ensureFirstColumn_(sh, col) {
  if (headerRow_(sh).indexOf(col) >= 0) return;
  sh.insertColumnBefore(1);
  styleHeader_(sh.getRange(1, 1).setValue(LABELS[col] || col));
}

/**
 * Puts the General tab in website order: Category | Key | Value, the category on
 * the first row of each group. Every value stays exactly as it is; keys the layout
 * doesn't know go last, under "Other"; rows without a key but with content stay too.
 */
function arrangeGeneral_(sh) {
  if (!sh || sh.getLastRow() < 2) return;
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const c = head.indexOf('category'), k = head.indexOf('key'), v = head.indexOf('value');
  if (c < 0 || k < 0 || v < 0) return;
  const byKey = {}, extra = [], loose = [];
  values.slice(1).forEach(r => {
    const key = String(r[k]).trim();
    if (!key) { if (r.some(cell => !isBlank_(cell))) loose.push(r.slice()); return; }
    if (byKey[key]) return;   // a repeated key: the first row counts, as everywhere else
    byKey[key] = r;
    if (!GENERAL_CATEGORY[key]) extra.push(key);
  });
  const out = [];
  const add = (cat, keys) => keys.filter(key => byKey[key]).forEach((key, i) => {
    const row = byKey[key].slice();
    row[c] = i === 0 ? cat : '';
    out.push(row);
  });
  GENERAL_LAYOUT.forEach(group => add(group[0], group[1]));
  add('Other', extra);
  loose.forEach(r => out.push(r));
  const sig = rows => rows.map(r => String(r[c]).trim() + '|' + String(r[k]).trim()).join('\n');
  if (sig(values.slice(1)) === sig(out)) return;   // already in order
  const old = sh.getRange(2, 1, values.length - 1, head.length);
  old.clearDataValidations();
  old.clearContent();
  sh.getRange(2, 1, out.length, head.length).setValues(out.map(r => r.map(cellIn_)));
  out.forEach((r, i) => {   // tick boxes follow their rows
    if (BOOLEAN_KEYS.indexOf(String(r[k]).trim()) < 0) return;
    const cell = sh.getRange(i + 2, v + 1), on = isTrue_(r[v]);
    cell.insertCheckboxes();
    if (on) cell.setValue(true);
  });
}

/** General tab: category names in bold, a line above each group. */
function styleGeneral_(sh) {
  if (!sh || sh.getLastRow() < 2) return;
  const c = headerRow_(sh).indexOf('category');
  if (c < 0) return;
  sh.setColumnWidth(c + 1, 150);
  sh.getRange(2, c + 1, sh.getMaxRows() - 1, 1).setHorizontalAlignment('left').setFontWeight('bold');
  const cats = sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues();
  const width = sh.getLastColumn();
  cats.forEach((r, i) => {
    if (i > 0 && String(r[0]).trim()) sh.getRange(i + 2, 1, 1, width).setBorder(true, null, null, null, null, null, '#C9CFCB', SpreadsheetApp.BorderStyle.SOLID);
  });
}

/** Deletes columns this version no longer uses. */
function dropColumns_(sh, cols) {
  const head = headerRow_(sh);
  for (let i = head.length - 1; i >= 0; i--) {
    if (cols.indexOf(head[i]) >= 0 && sh.getLastColumn() > 1) sh.deleteColumn(i + 1);
  }
}

/** Header cells: bold, size 10, centred, green text on the dark brand colour. */
function styleHeader_(range) {
  return range.setFontWeight('bold').setFontSize(10).setFontColor('#8FE05A').setBackground('#151917')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
    .setBorder(false, false, false, false, false, false);
}

/**
 * A tidy, plain look for a whole tab: styled header row, plain rows in size 10,
 * every cell clipped to one line, sensible column widths, short values centred.
 */
function styleTab_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return;
  if (sh.getMaxRows() < 2) sh.insertRowsAfter(1, 50);
  const rows = sh.getMaxRows() - 1;
  const head = headerRow_(sh);
  styleHeader_(sh.getRange(1, 1, 1, lastCol));
  sh.setRowHeight(1, 26);
  if (sh.getFrozenRows() !== 1) sh.setFrozenRows(1);
  sh.getBandings().forEach(b => b.remove());   // plain rows: no alternating colours
  sh.getRange(2, 1, rows, lastCol).setFontSize(10).setFontWeight('normal').setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setBorder(false, false, false, false, false, false);
  head.forEach((key, i) => {
    const style = COLUMN_STYLE[key];
    if (!style) return;
    sh.setColumnWidth(i + 1, style[0]);
    sh.getRange(2, i + 1, rows, 1).setHorizontalAlignment(style[1]);
  });
  const name = sh.getName();
  sh.setTabColor(name === 'Config' ? '#7E8580' : (name === 'Reviews' || name === 'Enquiries' ? '#E9C46A' : '#6DBE45'));
}

/** Writes rows (arrays in column order, or objects keyed by column) under the header of an empty tab. */
function writeRows_(sh, cols, rows) {
  if (!rows.length) return;
  const matrix = rows.map(r => (Array.isArray(r)
    ? cols.map((c, i) => (r[i] === undefined ? '' : r[i]))
    : cols.map(c => (c in r ? r[c] : (BOOLEAN_COLUMNS.indexOf(c) >= 0 ? false : '')))));
  BOOLEAN_COLUMNS.forEach(c => { const i = cols.indexOf(c); if (i >= 0) sh.getRange(2, i + 1, matrix.length, 1).insertCheckboxes(); });
  sh.getRange(2, 1, matrix.length, cols.length).setValues(matrix.map(r => r.map(v => cellIn_(v))));
}

/** Gives known columns their proper titles and adds missing ones. Your own extra columns stay. */
function relabelHeaders_(sh, cols) {
  const raw = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  const have = raw.map(normHeader_);
  raw.forEach((h, i) => {
    const key = have[i];
    if (cols.indexOf(key) >= 0 && LABELS[key] && String(h) !== LABELS[key]) sh.getRange(1, i + 1).setValue(LABELS[key]);
  });
  cols.filter(c => have.indexOf(c) < 0).forEach(c => sh.getRange(1, sh.getLastColumn() + 1).setValue(LABELS[c] || c));
  if (!sh.getFrozenRows()) sh.setFrozenRows(1);
}

/** fn(key, value) for each key/value row: a returned value replaces the cell, null deletes the row, undefined leaves it. */
function updateKeyValues_(sh, fn) {
  if (!sh) return;
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const k = Math.max(head.indexOf('key'), 0), v = head.indexOf('value') >= 0 ? head.indexOf('value') : 1;
  const deletions = [];
  values.forEach((row, i) => {
    const key = String(row[k]).trim();
    if (i === 0 || !key) return;
    const next = fn(key, row[v]);
    if (next === null) deletions.push(i + 1);
    else if (next !== undefined && !sameText_(row[v], next)) sh.getRange(i + 1, v + 1).setValue(cellIn_(next));
  });
  deletions.sort((a, b) => b - a).forEach(r => deleteRowSafe_(sh, r));
}

/** Adds [key, value, note] rows whose key is missing. */
function appendMissingKeys_(sh, rows) {
  if (!sh || !rows || !rows.length) return;
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const k = Math.max(head.indexOf('key'), 0), v = head.indexOf('value') >= 0 ? head.indexOf('value') : 1, n = head.indexOf('notes');
  const have = {};
  values.slice(1).forEach(r => { have[String(r[k]).trim()] = true; });
  let row = sh.getLastRow() + 1;
  rows.filter(r => !have[r[0]]).forEach(r => {
    ensureRow_(sh, row, false);
    sh.getRange(row, k + 1).setValue(r[0]);
    const cell = sh.getRange(row, v + 1);
    if (BOOLEAN_KEYS.indexOf(r[0]) >= 0) cell.insertCheckboxes();
    cell.setValue(cellIn_(r[1]));
    if (n >= 0 && r[2]) sh.getRange(row, n + 1).setValue(r[2]);
    row++;
  });
}

/** Keeps the Notes of known keys up to date (shown in grey). Notes of your own keys stay. */
function fillNotes_(sh, noteFn) {
  if (!sh || sh.getLastRow() < 2) return;
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const k = Math.max(head.indexOf('key'), 0), n = head.indexOf('notes');
  if (n < 0) return;
  const notes = values.slice(1).map(r => [noteFn(String(r[k]).trim()) || r[n]]);
  sh.getRange(2, n + 1, notes.length, 1).setValues(notes).setFontColor('#6B7280').setFontStyle('normal');
}

/** Turns the value cell of a key/value row into a tick box, keeping its current value. */
function makeCheckbox_(sh, key) {
  if (!sh) return;
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const k = Math.max(head.indexOf('key'), 0), v = head.indexOf('value') >= 0 ? head.indexOf('value') : 1;
  const i = values.findIndex((r, n) => n > 0 && String(r[k]).trim() === key);
  if (i < 1) return;
  const cell = sh.getRange(i + 1, v + 1);
  if (isCheckbox_(cell.getDataValidation())) return;
  const on = isTrue_(values[i][v]);
  cell.insertCheckboxes();
  if (on) cell.setValue(true);
}

/**
 * A dropdown on every Status cell. Dropdowns already there are left alone, so a style
 * chosen in the sheet (Data > Data validation > Display style: Chip) is kept, and cells
 * without one get a copy of it. Scripts can't choose that style themselves.
 */
function statusDropdown_(sh, list) {
  if (!sh || sh.getMaxRows() < 2) return;
  const col = headerRow_(sh).indexOf('status') + 1;
  if (col < 1) return;
  const range = sh.getRange(2, col, sh.getMaxRows() - 1, 1);
  const rules = range.getDataValidations();
  const first = rules.findIndex(r => Boolean(r[0]));
  if (first < 0) {
    range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build());
    return;
  }
  const source = sh.getRange(first + 2, col);
  let start = -1;
  for (let i = 0; i <= rules.length; i++) {
    const missing = i < rules.length && !rules[i][0];
    if (missing && start < 0) start = i;
    if (!missing && start >= 0) {
      source.copyTo(sh.getRange(start + 2, col, i - start, 1), SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      start = -1;
    }
  }
}

/** Puts the tabs in the same order as the admin panel. */
function orderTabs_(ss) {
  Object.keys(SCHEMA).forEach((name, i) => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getIndex() === i + 1) return;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  });
  const first = ss.getSheetByName('General');
  if (first) ss.setActiveSheet(first);
}

/** Offers to delete other rows in the Config and General tabs that look like passwords or API secrets. */
function removeSecretRows_(ui) {
  const found = [];
  ['Config', 'General'].forEach(name => {
    const sh = ss_().getSheetByName(name);
    if (!sh) return;
    const values = sh.getDataRange().getValues();
    const k = Math.max(headers_(values).indexOf('key'), 0);
    values.forEach((r, i) => {
      const key = String(r[k]).trim();
      if (i > 0 && key && !(name === 'Config' && SECRETS[key]) && SECRET_KEY_PATTERN.test(key)) found.push({ sh: sh, row: i + 1, label: name + ' tab: ' + key });
    });
  });
  if (!found.length) return 0;
  const answer = ui.alert('Secrets found in the sheet',
    'These rows look like passwords or API secrets:\n\n' + found.map(f => '• ' + f.label).join('\n') +
    '\n\nThe website never reads them from the sheet, and anyone who can open the sheet can see them. ' +
    'Set the admin password and keys from this SSV Admin menu instead.\n\nDelete these rows now?', ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return 0;
  found.sort((a, b) => b.row - a.row).forEach(f => deleteRowSafe_(f.sh, f.row));
  return found.length;
}

function setAdminPassword() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Set admin password', 'Choose a password for admin.html (at least 10 characters). Anyone with this password can edit the website.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const password = res.getResponseText();
  if (password.length < 10) { ui.alert('Use at least 10 characters. The password was not changed.'); return; }
  savePassword_(password);
  refreshSecretRows_();
  ui.alert('Admin password saved. Anyone signed in to the admin panel has been signed out.');
}

/** Saves the Cloudinary API key and secret in Script Properties after testing them. Running it also gives Google's permission to reach Cloudinary. */
function setCloudinaryKeys() {
  const ui = SpreadsheetApp.getUi();
  const cfg = readKeyValues_('Config') || {};
  const cloud = cloudName_(cfg);
  if (!cloud) { ui.alert('Put your Cloudinary cloud name in the Config tab first (CLOUDINARY_CLOUD_NAME), then run this again.'); return; }
  const k = ui.prompt('Cloudinary API key', 'Paste the API key from Cloudinary (Settings > API Keys).', ui.ButtonSet.OK_CANCEL);
  if (k.getSelectedButton() !== ui.Button.OK) return;
  const s = ui.prompt('Cloudinary API secret', 'Paste the API secret for that key. It is saved in Script Properties, never in the sheet.', ui.ButtonSet.OK_CANCEL);
  if (s.getSelectedButton() !== ui.Button.OK) return;
  const apiKey = k.getResponseText().trim(), secret = s.getResponseText().trim();
  if (!/^[A-Za-z0-9]{6,}$/.test(apiKey) || !/^[A-Za-z0-9_-]{10,}$/.test(secret)) { ui.alert('That doesn\'t look like a Cloudinary API key and secret. Nothing was changed.'); return; }
  try { cloudinaryApi_({ cloud: cloud, apiKey: apiKey, secret: secret }, 'get', 'ping'); }
  catch (err) {
    const again = ui.alert('Cloudinary did not accept these keys', err.message + '\n\nCheck the cloud name in the Config tab, the key and the secret. Save them anyway?', ui.ButtonSet.YES_NO);
    if (again !== ui.Button.YES) return;
  }
  PropertiesService.getScriptProperties().setProperties({ CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: secret });
  refreshSecretRows_();
  ui.alert('Cloudinary keys saved. Uploads and the media library in the admin panel are ready.');
  removeSecretRows_(ui);
}

/** Saves the Google Places API key in Script Properties after testing it on the gym's Place ID. */
function setGooglePlacesKey() {
  const ui = SpreadsheetApp.getUi();
  const placeId = googlePlaceId_();
  if (!placeId) { ui.alert('Put the gym\'s Google Place ID next to GOOGLE_PLACE_ID in the Config tab first, then run this again.'); return; }
  const res = ui.prompt('Google Places API key', 'Paste the API key from Google Cloud (APIs & Services > Credentials). Places API (New) must be enabled for its project. It is saved in Script Properties, never in the sheet.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const key = res.getResponseText().trim();
  if (!/^[\w-]{30,}$/.test(key)) { ui.alert('That doesn\'t look like a Google API key. Nothing was changed.'); return; }
  let info = null;
  try { info = fetchGooglePlace_(placeId, key); }
  catch (err) {
    const again = ui.alert('Google did not accept this key', err.message + '\n\nSave it anyway?', ui.ButtonSet.YES_NO);
    if (again !== ui.Button.YES) return;
  }
  PropertiesService.getScriptProperties().setProperty('GOOGLE_PLACES_API_KEY', key);
  clearGoogleCache_();
  CacheService.getScriptCache().remove(CONTENT_CACHE_KEY);
  refreshSecretRows_();
  ui.alert(info
    ? 'Google Places key saved. ' + (info.name || 'The gym') + ': ' + info.rating + ' from ' + info.count + ' Google reviews, ' + info.reviews.length + ' reviews with text.'
    : 'Google Places key saved.');
}

/** Asks Google for the rating, the number of reviews and the latest reviews straight away (it also happens by itself every 6 hours). */
function updateGoogleNow() {
  const ui = SpreadsheetApp.getUi();
  if (!googlePlaceId_()) { ui.alert('Put the gym\'s Google Place ID next to GOOGLE_PLACE_ID in the Config tab first.'); return; }
  if (!PropertiesService.getScriptProperties().getProperty('GOOGLE_PLACES_API_KEY')) { ui.alert('Set the Google Places key first: SSV Admin > Set Google Places key.'); return; }
  clearGoogleCache_();
  CacheService.getScriptCache().remove(CONTENT_CACHE_KEY);
  const g = googleStatus_();
  ui.alert(g.error
    ? 'Google says: ' + g.error
    : 'Updated: ' + g.rating + ' from ' + g.count + ' Google reviews' + (g.reviews ? ', with ' + g.reviews + ' recent reviews' : '') + '. The website shows it now; it also updates by itself every 6 hours.');
}

function clearWebsiteCache() {
  CacheService.getScriptCache().remove(CONTENT_CACHE_KEY);
  clearGoogleCache_();
  toast_('Website cache cleared. Google is asked again on the next visit.');
}

function unlockSignIn() {
  CacheService.getScriptCache().remove('login_failures');
  toast_('Admin sign-in unlocked.');
}

function signOutAllSessions() {
  PropertiesService.getScriptProperties().setProperty('SESSION_EPOCH', String(Date.now()));
  toast_('All admin sessions have been signed out.');
}

function toast_(message) { try { ss_().toast(message, 'SSV Admin', 8); } catch (err) { console.log(message); } }

/* ================================ starting content ================================
   Written by setupSheets() into empty tabs of a new sheet. Contact details,
   hours, facilities, plans, services and links are the gym's own; the hero,
   About and facility photos are stand-ins until photos of SSV are uploaded. */

function stockPhoto_(id) { return 'https://images.unsplash.com/' + id; }

/** The General tab's starting values, by key. */
function generalDefaults_() {
  return {
    gym_name: 'SSV Gym',
    full_name: 'Shree Siddhi Vinayak Gym',
    tagline: 'Train strong. Live strong.',
    description: DESCRIPTION_DEFAULT,
    hero_heading: 'Train strong. | Live strong.',
    hero_subtitle: 'Strength, CrossFit and cardio under one roof in Virar West, with personal training and a steam room for recovery.',
    hero_image: stockPhoto_('photo-1623874514711-0f321325f318'),
    facility_strip: 'Main Gym | CrossFit | Cardio | Steam Room | Pool & Carrom',
    stat_1_value: '5+', stat_1_label: 'Years in Virar',
    stat_2_value: '40+', stat_2_label: 'Machines and stations',
    stat_3_value: '3', stat_3_label: 'Expert trainers',
    stat_4_value: '7', stat_4_label: 'Days a week',
    about_heading: 'Shree Siddhi Vinayak Gym',
    about_text: 'SSV Gym is a Virar West gym for strength training, CrossFit, cardio and functional fitness, whether you are just starting out or training for a goal. | Train with a personal trainer, follow a weight loss or weight gain programme, and recover in the steam room after your session.',
    about_image: stockPhoto_('photo-1534438327276-14e5300c3a48'),
    about_highlights: 'Personal training | Weight loss and weight gain programmes | CrossFit and functional training | Complimentary lockers',
    facilities_intro: 'A full gym floor, a CrossFit and functional training zone, cardio equipment, a steam room for recovery, and pool and carrom to unwind.',
    featured_badge_text: 'Best value',
    services_heading: 'Personal training and diet plans',
    gallery_categories: 'Gym | CrossFit | Training | Equipment | Events',
    review_form: true,
    review_approval: false,
    phone: '+91 77588 78588',
    phone_2: '+91 75586 08585',
    whatsapp: '+91 75586 08585',
    address: 'Shree Siddhi Manora Commercial Complex | Datt Mandir Road, above IDBI Bank | Doghar Pada, Sheetal Nagar, Virar West | Vasai-Virar, Maharashtra 401303',
    opening_hours: 'Monday – Saturday: 6:00 AM – 11:00 PM | Sunday: 4:00 PM – 9:00 PM',
    maps_url: 'https://maps.app.goo.gl/EX4aAEYxKCztUjqv6',
    maps_embed_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3762.0924582644457!2d72.80667559999999!3d19.451580099999997!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3be7a93bdce7be0f%3A0x649a18d15a19e63a!2sSSV%20Gym!5e0!3m2!1sen!2sin!4v1790316802069!5m2!1sen!2sin',
    instagram_url: 'https://www.instagram.com/ssvgym2021/',
    facebook_url: 'https://www.facebook.com/p/SSV-GYM-100069942823280/'
  };
}

/** [category, key, value] rows in the General tab's order, the category on the first row of each group. */
function generalRows_(values) {
  const out = [];
  GENERAL_LAYOUT.forEach(group => group[1].filter(key => key in values).forEach((key, i) => out.push([i === 0 ? group[0] : '', key, values[key]])));
  return out;
}

function seedRows_() {
  const features = 'Full gym access | Cardio equipment | Complimentary locker';
  return {
    General: generalRows_(generalDefaults_()),
    Facilities: [
      { id: 'fac-main', name: 'Main Gym', tags: 'Strength | Bodybuilding | Machines', description: 'The main floor for strength training, bodybuilding and machine work.', image_url: stockPhoto_('photo-1637430308606-86576d8fef3c'), category: 'major', active: true, display_order: 1 },
      { id: 'fac-crossfit', name: 'CrossFit', tags: 'Functional Training | Conditioning', description: 'A dedicated zone for CrossFit, functional movements and conditioning circuits.', image_url: stockPhoto_('photo-1536922246289-88c42f957773'), category: 'major', active: true, display_order: 2 },
      { id: 'fac-steam', name: 'Steam Room', tags: 'Recovery | Relaxation', description: 'Unwind and recover in the steam room after your workout.', image_url: stockPhoto_('photo-1759216852954-88e547b8e01f'), category: 'major', active: true, display_order: 3 },
      { id: 'fac-cardio', name: 'Cardio', tags: '', description: 'Cardio equipment for warm-ups, endurance and fat loss.', image_url: '', category: 'additional', active: true, display_order: 4 },
      { id: 'fac-personal-training', name: 'Personal Training', tags: '', description: 'One-to-one coaching built around your goal.', image_url: '', category: 'additional', active: true, display_order: 5 },
      { id: 'fac-weight-loss', name: 'Weight Loss Programme', tags: '', description: 'Training and guidance to lose fat.', image_url: '', category: 'additional', active: true, display_order: 6 },
      { id: 'fac-weight-gain', name: 'Weight Gain Programme', tags: '', description: 'Training and guidance to build muscle and gain healthy weight.', image_url: '', category: 'additional', active: true, display_order: 7 },
      { id: 'fac-changing-room', name: 'Changing Room', tags: '', description: 'A clean changing room to get ready before and after your workout.', image_url: '', category: 'additional', active: true, display_order: 8 },
      { id: 'fac-lockers', name: 'Complimentary Lockers', tags: '', description: 'Keep your things safe while you train.', image_url: '', category: 'additional', active: true, display_order: 9 },
      { id: 'fac-gaming-area', name: 'Gaming Area', tags: 'Pool | Carrom', description: 'A pool table and carrom boards to unwind with friends after training.', image_url: '', category: 'additional', active: true, display_order: 10 }
    ],
    'Membership Plans': [
      { id: 'plan-monthly', name: 'Monthly', duration: '1 Month', price: 1200, description: 'Month-to-month membership.', features: features, featured: false, active: true, display_order: 1 },
      { id: 'plan-quarterly', name: 'Quarterly', duration: '3 Months', price: 3000, description: 'Three months to build a steady routine.', features: features, featured: false, active: true, display_order: 2 },
      { id: 'plan-half-yearly', name: 'Half Yearly', duration: '6 Months', price: 5500, description: 'Six months of consistent training.', features: features, featured: false, active: true, display_order: 3 },
      { id: 'plan-yearly', name: 'Yearly', duration: '12 Months', price: 9000, description: 'A full year of training.', features: features + ' | Diet guidance', featured: true, active: true, display_order: 4 }
    ],
    Services: [
      { id: 'svc-personal-training', name: 'Personal Training', price: 5000, price_note: 'Starting price', description: 'One-on-one personal training sessions built around your goal.', active: true, display_order: 1 },
      { id: 'svc-diet-plan', name: 'Diet Plan', price: 1250, price_note: 'Per session', description: 'A personalised diet plan to support your training.', active: true, display_order: 2 }
    ],
    Trainers: [],
    Gallery: [],
    Reviews: [],
    Announcements: [],
    Enquiries: [],
    Config: [
      ['APPS_SCRIPT_URL', ''],
      ['CLOUDINARY_CLOUD_NAME', ''],
      ['CLOUDINARY_FOLDER', 'SSV-Gym'],
      ['GOOGLE_PLACE_ID', PLACE_ID_DEFAULT],
      ['NOTIFY_EMAIL', NOTIFY_DEFAULT]
    ].map(r => [r[0], r[1], configNoteFor_(r[0])])
  };
}

function configNoteFor_(key) {
  return {
    APPS_SCRIPT_URL: 'For reference: the website\'s backend link (the same one is in js/config.js).',
    CLOUDINARY_CLOUD_NAME: 'Cloudinary cloud name. The API key and secret are kept in Script Properties (rows below).',
    CLOUDINARY_FOLDER: 'Main Cloudinary folder for website photos and videos.',
    GOOGLE_PLACE_ID: 'The gym\'s Google Place ID, for the Google rating, Google reviews and review links on the website.',
    NOTIFY_EMAIL: 'Who gets an email for each new enquiry and review. Separate several addresses with commas. This does not give access to the admin panel.',
    ADMIN_PASSWORD: 'Password for admin.html, kept only as a salted hash (ADMIN_PASSWORD_HASH, ADMIN_PASSWORD_SALT). Change it: SSV Admin > Set admin password.',
    CLOUDINARY_API_KEY: 'Cloudinary API key, for photo and video uploads. Change it: SSV Admin > Set Cloudinary keys.',
    CLOUDINARY_API_SECRET: 'Cloudinary API secret. Change it: SSV Admin > Set Cloudinary keys.',
    GOOGLE_PLACES_API_KEY: 'Google Places API key, for the Google rating and reviews. Change it: SSV Admin > Set Google Places key.'
  }[key] || '';
}
