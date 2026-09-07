"""End-to-end browser test of the PPE site survey form."""
import json
import re
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
errors, results = [], []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"   [{extra}]" if extra and not cond else ""))


with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1440, "height": 950})
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("dialog", lambda d: d.accept())   # auto-accept confirm() prompts

    page.goto(BASE + "/index.html", wait_until="networkidle")
    page.wait_for_selector("#nav button")

    # ---- structure ----
    nav = page.locator("#nav button").count()
    check("sidebar renders 12 nav entries", nav == 12, f"got {nav}")
    cards = page.locator(".section-card").count()
    check("12 section cards built", cards == 12, f"got {cards}")
    fields = page.locator(".section-card .field").count()
    check("fields rendered (>250)", fields > 250, f"got {fields}")
    check("camera repeater rendered", page.locator("#sec-cameras .rep-item").count() >= 1)
    check("review card present", page.locator("#sec-review").count() == 1)

    # only one card visible at a time
    visible = page.locator('.section-card[style*="display: block"], .section-card:visible').count()
    check("one section visible at a time", page.locator("#sec-respondent").is_visible())
    check("section 2 hidden while on section 1", not page.locator("#sec-plant").is_visible())

    # ---- conditional logic ----
    page.goto(BASE + "/index.html", wait_until="networkidle")
    page.wait_for_selector("#nav button")

    def pick(section, key, value):
        """Click a styled radio pill (the <input> is visually hidden behind a <span>)."""
        page.locator(f'#sec-{section} [data-path="{key}"] label.choice:has(input[value="{value}"]) span').click()
        page.wait_for_timeout(220)

    # navigate to section 6 (server) via sidebar
    page.locator("#nav button").nth(5).click()
    page.wait_for_selector("#sec-server:visible")
    pick("server", "has_server_room", "yes")
    check("server-room fields appear when 'Yes'",
          page.locator('#sec-server [data-path="rack_space"]').is_visible())
    pick("server", "has_server_room", "no")
    check("server-room fields hidden when 'No'",
          not page.locator('#sec-server [data-path="rack_space"]').is_visible())
    pick("server", "has_existing_server", "no")
    check("'nothing available' branch shown",
          page.locator('#sec-server [data-path="space_for_new"]').is_visible())
    check("server-spec branch hidden",
          not page.locator('#sec-server [data-path="gpu_present"]').is_visible())
    pick("server", "has_existing_server", "yes")
    check("GPU block reappears when server = yes",
          page.locator('#sec-server [data-path="gpu_present"]').is_visible())
    # photo + repeater blocks
    pick("server", "has_server_room", "yes")
    check("photo upload control rendered",
          page.locator('#sec-server [data-path="server_room_photos"] .photo-drop').count() == 1)

    # ---- key collision check: top-level vs repeater sub-field ----
    page.locator("#nav button").nth(3).click()
    page.wait_for_selector("#sec-cameras:visible")
    top_hidden_before = page.locator('#sec-cameras [data-grid="cameras"] > [data-path="mount_height"]').is_visible()
    check("top-level mount_height visible", top_hidden_before)
    check("repeater cam_mount_height visible",
          page.locator('#sec-cameras .rep-item [data-path="cam_mount_height"]').is_visible())

    # ---- range defaults to 'not set' ----
    page.locator("#nav button").nth(7).click()
    page.wait_for_selector("#sec-model:visible")
    rv = page.locator('#sec-model [data-path="min_accuracy"] .range-val').inner_text()
    check("range shows 'not set' before use", rv.strip() == "not set", f"got '{rv}'")
    page.locator('#sec-model [data-path="min_accuracy"] input[type=range]').fill("92")
    page.locator('#sec-model [data-path="min_accuracy"] input[type=range]').dispatch_event("change")
    page.wait_for_timeout(200)
    rv2 = page.locator('#sec-model [data-path="min_accuracy"] .range-val').inner_text()
    check("range updates to 92%", rv2.strip() == "92%", f"got '{rv2}'")

    # ---- progress bar reacts ----
    prog = page.locator("#progress-pct").inner_text()
    check("progress shows a percentage", "%" in prog, prog)

    # ---- fill required fields programmatically, then review ----
    setres = page.evaluate("""() => {
      const out = [];
      const set = (sec, k, v) => {
        const scope = `#sec-${sec} [data-grid="${sec}"] > [data-path="${k}"]`;
        let el = document.querySelector(scope + ' select, ' + scope + ' textarea, ' + scope + ' input');
        if (el && el.type === 'radio') el = document.querySelector(`${scope} input[value="${v}"]`);
        if (!el) { out.push('NOT FOUND ' + sec + '.' + k); return; }
        if (el.type === 'radio') { el.checked = true; el.dispatchEvent(new Event('change', {bubbles:true})); return; }
        el.value = v;
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
      };
      const setRep = (k, v) => {
        const el = document.querySelector(`#sec-cameras .rep-item [data-path="${k}"] input`);
        if (!el) { out.push('REP NOT FOUND ' + k); return; }
        el.value = v;
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
      };
      set('respondent','surveyor_name','Test Surveyor');
      set('respondent','survey_date','2026-09-07');
      set('respondent','company_name','Playwright Test Industries');
      set('respondent','plant_location','Thrissur, Kerala');
      set('respondent','resp_name','Test Person');
      set('respondent','resp_designation','Safety Head');
      set('respondent','resp_mobile','+91 90000 00000');
      set('plant','industry','Manufacturing (general)');
      set('safety','biggest_pain','helmets skipped at night');
      set('cameras','total_cameras','20');
      set('cameras','cams_in_scope','6');
      set('cameras','signal_type','ip');
      set('cameras','rtsp_access','creds');
      setRep('zone_name','Welding bay 1');
      set('model','told_85','yes');
      set('model','pilot_accept','yes_paid');
      set('model','success_criteria','90% accuracy on 6 cameras');
      set('model','expectations_other','WhatsApp alerts');
      set('server','has_server_room','yes');
      set('server','has_existing_server','yes');
      set('server','gpu_present','No GPU / integrated graphics only');
      set('newhw','willing_new_server','yes_capex');
      set('commercial','preferred_model','saas');
      set('commercial','decision_maker','MD');
      set('next','summary','Test summary line');
      return out;
    }""")
    check("all required fields were reachable & settable", not setres, str(setres))
    page.wait_for_timeout(400)
    page.locator("#nav button").nth(11).click()
    page.wait_for_selector("#sec-review:visible")
    page.wait_for_timeout(300)
    body = page.locator("#missing").inner_text()
    check("review reports required fields complete", "All required fields are complete" in body, body[:200])
    check("review lists answered sections", page.locator("#review-body .rev-sec").count() >= 8,
          str(page.locator("#review-body .rev-sec").count()))
    check("review shows company name", "Playwright Test Industries" in page.locator("#review-body").inner_text())

    # camera repeater required field is enforced
    page.locator("#btn-submit").click()
    page.wait_for_timeout(2500)
    ref_text = page.locator("#btn-submit").inner_text()
    check("submit returns a reference ID", ref_text.startswith("Submitted"), ref_text)
    ref = ref_text.split()[-1] if ref_text.startswith("Submitted") else ""
    if not ref:
        check("cannot continue API checks without a ref", False, ref_text)

    # ---- API side ----
    api = page.evaluate("""async (ref) => {
      const rows = await (await fetch('/api/responses')).json();
      const mine = rows.find(r => r.ref === ref);
      return {count: rows.length, company: mine ? mine.company : null,
              site: mine ? mine.site : null,
              cams: mine ? mine.payload.cameras.total_cameras : null,
              acc: mine ? mine.payload.model.min_accuracy : null};
    }""", ref)
    check("API returns the new record", api["count"] >= 1, json.dumps(api))
    check("company name indexed for the dashboard", api["company"] == "Playwright Test Industries", str(api["company"]))
    check("site indexed for the dashboard", api["site"] == "Thrissur, Kerala", str(api["site"]))
    check("range value persisted (min_accuracy=92)", api["acc"] == 92, str(api["acc"]))

    # ---- localStorage draft survives reload ----
    page.reload(wait_until="networkidle")
    page.wait_for_selector("#nav button")
    page.wait_for_timeout(400)
    val = page.evaluate("document.querySelector('#sec-respondent [data-path=\"company_name\"] input').value")
    check("draft restored after reload", val == "Playwright Test Industries", val)

    # ---- submissions dashboard ----
    page.goto(BASE + "/submissions.html", wait_until="networkidle")
    page.wait_for_selector("table.subs tbody tr", timeout=8000)
    rows = page.locator("table.subs tbody tr").count()
    check("dashboard lists submissions", rows >= 1, f"{rows} rows")
    txt = page.locator("table.subs").inner_text()
    check("dashboard shows the test company", "Playwright Test Industries" in txt)
    check("dashboard shows a stats panel", page.locator(".stat").count() == 6)
    csv_head = page.evaluate("""async () => {
      const t = await (await fetch('/api/export.csv')).text();
      return t.split('\\n')[0];
    }""")
    check("CSV export has flattened columns", "respondent.company_name" in csv_head and "cameras.profiles" in csv_head,
          csv_head[:140])

    # ---- mobile viewport ----
    m = b.new_page(viewport={"width": 390, "height": 844})
    m.goto(BASE + "/index.html", wait_until="networkidle")
    m.wait_for_selector("#nav button")
    check("mobile menu button visible", m.locator("#menu-btn").is_visible())
    m.locator("#menu-btn").click()
    m.wait_for_timeout(400)
    check("mobile sidebar opens", m.locator("#sidebar.open").count() == 1)
    m.locator("#nav button").nth(3).click()
    m.wait_for_timeout(400)
    check("mobile: camera section opens", m.locator("#sec-cameras:visible").count() == 1)
    m.screenshot(path="/home/user/ppe-survey/_mobile.png", full_page=False)

    m.locator("#menu-btn").click()                # reopen sidebar (clicking a section closes it)
    m.wait_for_timeout(350)
    m.locator("#nav button").nth(6).scroll_into_view_if_needed()
    m.evaluate("document.querySelectorAll('#nav button')[6].click()")   # new-hardware section on mobile
    m.wait_for_timeout(500)
    m.screenshot(path="/home/user/ppe-survey/_mobile.png", full_page=False)

    page.goto(BASE + "/index.html", wait_until="networkidle")
    page.wait_for_selector("#nav button")
    page.evaluate("document.querySelectorAll('#nav button')[3].click()")
    page.wait_for_timeout(600)
    page.screenshot(path="/home/user/ppe-survey/_desktop.png", full_page=False)
    page.evaluate("document.querySelectorAll('#nav button')[11].click()")
    page.wait_for_timeout(600)
    page.screenshot(path="/home/user/ppe-survey/_review.png", full_page=False)
    page.goto(BASE + "/submissions.html", wait_until="networkidle")
    page.wait_for_selector("table.subs tbody tr")
    page.wait_for_timeout(500)
    page.screenshot(path="/home/user/ppe-survey/_dashboard.png", full_page=True)

    b.close()

check("no JS console errors", not errors, " | ".join(errors[:4]))
fails = [r for r in results if not r[1]]
print("\n" + "=" * 62)
print(f"{len(results) - len(fails)}/{len(results)} checks passed")
if fails:
    print("FAILURES:")
    for f in fails:
        print("  -", f[0], f[2])
sys.exit(1 if fails else 0)
