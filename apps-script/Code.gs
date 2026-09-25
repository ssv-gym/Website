/**
 * ===========================================================================
 *  SSV GYM — Google Apps Script backend (Google Sheets CMS API)       v1.5.0
 * ===========================================================================
 *  First time
 *    1. Open the "SSV Gym CMS" spreadsheet > Extensions > Apps Script.
 *    2. Paste this file (the default appsscript.json needs no changes), save,
 *       and reload the sheet.
 *    3. Sheet menu: SSV Admin > Set up / repair sheets, Set admin password,
 *       then Set Cloudinary keys.
 *    4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *    5. Paste the /exec URL into js/config.js > API_URL.
 *  Updating
 *    Paste, save, reload the sheet, run SSV Admin > Set up / repair sheets,
 *    then Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy.
 *
 *  SECRETS live in Script Properties and are set from the sheet menu. Never
 *  type passwords or API secrets into the sheet or the website:
 *    ADMIN_PASSWORD_HASH / ADMIN_PASSWORD_SALT   SSV Admin > Set admin password
 *    CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET   SSV Admin > Set Cloudinary keys
 *    SHEET_ID       (optional)  only if this script is NOT bound to the sheet
 *  Email alerts go to NOTIFY_EMAIL in the Config tab (several addresses
 *  separated by commas). They only receive alerts; editing needs the password.
 * ===========================================================================
 */

const VERSION = '1.5.0';
const SEED_LEVEL = '1.5.0';            // level of the starting content (see setupSheets)
const NOTIFY_DEFAULT = 'ssvgym2021@gmail.com, laxman19.sawant@gmail.com';
const SESSION_SECONDS = 6 * 60 * 60;   // admin session, extended on each use (CacheService maximum)
const CONTENT_CACHE_SECONDS = 300;     // public content cache
const CONTENT_CACHE_KEY = 'public_content_v2';
const MAX_LOGIN_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;
const UPLOAD_FORMATS = 'jpg,png,webp'; // photos: Cloudinary refuses any other file type
const VIDEO_FORMATS = 'mp4,mov,webm';  // videos (gallery)
const MAX_FOLDER_DEPTH = 4;            // folders listed: a section folder plus up to 3 levels made in Cloudinary
const FOLDER_CACHE_SECONDS = 600;      // folder list cache for the admin panel
const MAX_PUBLIC_REVIEWS = 300;
const REVIEW_MAX_CHARS = 800;
/** Config/General keys that look like this are secrets, which don't belong in the sheet. */
const SECRET_KEY_PATTERN = /pass|secret|api.?key|token/i;
/** Links in reviews are almost always spam. */
const LINK_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|info|biz|xyz|ru|top|shop|site|online|click|link)\b)/i;

/** Uploads are filed as <CLOUDINARY_FOLDER>/<section>, e.g. SSV-Gym/Trainers. */
const MEDIA_SECTIONS = { general: 'Home', facilities: 'Facilities', trainers: 'Trainers', gallery: 'Gallery', announcements: 'Events' };
/** Main folders used by earlier versions. Their photos still show in the media library. */
const LEGACY_FOLDERS = ['ssv-gym'];

/** Sheet tab -> columns (internal names). Headers are matched by name, so columns may be reordered. */
const SCHEMA = {
  General:            ['key', 'value', 'notes'],
  Facilities:         ['id', 'name', 'tags', 'description', 'image_url', 'category', 'active', 'display_order'],
  'Membership Plans': ['id', 'name', 'duration', 'price', 'description', 'features', 'featured', 'active', 'display_order'],
  Services:           ['id', 'name', 'price', 'price_note', 'description', 'active', 'display_order'],
  Trainers:           ['id', 'name', 'role', 'specialization', 'bio', 'image_url', 'active', 'display_order'],
  Gallery:            ['id', 'image_url', 'title', 'category', 'caption', 'active', 'display_order'],
  Reviews:            ['id', 'name', 'rating', 'review', 'likes', 'date', 'source', 'status'],
  Announcements:      ['id', 'title', 'description', 'image_url', 'date', 'expiry', 'active', 'priority'],
  Enquiries:          ['id', 'name', 'phone', 'message', 'date', 'status'],
  Config:             ['key', 'value', 'notes']
};
/** How each column is titled in the sheet. */
const LABELS = {
  id: 'ID', key: 'Key', value: 'Value', notes: 'Notes', name: 'Name', tags: 'Tags', description: 'Description',
  image_url: 'Image URL', category: 'Category', active: 'Active', display_order: 'Display Order', duration: 'Duration',
  price: 'Price', price_note: 'Price Note', features: 'Features', featured: 'Featured', role: 'Role', specialization: 'Specialization',
  bio: 'Bio', title: 'Title', caption: 'Caption', rating: 'Rating', review: 'Review', likes: 'Likes', date: 'Date', source: 'Source',
  status: 'Status', expiry: 'Expiry', priority: 'Priority', phone: 'Phone', message: 'Message'
};
/** Column width in pixels and alignment. All text is clipped to one line; click a cell to read it all. */
const COLUMN_STYLE = {
  id: [170, 'left'], key: [190, 'left'], value: [420, 'left'], notes: [380, 'left'],
  name: [190, 'left'], title: [230, 'left'], tags: [220, 'left'], description: [340, 'left'],
  image_url: [240, 'left'], category: [110, 'center'], active: [80, 'center'], featured: [90, 'center'],
  display_order: [120, 'center'], duration: [110, 'center'], price: [100, 'center'], price_note: [150, 'left'],
  features: [300, 'left'], role: [170, 'left'], specialization: [220, 'left'], bio: [340, 'left'], caption: [280, 'left'],
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
    case 'deleteRecord': {
      const out = write_(() => deleteRecord_(tabFor_(body.collection), body.id));
      removeUnusedImages_(out.replaced);
      return { deleted: out.id };
    }
    case 'reorder':             return write_(() => reorder_(tabFor_(body.collection), body.ids));
    case 'updateEnquiryStatus': return withLock_(() => updateEnquiryStatus_(body.id, body.status));
    case 'getUploadSignature':  return getUploadSignature_(body.folder, body.kind);
    case 'mediaFolders':        return mediaFolders_(Boolean(body.fresh));
    case 'mediaLibrary':        return mediaLibrary_(Boolean(body.fresh));
    case 'deleteFolder':        return deleteFolder_(body.path);
    case 'deleteImages':        return deleteImages_(body.images);
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

function tabFor_(collection) {
  const tab = COLLECTIONS[collection];
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
 * e.g. "tr-rahul-sharma", "plan-student", "rev-priya". A name already in use
 * gets -2, -3…; rows without a usable name are numbered ("img-13"), and
 * enquiries are numbered per day ("enq-2026-09-25-1"). The id then never
 * changes, even if the item is renamed.
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

function readKeyValues_(name) {
  const rows = readTable_(name);
  if (!rows) return null;
  const out = {};
  rows.forEach(r => { out[String(r.key).trim()] = r.value === undefined ? '' : r.value; });
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
    media: { base: base, sections: sectionFolders_(base) }
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
    // Add tick boxes first: insertCheckboxes() resets cells to FALSE.
    BOOLEAN_COLUMNS.forEach(c => { const i = head.indexOf(c); if (i >= 0) sh.getRange(rowNumber, i + 1).insertCheckboxes(); });
  }
  sh.getRange(rowNumber, 1, 1, row.length).setValues([row]);

  const written = sh.getRange(rowNumber, 1, 1, head.length).getValues()[0];
  const saved = {};
  head.forEach((h, i) => { if (h) saved[h] = cellOut_(written[i]); });
  return { record: saved, replaced: replaced };
}

function deleteRecord_(name, id) {
  id = String(id || '').trim();
  if (!id) throw apiError_('Missing id.', 'BAD_REQUEST');
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const idCol = headers_(values).indexOf('id');
  const i = idCol < 0 ? -1 : values.findIndex((r, n) => n > 0 && String(r[idCol]).trim() === id);
  if (i < 1) throw apiError_('That item no longer exists. Refresh and try again.', 'NOT_FOUND');
  const replaced = values[i].filter(v => isCloudinaryUrl_(v)).map(v => String(v).trim());
  deleteRowSafe_(sh, i + 1);
  return { id: id, replaced: replaced };
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

/** Cloudinary settings, or null while the cloud name, API key or secret is missing. */
function cloudinary_(cfg) {
  cfg = cfg || readKeyValues_('Config') || {};
  const p = PropertiesService.getScriptProperties();
  const apiKey = p.getProperty('CLOUDINARY_API_KEY'), secret = p.getProperty('CLOUDINARY_API_SECRET'), cloud = cloudName_(cfg);
  if (!apiKey || !secret || !cloud) return null;
  const base = baseFolder_(cfg);
  return { cloud: cloud, apiKey: apiKey, secret: secret, base: base, roots: [base].concat(LEGACY_FOLDERS.filter(f => f !== base)) };
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

function encodePath_(path) { return String(path).split('/').map(encodeURIComponent).join('/'); }
function folderCacheKey_(base) { return 'cld_folders_v2:' + base; }

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

/** The main folder, the section folders (which exist once used) and any subfolders made in Cloudinary. Cached 10 minutes. */
function mediaFolders_(fresh) {
  const cld = requireCloudinary_();
  const cache = CacheService.getScriptCache(), key = folderCacheKey_(cld.base);
  if (!fresh) { const hit = cache.get(key); if (hit) return JSON.parse(hit); }
  const found = {};
  found[cld.base] = true;
  let calls = 0;
  const walk = (path, depth) => {
    if (calls++ >= 40) return;
    let res;
    try { res = cloudinaryApi_(cld, 'get', 'folders/' + encodePath_(path), { max_results: 500 }); }
    catch (err) { if (err.code === 'CLOUDINARY_NOT_FOUND') return; throw err; }
    (res.folders || []).forEach(f => {
      if (!f || !f.path) return;
      found[f.path] = true;
      if (depth + 1 < MAX_FOLDER_DEPTH) walk(f.path, depth + 1);
    });
  };
  walk(cld.base, 0);
  const sections = sectionFolders_(cld.base);
  Object.keys(sections).forEach(s => { found[sections[s]] = true; });
  const out = { base: cld.base, sections: sections, folders: Object.keys(found).sort() };
  try { cache.put(key, JSON.stringify(out), FOLDER_CACHE_SECONDS); } catch (err) { /* too big to cache */ }
  return out;
}

/** Folders, photos and videos, each file with the places in the sheet that use it. Includes older uploads. */
function mediaLibrary_(fresh) {
  const cld = requireCloudinary_();
  const tree = mediaFolders_(fresh);
  const usedIn = imageUsage_(cld.roots);
  const images = [], seen = {}, legacy = [];
  let truncated = false;
  cld.roots.forEach(root => {
    ['image', 'video'].forEach(type => {
      let cursor = null, pages = 0;
      do {
        const res = cloudinaryApi_(cld, 'get', 'resources/' + type + '/upload', { prefix: root + '/', max_results: 500, next_cursor: cursor });
        (res.resources || []).forEach(r => {
          const id = String(r.public_id || '');
          if (seen[type + ':' + id] || id.indexOf(root + '/') !== 0) return;
          seen[type + ':' + id] = true;
          const folder = typeof r.asset_folder === 'string' && r.asset_folder.indexOf(root) === 0 ? r.asset_folder : id.slice(0, id.lastIndexOf('/'));
          images.push({ id: id, type: type, url: r.secure_url || r.url || '', folder: folder, bytes: r.bytes || 0, width: r.width || 0, height: r.height || 0, duration: r.duration || 0, created: r.created_at || '', usedIn: usedIn(id) });
        });
        cursor = res.next_cursor || null;
      } while (cursor && ++pages < 4);
      if (cursor) truncated = true;
    });
    if (root !== cld.base && images.some(i => i.id.indexOf(root + '/') === 0)) legacy.push(root);
  });
  const folders = tree.folders.slice();
  images.forEach(i => {
    const parts = i.folder.split('/');
    for (let n = 1; n <= parts.length; n++) { const p = parts.slice(0, n).join('/'); if (p && folders.indexOf(p) < 0) folders.push(p); }
  });
  folders.sort();
  return { base: tree.base, sections: tree.sections, legacy: legacy, folders: folders, images: images, truncated: truncated };
}

/**
 * Deletes an empty folder: a folder of older uploads (such as ssv-gym) or a
 * subfolder made on the Cloudinary website. The section folders always stay.
 */
function deleteFolder_(path) {
  const cld = requireCloudinary_();
  const clean = cleanFolderPath_(path);
  const legacy = cld.roots.some(r => r !== cld.base && (clean === r || clean.indexOf(r + '/') === 0));
  const inSection = sectionNames_().some(s => clean.indexOf(cld.base + '/' + s + '/') === 0);
  if (!legacy && !inSection) throw apiError_('The main website folders can\'t be deleted.', 'VALIDATION');
  const inside = ['image', 'video'].some(type => (cloudinaryApi_(cld, 'get', 'resources/' + type + '/upload', { prefix: clean + '/', max_results: 1 }).resources || []).length > 0);
  if (inside) throw apiError_('This folder still has files. Delete them first.', 'VALIDATION');
  try { cloudinaryApi_(cld, 'delete', 'folders/' + encodePath_(clean)); }
  catch (err) { if (err.code !== 'CLOUDINARY_NOT_FOUND') throw err; }
  CacheService.getScriptCache().remove(folderCacheKey_(cld.base));
  return { deleted: clean };
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

/** { id, type } of a photo or video in this Cloudinary account inside the website's folders, or null. */
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
  return id.indexOf('..') < 0 && cld.roots.some(r => id.indexOf(r + '/') === 0) ? { id: id, type: type } : null;
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
 * Creates, repairs and styles every tab. Safe to run any time.
 * One-time steps for older sheets: 1.1 sample content is upgraded (1.3), empty
 * sections get sample content (1.4), and the new address, opening hours,
 * phone numbers and settings are added (1.5). Values you changed are kept.
 */
function setupSheets() {
  const ss = ss_();
  const scriptTz = Session.getScriptTimeZone();
  if (scriptTz && ss.getSpreadsheetTimeZone() !== scriptTz) ss.setSpreadsheetTimeZone(scriptTz);
  TZ_ = null;
  const props = PropertiesService.getScriptProperties();
  const level = ss.getSheetByName('General') ? (props.getProperty('SEED_VERSION') || '1.1.0') : SEED_LEVEL;
  renameTab_(ss, 'Plans', 'Membership Plans');
  renameTab_(ss, 'Leads', 'Enquiries');
  migrateTestimonials_(ss);
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
      relabelHeaders_(sh, cols);
      if (ID_PREFIX[name]) repaired += withLock_(() => repairTab_(sh, name));
    }
  });
  if (olderThan_(level, '1.3.0')) upgradeSampleContent_(ss, seeds);
  if (olderThan_(level, '1.4.0')) fillSamples_(ss, seeds);
  if (olderThan_(level, '1.5.0')) upgradeTo150_(ss, seeds);
  props.setProperty('SEED_VERSION', SEED_LEVEL);
  fillNotes_(ss.getSheetByName('General'), noteFor_);
  fillNotes_(ss.getSheetByName('Config'), configNoteFor_);
  BOOLEAN_KEYS.forEach(k => makeCheckbox_(ss.getSheetByName('General'), k));
  statusDropdown_(ss.getSheetByName('Enquiries'), ENQUIRY_STATUSES);
  statusDropdown_(ss.getSheetByName('Reviews'), REVIEW_STATUSES);
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  Object.keys(SCHEMA).forEach(name => { const sh = ss.getSheetByName(name); if (sh) styleTab_(sh); });
  orderTabs_(ss);
  const cache = CacheService.getScriptCache();
  cache.remove(CONTENT_CACHE_KEY);
  cache.remove(folderCacheKey_(baseFolder_(readKeyValues_('Config') || {})));
  try { removeSecretRows_(SpreadsheetApp.getUi()); } catch (err) { /* run from the editor: no dialogs */ }
  toast_('Sheets are ready' + (repaired ? ' (' + repaired + ' rows got an ID)' : '') + '. Next: Set admin password (if not done) and Set Cloudinary keys.');
}

function olderThan_(a, b) {
  const x = String(a).split('.').map(n => parseInt(n, 10) || 0), y = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
}

function renameTab_(ss, from, to) {
  const sh = ss.getSheetByName(from);
  if (sh && !ss.getSheetByName(to)) sh.setName(to);
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
 * Runs with Set up / repair sheets, so running it again restores the look.
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

/** Moves genuine testimonials into the new Reviews tab (the three samples are left behind). */
function migrateTestimonials_(ss) {
  const old = ss.getSheetByName('Testimonials');
  if (!old || ss.getSheetByName('Reviews')) return;
  const values = old.getDataRange().getValues();
  const head = headers_(values);
  const at = (r, h) => { const i = head.indexOf(h); return i >= 0 ? r[i] : ''; };
  const samples = { 'rev-1': 'Rohit P.', 'rev-2': 'Sneha D.', 'rev-3': 'Karan M.' };
  const rows = values.slice(1)
    .filter(r => String(at(r, 'name')).trim() && samples[String(at(r, 'id')).trim()] !== String(at(r, 'name')).trim())
    .map(r => ({ id: String(at(r, 'id')).trim(), name: at(r, 'name'), rating: at(r, 'rating'), review: at(r, 'review'), likes: 0, date: today_(), source: 'Admin', status: isTrue_(at(r, 'active')) ? 'Published' : 'Hidden' }));
  const sh = ss.insertSheet('Reviews');
  const cols = SCHEMA.Reviews;
  sh.getRange(1, 1, 1, cols.length).setValues([cols.map(c => LABELS[c])]);
  sh.setFrozenRows(1);
  writeRows_(sh, cols, rows);
  ss.deleteSheet(old);
}

/**
 * One-time upgrade from the sample content of version 1.1: sample values you
 * never changed are replaced with the real details, made-up rows are removed.
 */
function upgradeSampleContent_(ss, seeds) {
  const OLD = oldSamples_();
  const fresh = {};
  seeds.General.forEach(r => { fresh[r[0]] = r[1]; });
  const general = ss.getSheetByName('General'), config = ss.getSheetByName('Config');
  const cfg = readKeyValues_('Config') || {}, gen = readKeyValues_('General') || {};
  const moved = { WHATSAPP_NUMBER: 'whatsapp', GOOGLE_MAPS_URL: 'maps_url', INSTAGRAM_URL: 'instagram_url' };
  Object.keys(moved).forEach(k => {
    const value = String(cfg[k] === undefined ? '' : cfg[k]).trim(), target = moved[k];
    if (value && (isBlank_(gen[target]) || sameText_(gen[target], OLD.general[target]))) setKeyValue_(general, target, value);
  });
  updateKeyValues_(general, (key, value) => {
    if (key === 'sample_content') return null;
    if (key in OLD.general && sameText_(value, OLD.general[key])) return key in fresh ? fresh[key] : null;
    return undefined;
  });
  appendMissingKeys_(general, seeds.General.filter(r => ['maps_embed_url', 'facebook_url', 'review_form', 'review_approval'].indexOf(r[0]) >= 0));
  if (config) {
    updateKeyValues_(config, (key, value) => {
      if (key in moved || key === 'GOOGLE_SHEET_ID' || key === 'CLOUDINARY_UPLOAD_PRESET') return null;
      if (key === 'CLOUDINARY_FOLDER' && sameText_(value, 'ssv-gym')) return 'SSV-Gym';
      return undefined;
    });
    appendMissingKeys_(config, seeds.Config.filter(r => r[0] === 'NOTIFY_EMAIL'));
  }
  upgradeRows_(ss.getSheetByName('Facilities'), OLD.facilities, seeds.Facilities, ['name', 'tags', 'description', 'category']);
  upgradeRows_(ss.getSheetByName('Membership Plans'), OLD.plans, seeds['Membership Plans'], ['description', 'features']);
  upgradeRows_(ss.getSheetByName('Trainers'), OLD.trainers, [], []);
  upgradeRows_(ss.getSheetByName('Gallery'), OLD.gallery, [], []);
}

/**
 * One-time step (1.4): nothing on the website is left empty. Missing or empty
 * General values, empty tabs, plans without a price and an empty NOTIFY_EMAIL
 * get the sample content, to be replaced with the gym's own later. Reviews are
 * left to real visitors.
 */
function fillSamples_(ss, seeds) {
  const general = ss.getSheetByName('General');
  const sample = {};
  seeds.General.forEach(r => { sample[r[0]] = r[1]; });
  updateKeyValues_(general, (key, value) => (key in sample && isBlank_(value) && !isBlank_(sample[key]) ? sample[key] : undefined));
  appendMissingKeys_(general, seeds.General);
  ['Facilities', 'Membership Plans', 'Trainers', 'Gallery', 'Announcements'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() < 2) seeds[name].forEach(r => appendRecord_(sh, r));
  });
  const plans = ss.getSheetByName('Membership Plans');
  if (plans && plans.getLastRow() > 1) {
    const values = plans.getDataRange().getValues(), head = headers_(values);
    const idCol = head.indexOf('id'), priceCol = head.indexOf('price');
    const prices = {};
    seeds['Membership Plans'].forEach(p => { prices[p.id] = p.price; });
    if (idCol >= 0 && priceCol >= 0) values.forEach((r, i) => {
      const id = String(r[idCol]).trim();
      if (i > 0 && isBlank_(r[priceCol]) && prices[id] !== undefined) plans.getRange(i + 1, priceCol + 1).setValue(prices[id]);
    });
  }
  const config = ss.getSheetByName('Config');
  updateKeyValues_(config, (key, value) => (key === 'NOTIFY_EMAIL' && isBlank_(value) ? NOTIFY_DEFAULT : undefined));
  appendMissingKeys_(config, seeds.Config.filter(r => r[0] === 'NOTIFY_EMAIL'));
}

/**
 * One-time step (1.5): the gym's new address, opening hours (Sunday differs)
 * and phone numbers (gym and owner), plus the new settings. Only values still
 * equal to the old starting content are replaced; anything you edited stays.
 * The Services tab (personal training, diet plans) is created with its rows
 * like any new tab.
 */
function upgradeTo150_(ss, seeds) {
  const general = ss.getSheetByName('General');
  if (!general) return;
  const fresh = {};
  seeds.General.forEach(r => { fresh[r[0]] = r[1]; });
  const old = {
    phone: '+91 75586 08585',
    address: 'Kamanwala Nagar, Sheetal Nagar | Virar West, Maharashtra 401303',
    opening_hours: 'Open all 7 days | 6:00 AM – 11:00 PM'
  };
  updateKeyValues_(general, (key, value) => (key in old && sameText_(value, old[key]) ? fresh[key] : undefined));
  appendMissingKeys_(general, seeds.General.filter(r => ['phone_2', 'services_heading', 'gallery_categories'].indexOf(r[0]) >= 0));
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

function setKeyValue_(sh, key, value) {
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const k = Math.max(head.indexOf('key'), 0), v = head.indexOf('value') >= 0 ? head.indexOf('value') : 1;
  const i = values.findIndex((r, n) => n > 0 && String(r[k]).trim() === key);
  if (i > 0) sh.getRange(i + 1, v + 1).setValue(cellIn_(value));
  else appendMissingKeys_(sh, [[key, value, '']]);
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
    sh.getRange(row, k + 1).setValue(r[0]);
    const cell = sh.getRange(row, v + 1);
    if (BOOLEAN_KEYS.indexOf(r[0]) >= 0) cell.insertCheckboxes();
    cell.setValue(cellIn_(r[1]));
    if (n >= 0 && r[2]) sh.getRange(row, n + 1).setValue(r[2]);
    row++;
  });
}

/**
 * Replaces rows that still hold old sample content: a row whose ID and values
 * match an old sample is updated to the new version (listed fields only), or
 * deleted if the new version doesn't have it. New rows are added only when old
 * samples were found. Rows you changed are left alone.
 */
function upgradeRows_(sh, oldRows, newRows, fields) {
  if (!sh || sh.getLastRow() < 2) return;
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const idCol = head.indexOf('id');
  if (idCol < 0) return;
  const newById = {};
  newRows.forEach(r => { newById[r.id] = r; });
  let found = false;
  const deletions = [];
  values.forEach((row, i) => {
    if (i === 0) return;
    const id = String(row[idCol]).trim();
    const old = oldRows.find(o => o.id === id);
    if (!old) return;
    const untouched = Object.keys(old).every(key => key === 'id' || (head.indexOf(key) >= 0 && sameText_(row[head.indexOf(key)], old[key])));
    if (!untouched) return;
    found = true;
    const next = newById[id];
    if (!next) { deletions.push(i + 1); return; }
    fields.forEach(f => { const c = head.indexOf(f); if (c >= 0) sh.getRange(i + 1, c + 1).setValue(cellIn_(next[f] === undefined ? '' : next[f])); });
  });
  deletions.sort((a, b) => b - a).forEach(r => deleteRowSafe_(sh, r));
  if (!found) return;
  const have = takenIds_(sh);
  newRows.filter(r => !have[r.id]).forEach(r => appendRecord_(sh, r));
}

/** Fills empty Notes cells for known keys; notes are shown in grey. */
function fillNotes_(sh, noteFn) {
  if (!sh || sh.getLastRow() < 2) return;
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const k = Math.max(head.indexOf('key'), 0), n = head.indexOf('notes');
  if (n < 0) return;
  values.forEach((r, i) => {
    const key = String(r[k]).trim(), note = i > 0 && key && isBlank_(r[n]) ? noteFn(key) : '';
    if (note) sh.getRange(i + 1, n + 1).setValue(note);
  });
  sh.getRange(2, n + 1, sh.getLastRow() - 1, 1).setFontColor('#6B7280').setFontStyle('normal');
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

function statusDropdown_(sh, list) {
  if (!sh) return;
  const col = headerRow_(sh).indexOf('status') + 1;
  if (col < 1) return;
  sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build());
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

/** Offers to delete rows in the Config and General tabs that look like passwords or API secrets. */
function removeSecretRows_(ui) {
  const found = [];
  ['Config', 'General'].forEach(name => {
    const sh = ss_().getSheetByName(name);
    if (!sh) return;
    const values = sh.getDataRange().getValues();
    const k = Math.max(headers_(values).indexOf('key'), 0);
    values.forEach((r, i) => {
      const key = String(r[k]).trim();
      if (i > 0 && key && SECRET_KEY_PATTERN.test(key)) found.push({ sh: sh, row: i + 1, label: name + ' tab: ' + key });
    });
  });
  if (!found.length) return 0;
  const answer = ui.alert('Secrets found in the sheet',
    'These rows look like passwords or API secrets:\n\n' + found.map(f => '• ' + f.label).join('\n') +
    '\n\nThe website never reads them from the sheet, and anyone who can open the sheet can see them. ' +
    'Set the admin password and Cloudinary keys from this SSV Admin menu instead.\n\nDelete these rows now?', ui.ButtonSet.YES_NO);
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
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_PASSWORD_SALT: salt,
    ADMIN_PASSWORD_HASH: sha256Hex_(salt + password),
    SESSION_EPOCH: String(Date.now())
  });
  CacheService.getScriptCache().remove('login_failures');
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
  CacheService.getScriptCache().remove(folderCacheKey_(baseFolder_(cfg)));
  ui.alert('Cloudinary keys saved. Uploads and the media library in the admin panel are ready.');
  removeSecretRows_(ui);
}

function clearWebsiteCache() {
  CacheService.getScriptCache().remove(CONTENT_CACHE_KEY);
  toast_('Website cache cleared.');
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
   Written by setupSheets() into empty tabs. Contact details, hours, services,
   Facebook and Instagram are the gym's own. Trainers, statistics and most
   photos are SAMPLE content (photos from Unsplash) for the owner to replace.
   Reviews are left to real visitors. */

function seedRows_() {
  const stock = id => 'https://images.unsplash.com/' + id;   // stand-in photos until photos of SSV are uploaded
  const features = 'Full gym access | Cardio equipment | Complimentary locker';
  return {
    General: [
      ['gym_name', 'SSV Gym'],
      ['full_name', 'Shree Siddhi Vinayak Gym'],
      ['tagline', 'Train strong. Live strong.'],
      ['description', 'SSV Gym (Shree Siddhi Vinayak Gym) in Virar West: gym floor, CrossFit and functional training, cardio, personal training, diet plans, weight loss and weight gain programmes, and a steam room.'],
      ['hero_heading', 'Train strong. | Live strong.'],
      ['hero_subtitle', 'Strength, CrossFit and cardio under one roof in Virar West, with personal training and a steam room for recovery.'],
      ['hero_image', stock('photo-1623874514711-0f321325f318')],
      ['facility_strip', 'Main Gym | CrossFit | Cardio | Steam Room'],
      ['stat_1_value', '5+'], ['stat_1_label', 'Years in Virar'],
      ['stat_2_value', '40+'], ['stat_2_label', 'Machines and stations'],
      ['stat_3_value', '3'], ['stat_3_label', 'Expert trainers'],
      ['stat_4_value', '7'], ['stat_4_label', 'Days a week'],
      ['about_heading', 'Shree Siddhi Vinayak Gym'],
      ['about_text', 'SSV Gym is a Virar West gym for strength training, CrossFit, cardio and functional fitness, whether you are just starting out or training for a goal. | Train with a personal trainer, follow a weight loss or weight gain programme, and recover in the steam room after your session.'],
      ['about_image', stock('photo-1534438327276-14e5300c3a48')],
      ['about_highlights', 'Personal training | Weight loss and weight gain programmes | CrossFit and functional training | Complimentary lockers'],
      ['facilities_intro', 'A full gym floor, a CrossFit and functional training zone, cardio equipment and a steam room for recovery.'],
      ['services_heading', 'Personal training and diet plans'],
      ['phone', '+91 77588 78588'],
      ['phone_2', '+91 75586 08585'],
      ['whatsapp', '+91 75586 08585'],
      ['address', 'Shree Siddhi Manora Commercial Complex | Datt Mandir Road, above IDBI Bank | Doghar Pada, Sheetal Nagar, Virar West | Vasai-Virar, Maharashtra 401303'],
      ['opening_hours', 'Monday – Saturday: 6:00 AM – 11:00 PM | Sunday: 4:00 PM – 9:00 PM'],
      ['maps_url', 'https://maps.app.goo.gl/EX4aAEYxKCztUjqv6'],
      ['maps_embed_url', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3762.0924582644457!2d72.80667559999999!3d19.451580099999997!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3be7a93bdce7be0f%3A0x649a18d15a19e63a!2sSSV%20Gym!5e0!3m2!1sen!2sin!4v1790316802069!5m2!1sen!2sin'],
      ['instagram_url', 'https://www.instagram.com/ssvgym2021/'],
      ['facebook_url', 'https://www.facebook.com/p/SSV-GYM-100069942823280/'],
      ['featured_badge_text', 'Best value'],
      ['gallery_categories', 'Gym | CrossFit | Training | Equipment | Events'],
      ['review_form', true],
      ['review_approval', false]
    ].map(r => [r[0], r[1], noteFor_(r[0])]),
    Facilities: [
      { id: 'fac-main', name: 'Main Gym', tags: 'Strength | Bodybuilding | Machines', description: 'The main floor for strength training, bodybuilding and machine work.', image_url: stock('photo-1637430308606-86576d8fef3c'), category: 'major', active: true, display_order: 1 },
      { id: 'fac-crossfit', name: 'CrossFit', tags: 'Functional Training | Conditioning', description: 'A dedicated zone for CrossFit, functional movements and conditioning circuits.', image_url: stock('photo-1536922246289-88c42f957773'), category: 'major', active: true, display_order: 2 },
      { id: 'fac-steam', name: 'Steam Room', tags: 'Recovery | Relaxation', description: 'Unwind and recover in the steam room after your workout.', image_url: stock('photo-1759216852954-88e547b8e01f'), category: 'major', active: true, display_order: 3 },
      { id: 'fac-cardio', name: 'Cardio', tags: '', description: 'Cardio equipment for warm-ups, endurance and fat loss.', image_url: '', category: 'additional', active: true, display_order: 4 },
      { id: 'fac-personal-training', name: 'Personal Training', tags: '', description: 'One-to-one coaching built around your goal.', image_url: '', category: 'additional', active: true, display_order: 5 },
      { id: 'fac-weight-loss', name: 'Weight Loss Programme', tags: '', description: 'Training and guidance to lose fat.', image_url: '', category: 'additional', active: true, display_order: 6 },
      { id: 'fac-weight-gain', name: 'Weight Gain Programme', tags: '', description: 'Training and guidance to build muscle and gain healthy weight.', image_url: '', category: 'additional', active: true, display_order: 7 },
      { id: 'fac-lockers', name: 'Complimentary Lockers', tags: '', description: 'Keep your things safe while you train.', image_url: '', category: 'additional', active: true, display_order: 8 }
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
    Trainers: [
      { id: 'tr-aman-verma', name: 'Aman Verma', role: 'Head Trainer', specialization: 'Strength training and bodybuilding', bio: 'Helps members build strength with sound technique and a clear plan.', image_url: stock('photo-1567013127542-490d757e51fc'), active: true, display_order: 1 },
      { id: 'tr-neha-kulkarni', name: 'Neha Kulkarni', role: 'Fitness Coach', specialization: 'Weight loss and functional training', bio: 'Builds sustainable routines for fat loss and everyday fitness.', image_url: stock('photo-1594381898411-846e7d193883'), active: true, display_order: 2 },
      { id: 'tr-vikram-singh', name: 'Vikram Singh', role: 'CrossFit Coach', specialization: 'CrossFit and conditioning', bio: 'Runs high-energy conditioning sessions for all fitness levels.', image_url: stock('photo-1583454110551-21f2fa2afe61'), active: true, display_order: 3 }
    ],
    Gallery: [
      ['main-gym-floor', '1728486145245-d4cb0c9c3470', 'Main gym floor', 'gym', 'Machines and free weights on the main floor.'],
      ['battle-ropes', '1548690312-e3b507d8c110', 'Battle ropes', 'crossfit', 'Conditioning work in the CrossFit zone.'],
      ['strength-machines', '1571902943202-507ec2618e8f', 'Strength machines', 'equipment', 'Machines for every major muscle group.'],
      ['barbell-session', '1517836357463-d25dfeac3438', 'Barbell session', 'training', 'Heavy compound lifts with good form.'],
      ['dumbbell-rack', '1576678927484-cc907957088c', 'Dumbbell rack', 'equipment', 'A full range of dumbbells.'],
      ['kettlebell-work', '1601422407692-ec4eeec1d9b3', 'Kettlebell work', 'crossfit', 'Functional movements and circuits.'],
      ['weights-area', '1689877020200-403d8542d95d', 'Weights area', 'gym', 'Space to train with free weights.'],
      ['focused-training', '1526506118085-60ce8714f8c5', 'Focused training', 'training', 'Training towards a clear goal.'],
      ['steam-room', '1759216852954-88e547b8e01f', 'Steam room', 'gym', 'Recover after your workout.'],
      ['group-session', '1593079831268-3381b0db4a77', 'Group session', 'events', 'Training together.'],
      ['equipment-detail', '1590487988256-9ed24133863e', 'Equipment', 'equipment', 'Well-kept equipment.'],
      ['lifting-practice', '1605296867304-46d5465a13f1', 'Lifting practice', 'training', 'Building strength step by step.']
    ].map((g, i) => ({ id: 'img-' + g[0], image_url: stock('photo-' + g[1]), title: g[2], category: g[3], caption: g[4], active: true, display_order: i + 1 })),
    Reviews: [],
    Announcements: [
      { id: 'ann-welcome', title: 'Welcome to the new SSV Gym website', description: 'Membership plans, photos and reviews are all here. Questions? Call or WhatsApp us.', image_url: '', date: today_(), expiry: '', active: true, priority: 1 }
    ],
    Enquiries: [],
    Config: [
      ['APPS_SCRIPT_URL', ''],
      ['CLOUDINARY_CLOUD_NAME', ''],
      ['CLOUDINARY_FOLDER', 'SSV-Gym'],
      ['NOTIFY_EMAIL', NOTIFY_DEFAULT]
    ].map(r => [r[0], r[1], configNoteFor_(r[0])])
  };
}

function noteFor_(key) {
  const notes = {
    gym_name: 'Short name, used at the top of the page and in the contact section.',
    full_name: 'Full name of the gym.',
    tagline: 'Line in the footer. Empty = hidden.',
    description: 'Summary shown in Google search results.',
    hero_heading: 'Big heading at the top of the page. A | starts a new line.',
    hero_subtitle: 'Text under the big heading. Empty = hidden.',
    hero_image: 'Top photo (sample until replaced). Upload it in the admin panel (General information).',
    facility_strip: 'Words in the strip under the top photo, separated by |. Empty = hidden.',
    about_heading: 'Heading of the About section.',
    about_text: 'About section text. A | starts a new paragraph.',
    about_image: 'About section photo (sample until replaced).',
    about_highlights: 'Short points in the About section, separated by |.',
    facilities_intro: 'Text next to the Facilities heading. Empty = hidden.',
    services_heading: 'Heading above personal training and diet plans (Services tab).',
    phone: 'Gym phone number with country code. Used for the Call buttons.',
    phone_2: "Owner's phone number, shown as a second number. Empty = hidden.",
    whatsapp: 'WhatsApp number with country code. Empty = the gym phone is used.',
    address: 'Address. A | starts a new line.',
    opening_hours: 'One line per group of days, e.g. "Monday – Saturday: 6:00 AM – 11:00 PM". A | starts a new line.',
    maps_url: 'Google Maps link to the gym (Share > Copy link).',
    maps_embed_url: 'Map on the website (Google Maps > Share > Embed a map).',
    instagram_url: 'Instagram profile link or @handle. Empty = hidden.',
    facebook_url: 'Facebook page link. Empty = hidden.',
    featured_badge_text: 'Label on highlighted membership plans.',
    gallery_categories: 'Gallery categories in filter order, separated by |. Also editable in the admin panel (Gallery > Categories).',
    review_form: 'Ticked: visitors can write reviews on the website.',
    review_approval: 'Ticked: new reviews wait for your approval before they appear.'
  };
  if (notes[key]) return notes[key];
  const m = String(key).match(/^stat_(\d)_(value|label)$/);
  if (m) return m[2] === 'value' ? 'Sample figure for statistic ' + m[1] + ', e.g. 10+. Empty = hidden.' : 'Label for statistic ' + m[1] + ', e.g. Years in Virar.';
  return '';
}

function configNoteFor_(key) {
  return {
    APPS_SCRIPT_URL: 'For reference: the website\'s backend link (the same one is in js/config.js).',
    CLOUDINARY_CLOUD_NAME: 'Cloudinary cloud name. The API key and secret are set from SSV Admin > Set Cloudinary keys.',
    CLOUDINARY_FOLDER: 'Main Cloudinary folder for website photos and videos.',
    NOTIFY_EMAIL: 'Who gets an email for each new enquiry and review. Separate several addresses with commas. This does not give access to the admin panel.'
  }[key] || '';
}

/** Sample content written by version 1.1, used by the one-time upgrade. */
function oldSamples_() {
  const stock = id => 'https://images.unsplash.com/' + id;
  return {
    general: {
      description: 'A fitness space for strength, conditioning and wellness.',
      hero_subtitle: 'A complete fitness space for strength, conditioning and wellness.',
      facility_strip: 'Main Gym | CrossFit | Steam Room',
      about_text: 'SSV Gym is a fitness space focused on strength training, conditioning and overall fitness. | Train on the main gym floor, build conditioning in the CrossFit and functional training area, and recover in the steam room.',
      about_highlights: 'Quality Equipment | Dedicated Training Areas | Trainer Support | Fitness-focused Environment',
      facilities_intro: 'The main gym floor, a CrossFit and functional training zone, and a steam room for recovery.',
      stat_1_value: '10+', stat_1_label: 'Years of Fitness', stat_2_value: '20+', stat_2_label: 'Training Machines',
      stat_3_value: '500+', stat_3_label: 'Members', stat_4_value: '2', stat_4_label: 'Training Zones',
      phone: '+91 00000 00000', whatsapp: '+91 00000 00000',
      address: 'Shop No. 1, Sample Complex, Main Road | City, State 000000',
      opening_hours: 'Mon – Sat: 6:00 AM – 10:00 PM | Sunday: 7:00 AM – 12:00 PM',
      maps_url: 'https://www.google.com/maps/search/?api=1&query=Shree+Siddhi+Vinayak+Gym',
      maps_embed_url: '',
      instagram_url: 'https://www.instagram.com/'
    },
    facilities: [
      { id: 'fac-main', name: 'Main Gym', description: 'The main training floor for strength work, cardio and machine training.' },
      { id: 'fac-crossfit', name: 'CrossFit', description: 'A dedicated area for functional movements, circuits and conditioning.' },
      { id: 'fac-steam', name: 'Steam Room', description: 'Unwind after training and support recovery in the steam room.' },
      { id: 'fac-cardio', name: 'Cardio Area', description: 'Treadmills, bikes and cross-trainers for warm-ups and endurance work.' },
      { id: 'fac-weights', name: 'Free Weights', description: 'Dumbbells, barbells and benches for free-weight training.' },
      { id: 'fac-machines', name: 'Strength Machines', description: 'Machines for training every major muscle group.' }
    ],
    plans: [
      { id: 'plan-monthly', price: 1200 }, { id: 'plan-quarterly', price: 3000 },
      { id: 'plan-half-yearly', price: 5500 }, { id: 'plan-yearly', price: 9000 }
    ],
    trainers: [{ id: 'tr-1', name: 'Aman Verma' }, { id: 'tr-2', name: 'Neha Kulkarni' }, { id: 'tr-3', name: 'Vikram Singh' }],
    gallery: ['1728486145245-d4cb0c9c3470', '1548690312-e3b507d8c110', '1571902943202-507ec2618e8f', '1517836357463-d25dfeac3438',
      '1576678927484-cc907957088c', '1601422407692-ec4eeec1d9b3', '1689877020200-403d8542d95d', '1526506118085-60ce8714f8c5',
      '1759216852954-88e547b8e01f', '1593079831268-3381b0db4a77', '1590487988256-9ed24133863e', '1605296867304-46d5465a13f1']
      .map((p, i) => ({ id: 'img-' + (i + 1), image_url: stock('photo-' + p) }))
  };
}
