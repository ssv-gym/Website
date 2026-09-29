# Apps Script backend (v1.6.2)

`Code.gs` turns the Google Sheet into the website's backend: it serves content to
visitors, saves enquiries and reviews, fetches the Google rating and reviews, and lets the
admin panel edit everything.

## First-time setup

1. Open the Google Sheet › **Extensions › Apps Script**.
2. Replace the contents of `Code.gs` with this file and save. The default
   `appsscript.json` needs no changes.
3. **Project Settings:** time zone *(GMT+05:30) India Standard Time*.
4. Reload the Google Sheet. An **SSV Admin** menu appears after Help. Run, in order:
   - **Set up / repair sheets** (Google asks for permission the first time: tick **Select all**)
   - **Set admin password**
   - **Set Cloudinary keys** (after putting the cloud name in the Config tab)
   - **Set Google Places key**
5. **Deploy › New deployment › Web app**. Execute as: **Me**. Who has access: **Anyone**.
6. Copy the URL ending in `/exec` into `js/config.js` › `API_URL`.

## Updating

Paste the new `Code.gs`, save, reload the sheet, run **SSV Admin › Set up / repair
sheets**, then **Deploy › Manage deployments › Edit (pencil) › Version: New version ›
Deploy**. The web app URL stays the same.

## SSV Admin menu

| Item | What it does |
|---|---|
| Set up / repair sheets | Creates missing tabs and columns, removes old ones, puts the General tab in order, gives rows an ID, runs one-time upgrades, updates the key list in the Config tab and styles every tab |
| Set admin password | Sets the admin panel password and signs everyone out |
| Set Cloudinary keys | Tests and saves the Cloudinary API key and secret |
| Set Google Places key | Tests and saves the Google Places API key |
| Update Google rating now | Asks Google for the rating, the number of reviews and recent reviews now. It also happens by itself every 6 hours |
| Clear website cache | Makes the website read the sheet, and Google, again now |
| Unlock admin sign-in | Clears the 15-minute lock after 5 wrong passwords |
| Sign out all admin sessions | Signs out every browser signed in to the admin panel |

If the menu doesn't show all of these, the old `Code.gs` is still in the project: paste the
new one, save, and reload the sheet.

## Tabs

General, Facilities, Membership Plans, Services (personal training, diet plans),
Trainers, Gallery, Reviews, Announcements (an Image URL turns an announcement into an
event card), Enquiries, Config.

### General tab

Three columns: **Category | Key | Value**. Rows are grouped in the order of the website:
Basic, Top of page, Statistics, About, Facilities, Membership, Gallery, Reviews, Contact,
Map & social. The category name is on the first row of each group. Set up / repair sheets
puts the rows back in this order, keeping every value; keys it doesn't know go last, under
Other. What each key does is explained next to its field in the admin panel.

### Status dropdowns as chips

Google doesn't let scripts choose how a dropdown looks, so turn on the rounded "chip" style
once, by hand: select the Status column of the Enquiries tab (from row 2 down) › **Data ›
Data validation** › click the rule › **Advanced options › Display style: Chip** (you can
also give New, Contacted and Closed a colour) › **Done**. Do the same in the Reviews tab.
Set up / repair sheets keeps that style and copies it to rows added later.

## Config tab

| Key | Value |
|---|---|
| `APPS_SCRIPT_URL` | For reference: the web app link |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_FOLDER` | Cloudinary account and main folder |
| `GOOGLE_PLACE_ID` | The gym's Google Place ID |
| `NOTIFY_EMAIL` | Who gets enquiry and review emails (commas between addresses) |
| `ADMIN_PASSWORD`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `GOOGLE_PLACES_API_KEY` | Status only: "Stored in Script Properties" or "Not set". The values live in Project Settings › Script properties |

Set these four with the SSV Admin menu, not in the sheet. Any other text typed into their
value cells is simply replaced by the status. If a real Cloudinary or Google key is pasted
there by mistake, Set up / repair sheets moves it into Script Properties; change that key
afterwards, because the sheet's version history keeps what was typed. The admin password is
only ever set from the menu.

## Photos and videos (Cloudinary)

Uploads go into their section's folder: `SSV-Gym/Home`, `SSV-Gym/Facilities`,
`SSV-Gym/Trainers`, `SSV-Gym/Gallery` or `SSV-Gym/Events`. Files uploaded by earlier versions
(in `ssv-gym/…`) are filed under the same sections. Photos: JPG, PNG, WebP. Videos: MP4,
MOV, WebM, up to 100 MB. Each upload is signed by the backend, so the API secret never
reaches the browser. A replaced or deleted file is removed from Cloudinary when nothing
else uses it.

## API

`GET ?action=content` returns everything the website shows, including `google` (rating,
count, up to five reviews and links). `GET ?action=health` returns the version.
`POST` (JSON body as text/plain) with `action`:

- Public: `submitEnquiry`, `submitReview`, `likeReview`, `login`
- Admin (with `token`): `verify`, `logout`, `adminGetAll`, `getInbox`, `saveGeneral`,
  `saveRecord`, `deleteRecord`, `deleteRecords` (several ids; also enquiries), `reorder`,
  `updateEnquiryStatus`, `getUploadSignature`, `mediaLibrary`, `deleteImages`, `refreshGoogle`

Responses are `{ ok: true, data }` or `{ ok: false, error, code }`.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Apps Script is not allowed to connect to Cloudinary yet" | Run SSV Admin › Set Cloudinary keys and allow access when Google asks |
| Google rating missing | Admin › Settings shows Google's message. Check that Places API (New) is enabled and billing is on |
| Admin panel says the backend is older | Deploy › Manage deployments › Edit › Version: New version › Deploy |
| "Photo uploads are not set up" | Put CLOUDINARY_CLOUD_NAME in the Config tab, then Set Cloudinary keys |
| No emails arrive | Check NOTIFY_EMAIL in the Config tab and the spam folder |
| Anything else | Apps Script › Executions shows the full error |
