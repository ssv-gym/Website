# Apps Script backend (v1.5.0)

`Code.gs` turns the Google Sheet into the website's backend: it serves content to
visitors, saves enquiries and reviews, and lets the admin panel edit everything.

## First-time setup

1. Open the Google Sheet › **Extensions › Apps Script**.
2. Replace the contents of `Code.gs` with this file and save. The default
   `appsscript.json` needs no changes.
3. **Project Settings:** time zone *(GMT+05:30) India Standard Time*.
4. Reload the Google Sheet. An **SSV Admin** menu appears after Help. Run, in order:
   - **Set up / repair sheets** (Google asks for permission the first time: tick **Select all**)
   - **Set admin password**
   - **Set Cloudinary keys** (after putting the cloud name in the Config tab)
5. **Deploy › New deployment › Web app**. Execute as: **Me**. Who has access: **Anyone**.
6. Copy the URL ending in `/exec` into `js/config.js` › `API_URL`.

## Updating

Paste the new `Code.gs`, save, reload the sheet, run **SSV Admin › Set up / repair
sheets**, then **Deploy › Manage deployments › Edit (pencil) › Version: New version ›
Deploy**. The web app URL stays the same.

## SSV Admin menu

| Item | What it does |
|---|---|
| Set up / repair sheets | Creates missing tabs and columns, gives rows an ID, runs one-time upgrades, and styles every tab |
| Set admin password | Sets the admin panel password and signs everyone out |
| Set Cloudinary keys | Tests and saves the Cloudinary API key and secret. Also gives Google's permission to reach Cloudinary |
| Clear website cache | Makes the website read the sheet again now |
| Unlock admin sign-in | Clears the 15-minute lock after 5 wrong passwords |
| Sign out all admin sessions | Signs out every browser signed in to the admin panel |

## Tabs

General, Facilities, Membership Plans, **Services** (personal training, diet plans),
Trainers, Gallery (photos, uploaded videos and YouTube links), Reviews, Announcements
(an Image URL turns an announcement into an event card), Enquiries, Config.

## Where settings live

| Setting | Place |
|---|---|
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_FOLDER` | Config tab |
| `NOTIFY_EMAIL` (who gets enquiry and review emails; commas between addresses) | Config tab |
| `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD_SALT`, `SESSION_EPOCH` | Script Properties (set by the menu) |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Script Properties (set by the menu) |
| `SEED_VERSION` | Script Properties: remembers which one-time upgrades have run |
| `SHEET_ID` (optional) | Script Properties, only if the script isn't bound to the sheet |

Never type passwords or API secrets into the sheet. Set up / repair sheets offers to
delete rows that look like secrets.

## Photos and videos (Cloudinary)

Each upload goes into its section's folder: `SSV-Gym/Home` (top and About photos),
`SSV-Gym/Facilities`, `SSV-Gym/Trainers`, `SSV-Gym/Gallery` or `SSV-Gym/Events`
(announcement photos). The admin panel can't create other folders; it can only delete
empty old ones (such as `ssv-gym`). Photos: JPG, PNG, WebP. Videos: MP4, MOV, WebM,
up to 100 MB each on the free plan. Each upload is signed by the backend, so the API
secret never reaches the browser. When a file is replaced or an item deleted, the old
file is deleted from Cloudinary if nothing else uses it.

## API

`GET ?action=content` returns everything the website shows. `GET ?action=health`
returns the version. `POST` (JSON body as text/plain) with `action`:

- Public: `submitEnquiry`, `submitReview`, `likeReview`, `login`
- Admin (with `token`): `verify`, `logout`, `adminGetAll`, `getInbox`, `saveGeneral`,
  `saveRecord`, `deleteRecord`, `reorder`, `updateEnquiryStatus`, `getUploadSignature`
  (with `kind: "video"` for videos), `mediaFolders`, `mediaLibrary`, `deleteFolder`, `deleteImages`

Responses are `{ ok: true, data }` or `{ ok: false, error, code }`.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Apps Script is not allowed to connect to Cloudinary yet" | Run SSV Admin › Set Cloudinary keys and allow access when Google asks (tick Select all) |
| An upload says "cloud_name is disabled" | Cloudinary has switched the account off. Sign in at cloudinary.com to see why (unverified email, plan limits) |
| Admin panel says the backend is older | Deploy › Manage deployments › Edit › Version: New version › Deploy |
| "Photo uploads are not set up" | Put CLOUDINARY_CLOUD_NAME in the Config tab, then Set Cloudinary keys |
| No emails arrive | Check NOTIFY_EMAIL in the Config tab and the spam folder |
| Anything else | Apps Script › Executions shows the full error |
