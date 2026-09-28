# SSV Gym website (v1.6.0)

Website for **Shree Siddhi Vinayak Gym (SSV Gym)**, Virar West, with an admin panel.
Content lives in a private Google Sheet, photos and videos in Cloudinary, the Google
rating and reviews come from the Google Places API, and the site runs on GitHub Pages.
No frameworks and no build step.

## Files

| File | What it is |
|---|---|
| `index.html` | The website (one page) |
| `gallery.html` | The full gallery: every photo and video, with category filters |
| `admin.html` | The admin panel (password protected) |
| `css/style.css`, `css/admin.css` | Styles for the website and the admin panel |
| `js/config.js` | The backend link (`API_URL`) and upload limits. Public: no secrets here |
| `js/utils.js`, `js/api.js` | Shared helpers and all calls to the backend |
| `js/main.js` | The home page: sections, hours, events, reviews, map, enquiry form |
| `js/gallery.js`, `js/gallery-page.js` | The gallery preview, the full gallery page and the photo viewer |
| `js/admin.js` | The admin panel |
| `apps-script/Code.gs` | The backend. Paste it into the sheet's Apps Script (see `apps-script/README.md`) |
| `assets/favicon.jpg` | The browser tab icon and link-preview picture: the SSV logo (square, at least 192 × 192 px) |
| `demo/` | The website and admin panel on sample data, for a portfolio (see `demo/README.md`) |

## What the owner can change in the admin panel

- **General information:** names, texts, photos, statistics, both phone numbers, WhatsApp,
  address, opening hours, map and social links.
- **Facilities, Membership plans, Personal training & diet, Trainers:** add, edit, hide.
- **Gallery:** photos and videos (uploaded, or YouTube links), with categories.
- **Announcements & events:** without a photo, a short notice near the top of the site;
  with a photo, an event card in the Events section.
- **Reviews, Enquiries, Media library, Settings.**
- **Reorder** any list by dragging it (on a phone, drag the ⠿ handle), or with the arrows.
- **Delete several at once:** tick the boxes, then Delete in the bar at the bottom.

## Gallery

The home page shows the first six gallery items, in the admin's order, and a
**See the full gallery** button that opens `gallery.html` with everything in a masonry
layout and filters by category. `gallery.html#crossfit` opens one category directly.

## Google rating and reviews

The Reviews section shows the gym's Google rating, the number of Google reviews, up to three
Google reviews and a **See all reviews on Google** button. Reviews written on the website
stay in their own tab. Setup, once:

1. In the Google Cloud console, enable **Places API (New)** (billing must be on for the
   project), then Credentials › Create API key. Restrict the key to Places API (New).
2. In the Google Sheet: **SSV Admin › Set Google Places key** and paste it. The Place ID is
   already in the Config tab (`GOOGLE_PLACE_ID`).

Google is asked at most every 6 hours (about 120 requests a month). Admin › Settings ›
Refresh from Google asks now.

## Keys and passwords

Secrets are kept in Apps Script › Project Settings › **Script properties**, never in the
sheet or the website. The Config tab lists each one (`ADMIN_PASSWORD`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`, `GOOGLE_PLACES_API_KEY`) with **Stored in Script Properties** or
**Not set**, so you can see at a glance which keys the project uses. Admin › Settings shows
the same list. Change them from the SSV Admin menu in the sheet.

## Demo

`demo/index.html`, `demo/gallery.html` and `demo/admin.html` run on the sample content in
`demo/data.js`, using the real `css/` and `js/` files with `demo/api.js` in place of
`js/api.js`. Visitors sign in with any password, change anything and see it on the demo
website. Nothing is saved anywhere: changes stay in that browser tab and are gone after a
refresh. The demo never touches the Google Sheet, Cloudinary or Google, and the real website
never loads anything from `demo/`.

## Opening hours

One line per group of days, for example
`Monday – Saturday: 6:00 AM – 11:00 PM | Sunday: 4:00 PM – 9:00 PM`.
The website highlights today's hours and shows whether the gym is open now (India time).

## Link previews (WhatsApp, Facebook)

`og:url` and `og:image` at the top of `index.html` and `gallery.html` must hold the site's
full address (`https://ssvgym.github.io/ssv-gym/`). If the site moves to its own domain,
change them and the `url` and `logo` in the business details in `index.html`.

## How content gets to the website

1. The owner edits in `admin.html` (or directly in the Google Sheet).
2. The backend (`Code.gs`) saves to the sheet and clears its 5-minute cache.
3. New visitors see the change straight away; returning visitors within a few minutes.

Code updates never overwrite what the owner has changed: one-time upgrade steps only
replace values that still match the original text.

## Updating

- **Website files:** upload the changed files to the GitHub repository (Add file ›
  Upload files). When a CSS or JS file changes, the `?v=` numbers in the HTML files change
  too, so browsers load the new version.
- **Backend:** paste the new `Code.gs`, save, reload the sheet, run SSV Admin › Set up /
  repair sheets, then Deploy › Manage deployments › Edit › Version: New version › Deploy.
  The admin panel warns when the deployed backend is older than it expects.

## Troubleshooting

- **Windows blocks `.js` files when extracting a downloaded ZIP.** Right-click the ZIP ›
  Properties › tick Unblock › OK, then extract. Or use the builder's "Save to a folder".
- **No Google rating on the site.** Admin › Settings › Google rating and reviews says why.
- **An upload says "cloud_name is disabled".** Cloudinary has switched the account off.
  Sign in at cloudinary.com to see why (unverified email, plan limits).
- **The website shows old content.** Wait five minutes, or run SSV Admin › Clear website
  cache and reload the page.
- **Admin sign-in is locked** after 5 wrong passwords: SSV Admin › Unlock admin sign-in.
