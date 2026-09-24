/* Shared compatibility helpers. Never mutate a submitted v1 record.
   The short form adds readable summaries while keeping every original key. */
(() => {
  "use strict";
  const empty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
  const get = (o, path) => path.split(".").reduce((a, k) => a?.[k], o);
  const title = (s) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  function describe(v) {
    if (Array.isArray(v)) {
      if (v.length && v.every((x) => typeof x === "string" && x.startsWith("data:image"))) return `${v.length} photo(s) retained in original data`;
      return v.map(describe).filter(Boolean).join("; ");
    }
    if (v && typeof v === "object") return lines(v);
    return empty(v) ? "" : String(v);
  }
  function lines(o, keys) {
    return (keys || Object.keys(o || {})).filter((k) => !empty(o?.[k]))
      .map((k) => `${title(k)}: ${describe(o[k])}`).join("\n");
  }
  const join = (...xs) => xs.filter(Boolean).join("\n");
  function describeEstimate(cfg, est) {
    if (!est || typeof est !== "object") return "";
    const rows = (cfg.lines || []).filter((line) => est[line.k] && est[line.k].qty !== "" && est[line.k].rate !== "" && est[line.k].qty != null && est[line.k].rate != null)
      .map((line) => `${line.l}: ${est[line.k].qty} × ${cfg.currency}${est[line.k].rate} = ${cfg.currency}${(Number(est[line.k].qty) * Number(est[line.k].rate)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
    if (!rows.length) return "";
    const total = rows.length && est._total != null ? est._total : null;
    return rows.join("\n") + (total != null ? `\nEstimated total: ${cfg.currency}${Number(total).toLocaleString("en-IN", { maximumFractionDigits: 2 })} per year (estimate, not a quotation)` : "");
  }
  // v2.0 -> v2.1: permissions and next steps became one closing question, and the
  // service section is new. Nothing is removed; keys simply move to their new section.
  function upgradeShortForm(p) {
    if (p.meta?.form_version !== "2.0") return p;
    const c = p.commercial || {};
    p.close = { ...(p.close || {}) };
    for (const key of ["permissions", "permissions_notes", "next_steps", "site_photos"]) {
      if (!empty(c[key]) && empty(p.close[key])) p.close[key] = c[key];
      delete c[key];
    }
    p.service = { ...(p.service || {}) };
    p.meta = { ...(p.meta || {}), migrated_from: p.meta?.migrated_from || "2.0", form_version: "2.1" };
    return p;
  }
  function migrate(input) {
    const p = JSON.parse(JSON.stringify(input));
    if (p.meta?.form_version === "2.1") return p;
    if (p.meta?.form_version === "2.0") return upgradeShortForm(p);
    const fill = (section, key, v) => {
      p[section] = p[section] && typeof p[section] === "object" && !Array.isArray(p[section]) ? p[section] : {};
      if (empty(p[section][key]) && !empty(v)) p[section][key] = v;
    };
    const r = p.respondent || {}, plant = p.plant || {}, safety = p.safety || {};
    const c = p.cameras || {}, v = p.video || {}, s = p.server || {}, h = p.newhw || {};
    const m = p.model || {}, a = p.alerts || {}, b = p.commercial || {}, next = p.next || {};
    fill("respondent", "contact_details", lines(r, ["resp_name", "resp_designation", "resp_dept", "resp_mobile", "resp_email", "resp_whatsapp", "it_contact_name", "it_contact_number", "surveyor_name", "survey_date", "visit_mode", "preferred_language", "source_of_lead"]));
    fill("respondent", "site_summary", join(lines(r, ["plant_location", "gmaps_link"]), lines(plant), lines(safety, Object.keys(safety).filter((k) => !k.startsWith("ppe_") && k !== "zone_specific_rules"))));
    const ppeMap = [[/helmet|hard hat/i, "Helmets"], [/shoes/i, "Safety shoes"], [/vest|jacket/i, "Reflective vests"], [/goggles|face shield/i, "Goggles / face shields"], [/gloves/i, "Gloves"], [/harness/i, "Safety harnesses"], [/ear/i, "Ear protection"], [/respirator|mask/i, "Masks / respirators"], [/suit|coat|apron/i, "Protective clothing"]];
    const ppe = (safety.ppe_items_needed || []).map((x) => ppeMap.find(([re]) => re.test(x))?.[1] || (/not sure/i.test(x) ? "Not sure" : "Other"));
    fill("respondent", "ppe_items_needed", [...new Set(ppe)]);
    fill("respondent", "ppe_items_needed_notes", lines(safety, ["ppe_items_needed", "ppe_items_other", "ppe_mandatory_zones", "zone_specific_rules"]));
    fill("cameras", "setup_summary", join(lines(c, ["total_cameras", "cams_usable", "cams_broken", "signal_type", "encoder_available", "camera_makes", "res_majority", "fps_majority", "codec", "lens_type", "night_vision"]), lines(v, ["vms_type", "vms_make_model", "vms_license", "storage_location", "retention_days", "storage_total_tb", "storage_free_tb"])));
    fill("cameras", "view_checks_notes", lines(c, ["mount_type", "mount_height", "subject_distance", "lighting_condition", "power_backup", "new_cameras_ok", "new_camera_budget", "profiles"]));
    fill("cameras", "rtsp_access_notes", join(c.rtsp_notes, lines(v, Object.keys(v).filter((k) => !/^(vms|storage|retention)/.test(k)))));
    const roomKeys = ["rack_space", "power_available", "cooling", "ups", "space_for_new", "power_for_new", "cooling_for_new", "no_server_notes"];
    fill("server", "has_server_room_notes", lines(s, roomKeys));
    fill("server", "has_existing_server_notes", lines(s, Object.keys(s).filter((k) => !roomKeys.includes(k) && !["has_server_room", "has_existing_server", "server_room_photos"].includes(k))));
    fill("server", "willing_new_server", h.willing_new_server);
    fill("server", "willing_new_server_notes", lines(h, Object.keys(h).filter((k) => k !== "willing_new_server")));
    fill("model", "acceptance_targets", lines(m, ["min_accuracy", "min_recall", "max_false_alarms", "latency_req", "detection_speed", "success_criteria", "reaction_85", "false_alarm_reaction", "challenging_cases", "other_detections", "future_roadmap", "expectations_other"]));
    fill("model", "pilot_accept_notes", lines(m, ["pilot_model", "pilot_cameras", "pilot_duration", "success_criteria", "footage_available", "footage_hours"]));
    const alertMap = [[/dashboard|control room/i, "Live dashboard"], [/mobile/i, "Mobile phone / app"], [/WhatsApp|Telegram|SMS/i, "WhatsApp / SMS"], [/email/i, "Email"], [/siren|hooter|beacon|PA system/i, "Siren / warning light"], [/report/i, "Shift / daily reports"]];
    fill("model", "alert_channels", [...new Set((a.alert_channels || []).map((x) => alertMap.find(([re]) => re.test(x))?.[1] || (/not sure/i.test(x) ? "Not sure" : "Connect to existing software")))]);
    fill("model", "alert_channels_notes", lines(a));
    fill("commercial", "total_budget_notes", lines(b, ["budget_head", "payment_pref", "amc_expect", "roi_driver", "cost_of_incident", "current_safety_spend", "safety_officer_cost"]));
    fill("commercial", "decision_plan", lines(b, ["decision_maker", "decision_maker_contact", "approval_path", "tender_needed", "tender_date", "tender_participants", "competitor_names", "competitor_quote", "timeline", "target_go_live", "decision_by_date", "pilot_cams", "full_cams", "future_sites"]));
    const permissions = [];
    if (next.consent_visit === "yes") permissions.push("Technical site visit approved");
    if (next.consent_photos === "yes") permissions.push("Site photos approved");
    if (next.consent_footage === "yes") permissions.push("Recorded video testing approved");
    if (m.data_use_consent === "Anonymised data may be used to improve the model") permissions.push("Video use for model improvement approved");
    fill("close", "permissions", permissions);
    fill("close", "permissions_notes", join(lines(next, ["consent_visit", "consent_footage", "consent_photos"]), lines(m, ["data_use_consent", "footage_available"]), lines(b, ["ownership"])));
    fill("close", "next_steps", join(lines(next, Object.keys(next).filter((k) => !["site_photos", "consent_visit", "consent_footage", "consent_photos"].includes(k))), lines(b, ["support_expect", "sla_expect", "warranty_expect", "training_need", "concerns", "concern_notes", "buying_signals", "commercial_notes"])));
    fill("service", "service_arrangement_notes", lines(b, ["amc_expect", "support_expect", "sla_expect", "warranty_expect"]));
    // Existing photos remain in their original fields; do not duplicate large
    // data URIs into the new draft, which could exhaust browser storage.
    p.meta = { ...(p.meta || {}), migrated_from: p.meta?.form_version || "1.0", form_version: "2.1" };
    return p;
  }
  function valid(p) {
    return p && typeof p === "object" && !Array.isArray(p) && p.respondent && typeof p.respondent === "object"
      && (p.respondent.company_name || p.cameras || p.model);
  }
  function answerLabel(f, value) {
    if (Array.isArray(value)) return value.join(", ");
    return (f.o || []).find((o) => typeof o === "object" && String(o.id) === String(value))?.label ?? value;
  }
  window.SurveyData = { migrate, valid, get, empty, answerLabel, describe, describeEstimate };
})();
