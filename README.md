# SSV Gym website (v1.6.2)

Website for **Shree Siddhi Vinayak Gym (SSV Gym)**, Virar West, with an admin panel.
Content lives in a private Google Sheet, photos and videos in Cloudinary, the Google
rating and reviews come from the Google Places API, and the site runs on GitHub Pages.
No frameworks and no build step.

## Files

| File | What it is |
|---|---|
| `index.html` | The website (one page) |
| `gallery.html` | The full gallery: every photo and video, with category filters |
| `admin.html` | The admin panel (password protected, kept out of search results) |
| `sitemap.xml`, `robots.txt` | For search engines (see Search engines below) |
| `css/style.css`, `css/admin.css` | Styles for the website and the admin panel |
| `js/config.js` | The backend link (`API_URL`) and upload limits. Public: no secrets here |
| `js/utils.js`, `js/api.js` | Shared helpers and all calls to the backend |
| `js/main.js` | The home page: sections, hours, events, social, reviews, map, enquiry form |
| `js/gallery.js`, `js/gallery-page.js` | The gallery preview, the full gallery page and the photo viewer |
| `js/admin.js` | The admin panel |
| `apps-script/Code.gs` | The backend. Paste it into the sheet's Apps Script (see `apps-script/README.md`) |
| `assets/favicon.jpg` | The SSV logo: browser tab icon, link previews and the Instagram card (square, at least 192 × 192 px) |
| `demo/` | The website and admin panel on sample data, for a portfolio (see `demo/README.md`) |

## What the owner can change in the admin panel

- **General information:** names, texts, photos, statistics, both phone numbers, WhatsApp,
  address, opening hours, map, Instagram and Facebook.
- **Facilities, Membership plans, Personal training & diet, Trainers:** add, edit, hide.
- **Gallery:** photos and videos (uploaded, or YouTube links), with categories.
- **Announcements & events:** without a photo, a short notice near the top of the site;
  with a photo, an event card in the Events section.
- **Reviews, Enquiries, Media library, Settings.**
- **Reorder** any list by dragging it (on a phone, drag the ⠿ handle), or with the arrows.
- **Delete several at once:** tick the boxes, then Delete in the bar at the bottom.

## Social

The Social section highlights Instagram (General › `instagram_url`) with Facebook next to it
(`facebook_url`). An empty link hides its card; with neither, the section is hidden.

## Reviews

The Reviews section shows two scores: the **Google rating** with the number of Google
reviews, and the **average of the reviews written on this website**. Each score opens its
own reviews.

A review written on the website can't become a Google review: Google only accepts reviews
that people post themselves, from their own Google account, and no API posts one for them.
Instead, everyone who posts on the website is invited to post on Google too, whatever
their rating (asking only happy members would break Google's rules).

## Google rating and reviews

The rating, the number of reviews and up to five recent Google reviews update by
themselves: Google is asked again at most every 6 hours. That is about 120 requests a
month, well inside Google's free monthly allowance for this request. To update straight
away: in the Google Sheet, **SSV Admin › Update Google rating now**, or Admin › Settings ›
Refresh from Google. Setup, once:

1. In the Google Cloud console, enable **Places API (New)** (billing must be on for the
   project), then Credentials › Create API key. Restrict the key to Places API (New).
2. In the Google Sheet: **SSV Admin › Set Google Places key** and paste it. The Place ID is
   already in the Config tab (`GOOGLE_PLACE_ID`).

## Gallery

The home page shows the first six gallery items, in the admin's order, and a
**See the full gallery** button that opens `gallery.html` with everything in a masonry
layout and filters by category. `gallery.html#crossfit` opens one category directly.

## Keys and passwords

Secrets are kept in Apps Script › Project Settings › **Script properties**, never in the
sheet or the website. The Config tab lists each one (`ADMIN_PASSWORD`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`, `GOOGLE_PLACES_API_KEY`) with **Stored in Script Properties** or
**Not set**. Admin › Settings shows the same list. Change them from the SSV Admin menu.

## Search engines (SEO)

Built in:

- A clear title and description on each page, written naturally, and one H1 per page
  ("SSV Gym, Shree Siddhi Vinayak Gym, Virar West" on the home page).
- A canonical link on each page, link previews for WhatsApp and Facebook, and alt text on
  every photo.
- Business details for Google (schema.org `ExerciseGym`): name, address, phone, opening
  hours, map link, location and the Instagram and Facebook pages. They follow the Google
  Sheet, so they always match the website.
- No star ratings in those details: Google doesn't show ratings a business publishes about
  itself, and the Google rating belongs to Google.
- `sitemap.xml` with both pages. The admin panel and the demo are marked noindex.

After the site is live, once:

1. **Google Search Console** › Add property › URL prefix ›
   `https://ssvgym.github.io/ssv-gym/`. Verify with the HTML tag method: paste the tag
   Google gives you into the head of `index.html`, next to the other meta tags, upload it,
   then press Verify.
2. **Sitemaps** › add `sitemap.xml`.
3. **URL Inspection** › `https://ssvgym.github.io/ssv-gym/` › **Request indexing**.
4. **Google Business Profile:** add the website link, and keep the name, address, phone
   and opening hours exactly as on the website. For "SSV Gym Virar West" searches, this
   profile matters most.

`robots.txt`: search engines only read it at the root of a domain, so while the site lives
at `ssvgym.github.io/ssv-gym/` it isn't read (nothing is blocked either way); the sitemap is
submitted in Search Console instead. It works as it is if the site moves to its own domain
or to a repository named `ssvgym.github.io`; then change the addresses in `index.html`,
`gallery.html`, `sitemap.xml` and `robots.txt`.

## Opening hours

One line per group of days, for example
`Monday – Saturday: 6:00 AM – 11:00 PM | Sunday: 4:00 PM – 9:00 PM`.
The website highlights today's hours and shows whether the gym is open now (India time).

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

- **The SSV Admin menu is missing items** (such as Set Google Places key): the old
  `Code.gs` is still in Apps Script. Paste the new one, save, and reload the sheet.
- **Windows blocks `.js` files when extracting a downloaded ZIP.** Right-click the ZIP ›
  Properties › tick Unblock › OK, then extract. Or use the builder's "Save to a folder".
- **No Google rating on the site.** Admin › Settings › Google rating and reviews says why.
- **An upload says "cloud_name is disabled".** Cloudinary has switched the account off.
  Sign in at cloudinary.com to see why (unverified email, plan limits).
- **The website shows old content.** Wait five minutes, or run SSV Admin › Clear website
  cache and reload the page.
- **Admin sign-in is locked** after 5 wrong passwords: SSV Admin › Unlock admin sign-in.
