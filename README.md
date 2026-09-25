# SSV Gym website (v1.5.0)

Website for **Shree Siddhi Vinayak Gym (SSV Gym)**, Virar West, with an admin panel.
Content lives in a private Google Sheet, photos and videos in Cloudinary, and the site
runs on GitHub Pages. No frameworks and no build step.

## Files

| File | What it is |
|---|---|
| `index.html` | The website (one page) |
| `admin.html` | The admin panel (password protected) |
| `css/style.css`, `css/admin.css` | Styles for the website and the admin panel |
| `js/config.js` | The backend link (`API_URL`) and upload limits. Public: no secrets here |
| `js/utils.js`, `js/api.js` | Shared helpers and all calls to the backend |
| `js/main.js`, `js/gallery.js` | The website: sections, hours, events, reviews, gallery, map, enquiry form |
| `js/admin.js` | The admin panel |
| `apps-script/Code.gs` | The backend. Paste it into the sheet's Apps Script (see `apps-script/README.md`) |
| `assets/favicon.jpg` | The browser tab icon and link-preview picture: the SSV logo (square, at least 192 × 192 px) |
| `demo/` | A separate demo with sample data (see `demo/README.md`). Delete it any time |

The Apps Script project uses Google's default `appsscript.json`; no manifest file is needed.

## What the owner can change in the admin panel

- **General information:** names, texts, photos, statistics, both phone numbers, WhatsApp,
  address, opening hours, map and social links.
- **Facilities, Membership plans, Trainers:** add, edit, hide, reorder.
- **Personal training & diet:** the extra services shown under the membership plans,
  with their prices.
- **Gallery:** photos and videos (uploaded, or YouTube links), with categories that can be
  added or renamed (Gallery › Categories).
- **Announcements & events:** without a photo, a short notice near the top of the site;
  with a photo, an event card (tournament, competition) in the Events section.
- **Reviews, Enquiries, Media library, Settings.**

## Opening hours

One line per group of days, for example
`Monday – Saturday: 6:00 AM – 11:00 PM | Sunday: 4:00 PM – 9:00 PM`.
The website highlights today's hours and shows whether the gym is open now (India time).

## Link previews (WhatsApp, Facebook)

`og:url` and `og:image` at the top of `index.html` must hold the site's full address. They
are set to `https://ssvgym.github.io/ssv-gym/`. If the site moves (for example to its own
domain), change both lines and the `url` and `logo` in the business details below them.

## How content gets to the website

1. The owner edits in `admin.html` (or directly in the Google Sheet).
2. The backend (`Code.gs`) saves to the sheet and clears its 5-minute cache.
3. Visitors get the new content: new visitors straight away, returning visitors
   within a few minutes (their browser shows its saved copy first, then refreshes).

Code updates never overwrite what the owner has changed: the one-time upgrade steps
only replace values that still match the original starting content.

## Sample content

Until the owner replaces them, trainers, statistics and most photos are **sample
content** (photos from Unsplash). The admin dashboard lists what still needs replacing
under "Finish your website". Reviews are left to real visitors.

## Security

- **Who can edit:** anyone with the admin password (admin panel) and anyone with edit
  access to the Google Sheet. Change the password with SSV Admin › Set admin password.
- **Secrets never go in the sheet.** The admin password (stored only as a salted hash)
  and the Cloudinary API key and secret are kept in the script's Script Properties, set
  from the SSV Admin menu. An unpublished sheet is still readable by everyone it is
  shared with, can be copied or downloaded, and keeps old values in its version
  history. Script Properties can only be seen by people who can edit the script.
- **Email alerts:** `NOTIFY_EMAIL` in the Config tab (several addresses separated by
  commas). These addresses only receive alerts; they give no access to the admin panel.
- `js/config.js` is public, like every file of the website. It holds no secrets.

## Updating

- **Website files:** upload the changed files to the GitHub repository (Add file ›
  Upload files). When a CSS or JS file changes, the `?v=` numbers in the HTML files
  change too, so browsers load the new version.
- **Backend:** paste the new `Code.gs`, save, reload the sheet, run SSV Admin › Set up /
  repair sheets, then Deploy › Manage deployments › Edit › Version: New version › Deploy.
  The admin panel warns when the deployed backend is older than it expects.

## Troubleshooting

- **Windows blocks `.js` files when extracting a downloaded ZIP.** Right-click the ZIP ›
  Properties › tick Unblock › OK, then extract. Or use the project builder's "Save to a
  folder" button.
- **An upload says "cloud_name is disabled".** Cloudinary has switched the account off.
  Sign in at cloudinary.com: usually the email address isn't verified yet, or the free
  plan's limits were reached. The website can't fix this; Cloudinary support can.
- **Media library mentions permission.** In the sheet, run SSV Admin › Set Cloudinary keys
  once and allow access (tick "Select all") when Google asks.
- **The website shows old content.** Wait five minutes, or run SSV Admin › Clear website
  cache and reload the page.
- **Admin sign-in is locked** after 5 wrong passwords: SSV Admin › Unlock admin sign-in.
