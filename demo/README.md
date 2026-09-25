# Demo

A separate copy of the website and admin panel that runs on sample data, for showing
the site before the real content is ready.

- `demo/index.html`: the demo website (hidden from search engines)
- `demo/admin.html`: the demo admin panel. **Any password works.**

Everything is stored in your own browser (localStorage). The demo never touches the
real Google Sheet or Cloudinary. The demo website and demo admin share the same data,
so changes made in the demo admin show on the demo website. Uploaded photos are kept
as small copies in the browser.

The **Reset** button on both pages restores the sample data.

The real website never loads any demo files. To remove the demo, delete the `demo/`
folder.
