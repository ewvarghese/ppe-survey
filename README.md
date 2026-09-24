# AI PPE Detection — 20-question site survey

A short, mobile-friendly field survey for pre-sales visits. **Exactly 20 numbered
questions in seven short sections**, followed by review and submit. Plain-language
choices, short answers and “Not sure” responses replace the earlier long form.
Optional notes keep technical detail available without a second questionnaire.
Version 2.1 adds a **camera and network maintenance service** section with a
yearly cost calculator (quantities × unit rates typed by the surveyor).

**Survey link to share:** https://ewvarghese.github.io/ppe-survey/

**Printable checklist:** https://ewvarghese.github.io/ppe-survey/checklist.html

## Owner output data

### [Open output dashboard ↗](https://ewvarghese.github.io/ppe-survey/submissions.html)

Use this link to view submissions, export CSV, download JSON or import survey
files. The form's header, sidebar, review step and field checklist no longer link
to the dashboard, and the form no longer fetches or displays submission counts.
**The review step only lets the respondent check their answers and submit** — it
has no download, print or import controls; all output comes from this dashboard.

**On GitHub Pages, open this link in the same device/browser that holds the
records.** Submissions made on other devices do not arrive here automatically:
open the dashboard on each surveyor's device, use **Backup JSON** there, then
**Import JSON** on your own dashboard to combine the files and export CSV. If
customers fill the form on their own devices, run the optional survey server so
submissions reach you directly.

> **Link removal only — not private access.** The repository and dashboard URL
> remain public; anyone who knows the URL can open the page. It shows the records
> stored in that browser, or the shared database when using the optional survey
> server. No owner login or access restriction has been added. Genuine owner-only
> results require authenticated backend access.

## The 20 questions

| Section | # | Question |
|---|---:|---|
| Site & PPE | 1 | Which company and site are you visiting? |
| | 2 | Who did you meet? |
| | 3 | What work happens here, and what is the main safety problem? |
| | 4 | Which PPE should the AI check? |
| Cameras & network | 5 | How many cameras cover the areas to monitor? |
| | 6 | What cameras and recorder do you have? |
| | 7 | Can the cameras clearly show workers and their PPE? |
| | 8 | Can our system use the camera video? |
| Computer & hardware | 9 | Is a spare server or computer available? |
| | 10 | Where could the AI computer run? |
| | 11 | Would you buy or rent extra AI hardware if needed? |
| AI results & alerts | 12 | Have we explained the current 85% accuracy? |
| | 13 | What accuracy and false alarms would you accept? |
| | 14 | Would you try a pilot? |
| | 15 | How should alerts and reports reach your team? |
| Budget & approval | 16 | How would you like to pay? |
| | 17 | What budget is possible, and who can approve it? (budget band + approval/timeline box) |
| Camera & network service | 18 | Who maintains the cameras and network today? |
| | 19 | What ongoing camera and network service is needed, and what would it cost per year? (checklist + cost calculator) |
| Permissions & next steps | 20 | What permission has the site given, and what should happen next? (permissions + next-steps box + photos) |

The visit date is recorded automatically. Optional notes and photos belong to
these answers; they do not open additional numbered questions or a long repeatable
sub-form. Related details are captured in short summaries, **not as hundreds of
separate mandatory metrics**.

### Coverage retained

- **People and safety:** company/site, contacts, surveyor, industry, workers,
  shifts, current checks, incidents, hazards, audit requirements, PPE by zone,
  other/future AI needs and business value.
- **Cameras:** count in scope, total count in notes, IP/analogue, make/model,
  resolution, frame rate, codec, lens/night vision, recorder/software
  (DVR/NVR/VMS), storage/retention, per-zone observations, blind spots and upgrades.
- **Network:** stream access (RTSP/ONVIF), IT contact, VLAN, bandwidth,
  cabling/PoE, firewall and internet/cloud restrictions.
- **Compute:** available server/PC/edge device, CPU/RAM/storage, GPU and memory,
  OS, spare capacity, virtualisation/installation permissions, rack/power/UPS/
  cooling, constraints, and willingness to buy/rent/reuse/cloud.
- **AI and workflow:** current reported accuracy of about 85%, minimum acceptable
  performance, false alarms and missed violations, alert delay, pilot acceptance,
  scope and success criteria, alert recipients/actions, evidence, reports,
  languages, user roles and integrations.
- **Commercial:** CAPEX/OPEX, per-camera/lease options, first-year budget band,
  hardware/monthly splits, funding, approvals, decision maker, timeline, tender,
  competitors, ROI, rollout, service/SLA, maintenance, warranty and training.
- **Camera & network service (ongoing maintenance only, not installation or
  upgrades):** who maintains the CCTV and network today (AMC vendor, on-call
  vendor, in-house, nobody), current contract/vendor details and known faults,
  which services the site expects (repairs/replacements, cleaning and focus checks,
  recorder and storage upkeep, switch/cabling/PoE repairs, remote health
  monitoring, AMC) and a **yearly cost estimate calculator**.
- **Close:** separate permissions for visits, photos, testing and model
  improvement; privacy/data ownership restrictions; surveyor assessment,
  recommended configuration, estimates, blockers, next action/owner/date and photos.

### Service cost estimate — how it works and what it is not

The Q19 calculator has six lines (maintenance visits, cameras under service,
expected camera replacements, network/cabling repair call-outs, remote monitoring,
other). For each line the surveyor enters a **quantity** and a **unit rate in ₹**
taken from your own price list or a service provider's quotation. The form
multiplies each line and adds them up; a line without both numbers is left out,
never guessed. The result is saved as `service.service_estimate` with the lines,
`_total`, `_currency` and a fixed `_note` ("…not a quotation"), and is shown in the
review, the dashboard and the CSV/JSON exports. The app contains **no built-in
prices**, no taxes and no site-condition adjustments; treat every total as a
rough planning estimate, not an offer or quotation. Record where each rate came
from in the "Cost basis and quotes" note.

Guidance is optional: answer only what is known. Requested PPE types/integrations
are requirements to assess, not claims that the product supports all of them.
The 85% figure is the supplied current accuracy context, **not a guaranteed
site result or an assertion about recall**. A pilot needs agreed metrics and
site-specific testing. Fine-tuning is not a guarantee of improvement; AI does
not replace normal safety controls.

## Features kept

- Auto-saving drafts, restore after reload, 20-question progress, mobile and
  keyboard navigation (`Alt + ←/→`).
- Review of every answer (missing required items listed), submit/update with a
  reference ID. No download, print or import on the respondent's review step.
- Up to eight optional site photos in Q20; images are resized. Only attach
  images with permission.
- Dashboard with search/sort, readable answers/photos, delete, CSV export,
  individual JSON download/copy, bulk JSON backup, multi-file/backup import,
  and upload of device records to a reachable survey server.
- Both static GitHub Pages and optional Flask/SQLite modes.
- Earlier detailed submissions remain available. Opening an earlier draft
  adds short-form summaries while preserving **all original fields and photos**
  in its JSON/CSV. Viewing/importing old submissions does not rewrite them.

## Where output data goes

| Mode | How it runs | Storage |
|---|---|---|
| **GitHub Pages / static hosting** | Open the live link; no server needed | This browser only |
| **Survey server** | Run `app.py` on a controlled host | Shared SQLite database on that host |

The app probes relative `api/health`, then labels the storage mode. A missing
endpoint on a static host is expected. No respondent data is sent to GitHub or
committed to the repository. A different device/browser/origin will not have the
same local records automatically.

### GitHub Pages: get your data

On the **same device and browser** used to fill the form, open:
https://ewvarghese.github.io/ppe-survey/submissions.html

- **Export CSV**: one row per survey, with all stored answers/notes, for Excel
  or Sheets. Photos are represented by counts rather than embedded image data.
- **Download JSON** in a row: that survey, including its reference and photos.
- **Backup JSON**: every listed record and its photos in one file.
- **Import JSON**: merge individual survey files or bulk backups. Existing
  references are updated rather than duplicated.

Back up regularly from the dashboard. Clearing site data, private-browsing
sessions or a device reset can remove local drafts/submissions. Browser storage
is limited; if saving fails, remove some photos. Once loaded, device-mode
editing/submission needs no backend; a fresh page load while fully offline is
not guaranteed.

### Server mode

```bash
pip install -r requirements.txt
python3 app.py  # http://0.0.0.0:5000
```

| URL / file | Purpose |
|---|---|
| `/` | The 20-question form |
| `/submissions.html` | Dashboard and exports |
| `/api/responses` | JSON API; GET list, POST create/update |
| `/api/responses/<id>` | DELETE record |
| `/api/export.csv` | Server-side flat CSV |
| `surveys.db` | SQLite database next to `app.py` (not tracked in Git) |

Import phone JSON files into the server-hosted dashboard, then choose
**Upload device records to server**. Different origins do not share browser
storage. Server records are upserted by reference; successfully uploaded local
copies are removed, and failed uploads remain for retry.

For deployment, use a production WSGI server and HTTPS, for example gunicorn
behind Caddy/nginx. **This starter API has no authentication**: place it behind
access controls before collecting sensitive information. Do not publicly expose
an unauthenticated server containing site/contact data. Back up SQLite using its
backup tools or a consistent copy while writes are stopped.

## Publish / update GitHub Pages

This repository publishes **only `static/`** using
`.github/workflows/pages.yml` on a push to `main`.

For a new repository, enable **Settings → Pages → Source: GitHub Actions**
before the initial deployment. Then:

```bash
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

For this existing project, push the updated files to `main`; the included
workflow redeploys the same URL. There are no npm dependencies, build step,
external fonts or CDN scripts. Authenticate on your own computer with GitHub's
credential manager or CLI; do not commit credentials or survey data.

## Edit the short form

- `static/schema.js`: exactly 20 primary fields, numbered `n: 1` through `20`.
  Each field supports a plain label, choices, example, hint, optional note and
  expandable technical guidance. A field may also carry a `followup` text box
  (Q17 approval plan, Q20 next steps) or an `estimate` calculator (Q19) without
  becoming an extra numbered question. Q20 optionally attaches photos.
- `static/app.js`: generic renderer, draft storage, review and submission.
- `static/data.js`: additive compatibility mapping for earlier detailed data.
- `static/submissions.js`: shared static/server dashboard and export/import.
- `static/checklist.html`: uses the same schema so its 20 prompts stay in sync.

Bump `SURVEY_SCHEMA.version` only with an explicit migration plan. Existing
localStorage names are deliberately retained so an update does not strand drafts
or submissions. Avoid deleting or renaming data keys without a compatibility map.
Version history: v1 (long form) → v2.0 (20 questions, five sections) → v2.1
(service section; `permissions`, `next_steps` and `site_photos` moved from
`commercial` to `close`). `static/data.js` upgrades v1 and v2.0 drafts in place,
and the dashboard reads records of every version; older records simply show
"No cost estimate" for the service column.

## Tests

```bash
pip install -r requirements-dev.txt
python -m playwright install --with-deps chromium
python test_static.py    # plain static host, temporary browser storage
python test_e2e.py       # Flask with an isolated temporary DB
python test_live.py      # deployed Pages, disposable browser storage only
```

All three use `test_short_form.py`. Checks cover the exact question count,
choices, accessibility labels, optional notes/photos, auto-save/reload, honest
accuracy/consent wording, a review step without download/print/import, submit/update, dashboard, CSV/JSON
round-trips, migration of old records, device-to-server upload, mobile layout, removal of
respondent-facing dashboard links/count requests, and JavaScript exceptions. Local tests do not alter `surveys.db`. To test another
static deployment: `SURVEY_URL=https://example.com/survey/ python test_live.py`.
