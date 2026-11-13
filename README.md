# wildcareproject.org

The WILD:CARE website. Plain files, no build step: what you upload is what visitors see.
Every change made through GitHub is kept as a version and can be undone.

## What is where

| Folder / file | What it is |
|---|---|
| `index.html` | Home |
| `walk/` `inspire/` `listen/` `design/` `care/` | The five dimensions |
| `method/` `pilots/` `partners/` | Information pages (contact is on `partners/`) |
| `kit/` | The Listening Kit. **Built but not linked** and hidden from search engines until release |
| `data/worksheets.js` | All 49 worksheets: titles, the one line shown on the site, players, PDF paths |
| `data/sounds.js` | The LISTEN sound map |
| `data/walks.js` | The WALK chain (empty for now) |
| `audio/listen/` `audio/walks/` | Sound files (delivered as a separate zip) |
| `assets/` | Styles, scripts, fonts (Prompt, stored here), images, Leaflet 1.9.4 |
| `assets/eu/` | Put the official EU emblem here (see below) |

## Before going live: fill the placeholders

Everything in **[square brackets]** is missing information. On GitHub, press `t`, or use the search box
of the repository with `[`, to find them. Current list:
- `partners/index.html`: three partner websites
- `pilots/index.html`: Berlin dates and places
- `walk/index.html`, `care/index.html`: opening dates, the Care contribution link
- `kit/index.html`: card deck date, WILD PROBE link
- `data/sounds.js`: a written description for every recording (required for hearing diversity)

**EU emblem.** Download the official "Co-funded by the European Union" emblem (English, PNG, horizontal)
from the European Commission's visual identity page and upload it as
`assets/eu/co-funded-by-the-eu.png`. Until then the footer shows the funding text only.

## Everyday edits (all in the browser)

Open the file on GitHub, click the pencil, change it, click **Commit changes**. The site updates in about a minute.

- **Add a walk:** upload the MP3 into `audio/walks/`, then copy one line in `data/walks.js` and change file, place and year. Walks are anonymous.
- **Add a recording to the map:** upload the MP3 into `audio/listen/`, copy one block in `data/sounds.js`, change the values.
- **English worksheet texts arrive:** replace `title_en` and `line_en` in `data/worksheets.js`. The site uses them everywhere at once.
- **Oliveros permission granted:** set `"oliveros": false` on Native and Environmental Dialogue, and add their `line_it`/`line_en`.
- Keep quotes, commas and brackets exactly as they are. If a page goes blank after an edit, the last commit broke the punctuation: open the file's **History** and restore the previous version.

## CARE (the soundscape)

- `care/corpus.json` is the list of every sound in the soundscape. The drop box adds and removes lines itself;
  you only touch it to remove a sound by hand (delete its whole `{ … }` block and the comma before it).
- `audio/care/seed/` holds the 54 starting sounds, rendered from the recordings already on the site
  (each one as texture, material and sediment). `audio/care/contributed/` fills up by itself.
- `data/care-config.js` holds the drop box address. Empty = giving is closed, the soundscape still plays.
- Setting up the drop box: see CARE-SETUP.md (delivered with the drop box code).

## Releasing the Listening Kit

1. Upload the PDFs into `kit/pdf/it/` and `kit/pdf/en/` and write their paths in `pdf_it` / `pdf_en` in `data/worksheets.js`.
2. In `index.html`, replace the "Coming soon" box with a link: `<a class="btn" href="kit/">Download the Listening Kit</a>`.
3. In `kit/index.html`, delete the line `<meta name="robots" content="noindex">`.
4. Optionally add `<a href="../kit/">Listening Kit</a>` to the navigation (it appears in every page's header).

## Publishing (first time)

1. In the project's GitHub organisation, create a public repository (for example `wildcareproject.org`).
2. **Add file → Upload files**: drag in the contents of this folder (not the folder itself), then the `audio` folder from the audio zip. GitHub's browser upload takes up to 100 files at a time and 25 MB per file; all files here are below that.
3. **Settings → Pages**: Source "Deploy from a branch", branch `main`, folder `/ (root)`. The site appears at `https://<organisation>.github.io/<repository>/`. Check every page there.

## Moving the domain (only after the check above, with Co-design Toscana's agreement)

1. **Settings → Pages → Custom domain**: type `wildcareproject.org`, save. Do this at the moment of the switch, never before (it makes GitHub redirect the test address to the domain).
2. In Aruba's DNS panel for `wildcareproject.org`, change only:
   - the `@` (apex) **A** records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - the `www` **CNAME** to `<organisation>.github.io`
   - leave every **MX** and mail-related record as it is.
3. When GitHub shows the domain as verified, tick **Enforce HTTPS**.
4. Cancel nothing at Aruba until the new site works on the domain for a few days.

## Privacy

No cookies, no analytics, no external fonts. The only external request is the OpenStreetMap map on LISTEN,
and it loads only after the visitor presses "Show the map".
