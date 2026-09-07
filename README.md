# Industrial Site Survey — AI PPE Detection

A field-survey web app for pre-sales / technical site visits at factories.
It captures **camera infrastructure, network & server readiness, willingness to
invest in new hardware, and what the customer expects from the AI model**
(current model accuracy: ~85%), then stores every survey and exports it to CSV.

**Runs in two modes, from the same code:**

| Mode | How | Where submissions live |
|---|---|---|
| **GitHub Pages / any static host** | push this repo, Actions publishes `static/` | each device's browser (export/import JSON to sync) |
| **Survey server** | `python3 app.py` on any VPS / office machine | shared SQLite DB + one-click CSV |

The form probes `api/health` on load: if a survey server answers, it uses it;
otherwise it silently switches to on-device storage. The dashboard shows
**SERVER MODE** or **DEVICE MODE** accordingly, merges device-only imports,
and can upload them to the server when one is reachable.

---

## Run it directly from GitHub (no server at all)

1. Create an empty repository on GitHub (no README needed).
2. Push this folder:
   ```bash
   git remote add origin https://github.com/<your-org>/<your-repo>.git
   git push -u origin main
   ```
3. The included workflow `.github/workflows/pages.yml` publishes the `static/
   folder to **GitHub Pages** automatically (Settings → Pages will show
   "GitHub Actions" as the source after the first run).
4. Open `https://<your-org>.github.io/<your-repo>/` on any phone or laptop.
   This project is live at **https://ewvarghese.github.io/ppe-survey/**

In Pages mode every submission is stored in that browser only — perfect for
field work with no infrastructure. Back at the office: open the dashboard on
the same device and **Export CSV**, or **Import JSON** files copied from
surveyors' phones. If you later run `app.py` on a server, the dashboard's
**Upload device records to server** button syncs everything up.

## Run the survey-server version

```bash
pip install flask
python3 app.py            # serves on http://0.0.0.0:5000
```

Same repository, same UI — but now submissions from every device collect in
`surveys.db` and `/api/export.csv` gives one flat row per survey.
For a VPS: put it behind nginx/caddy with TLS, or run with
`gunicorn -b 0.0.0.0:5000 app:app`.

Open `http://localhost:5000` (or the preview URL). No build step, no internet
needed at run time — the form works on a phone in a factory with patchy signal:
drafts auto-save in the browser and can be exported as a JSON file and imported
later on an office machine.

| URL | What it is |
|---|---|
| `/` (index.html) | The survey form (12 steps) |
| `/submissions.html` | Dashboard of submitted surveys + CSV export |
| `/api/responses` | JSON API (GET list, POST submit, DELETE by id) |
| `/api/export.csv` | One flat CSV row per survey, for Excel / Sheets |

Data lives in `surveys.db` (SQLite, next to `app.py`). Back it up by copying
that file. Photos taken on site are embedded in each record (resized to
~1100 px JPEG), so the DB grows by roughly 100–300 KB per photo.

---

## The 12 sections

1. **Respondent & company** – who you spoke to, who decides, contact details
2. **Plant profile** – industry, shifts, headcount, hazards, site constraints
3. **Safety & PPE context** – violations/month, accidents, standards, pain point
4. **Camera infrastructure** – counts, IP vs analogue, resolution/FPS/codec,
   lighting, RTSP access, plus a **per-zone camera profile** (up to 8 zones)
   with photos of the live view
5. **VMS, network & security** – NVR/VMS, retention, storage, VLAN, bandwidth,
   cybersecurity policy
6. **Existing server & compute** – server room (rack/power/cooling/UPS),
   existing server spec (CPU, RAM, storage, **GPU**, OS, virtualisation)
7. **New server & investment** – willing to buy / lease / edge / cloud / reuse,
   budget band, who pays, mandatory IT requirements
8. **Model & accuracy expectations** – states our 85% accuracy, captures their
   minimum acceptable accuracy, false-alarm tolerance, alert latency, pilot
   acceptance and success criteria
9. **Alerts, workflow & integration** – channels, recipients, reports, evidence,
   integrations
10. **Commercial & pricing** – payment model, budget, approval route, tender,
    competitors, timeline, ROI drivers, support SLA, objections, buying intent
11. **Assessment & next steps** – your scores (video / server / network / fit),
    priority, recommended configuration, estimated project value, consents
12. **Review & submit** – full read-back, submit, print/PDF, JSON download/import

---

## How to edit the questions

Everything is data in **`static/schema.js`**. Add a field like:

```js
{ k: "my_field", t: "select", l: "Question text", r: true,   // r = required
  o: ["Option A", "Option B"],                               // or [{id, label, sub}]
  span: 2,                                                   // full width
  hint: "Grey guidance under the question",
  showIf: { p: "server.has_server_room", in: ["yes", "partial"] } }  // conditional
```

Field types: `text`, `textarea`, `number` (with `unit`), `tel`, `email`,
`date`, `time`, `select`, `choice` (radio pills), `checks` (multi-select),
`range` (slider), `photo` (camera capture, stored in the record),
`repeater` (repeatable sub-form — used for camera profiles).

The `showIf` rule reads any other field by `"section.key"` path with
`equals`, `notEquals`, `in`, `notIn`, `filled`, `empty`.

---

## Tests

Both modes are covered by real-browser (Playwright) suites:

```bash
pip install playwright && playwright install chromium
python3 test_e2e.py        # 36 checks against the Flask server mode
python3 test_static.py     # 8 checks against a plain static file server
                           # (exactly what GitHub Pages provides)
python3 test_live.py       # same 8 checks against the deployed Pages site
```
