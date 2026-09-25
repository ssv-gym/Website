# SSV Gym website (v1.4.0)

Website for **Shree Siddhi Vinayak Gym (SSV Gym)**, Virar West, with an admin panel.
Content lives in a private Google Sheet, photos in Cloudinary, and the site runs on
GitHub Pages. No frameworks and no build step.

## Files

| File | What it is |
|---|---|
| `index.html` | The website (one page) |
| `admin.html` | The admin panel (password protected) |
| `css/style.css`, `css/admin.css` | Styles for the website and the admin panel |
| `js/config.js` | The backend link (`API_URL`) and upload settings. Public: no secrets here |
| `js/utils.js`, `js/api.js` | Shared helpers and all calls to the backend |
| `js/main.js`, `js/gallery.js` | The website: sections, reviews, gallery, map, enquiry form |
| `js/admin.js` | The admin panel |
| `apps-script/Code.gs` | The backend. Paste it into the sheet's Apps Script (see `apps-script/README.md`) |
| `assets/favicon.jpg` | The browser tab icon: add the SSV logo here (exactly this name, square, at least 192 × 192 px). Until then browsers show their default icon |
| `demo/` | A separate demo with sample data (see `demo/README.md`). Delete it any time |

The Apps Script project uses Google's default `appsscript.json`; no manifest file is needed.

## How content gets to the website

1. The owner edits in `admin.html` (or directly in the Google Sheet).
2. The backend (`Code.gs`) saves to the sheet and clears its 5-minute cache.
3. Visitors get the new content: new visitors straight away, returning visitors
   within a few minutes (their browser shows its saved copy first, then refreshes).

## Sample content

Until the owner replaces them, trainers, membership prices, statistics and most
photos are **sample content** (photos from Unsplash). The admin dashboard lists what
still needs replacing under "Finish your website". Contact details, opening hours,
map, Facebook and Instagram are the gym's own. Reviews are left to real visitors.

## The Google Sheet

Tabs: General, Facilities, Membership Plans, Trainers, Gallery, Reviews,
Announcements, Enquiries, Config. **SSV Admin › Set up / repair sheets** creates missing
tabs and columns, gives hand-typed rows an ID, and styles the tabs (dark header with
green bold text, plain rows, size 10, text clipped to one line).

- Keep the sheet **unpublished** (File › Share › Publish to web should be off) and share
  it only with people who should see enquiries.
- **Email alerts:** `NOTIFY_EMAIL` in the Config tab. Several addresses, separated by
  commas, all get an email for every enquiry and review. These addresses only receive
  alerts: they give no access to the admin panel.

## Security

- **Who can edit:** anyone with the admin password (admin panel) and anyone with edit
  access to the Google Sheet. Change the password with SSV Admin › Set admin password.
- **Secrets never go in the sheet.** The admin password (stored only as a salted hash)
  and the Cloudinary API key and secret are kept in the script's Script Properties, set
  from the SSV Admin menu. An unpublished sheet is still readable by everyone it is
  shared with, can be copied or downloaded, and keeps old values in its version
  history. Script Properties can only be seen by people who can edit the script.
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
- **Media library shows an error about permission.** In the sheet, run SSV Admin › Set
  Cloudinary keys once and allow access when Google asks.
- **The website shows old content.** Wait five minutes, or run SSV Admin › Clear website
  cache and reload the page.
- **Admin sign-in is locked** after 5 wrong passwords: SSV Admin › Unlock admin sign-in.
