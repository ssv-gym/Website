/* ==========================================================================
   SSV GYM — FRONTEND CONFIGURATION                                   v1.3.0
   --------------------------------------------------------------------------
   Everything in this file is sent to every visitor's browser. It is PUBLIC.
   Never put passwords or API secrets here: they live in Apps Script and are
   set from the SSV Admin menu in the Google Sheet.
   ========================================================================== */
const CONFIG = Object.freeze({
  // Google Apps Script web-app URL (Deploy > Manage deployments > the URL ending in /exec).
  API_URL: "https://script.google.com/macros/s/AKfycbxiI4QWZQkky2uvW7WST7-QieWcl7oddsGLt9-aU0gdikLjl3i585J34aMilm2XEpnjNQ/exec",

  // Photo uploads from the admin panel. Large photos are resized in the browser
  // first: much faster on mobile data, and location (GPS) data is removed.
  MAX_UPLOAD_MB: 10,
  IMAGE_MAX_EDGE: 2400,   // longest side in pixels
  IMAGE_QUALITY: 0.85,    // JPEG quality, 0 to 1

  // Behaviour
  REQUEST_TIMEOUT_MS: 10000, // first-time visitors wait this long before the page's built-in details are used
  CACHE_MINUTES: 5           // a saved copy newer than this is used without asking the server
});
