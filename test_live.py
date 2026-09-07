"""Verify the deployed GitHub Pages site works end to end."""
from playwright.sync_api import sync_playwright

PORT = 5055

fails = []
def check(name, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + name + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 950})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if (m.type == "error" and "api/health" not in m.text and "Failed to load resource" not in m.text) else None)
    pg.on("dialog", lambda d: d.accept())

    pg.goto(f"https://ewvarghese.github.io/ppe-survey/index.html", wait_until="networkidle")
    pg.wait_for_selector("#nav button"); pg.wait_for_timeout(1200)

    badge = pg.locator("#mode-badge").inner_text()
    check("detects device mode on static hosting", "this device only" in badge, badge)

    # fill minimum required set
    res = pg.evaluate("""() => {
      const out = [];
      const set = (sec, k, v) => {
        const scope = `#sec-${sec} [data-grid="${sec}"] > [data-path="${k}"]`;
        let el = document.querySelector(scope + ' select, ' + scope + ' textarea, ' + scope + ' input');
        if (el && el.type === 'radio') el = document.querySelector(`${scope} input[value="${v}"]`);
        if (!el) { out.push('MISS ' + sec + '.' + k); return; }
        if (el.type === 'radio') { el.checked = true; el.dispatchEvent(new Event('change', {bubbles:true})); return; }
        el.value = v;
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
      };
      set('respondent','surveyor_name','Pages Surveyor');
      set('respondent','survey_date','2026-09-07');
      set('respondent','company_name','Static Host Industries');
      set('respondent','plant_location','Kochi, Kerala');
      set('respondent','resp_name','A'); set('respondent','resp_designation','B'); set('respondent','resp_mobile','1');
      set('plant','industry','Manufacturing (general)');
      set('safety','biggest_pain','x');
      set('cameras','total_cameras','10'); set('cameras','cams_in_scope','4'); set('cameras','rtsp_access','yes');
      setRepZone();
      function setRepZone(){ const el = document.querySelector('#sec-cameras .rep-item [data-path="zone_name"] input');
        el.value='Gate'; el.dispatchEvent(new Event('input',{bubbles:true})); }
      set('server','has_server_room','no'); set('server','has_existing_server','no');
      set('model','told_85','yes'); set('model','pilot_accept','yes_paid');
      set('model','success_criteria','y'); set('model','expectations_other','z');
      set('newhw','willing_new_server','yes_lease');
      set('commercial','preferred_model','percam'); set('commercial','decision_maker','MD');
      set('next','summary','static mode test');
      return out;
    }""")
    check("required fields settable in static mode", not res, str(res))

    pg.evaluate("document.querySelectorAll('#nav button')[11].click()")
    pg.wait_for_selector("#sec-review:visible"); pg.wait_for_timeout(300)
    pg.locator("#btn-submit").click()
    pg.wait_for_timeout(900)
    btn = pg.locator("#btn-submit").inner_text()
    check("submit works with no server (device store)", btn.startswith("Submitted"), btn)

    stored = pg.evaluate("JSON.parse(localStorage.getItem('ppe_survey_submissions_v1') || '[]').length")
    check("submission persisted to localStorage", stored == 1, str(stored))

    # dashboard in device mode
    pg.goto(f"https://ewvarghese.github.io/ppe-survey/submissions.html", wait_until="networkidle")
    pg.wait_for_timeout(1200)
    pill = pg.locator("#mode-pill").inner_text()
    check("dashboard shows DEVICE MODE", pill == "DEVICE MODE", pill)
    pg.wait_for_selector("table.subs tbody tr", timeout=6000)
    txt = pg.locator("table.subs").inner_text()
    check("dashboard lists the device submission", "Static Host Industries" in txt)

    # client-side CSV export produces a download
    with pg.expect_download() as dinfo:
        pg.locator("#btn-csv").click()
    d = dinfo.value
    path = "/tmp/static_export.csv"
    d.save_as(path)
    head = open(path).read().split("\r\n")[0]
    check("client CSV has flattened headers", "respondent.company_name" in head and "_reference_id" in head, head[:120])

    # import that JSON back (round trip)
    pg.locator("#btn-refresh").click(); pg.wait_for_timeout(400)
    check("no JS errors in static mode", not errs, " | ".join(errs[:3]))
    b.close()

print("\n" + ("ALL STATIC-MODE CHECKS PASSED" if not fails else f"FAILURES: {fails}"))
sys.exit(1 if fails else 0)
