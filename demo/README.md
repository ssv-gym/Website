# Demo (for a portfolio)

A copy of the SSV Gym website, gallery page and admin panel that runs on sample data, to show
the project without the gym's real admin panel or data.

| File | What it is |
|---|---|
| `index.html` | The demo website (hidden from search engines) |
| `gallery.html` | The demo gallery page |
| `admin.html` | The demo admin panel. Any password works; "demo" is filled in |
| `data.js` | The sample content every visitor starts with. Edit it to change the demo |
| `api.js` | Stands in for `js/api.js`: the same functions, all inside the browser |
| `demo.css`, `demo.js` | The "Demo" note on the pages |

## How it behaves

- Every visit starts from `data.js`.
- Whatever a visitor adds, edits, reorders or deletes in the demo admin shows on the demo
  website while they move between the demo pages in the same browser tab.
- Nothing is saved anywhere. Changes are kept in that tab only (sessionStorage) and are gone
  after a refresh or when the tab is closed.
- Nothing reaches the Google Sheet, Cloudinary or Google, and no emails are sent.
- Photos uploaded in the demo are shrunk and kept in the tab. Videos can't be uploaded in the
  demo; YouTube links work (Gallery › Add by link).
- The Google rating and reviews in `data.js` are sample data in the shape the Google Places
  API returns. "See all reviews on Google" opens the gym's real Google page.

## Hosting

Put the whole project online (the demo uses `../css/`, `../js/` and `../assets/favicon.jpg`)
and link to `demo/index.html`. The demo doesn't use `js/config.js`: on a portfolio copy you
can set `API_URL` there to `""` so the real `index.html` and `admin.html` don't connect to the
gym's backend. The real website never loads anything from `demo/`.
