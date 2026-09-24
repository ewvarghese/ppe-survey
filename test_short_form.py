"""Browser regression checks shared by server, static and live Pages tests.
Local runs use temporary storage; they never alter the project's surveys.db.
Live Pages tests only create data inside a disposable browser profile.
"""
from __future__ import annotations
import base64
import csv
import functools
import http.server
import io
import json
from pathlib import Path
import tempfile
import threading
from contextlib import contextmanager
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
PIXEL = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6HXsAAAAASUVORK5CYII=")
PHOTO = "data:image/png;base64," + base64.b64encode(PIXEL).decode()
LS = "ppe_survey_submissions_v1"
DRAFT = "ppe_survey_draft_v1"

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

@contextmanager
def site(mode, url=None):
    if url:
        yield url.rstrip("/") + "/"
        return
    with tempfile.TemporaryDirectory() as folder:
        if mode == "server":
            import app as module
            from werkzeug.serving import make_server, WSGIRequestHandler
            class QuietWSGI(WSGIRequestHandler):
                def log(self, *_):
                    pass
            module.DB_PATH = str(Path(folder) / "test.db")
            module.init_db()
            server = make_server("127.0.0.1", 0, module.app, threaded=True, request_handler=QuietWSGI)
        else:
            handler = functools.partial(QuietHandler, directory=str(ROOT / "static"))
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}/"
        finally:
            server.shutdown()
            thread.join()
            server.server_close()

LEGACY = {
    "meta": {"form_version": "1.0", "ref": "SUR-LEGACY-COMPAT", "saved_at": "2026-09-01T10:00:00Z"},
    "respondent": {"company_name": "Earlier Survey Industries", "plant_location": "Thrissur", "surveyor_name": "Ravi", "survey_date": "2026-09-01", "resp_name": "Anu", "resp_mobile": "0000000000", "resp_designation": "Safety Head"},
    "plant": {"industry": "Manufacturing (general)", "max_per_shift": 120, "shifts": "2 shifts"},
    "safety": {"ppe_items_needed": ["Helmet / hard hat", "Safety shoes"], "biggest_pain": "Repeat helmet violations", "violations_per_month": 23, "standards": ["ISO 45001"]},
    "cameras": {"total_cameras": 20, "cams_in_scope": 4, "signal_type": "ip", "rtsp_access": "approval", "camera_makes": "Axis", "profiles": [{"zone_name": "Welding", "resolution": "4 MP", "sample_photos": [PHOTO], "zone_notes": "Keep all these original fields"}]},
    "video": {"vms_type": "Milestone XProtect", "retention_days": "30 days", "bandwidth_available": "1 Gbps or more", "cyber_notes": "No cloud"},
    "server": {"has_server_room": "yes", "has_existing_server": "yes", "gpu_present": "NVIDIA RTX 4060", "ram_gb": 32, "cpu_model": "Xeon", "server_room_photos": [PHOTO]},
    "newhw": {"willing_new_server": "yes_lease", "hw_budget": "₹1 - 3 lakh", "it_requirements": ["Must run fully on-premise (no cloud)"]},
    "model": {"told_85": "yes", "min_accuracy": 92, "max_false_alarms": "Under 5 per camera per shift", "pilot_accept": "yes_paid", "pilot_duration": "30 days", "success_criteria": "Test at night too", "data_use_consent": "Not sure"},
    "alerts": {"alert_channels": ["Email", "Live dashboard in control room"], "integrations": ["ERP (SAP, Oracle, etc.)"], "language_ui": "Malayalam"},
    "commercial": {"preferred_model": "capex", "total_budget": "₹3 - 5 lakh", "decision_maker": "Meera, MD", "timeline": "1 - 3 months", "buying_signals": 8, "support_expect": ["Onsite training for our team"]},
    "next": {"consent_visit": "yes", "consent_photos": "yes", "consent_footage": "yes", "summary": "Keep the full assessment", "fit_score": 7, "site_photos": [PHOTO]},
    "custom_earlier_section": {"must_survive": "Original information"},
}

ANSWERS = {
    1: 'QA Industries <b>literal text</b> — Kochi',
    2: 'Anu, EHS Manager — anu@example.invalid. Surveyor: Ravi.',
    3: 'Metal work, 80 people, two shifts. Manual checks; helmets often missed.',
    4: ['Helmets', 'Safety shoes'],
    5: '6',
    6: '20 IP cameras, 4 MP, 15 FPS, H.265.\nRecorder: "NVR", 32 channels; 30 days.',
    7: ['Clear in daytime', 'Poor light / glare'],
    8: 'yes', 9: 'pc', 10: 'yes', 11: 'yes_lease', 12: 'yes',
    13: '90% minimum on agreed test; ≤5 false alarms per camera per shift; alerts within 10 seconds.',
    14: 'yes_paid', 15: ['Live dashboard', 'Email'], 16: 'saas', 17: '₹1–3 lakh',
    18: 'Meera, Plant Head; MD approval needed. Start in 1–3 months.',
    19: ['Site photos approved', 'Recorded video testing approved'],
    20: 'Ravi to arrange a demo by Friday. IT to confirm GPU. Next-day support and operator training needed.',
}
NOTES = {
    4: 'Helmet at the gate; shoes in the workshop.',
    7: 'Move one camera lower in the welding bay.',
    8: '1 Gbps VLAN; RTSP allowed. No cloud.',
    9: 'i7, 32 GB RAM, RTX 4060 8 GB, 1 TB SSD, Ubuntu 24.04.',
    10: 'Rack, AC and 3 kVA UPS available.',
    11: 'Only after the pilot.',
    14: '2 cameras for 30 days; meet the targets above.',
    15: 'Supervisor acts on email; daily Excel report; keep evidence for 30 days.',
    17: 'Hardware ₹2 lakh; software ₹10,000/month. Approval pending.',
    19: 'Testing only; no training permission. NDA and deletion after 30 days.',
}

def run(mode="static", url=None):
    count = 0
    def check(name, condition):
        nonlocal count
        assert condition, name
        count += 1
        print("PASS ", name, flush=True)

    with site(mode, url) as base, tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
        browser = pw.chromium.launch()
        context = browser.new_context(viewport={"width": 1365, "height": 950}, accept_downloads=True)
        pg = context.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("dialog", lambda d: d.accept())
        pg.goto(base, wait_until="networkidle")
        pg.wait_for_selector("[data-question]")
        expected_mode = "survey server" if mode == "server" else "this device only"
        check("correct storage mode", expected_mode in pg.locator("#mode-badge").inner_text())
        schema = pg.evaluate("window.SURVEY_SCHEMA")
        fields = [(s["id"], f) for s in schema["sections"] for f in s["fields"]]
        check("exactly 20 schema questions numbered 1–20", len(fields) == 20 and [f["n"] for _, f in fields] == list(range(1, 21)))
        check("exactly 20 visible-question containers, no repeated sub-questionnaire", pg.locator("[data-question]").count() == 20 and pg.locator(".rep-item").count() == 0)
        check("five short sections plus review", pg.locator("#nav button").count() == 6)
        check("fresh progress starts at zero", pg.locator("#progress-pct").inner_text() == "0 / 20 answered")
        check("text labels are connected to inputs", pg.locator('[name="respondent.company_name"]').get_attribute("id") == pg.locator("#question-1 > label").get_attribute("for"))

        for i, section in enumerate(schema["sections"]):
            if section.get("special"):
                continue
            pg.locator("#nav button").nth(i).click()
            for f in section["fields"]:
                q = pg.locator(f'#question-{f["n"]}')
                value = ANSWERS[f["n"]]
                if f["t"] == "choice":
                    q.locator(f'label.choice:has(input[value="{value}"])').click()
                elif f["t"] == "checks":
                    for item in value:
                        q.get_by_label(item, exact=True).check()
                elif f["t"] == "select":
                    q.locator(":scope > select").select_option(value)
                else:
                    q.locator(":scope > input, :scope > textarea").fill(value)
                if f["n"] in NOTES:
                    details = q.locator("details.answer-note").first
                    details.locator("summary").click()
                    details.locator("textarea").fill(NOTES[f["n"]])
            if i == 0:
                q = pg.locator("#question-4")
                q.get_by_label("Not sure", exact=True).check()
                check("Not sure cannot conflict with PPE selections", q.locator("input:checked").count() == 1)
                q.get_by_label("Helmets", exact=True).check()
                check("a real PPE choice clears Not sure", not q.get_by_label("Not sure", exact=True).is_checked())
                q.get_by_label("Safety shoes", exact=True).check()

        # Photos belong to Q20, not a 21st question.
        photo = pg.locator('#question-20 details.answer-note')
        photo.locator('summary').click()
        photo.locator('input[type="file"]').set_input_files({"name": "approved-site.png", "mimeType": "image/png", "buffer": PIXEL})
        pg.wait_for_selector('#question-20 .thumb img')
        check("photo attachment works without adding a question", pg.locator("[data-question]").count() == 20)
        pg.wait_for_timeout(650)
        check("all 20 answers counted", pg.locator("#progress-pct").inner_text() == "20 / 20 answered")
        draft = pg.evaluate(f"JSON.parse(localStorage.getItem('{DRAFT}'))")
        check("auto-save uses schema v2", draft["meta"]["form_version"] == "2.0")
        check("camera specs and GPU detail saved", 'H.265' in draft['cameras']['setup_summary'] and 'RTX 4060' in draft['server']['has_existing_server_notes'])
        check("consent does not imply permission to train", 'Video use for model improvement approved' not in draft['commercial']['permissions'])
        pg.reload(wait_until="networkidle")
        check("answers and notes survive reload", pg.locator('[name="respondent.company_name"]').input_value() == ANSWERS[1] and pg.locator('[name="server.has_existing_server_notes"]').input_value() == NOTES[9])
        check("photo survives reload", pg.locator('#question-20 .thumb').count() == 1)
        pg.locator("#nav button").last.click()
        check("review has no missing required questions", 'All required fields are complete' in pg.locator('#missing').inner_text())
        check("review shows human-readable choices and optional notes", 'Monthly / yearly subscription (OPEX)' in pg.locator('#review-body').inner_text() and 'RTX 4060' in pg.locator('#review-body').inner_text())
        check("review tells the truth about storage", ('shared survey server' if mode == 'server' else 'only in this browser') in pg.locator('#review-storage').inner_text())

        def download_json(selector, filename):
            with pg.expect_download() as info:
                pg.locator(selector).click()
            path = Path(tmp) / filename
            info.value.save_as(path)
            return json.loads(path.read_text())

        saved = download_json('#btn-download-json', 'draft.json')
        check("JSON export keeps multiline answers and photos", saved['cameras']['setup_summary'] == ANSWERS[6] and len(saved['commercial']['site_photos']) == 1)
        pg.evaluate("window.print = () => { window.__printReview = document.body.classList.contains('printing-survey') && document.querySelector('#sec-review').style.display !== 'none'; }")
        pg.locator('#btn-print').click()
        check("print/PDF action uses the answer review", pg.evaluate('window.__printReview === true'))
        check("a real PDF can be generated", pg.pdf().startswith(b'%PDF'))
        pg.locator('#btn-submit').click()
        pg.wait_for_function("document.querySelector('#btn-submit').textContent.startsWith('Submitted')")
        ref = pg.evaluate(f"JSON.parse(localStorage.getItem('{DRAFT}')).meta.ref")
        check("submission receives a reference", ref.startswith('SUR-'))
        records = pg.request.get(base + 'api/responses').json() if mode == 'server' else pg.evaluate(f"JSON.parse(localStorage.getItem('{LS}'))")
        check("submission saved once with reference inside JSON", len(records) == 1 and records[0]['payload']['meta']['ref'] == ref)

        pg.goto(base, wait_until='networkidle')
        pg.locator('[name="respondent.company_name"]').fill(ANSWERS[1] + ' updated')
        pg.locator('#nav button').last.click()
        pg.locator('#btn-submit').click()
        pg.wait_for_function("document.querySelector('#btn-submit').textContent.startsWith('Submitted')")
        records = pg.request.get(base + 'api/responses').json() if mode == 'server' else pg.evaluate(f"JSON.parse(localStorage.getItem('{LS}'))")
        check("editing updates the same survey, not a duplicate", len(records) == 1 and records[0]['ref'] == ref and records[0]['payload']['respondent']['company_name'].endswith('updated'))

        pg.goto(base + 'submissions.html', wait_until='networkidle')
        pg.wait_for_selector('table.subs tbody tr')
        check("dashboard mode is correct", pg.locator('#mode-pill').inner_text() == ('SERVER MODE' if mode == 'server' else 'DEVICE MODE'))
        check("dashboard shows short-form hardware, pilot and payment answers", all(s in pg.locator('#table').inner_text() for s in ['Rent / pay monthly', 'Yes — paid pilot', '₹1–3 lakh', 'Monthly / yearly subscription']))
        check("company HTML is safely treated as text", '<b>literal text</b>' in pg.locator('#table').inner_text() and pg.locator('#table b b').count() == 0)
        pg.locator('#q').fill('not-present')
        check("dashboard search filters rows", pg.locator('tbody tr').count() == 0)
        pg.locator('#q').fill('QA Industries')
        check("dashboard search finds the survey", pg.locator('tbody tr').count() == 1)
        pg.locator('#q').fill('')
        pg.locator('[data-detail] summary').click()
        pg.wait_for_selector('.answer-detail')
        check("dashboard provides all 20 readable answers", pg.locator('.answer-detail b').count() == 21)  # 20 + photo heading
        exported = download_json('[data-dl]', 'submitted.json')
        check("downloaded JSON includes the saved reference", exported['meta']['ref'] == ref)
        with pg.expect_download() as info:
            pg.locator('#btn-csv').click()
        path = Path(tmp) / 'export.csv'; info.value.save_as(path)
        data = list(csv.DictReader(io.StringIO(path.read_text(encoding='utf-8-sig'))))
        check("CSV is Excel-readable with Unicode and one row", len(data) == 1 and data[0]['commercial.total_budget'] == '₹1–3 lakh')
        check("CSV preserves camera detail, notes and reference", data[0]['cameras.setup_summary'] == ANSWERS[6] and data[0]['server.has_existing_server_notes'] == NOTES[9] and data[0]['_reference_id'] == ref)
        check("CSV summarises images instead of base64", data[0]['commercial.site_photos'] == '1 photo(s)' and 'data:image/' not in path.read_text())
        backup = download_json('#btn-backup', 'backup.json')
        check("bulk JSON backup includes complete answers/photos", len(backup['surveys']) == 1 and len(backup['surveys'][0]['commercial']['site_photos']) == 1)

        # JSON backups and earlier long-form records can be safely merged.
        legacy_file = Path(tmp) / 'earlier.json'; legacy_file.write_text(json.dumps(LEGACY))
        pg.locator('#btn-import').set_input_files([str(legacy_file), str(Path(tmp) / 'backup.json')])
        pg.wait_for_function("document.querySelectorAll('table.subs tbody tr').length === 2")
        check("old and new surveys can be imported together", pg.locator('tbody tr').count() == 2)
        pg.locator('#btn-import').set_input_files(str(legacy_file))
        pg.wait_for_timeout(400)
        check("re-import by reference does not duplicate", pg.locator('tbody tr').count() == 2)
        raw = pg.evaluate(f"JSON.parse(localStorage.getItem('{LS}')).find(r=>r.ref==='SUR-LEGACY-COMPAT').payload")
        check("dashboard leaves legacy fields and photos untouched", raw == LEGACY)
        check("legacy hardware and camera answers still displayed", 'Earlier Survey Industries' in pg.locator('#table').inner_text() and 'Rent / pay monthly' in pg.locator('#table').inner_text())
        invalid_file = Path(tmp) / 'invalid.json'; invalid_file.write_text('{"not_a_survey": true}')
        pg.locator('#btn-import').set_input_files(str(invalid_file))
        pg.wait_for_timeout(400)
        check("invalid JSON payload does not become a survey", pg.locator('tbody tr').count() == 2)
        if mode == 'server':
            pg.locator('#btn-upload').click()
            pg.wait_for_function("localStorage.getItem('ppe_survey_submissions_v1') === '[]'")
            check("device imports upload to the server without duplicates", len(pg.request.get(base+'api/responses').json()) == 2)
            api_csv = pg.request.get(base+'api/export.csv').text()
            check("server CSV still supports old and new fields", 'custom_earlier_section.must_survive' in api_csv and 'commercial.next_steps' in api_csv)

        # Migration when opening an old saved draft is additive, not destructive.
        pg.goto(base, wait_until='networkidle')
        pg.locator('#nav button').last.click()
        pg.locator('#btn-import').set_input_files(str(legacy_file))
        pg.wait_for_function("document.querySelector('[name=\"respondent.company_name\"]').value === 'Earlier Survey Industries'")
        pg.wait_for_timeout(600)
        migrated = pg.evaluate(f"JSON.parse(localStorage.getItem('{DRAFT}'))")
        check("earlier draft becomes the 20-question form", pg.locator('[data-question]').count() == 20 and migrated['meta']['form_version'] == '2.0')
        check("migration retains original sections and zone photos", migrated['safety'] == LEGACY['safety'] and migrated['cameras']['profiles'] == LEGACY['cameras']['profiles'] and migrated['custom_earlier_section'] == LEGACY['custom_earlier_section'])
        check("migration maps accuracy, compute and new-hardware willingness", '92' in migrated['model']['acceptance_targets'] and 'RTX 4060' in migrated['server']['has_existing_server_notes'] and migrated['server']['willing_new_server'] == 'yes_lease')
        check("migration never invents training consent", 'Video use for model improvement approved' not in migrated['commercial']['permissions'])
        pg.locator('#nav button').last.click()
        migrated_export = download_json('#btn-download-json', 'migrated.json')
        check("legacy raw data remains in downloadable output", migrated_export['cameras']['profiles'] == LEGACY['cameras']['profiles'] and migrated_export['next']['fit_score'] == 7)
        pg.locator('#btn-new').click()
        check("new survey resets only the draft", pg.locator('[name="respondent.company_name"]').input_value() == '' and pg.locator('#progress-pct').inner_text() == '0 / 20 answered')
        pg.goto(base+'submissions.html', wait_until='networkidle')
        check("new survey does not delete earlier submissions", pg.locator('tbody tr').count() == 2)

        pg.goto(base, wait_until='networkidle')
        pg.set_viewport_size({'width':390, 'height':844})
        pg.wait_for_timeout(300)
        check("mobile layout has no horizontal overflow", pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        pg.locator('#menu-btn').click()
        pg.locator('#nav button').nth(3).click()
        check("mobile navigation opens AI expectations", pg.locator('#sec-model').is_visible() and not pg.locator('#sidebar').evaluate("e=>e.classList.contains('open')"))
        check("85% limitation is prominent", '85%' in pg.locator('#sec-model .callout').inner_text() and 'not guaranteed' in pg.locator('#sec-model .callout').inner_text())
        pg.keyboard.press('Alt+ArrowRight')
        check("keyboard navigation still works", pg.locator('#sec-commercial').is_visible())
        pg.goto(base+'checklist.html', wait_until='networkidle')
        check("field checklist has the same 20 questions", pg.locator('.item').count() == 20)
        check("no JavaScript exceptions", not errors)
        browser.close()
    print(f'\nALL {count} {mode.upper()} CHECKS PASSED', flush=True)
    return count

if __name__ == '__main__':
    run()
