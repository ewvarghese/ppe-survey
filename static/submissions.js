/* Dashboard for short-form and earlier detailed surveys. Static-host compatible. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const { migrate, valid, empty, answerLabel } = window.SurveyData;
  const LS_SUBS = "ppe_survey_submissions_v1";
  let ROWS = [], SERVER = null;
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const n = (v) => empty(v) || !Number.isFinite(Number(v)) ? null : Number(v);
  const label = (sec, key, v) => answerLabel(window.SURVEY_SCHEMA.sections.find((s) => s.id === sec)?.fields.find((f) => f.k === key) || {}, v) || "—";
  function toast(m, kind) { const t = $("#toast"); t.textContent = m; t.className = "toast show " + (kind || ""); clearTimeout(t._timer); t._timer = setTimeout(() => t.className = "toast", 3500); }
  function dl(name, text, type = "application/json") {
    const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function localSubs() { try { const a = JSON.parse(localStorage.getItem(LS_SUBS) || "[]"); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function localSubsSave(a) { localStorage.setItem(LS_SUBS, JSON.stringify(a)); }
  function payloadCopy(r) { return { ...r.payload, meta: { ...(r.payload.meta || {}), ref: r.ref } }; }
  function summarise(r) {
    const original = r.payload || {};
    const p = migrate(original);
    return {
      ...r, deviceOnly: !!r.device_only, view: p,
      company: p.respondent?.company_name || r.company || "—",
      site: p.respondent?.plant_location || r.site || "",
      contact: p.respondent?.contact_details || "",
      scopeCams: n(p.cameras?.cams_in_scope),
      cameras: p.cameras?.cams_in_scope ?? "—",
      existing: label("server", "has_existing_server", p.server?.has_existing_server),
      willingId: p.server?.willing_new_server || "",
      willing: label("server", "willing_new_server", p.server?.willing_new_server),
      pilotId: p.model?.pilot_accept || "",
      pilot: label("model", "pilot_accept", p.model?.pilot_accept),
      targets: p.model?.acceptance_targets || "",
      budget: p.commercial?.total_budget || "—",
      payment: label("commercial", "preferred_model", p.commercial?.preferred_model),
      decision: p.commercial?.decision_plan || "",
      next: p.close?.next_steps || "",
      serviceNow: label("service", "service_arrangement", p.service?.service_arrangement),
      serviceNeeds: Array.isArray(p.service?.service_needs) ? p.service.service_needs.join(", ") : "",
      serviceCost: n(p.service?.service_estimate?._total),
      intent: n(original.commercial?.buying_signals),
      date: p.respondent?.survey_date || p.meta?.survey_date || (r.created_at || "").slice(0, 10),
      legacy: original.meta?.form_version !== window.SURVEY_SCHEMA.version,
    };
  }
  // Keep original field names and all earlier detailed answers in CSV.
  function flatten(payload) {
    const row = {};
    const walk = (obj, prefix) => {
      if (Array.isArray(obj)) {
        if (obj.length && obj.every((x) => typeof x === "string" && x.startsWith("data:image"))) { row[prefix.slice(0, -1)] = obj.length + " photo(s)"; return; }
        row[prefix.slice(0, -1)] = obj.map((item) => item && typeof item === "object"
          ? Object.entries(item).filter(([, v]) => v !== "" && v != null && typeof v !== "object").map(([k, v]) => `${k}=${v}`).join("; ")
          : String(item)).join(" | ");
      } else if (obj && typeof obj === "object") {
        Object.entries(obj).forEach(([k, v]) => walk(v, prefix + k + "."));
      } else row[prefix.slice(0, -1)] = typeof obj === "boolean" ? (obj ? "Yes" : "No") : obj;
    };
    walk(payload, ""); return row;
  }
  function exportCSV() {
    const flat = ROWS.map((r) => ({ ...flatten(payloadCopy(r)), _reference_id: r.ref, _submitted_at: r.created_at || "", _stored: r.deviceOnly ? "this device only" : "server" }));
    const headers = ["_reference_id", "_submitted_at"], seen = new Set(headers);
    flat.forEach((r) => Object.keys(r).forEach((k) => { if (!seen.has(k)) { seen.add(k); headers.push(k); } }));
    const cell = (v) => {
      let s = v == null ? "" : String(v);
      if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula safety
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [headers.map(cell).join(","), ...flat.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\r\n");
    dl(`ppe-survey-export-${new Date().toISOString().slice(0, 10)}.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8");
    toast(`Exported ${ROWS.length} survey(s).`, "ok");
  }
  function renderStats() {
    const willing = ROWS.filter((r) => ["yes_capex", "yes_lease", "yes_edge", "cloud", "maybe"].includes(r.willingId)).length;
    const pilots = ROWS.filter((r) => ["yes_paid", "yes_free"].includes(r.pilotId)).length;
    const cams = ROWS.reduce((sum, r) => sum + (r.scopeCams || 0), 0);
    const serviceEstimates = ROWS.filter((r) => r.serviceCost != null);
    const serviceTotal = serviceEstimates.reduce((sum, r) => sum + r.serviceCost, 0);
    const stats = [["Surveys", ROWS.length], ["Cameras (known count)", cams], ["Open to extra hardware", willing], ["Open to a pilot", pilots],
      ["Service estimates entered", serviceEstimates.length], ["Estimated yearly service (sum)", serviceEstimates.length ? "₹" + serviceTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"],
      ["On this device only", ROWS.filter((r) => r.deviceOnly).length]];
    $("#stats").innerHTML = stats.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join("");
  }
  function detail(r) {
    const p = r.view;
    const html = [];
    for (const sec of window.SURVEY_SCHEMA.sections) for (const f of sec.fields) {
      const v = p[sec.id]?.[f.k], note = p[sec.id]?.[f.k + "_notes"];
      const follow = f.followup ? p[sec.id]?.[f.followup.k] : "";
      const estimate = f.estimate ? window.SurveyData.describeEstimate(f.estimate, p[sec.id]?.[f.estimate.k]) : "";
      if (empty(v) && empty(note) && empty(follow) && empty(estimate)) continue;
      html.push(`<div class="answer-detail"><b>${f.n}. ${esc(f.l)}</b>${!empty(v) ? `<p>${esc(answerLabel(f, v))}</p>` : ""}${!empty(follow) ? `<p><b>${esc(f.followup.l)}</b>${esc(follow)}</p>` : ""}${!empty(estimate) ? `<p class="note">${esc(estimate)}</p>` : ""}${!empty(note) ? `<p class="note">${esc(note)}</p>` : ""}</div>`);
    }
    const photos = new Set();
    const findPhotos = (o) => {
      if (typeof o === "string" && /^data:image\/(jpeg|png|webp|gif);base64,/.test(o)) photos.add(o);
      else if (o && typeof o === "object") Object.values(o).forEach(findPhotos);
    };
    findPhotos(r.payload);
    if (photos.size) html.push(`<div class="answer-detail"><b>Attached photos (${photos.size})</b><div class="thumbs">${[...photos].map((src) => `<span class="thumb"><img src="${esc(src)}" alt="Site photo"></span>`).join("")}</div></div>`);
    if (r.legacy || p.meta?.migrated_from) html.push('<p class="legacy-note">Earlier detailed answers are preserved. Download JSON or export CSV for all original fields.</p>');
    return html.join("");
  }
  function renderTable() {
    const q = $("#q").value.trim().toLowerCase();
    let rows = ROWS.filter((r) => !q || JSON.stringify([r.company, r.site, r.ref, r.contact, r.view.respondent?.site_summary]).toLowerCase().includes(q));
    rows.sort({
      date: (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
      date_asc: (a, b) => String(a.created_at).localeCompare(String(b.created_at)),
      intent: (a, b) => (b.intent ?? -1) - (a.intent ?? -1),
      cams: (a, b) => (b.scopeCams ?? -1) - (a.scopeCams ?? -1),
      company: (a, b) => String(a.company).localeCompare(String(b.company)),
    }[$("#sort").value]);
    $("#count").textContent = rows.length + " shown";
    if (!rows.length) { $("#table").innerHTML = '<div class="empty">No matching surveys.<br><small>Submit a survey in this browser, or import saved JSON copies.</small></div>'; return; }
    const clip = (s) => `<div class="clip">${esc(s || "—")}</div>`;
    $("#table").innerHTML = `<table class="subs"><thead><tr><th>Company / site</th><th>Visit / reference</th><th>Cameras</th><th>Computer / new hardware</th><th>AI targets / pilot</th><th>Budget / payment</th><th>Camera & network service</th><th>Approval / next step</th><th>Answers & exports</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.deviceOnly ? "dev-only" : ""}">
      <td class="cell-note"><b>${esc(r.company)}</b>${r.site ? `<br><small>${esc(r.site)}</small>` : ""}<small>${clip(r.contact)}</small></td>
      <td class="mono">${esc(r.date)}<br><small>${esc(r.ref)}</small>${r.deviceOnly ? '<br><small>Device only</small>' : ""}</td>
      <td>${esc(r.cameras)}</td>
      <td class="cell-note">${esc(r.existing)}<br><small>Extra hardware: ${esc(r.willing)}</small></td>
      <td class="cell-note">${clip(r.targets)}<small>Pilot: ${esc(r.pilot)}</small></td>
      <td class="cell-note">${esc(r.budget)}<br><small>${esc(r.payment)}</small></td>
      <td class="cell-note">${esc(r.serviceNow)}${clip(r.serviceNeeds)}<small>${r.serviceCost != null ? "Est. ₹" + r.serviceCost.toLocaleString("en-IN", { maximumFractionDigits: 0 }) + "/year (estimate)" : "No cost estimate"}</small></td>
      <td class="cell-note">${clip(r.decision)}<small>${clip(r.next)}</small>${r.intent != null ? `<small>Earlier buying intent: ${r.intent}/10</small>` : ""}</td>
      <td><details class="sub-detail" data-detail="${i}"><summary>View answers</summary><div class="survey-detail"></div></details>
      <div class="btn-row" style="margin-top:8px"><button class="btn-mini" data-dl="${i}">Download JSON</button><button class="btn-mini" data-copy="${i}">Copy JSON</button><button class="btn-mini" data-del="${i}">Delete</button></div></td>
    </tr>`).join("")}</tbody></table>`;
    $$("[data-detail]").forEach((el) => el.ontoggle = () => { if (el.open && !el.dataset.loaded) { el.querySelector(".survey-detail").innerHTML = detail(rows[+el.dataset.detail]); el.dataset.loaded = "1"; } });
    $$("[data-dl]").forEach((b) => b.onclick = () => { const r = rows[+b.dataset.dl]; dl(`${r.ref}.json`, JSON.stringify(payloadCopy(r), null, 2)); });
    $$("[data-copy]").forEach((b) => b.onclick = async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(payloadCopy(rows[+b.dataset.copy]), null, 2)); toast("JSON copied.", "ok"); }
      catch (_) { toast("Clipboard unavailable here. Use Download JSON.", "err"); }
    });
    $$("[data-del]").forEach((b) => b.onclick = async () => {
      const r = rows[+b.dataset.del];
      if (!confirm(`Delete survey ${r.ref} permanently?`)) return;
      try {
        if (SERVER && !r.deviceOnly) {
          const res = await fetch("api/responses/" + encodeURIComponent(r.id), { method: "DELETE" });
          if (!res.ok) throw new Error("Server did not delete the record");
        }
        localSubsSave(localSubs().filter((x) => x.ref !== r.ref));
        await load();
      } catch (e) { toast(e.message, "err"); }
    });
  }
  // A stable reference for earlier unsubmitted JSON files makes re-import safe.
  function importedRef(p) {
    if (p.meta?.ref) return p.meta.ref;
    let hash = 2166136261;
    for (const ch of JSON.stringify(p)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    return "SUR-imported-" + (hash >>> 0).toString(16);
  }
  $("#btn-import").onchange = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = "";
    if (!files.length) return;
    let added = 0, updated = 0, skipped = 0;
    const list = localSubs();
    try {
      for (const f of files) {
        let input;
        try { input = JSON.parse(await f.text()); } catch (_) { skipped++; continue; }
        const batch = Array.isArray(input?.surveys) ? input.surveys : [input];
        for (const p of batch) {
          if (!valid(p)) { skipped++; continue; }
          const ref = importedRef(p), i = list.findIndex((r) => r.ref === ref);
          p.meta = { ...(p.meta || {}), ref };
          const record = { id: i >= 0 ? list[i].id : ref, ref, company: p.respondent.company_name || "", site: p.respondent.plant_location || "", payload: p, created_at: p.meta.saved_at || new Date().toISOString(), device_only: true };
          if (i >= 0) { list[i] = record; updated++; } else { list.push(record); added++; }
        }
      }
      localSubsSave(list);
      await load(); toast(`Imported ${added} new, ${updated} updated${skipped ? `; ${skipped} invalid file(s) skipped` : ""}.`, skipped ? "err" : "ok");
    } catch (_) { toast("Could not save imports: browser storage may be full. Keep your JSON files.", "err"); }
  };
  $("#btn-upload").onclick = async () => {
    const button = $("#btn-upload"); button.disabled = true;
    const done = new Set(); let fail = 0;
    for (const rec of localSubs()) {
      try {
        const res = await fetch("api/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadCopy(rec)) });
        const d = await res.json(); if (res.ok && d.ok) done.add(rec.ref); else fail++;
      } catch (_) { fail++; }
    }
    localSubsSave(localSubs().filter((r) => !done.has(r.ref)));
    button.disabled = false;
    await load(); toast(`Uploaded ${done.size}${fail ? `; ${fail} kept on device for retry` : ""}.`, fail ? "err" : "ok");
  };
  async function probe() {
    try { const res = await fetch("api/health", { cache: "no-store", signal: AbortSignal.timeout(5000) }); const d = await res.json(); SERVER = !!(res.ok && d?.ok); }
    catch (_) { SERVER = false; }
    $("#mode-pill").className = "mode-pill " + (SERVER ? "srv" : "dev");
    $("#mode-pill").textContent = SERVER ? "SERVER MODE" : "DEVICE MODE";
    $("#mode-note").innerHTML = SERVER
      ? "Connected to the shared survey server. Imported device records can be uploaded below."
      : "These records live <b>only in this browser</b>, not in GitHub. Export CSV for Excel, or Backup JSON to keep answers and photos. Import JSON to combine devices.";
  }
  async function load() {
    if (SERVER === null) await probe();
    let rows = [];
    if (SERVER) {
      try { const res = await fetch("api/responses"); if (!res.ok) throw new Error(); rows = (await res.json()).map((r) => ({ ...r, device_only: false })); }
      catch (_) { toast("Server records could not be loaded. Showing device copies only; try Refresh.", "err"); }
    }
    const seen = new Set(rows.map((r) => r.ref));
    for (const r of localSubs()) if (!seen.has(r.ref)) { rows.push({ ...r, device_only: true }); seen.add(r.ref); }
    ROWS = rows.map(summarise); renderStats(); renderTable();
    $("#btn-upload").style.display = SERVER && localSubs().length ? "" : "none";
  }
  $("#btn-csv").onclick = exportCSV;
  $("#btn-backup").onclick = () => dl(`ppe-survey-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ surveys: ROWS.map(payloadCopy) }, null, 2));
  $("#q").oninput = renderTable;
  $("#sort").onchange = renderTable;
  $("#btn-refresh").onclick = () => { SERVER = null; load(); };
  load();
})();
