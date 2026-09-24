/* ==========================================================================
   PPE Detection Site Survey - form engine
   Renders every question from schema.js, auto-saves to localStorage,
   submits to the Flask API, and exports JSON / print copies.
   ========================================================================== */
(function () {
  "use strict";

  /* Surface any uncaught error on the page itself - a silent JS exception
     in the field would otherwise look like "the form is broken". */
  window.addEventListener("error", function (e) {
    var el = document.getElementById("js-error");
    if (!el) {
      el = document.createElement("div");
      el.id = "js-error";
      el.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:200;background:#c2352b;color:#fff;" +
        "font:12px/1.4 ui-monospace,Menlo,monospace;padding:8px 12px;max-height:30vh;overflow:auto";
      document.body.appendChild(el);
    }
    el.textContent = "JS error: " + (e.message || e.error) + (el.textContent ? "\n" + el.textContent : "");
  });

  const SCHEMA = window.SURVEY_SCHEMA;
  const LS_KEY = "ppe_survey_draft_v1";
  const LS_ID_KEY = "ppe_survey_draft_id_v1";
  const LS_SUBS = "ppe_survey_submissions_v1";

  /* ------------------------------------------------------------------ *
   * STORAGE MODES
   *  "server" - a survey server (app.py) is reachable: submissions are
   *             shared across devices and exportable as CSV from it.
   *  "device" - static hosting (e.g. GitHub Pages) or offline: every
   *             submission is stored in this browser only, and can be
   *             exported as JSON / merged later on the office machine.
   * ------------------------------------------------------------------ */
  let serverMode = null;   // null = not probed yet

  function localSubs() {
    try { return JSON.parse(localStorage.getItem(LS_SUBS) || "[]"); }
    catch (e) { return []; }
  }
  function localSubsSave(list) { localStorage.setItem(LS_SUBS, JSON.stringify(list)); }

  function localRef() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
    return `SUR-${stamp}-${suffix}`;
  }

  async function probeServer() {
    try {
      const res = await fetch("api/health", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      serverMode = !!(res.ok && data && data.ok);
    } catch (e) { serverMode = false; }
    updateModeBadge();
    return serverMode;
  }

  function updateModeBadge() {
    const el = $("#mode-badge");
    if (!el) return;
    if (serverMode === null) { el.textContent = "Checking storage…"; return; }
    el.innerHTML = serverMode
      ? `Storage: <b>survey server</b> (shared across devices)`
      : `Storage: <b>this device only</b> — keep a JSON copy as a backup`;
    
    const note = $("#review-storage");
    if (note) note.innerHTML = serverMode
      ? 'Submitting saves to the <b>shared survey server</b>. You can also download a JSON backup.'
      : 'Submitting saves <b>only in this browser</b>, not in GitHub. Use <b>Download JSON copy</b> to keep a backup of this survey or share it with the survey owner. Do not clear browser data before backing up.';
  }

  /* ------------------------------- state ------------------------------- */
  let state = blankState();
  let currentSection = 0;
  let submittedRef = null;

  function blankState() {
    const d = new Date();
    const surveyDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const s = { meta: { form_version: SCHEMA.version, survey_date: surveyDate } };
    SCHEMA.sections.forEach((sec) => {
      if (sec.special) return;
      s[sec.id] = {};
      sec.fields.forEach((f) => {
        if (f.t === "repeater") s[sec.id][f.k] = [];
        else if (f.t === "checks" || f.t === "photo") s[sec.id][f.k] = [];
        else s[sec.id][f.k] = "";
        if (f.note) s[sec.id][f.k + "_notes"] = "";
        if (f.photos) s[sec.id][f.photos.k] = [];
        if (f.followup) s[sec.id][f.followup.k] = "";
        if (f.estimate) s[sec.id][f.estimate.k] = {};
      });
    });
    return s;
  }

  /* ------------------------------- utils ------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* fetch that never chokes on an HTML error page */
  async function getJSON(url, opts) {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); }
    catch (e) {
      throw new Error(`server replied HTTP ${res.status} (not JSON)`);
    }
    if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
    return data;
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function getPath(path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), state);
  }
  function isEmpty(v) {
    return v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
  }
  function optLabel(o) {
    if (o == null) return "";
    return typeof o === "string" ? o : String(o.label == null ? o.id || "" : o.label);
  }
  function optId(o) {
    if (o == null) return "";
    return typeof o === "string" ? o : String(o.id == null ? o.label : o.id);
  }

  function toast(msg, kind) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast show " + (kind || "");
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = "toast " + (kind || ""); }, 3200);
  }

  /* ---------------------------- conditional ---------------------------- */
  function ruleMet(rule) {
    if (!rule) return true;
    const val = getPath(rule.p);
    if (rule.equals !== undefined) return String(val) === String(rule.equals);
    if (rule.notEquals !== undefined) return String(val) !== String(rule.notEquals);
    if (rule.in) return rule.in.some((v) => String(val) === String(v));
    if (rule.notIn) return !rule.notIn.some((v) => String(val) === String(v));
    if (rule.filled) return !isEmpty(val);
    if (rule.empty) return isEmpty(val);
    if (rule.truthy === true) return !!val && val !== "no";
    return true;
  }
  function fieldVisible(field) { return ruleMet(field.showIf); }

  /* ------------------------------ render ------------------------------- */
  function render() {
    try {
      buildSidebar();
      const main = $("#sections");
      main.innerHTML = "";
      SCHEMA.sections.forEach((sec, i) => {
        if (sec.special === "review") { main.appendChild(buildReviewCard(sec, i)); return; }
        main.appendChild(buildSection(sec, i));
      });
      bindGlobals();
      bindReview();
      applyVisibility();
      updateProgress();
      goTo(currentSection, true);
    } catch (err) {
      console.error("Form render failed:", err);
      const main = $("#sections");
      if (main) {
        main.innerHTML = `<div class="callout warn" style="border-color:#c2352b;background:#fdeceb;color:#8d1f17">
          <b>The form failed to render.</b><br>${esc(err && err.message ? err.message : String(err))}
          <br><small>Reload the page, or open schema.js in the console to inspect the question list.</small></div>`;
      }
    }
  }

  function buildSidebar() {
    const nav = $("#nav");
    nav.innerHTML = "";
    SCHEMA.sections.forEach((sec, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.idx = i;
      b.innerHTML = `<span class="nav-num">${String(i + 1).padStart(2, "0")}</span>
                     <span class="nav-title">${esc(sec.nav)}</span>
                     <span class="nav-count"></span>`;
      b.addEventListener("click", () => { goTo(i); $("#sidebar").classList.remove("open"); });
      li.appendChild(b);
      nav.appendChild(li);
    });
  }

  function buildSection(sec, idx) {
    const card = document.createElement("section");
    card.className = "card section-card";
    card.id = "sec-" + sec.id;
    card.dataset.idx = idx;

    let html = `<div class="card-head">
        <h2><span class="tag">${String(idx + 1).padStart(2, "0")}</span> ${esc(sec.title)}</h2>
        ${sec.desc ? `<p>${esc(sec.desc)}</p>` : ""}
      </div>`;
    if (sec.callout) html += `<div class="callout ${sec.callout.type || ""}">${sec.callout.html}</div>`;
    html += `<div class="grid" data-grid="${sec.id}"></div>`;
    card.innerHTML = html;

    const grid = $("[data-grid]", card);
    sec.fields.forEach((f) => grid.appendChild(buildField(f, sec.id, null, null)));
    return card;
  }

  /* one field wrapper (also used inside repeaters) */
  function buildField(f, secId, repKey, repIdx) {
    const wrap = document.createElement("div");
    wrap.className = "field" + (f.span === 2 ? " span-2" : "");
    wrap.dataset.path = f.k;
    if (f.n) { wrap.classList.add("question"); wrap.dataset.question = f.n; wrap.id = "question-" + f.n; }
    if (f.span !== 2 && f.t !== "repeater") wrap.style.gridColumn = "auto";

    const labelHtml = `<label class="lbl">${f.n ? `<span class="question-number">${f.n}</span>` : ""}${esc(f.l)}${f.r ? '<span class="req">*</span>' : ""}
        ${f.unit ? `<span class="unit">(${esc(f.unit)})</span>` : ""}</label>`;

    if (f.t === "repeater") {
      wrap.classList.add("span-2");
      wrap.innerHTML = `${labelHtml}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}
        <div class="rep-list"></div>
        <button type="button" class="btn-add">${esc(f.addLabel || "+ Add another")}</button>`;
      const list = $(".rep-list", wrap);
      const addBtn = $(".btn-add", wrap);

      const ensureOne = () => {
        const arr = state[secId][f.k];
        if (!arr.length) arr.push(repeaterBlank(f));
        drawRep();
      };
      const drawRep = () => {
        list.innerHTML = "";
        state[secId][f.k].forEach((item, i) => {
          const box = document.createElement("div");
          box.className = "rep-item";
          const title = f.itemLabel ? f.itemLabel(i + 1, item) : `Entry ${i + 1}`;
          box.innerHTML = `<div class="rep-head"><strong>${esc(title)}</strong>
              <button type="button" class="btn-mini" data-del="${i}">Remove</button></div>
              <div class="grid"></div>`;
          const g = $(".grid", box);
          f.fields.forEach((sub) => g.appendChild(buildField(sub, secId, f.k, i)));
          box.querySelector("[data-del]").addEventListener("click", () => {
            if (state[secId][f.k].length <= 1) { toast("At least one entry is kept.", "err"); return; }
            state[secId][f.k].splice(i, 1); drawRep(); save(); updateProgress();
          });
          list.appendChild(box);
        });
        applyVisibility();
      };
      addBtn.addEventListener("click", () => {
        if (state[secId][f.k].length >= (f.max || 99)) { toast(`Maximum ${f.max} entries.`, "err"); return; }
        state[secId][f.k].push(repeaterBlank(f)); drawRep(); save(); updateProgress();
      });
      ensureOne();
      wrap._redraw = drawRep;
      return wrap;
    }

    let control = "";
    const nameAttr = repKey ? `${secId}.${repKey}[${repIdx}].${f.k}` : `${secId}.${f.k}`;

    switch (f.t) {
      case "textarea":
        control = `<textarea name="${esc(nameAttr)}" rows="${f.rows || 3}" placeholder="${esc(f.ph || "")}"></textarea>`;
        break;
      case "select": {
        const opts = (f.o || []).map((o, i) =>
          `<option value="${esc(typeof o === "string" ? o : o.id)}">${esc(optLabel(o))}</option>`).join("");
        control = `<select name="${esc(nameAttr)}"><option value="">— select —</option>${opts}</select>`;
        break;
      }
      case "choice": {
        control = `<div class="choices">` + (f.o || []).map((o, i) => {
          const id = `${nameAttr}_${i}`.replace(/[^a-z0-9_]/gi, "_");
          const sub = (typeof o === "object" && o.sub) ? `<small>${esc(o.sub)}</small>` : "";
          return `<label class="choice${sub ? " block" : ""}"><input type="radio" name="${esc(nameAttr)}" id="${id}" value="${esc(optId(o))}"><span>${esc(optLabel(o))}${sub}</span></label>`;
        }).join("") + `</div>`;
        break;
      }
      case "checks": {
        control = `<div class="checks">` + (f.o || []).map((o, i) => {
          const id = `${nameAttr}_c${i}`.replace(/[^a-z0-9_]/gi, "_");
          return `<label class="check"><input type="checkbox" name="${esc(nameAttr)}" id="${id}" value="${esc(optLabel(o))}"><span>${esc(optLabel(o))}</span></label>`;
        }).join("") + `</div>`;
        break;
      }
      case "range": {
        control = `<div class="range-row"><input type="range" name="${esc(nameAttr)}" min="${f.min}" max="${f.max}" step="${f.step || 1}">
            <span class="range-val">${f.min}${f.suffix || ""}</span></div>
          <div class="range-scale"><span>${f.min}${f.suffix || ""}</span><span>${f.max}${f.suffix || ""}</span></div>`;
        break;
      }
      case "photo": {
        control = `<label class="photo-drop">📷 Tap to take / choose up to ${f.max || 4} photo(s)
            <input type="file" accept="image/*" capture="environment" multiple></label>
          <div class="thumbs"></div>`;
        break;
      }
      default: {
        const type = f.t === "number" ? "number" : f.t === "email" ? "email" : f.t === "tel" ? "tel"
          : f.t === "date" ? "date" : f.t === "time" ? "time" : "text";
        const extra = f.t === "number" ? `min="${f.min ?? ""}" max="${f.max ?? ""}" step="${f.step ?? 1}"` : "";
        control = `<input type="${type}" name="${esc(nameAttr)}" placeholder="${esc(f.ph || "")}" ${extra}>`;
      }
    }

    wrap.innerHTML = labelHtml + control + (f.hint ? `<div class="hint">${esc(f.hint)}</div>` : "");

    const mainLabel = $(".lbl", wrap);
    const controlId = "answer-" + nameAttr.replace(/[^a-z0-9_-]/gi, "-");
    mainLabel.id = controlId + "-label";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-labelledby", mainLabel.id);
    if (!["choice", "checks", "photo"].includes(f.t)) {
      const input = $("input, select, textarea", wrap);
      if (input) { input.id = controlId; mainLabel.htmlFor = controlId; }
    }
    const hint = $(".hint", wrap);
    if (hint) {
      hint.id = controlId + "-hint";
      $$("input, select, textarea", wrap).forEach((el) => el.setAttribute("aria-describedby", hint.id));
    }

    /* ---- value binding ---- */
    const getVal = () => repKey ? (state[secId][repKey][repIdx] || {})[f.k] : state[secId][f.k];
    const setVal = (v) => {
      if (repKey) { if (!state[secId][repKey][repIdx]) return; state[secId][repKey][repIdx][f.k] = v; }
      else state[secId][f.k] = v;
    };

    if (f.t === "photo") {
      const input = $("input[type=file]", wrap);
      const thumbs = $(".thumbs", wrap);
      const drawThumbs = () => {
        thumbs.innerHTML = "";
        (getVal() || []).forEach((src, i) => {
          const d = document.createElement("div");
          d.className = "thumb";
          d.innerHTML = `<img src="${esc(src)}" alt="photo ${i + 1}"><button type="button" title="Remove">×</button>`;
          d.querySelector("button").addEventListener("click", () => {
            const arr = getVal(); arr.splice(i, 1); setVal(arr); drawThumbs(); save(); updateProgress();
          });
          thumbs.appendChild(d);
        });
      };
      input.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        const arr = getVal() || [];
        for (const file of files) {
          if (arr.length >= (f.max || 4)) { toast(`Maximum ${f.max} photos here.`, "err"); break; }
          if (!file.type.startsWith("image/")) continue;
          const image = await compressImage(file);
          if (image) arr.push(image);
        }
        setVal(arr); drawThumbs(); save(); updateProgress(); e.target.value = "";
      });
      drawThumbs();
    } else if (f.t === "checks") {
      $$("input[type=checkbox]", wrap).forEach((cb) => {
        const arr = getVal() || [];
        cb.checked = arr.includes(cb.value);
        cb.addEventListener("change", () => {
          let a = getVal() || [];
          if (cb.checked) {
            a = (f.exclusive || []).includes(cb.value) ? [cb.value]
              : [...a.filter((x) => !(f.exclusive || []).includes(x) && x !== cb.value), cb.value];
          } else a = a.filter((x) => x !== cb.value);
          setVal(a);
          $$("input[type=checkbox]", wrap).forEach((el) => { el.checked = a.includes(el.value); });
          save(); updateProgress();
        });
      });
    } else if (f.t === "choice") {
      $$("input[type=radio]", wrap).forEach((r) => {
        r.checked = String(getVal()) === r.value;
        r.addEventListener("change", () => { setVal(r.value); save(); applyVisibility(); updateProgress(); });
      });
    } else if (f.t === "range") {
      const r = $("input[type=range]", wrap);
      const out = $(".range-val", wrap);
      r.min = f.min; r.max = f.max;
      const cur = getVal();
      const show = (v) => {
        out.textContent = v === "" || v == null ? "not set" : v + (f.suffix || "");
        out.style.background = v === "" || v == null ? "#eef1f6" : "";
        out.style.color = v === "" || v == null ? "#8593a8" : "";
      };
      // sit at the midpoint but record NOTHING until the surveyor moves it
      r.value = cur === "" || cur == null ? Math.round((f.min + f.max) / 2) : cur;
      show(cur === "" || cur == null ? "" : cur);
      r.addEventListener("input", () => show(r.value));
      r.addEventListener("change", () => { setVal(Number(r.value)); show(r.value); save(); updateProgress(); });
    } else if (f.t === "select") {
      const s = $("select", wrap);
      const existing = getVal();
      if (!isEmpty(existing) && !Array.from(s.options).some((o) => o.value === String(existing))) {
        const opt = document.createElement("option"); opt.value = existing; opt.textContent = existing + " (earlier answer)"; s.appendChild(opt);
      }
      s.value = existing || "";
      s.addEventListener("change", () => { setVal(s.value); save(); applyVisibility(); updateProgress(); });
    } else {
      const inp = $("input, textarea", wrap);
      inp.value = getVal() ?? "";
      inp.addEventListener("input", () => { setVal(inp.value); save(); updateProgress(); });
      inp.addEventListener("change", () => { applyVisibility(); });
    }
    // A follow-up text box completes the same question (e.g. next steps).
    if (f.followup) {
      const follow = buildField({ ...f.followup, t: "textarea", span: 2 }, secId);
      follow.classList.add("followup");
      wrap.appendChild(follow);
    }
    if (f.estimate) wrap.appendChild(buildEstimate(f, secId));
    // Optional notes belong to the same answer: no nested questionnaire.
    if (f.note) {
      const details = document.createElement("details");
      details.className = "answer-note";
      details.open = !isEmpty(state[secId][f.k + "_notes"]);
      details.innerHTML = `<summary>${esc(f.note)}</summary>`;
      if (f.help) details.innerHTML += `<p class="detail-help">${esc(f.help)}</p>`;
      details.appendChild(buildField({ k: f.k + "_notes", t: "textarea", l: "Optional note", ph: f.notePh || "", span: 2 }, secId));
      wrap.appendChild(details);
    } else if (f.help) {
      const help = document.createElement("details"); help.className = "tech-tip";
      help.innerHTML = `<summary>Details to note if known</summary><p class="detail-help">${esc(f.help)}</p>`;
      wrap.appendChild(help);
    }
    if (f.photos) {
      const details = document.createElement("details"); details.className = "answer-note";
      details.open = !isEmpty(state[secId][f.photos.k]);
      details.innerHTML = `<summary>Add site photos (optional)</summary>`;
      details.appendChild(buildField({ ...f.photos, t: "photo", span: 2 }, secId));
      wrap.appendChild(details);
    }
    return wrap;
  }

  /* Quantity × unit-rate calculator. Rates must be typed by the surveyor from a
     price list or quotation; nothing is pre-filled, and the total is labelled
     an estimate, never a quotation. */
  const money = (v) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  function estimateTotal(est) {
    let total = 0, any = false;
    Object.values(est || {}).forEach((line) => {
      const q = Number(line && line.qty), r = Number(line && line.rate);
      if (line && line.qty !== "" && line.rate !== "" && Number.isFinite(q) && Number.isFinite(r) && q >= 0 && r >= 0) { total += q * r; any = true; }
    });
    return { total, any };
  }
  function buildEstimate(f, secId) {
    const cfg = f.estimate;
    const box = document.createElement("details");
    box.className = "answer-note estimate";
    const est = state[secId][cfg.k] || (state[secId][cfg.k] = {});
    box.open = Object.values(est).some((line) => line && (line.qty !== "" || line.rate !== ""));
    box.innerHTML = `<summary>${esc(cfg.title)}</summary>
      <table class="estimate-table"><thead><tr><th>Service</th><th>Quantity</th><th>Unit rate (${esc(cfg.currency)})</th><th>Line total</th></tr></thead>
      <tbody>${cfg.lines.map((line) => `<tr data-line="${esc(line.k)}">
        <td><label for="est-${esc(secId)}-${esc(line.k)}-qty">${esc(line.l)}</label><small>${esc(line.unit)}</small></td>
        <td><input type="number" inputmode="decimal" min="0" step="any" id="est-${esc(secId)}-${esc(line.k)}-qty" placeholder="${esc(line.ph || "")}" aria-label="${esc(line.l)} quantity"></td>
        <td><input type="number" inputmode="decimal" min="0" step="any" placeholder="rate" aria-label="${esc(line.l)} unit rate in ${esc(cfg.currency)}"></td>
        <td class="line-total">—</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3">Estimated total per year</td><td class="grand-total">—</td></tr></tfoot></table>
      ${cfg.hint ? `<div class="hint">${esc(cfg.hint)}</div>` : ""}`;
    const refresh = () => {
      $$("tr[data-line]", box).forEach((row) => {
        const line = est[row.dataset.line] || {};
        const q = Number(line.qty), r = Number(line.rate);
        const ok = line.qty !== "" && line.rate !== "" && line.qty != null && line.rate != null && Number.isFinite(q) && Number.isFinite(r);
        $(".line-total", row).textContent = ok ? cfg.currency + money(q * r) : "—";
      });
      const { total, any } = estimateTotal(est);
      $(".grand-total", box).textContent = any ? cfg.currency + money(total) : "—";
      if (any) est._total = Math.round(total * 100) / 100; else delete est._total;
    };
    $$("tr[data-line]", box).forEach((row) => {
      const [qty, rate] = $$("input", row);
      const line = est[row.dataset.line] || {};
      qty.value = line.qty ?? ""; rate.value = line.rate ?? "";
      const update = () => {
        if (qty.value === "" && rate.value === "") delete est[row.dataset.line];
        else est[row.dataset.line] = { qty: qty.value, rate: rate.value };
        refresh(); save(); updateProgress();
      };
      qty.addEventListener("input", update); rate.addEventListener("input", update);
    });
    refresh();
    return box;
  }

  function repeaterBlank(f) {
    const o = {};
    f.fields.forEach((sf) => { o[sf.k] = sf.t === "checks" || sf.t === "photo" ? [] : ""; });
    return o;
  }

  /* ------------------------------ images ------------------------------- */
  function compressImage(file, maxSide = 1100, quality = 0.72) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxSide || height > maxSide) {
            const r = Math.min(maxSide / width, maxSide / height);
            width = Math.round(width * r); height = Math.round(height * r);
          }
          const c = document.createElement("canvas");
          c.width = width; c.height = height;
          c.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => resolve("");
        img.src = reader.result;
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  /* --------------------------- visibility ------------------------------ */
  function applyVisibility() {
    SCHEMA.sections.forEach((sec) => {
      if (sec.special) return;
      const card = $("#sec-" + sec.id);
      if (!card) return;
      sec.fields.forEach((f) => {
        const visible = fieldVisible(f);
        // top-level field: direct child of this section's grid only
        $$(`[data-grid="${sec.id}"] > [data-path="${cssEsc(f.k)}"]`, card)
          .forEach((w) => w.classList.toggle("hidden", !visible));
        // sub-fields: only inside this section's repeater items
        if (f.t === "repeater") {
          f.fields.forEach((sf) => {
            const subVisible = visible && ruleMet(sf.showIf);
            $$(`.rep-item [data-path="${cssEsc(sf.k)}"]`, card)
              .forEach((w) => w.classList.toggle("hidden", !subVisible));
          });
        }
      });
    });
  }

  function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }

  /* ---------------------------- progress ------------------------------- */
  function sectionStats(sec) {
    if (sec.special) return { filled: 0, total: 0, requiredLeft: 0 };
    let filled = 0, total = 0, requiredLeft = 0;
    sec.fields.forEach((f) => {
      if (!fieldVisible(f)) return;
      if (f.t === "repeater") {
        const arr = state[sec.id][f.k] || [];
        arr.forEach((item) => {
          f.fields.forEach((sf) => {
            total++;
            if (!isEmpty(item[sf.k])) filled++;
            if (sf.r && isEmpty(item[sf.k])) requiredLeft++;
          });
        });
        return;
      }
      total++;
      const v = state[sec.id][f.k];
      if (!isEmpty(v) || (f.note && !isEmpty(state[sec.id][f.k + "_notes"])) || (f.photos && !isEmpty(state[sec.id][f.photos.k]))
        || (f.followup && !isEmpty(state[sec.id][f.followup.k])) || (f.estimate && estimateTotal(state[sec.id][f.estimate.k]).any)) filled++;
      if (f.r && isEmpty(v)) requiredLeft++;
      if (f.followup && f.followup.r && isEmpty(state[sec.id][f.followup.k])) requiredLeft++;
    });
    return { filled, total, requiredLeft };
  }

  function updateProgress() {
    let filledAll = 0, totalAll = 0;
    const navBtns = $$("#nav button");
    SCHEMA.sections.forEach((sec, i) => {
      const s = sectionStats(sec);
      filledAll += s.filled; totalAll += s.total;
      const b = navBtns[i];
      if (!b) return;
      const cnt = $(".nav-count", b);
      if (sec.special) { cnt.textContent = ""; return; }
      const pct = s.total ? Math.round((s.filled / s.total) * 100) : 0;
      cnt.textContent = `${s.filled}/${s.total}`;
      b.classList.toggle("done", pct === 100 && s.requiredLeft === 0);
      if (s.requiredLeft > 0) cnt.style.color = "#ffb4ad"; else cnt.style.color = "";
    });
    const overall = totalAll ? Math.round((filledAll / totalAll) * 100) : 0;
    $("#progress-fill").style.width = overall + "%";
    $("#progress-pct").textContent = `${filledAll} / ${totalAll} answered`;
  }

  /* ------------------------------ review ------------------------------- */
  function buildReviewCard(sec, idx) {
    const card = document.createElement("section");
    card.className = "card section-card";
    card.id = "sec-review";
    card.dataset.idx = idx;
    card.innerHTML = `<div class="card-head">
        <h2><span class="tag">${String(idx + 1).padStart(2, "0")}</span> ${esc(sec.title)}</h2>
        <p>${esc(sec.desc)}</p></div>
      <div id="missing"></div>
      <div id="review-body"></div>
      <div class="btn-row" style="margin:16px 0 6px">
        <button type="button" class="btn btn-ghost" id="btn-download-json">Download JSON copy</button>
        <button type="button" class="btn btn-ghost" id="btn-print">Print / save PDF</button>
        <button type="button" class="btn btn-ghost" id="btn-new">Start a new blank survey</button>
      </div>
      <div class="callout" id="review-storage" style="margin-top:14px">Checking storage…</div>
      <div class="btn-row" style="margin-top:14px">
        <button type="button" class="btn btn-ok" id="btn-submit">Submit survey</button>
        <label class="btn btn-ghost" style="cursor:pointer">Import a saved JSON
          <input type="file" accept="application/json" id="btn-import" style="display:none"></label>
      </div>`;
    return card;
  }

  function renderReview() {
    const body = $("#review-body");
    if (!body) return;
    updateModeBadge();
    body.innerHTML = "";
    let missingTotal = 0;
    const missingHtml = [];

    SCHEMA.sections.forEach((sec, i) => {
      if (sec.special) return;
      const st = sectionStats(sec);
      if (st.requiredLeft > 0) {
        missingTotal += st.requiredLeft;
        sec.fields.forEach((f) => {
          if (!fieldVisible(f)) return;
          if (f.r && isEmpty(state[sec.id][f.k])) missingHtml.push(`<li>Question ${f.n} — <b>${esc(f.l)}</b></li>`);
          if (f.followup && f.followup.r && isEmpty(state[sec.id][f.followup.k])) missingHtml.push(`<li>Question ${f.n} — <b>${esc(f.followup.l)}</b></li>`);
          if (f.t === "repeater") (state[sec.id][f.k] || []).forEach((item, ri) => {
            f.fields.forEach((sf) => { if (sf.r && isEmpty(item[sf.k])) missingHtml.push(`<li>Section ${i + 1}, entry ${ri + 1} — <b>${esc(sf.l)}</b></li>`); });
          });
        });
      }
      const rows = collectRows(sec);
      if (!rows.length) return;
      const div = document.createElement("div");
      div.className = "rev-sec";
      div.innerHTML = `<h3><span>${String(i + 1).padStart(2, "0")} · ${esc(sec.title)}</span>
          <span class="cnt">${st.filled}/${st.total} answered${st.requiredLeft ? ` · ${st.requiredLeft} required left` : ""}</span></h3>
        <div class="rev-body">${rows.join("")}</div>`;
      body.appendChild(div);
    });

    if (state.meta?.migrated_from) {
      const notice = document.createElement("div"); notice.className = "callout";
      notice.textContent = "Earlier detailed answers are preserved. The short form shows summaries; the JSON copy and CSV export also keep the original fields and photos.";
      body.prepend(notice);
    }
    $("#missing").innerHTML = missingTotal
      ? `<div class="callout warn"><b>${missingTotal} required field(s) still empty:</b><ul>${missingHtml.join("")}</ul></div>`
      : `<div class="callout ok"><b>All required fields are complete.</b> Ready to submit.</div>`;
  }

  function collectRows(sec) {
    const rows = [];
    const push = (k, v) => {
      if (isEmpty(v)) return;
      if (Array.isArray(v) && typeof v[0] === "string" && v[0].startsWith("data:image")) {
        rows.push(`<div class="rev-row"><div class="rev-k">${esc(k)}</div><div class="rev-v">
          <span class="thumbs">${v.map((s) => `<span class="thumb"><img src="${esc(s)}" alt="Site photo"></span>`).join("")}</span></div></div>`);
        return;
      }
      rows.push(`<div class="rev-row"><div class="rev-k">${esc(k)}</div>
        <div class="rev-v">${esc(Array.isArray(v) ? v.join(", ") : v)}</div></div>`);
    };
    sec.fields.forEach((f) => {
      if (!fieldVisible(f)) return;
      if (f.t === "repeater") {
        (state[sec.id][f.k] || []).forEach((item, i) => {
          f.fields.forEach((sf) => {
            if (!ruleMet(sf.showIf)) return;
            push(`${f.l} #${i + 1} — ${sf.l}`, item[sf.k]);
          });
        });
        return;
      }
      push(`${f.n}. ${f.l}`, window.SurveyData.answerLabel(f, state[sec.id][f.k]));
      if (f.followup) push(`Q${f.n} · ${f.followup.l}`, state[sec.id][f.followup.k]);
      if (f.estimate) push(`Q${f.n} · ${f.estimate.title}`, window.SurveyData.describeEstimate(f.estimate, state[sec.id][f.estimate.k]));
      if (f.note) push(`Q${f.n} · Note`, state[sec.id][f.k + "_notes"]);
      if (f.photos) push(`Q${f.n} · ${f.photos.l}`, state[sec.id][f.photos.k]);
    });
    return rows;
  }

  /* ---------------------------- navigation ----------------------------- */
  function goTo(i, skipScroll) {
    currentSection = Math.max(0, Math.min(SCHEMA.sections.length - 1, i));
    $$(".section-card").forEach((c) => { c.style.display = "none"; });
    const active = SCHEMA.sections[currentSection];
    const el = $("#sec-" + (active.special === "review" ? "review" : active.id));
    if (el) el.style.display = "";
    $$("#nav button").forEach((b, bi) => b.classList.toggle("active", bi === currentSection));
    $("#btn-prev").disabled = currentSection === 0;
    $("#btn-next").hidden = currentSection === SCHEMA.sections.length - 1;
    $("#btn-next").textContent = currentSection === SCHEMA.sections.length - 2 ? "Review answers →" : "Next section →";
    if (active.special === "review") renderReview();
    if (!skipScroll) window.scrollTo({ top: 0, behavior: "smooth" });
    updateProgress();
  }

  /* ------------------------------ storage ------------------------------ */
  let saveTimer = null;
  function setSaveIndicator(cls, text) {
    // never let a missing DOM node break saving - this runs on every keystroke
    try {
      const dot = $("#save-dot") || $("#save-state .dot");
      const lbl = $("#save-text");
      if (dot) dot.className = "dot " + cls;
      if (lbl) lbl.textContent = text;
    } catch (e) { /* ignore */ }
  }

  function save() {
    const btn = $("#btn-submit");
    if (btn) { btn.disabled = false; btn.textContent = submittedRef ? "Update submitted survey" : "Submit survey"; }
    clearTimeout(saveTimer);
    setSaveIndicator("idle", "Saving…");
    saveTimer = setTimeout(() => {
      try {
        state.meta.form_version = SCHEMA.version;
        localStorage.setItem(LS_KEY, JSON.stringify(state));
        saveTimer = null;
        setSaveIndicator("", "Draft saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      } catch (e) {
        setSaveIndicator("idle", "Not saved (storage full) - download a JSON copy");
      }
    }, 450);
  }

  function hydrate(parsed) {
    const upgraded = window.SurveyData.migrate(parsed);
    const base = blankState();
    for (const [key, value] of Object.entries(upgraded)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) continue;
      if (value && typeof value === "object" && !Array.isArray(value)) base[key] = { ...(base[key] || {}), ...value };
      else if (!(key in base)) base[key] = value;
    }
    return base;
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      state = hydrate(JSON.parse(raw));
      submittedRef = state.meta.ref || null;
      return true;
    } catch (e) { return false; }
  }

  /* ------------------------------ submit ------------------------------- */
  function buildPayload() {
    const p = JSON.parse(JSON.stringify(state));
    // strip empty values to keep the CSV tidy
    SCHEMA.sections.forEach((sec) => {
      if (sec.special) return;
      sec.fields.forEach((f) => {
        if (f.t === "repeater") {
          p[sec.id][f.k] = (p[sec.id][f.k] || []).map((item) => {
            const o = {};
            f.fields.forEach((sf) => { if (!isEmpty(item[sf.k])) o[sf.k] = item[sf.k]; });
            return o;
          }).filter((o) => Object.keys(o).length);
        } else if (isEmpty(p[sec.id][f.k])) delete p[sec.id][f.k];
        if (f.note && isEmpty(p[sec.id][f.k + "_notes"])) delete p[sec.id][f.k + "_notes"];
        if (f.photos && isEmpty(p[sec.id][f.photos.k])) delete p[sec.id][f.photos.k];
        if (f.followup && isEmpty(p[sec.id][f.followup.k])) delete p[sec.id][f.followup.k];
        if (f.estimate) {
          const est = p[sec.id][f.estimate.k] || {};
          if (!estimateTotal(est).any) delete p[sec.id][f.estimate.k];
          else { p[sec.id][f.estimate.k] = { ...est, _currency: f.estimate.currency, _note: "Estimate from surveyor-entered quantities and unit rates; not a quotation." }; }
        }
      });
    });
    p.meta = Object.assign({}, p.meta, {
      form_version: SCHEMA.version,
      ref: submittedRef || p.meta.ref || "",
      saved_at: new Date().toISOString(),
      surveyor: (state.respondent && state.respondent.surveyor_name) || "",
      company: (state.respondent && state.respondent.company_name) || "",
      device: navigator.userAgent.slice(0, 120),
    });
    return p;
  }

  async function submit() {
    let missing = 0;
    SCHEMA.sections.forEach((sec) => { if (!sec.special) missing += sectionStats(sec).requiredLeft; });
    if (missing > 0) {
      const ok = confirm(`${missing} required field(s) are still empty.\n\nSubmit anyway as an incomplete draft?\n\n(Choose Cancel to go back and fill them.)`);
      if (!ok) { goTo(SCHEMA.sections.length - 1); return; }
    }
    const btn = $("#btn-submit");
    btn.disabled = true; btn.textContent = "Submitting…";
    const payload = buildPayload();
    payload.meta.ref = payload.meta.ref || localRef();
    try {
      if (serverMode === null) await probeServer();
      let ref;
      if (serverMode) {
        const data = await getJSON("api/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!data.ok) throw new Error(data.error || "Server rejected the submission");
        ref = data.ref;
      } else {
        ref = payload.meta.ref || localRef();
        const list = localSubs();
        const now = new Date().toISOString().replace("T", " ").slice(0, 19);
        const i = list.findIndex((r) => r.ref === ref);
        const rec = {
          id: i >= 0 ? list[i].id : Date.now(),
          ref,
          company: payload.meta.company || "",
          site: (state.respondent && state.respondent.plant_location) || "",
          payload,
          created_at: i >= 0 ? list[i].created_at : now,
          device_only: true,
        };
        if (i >= 0) list[i] = rec; else list.push(rec);
        localSubsSave(list);
      }
      submittedRef = ref;
      state.meta.ref = ref;
      payload.meta.ref = ref;
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(LS_ID_KEY, ref);
      toast(`Submitted ✓  Reference: ${ref}`, "ok");
      btn.textContent = `Submitted ✓  ${ref}`;
      renderReview();
    } catch (e) {
      toast("Submit failed: " + e.message + ". Use 'Download JSON copy'.", "err");
      btn.disabled = false; btn.textContent = "Submit survey";
    }
  }

  /* ------------------------------- misc -------------------------------- */
  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  /* review-card buttons are re-created by render(), so they must be re-bound
     every time - hence a dedicated function called from render() */
  function bindReview() {
    const submitBtn = $("#btn-submit");
    if (!submitBtn) return;

    submitBtn.onclick = submit;
    submitBtn.disabled = false;
    submitBtn.textContent = submittedRef ? "Update submitted survey" : "Submit survey";

    $("#btn-download-json").onclick = () => {
      const company = ((state.respondent && state.respondent.company_name) || "site")
        .replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      download(`ppe-survey-${company}-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(buildPayload(), null, 2));
      toast("JSON copy downloaded.");
    };

    $("#btn-print").onclick = () => {
      const before = currentSection;
      goTo(SCHEMA.sections.length - 1, true);
      document.body.classList.add("printing-survey");
      try { window.print(); }
      finally { document.body.classList.remove("printing-survey"); goTo(before, true); }
    };

    $("#btn-new").onclick = () => {
      if (!confirm("Start a new blank survey? The current draft will be cleared (submit or download it first).")) return;
      clearTimeout(saveTimer); saveTimer = null;
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_ID_KEY);
      state = blankState();
      submittedRef = null;
      setSaveIndicator("idle", "New survey — not saved yet");
      render();
      goTo(0);
      toast("New blank survey started.");
    };

    $("#btn-import").onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const parsed = JSON.parse(fr.result);
          if (!window.SurveyData.valid(parsed)) throw new Error("Not a survey");
          state = hydrate(parsed);
          submittedRef = state.meta.ref || null;
          save(); render(); goTo(0); toast("JSON imported.");
        } catch (err) { toast("That file is not a valid survey JSON.", "err"); }
      };
      fr.readAsText(file);
      e.target.value = "";
    };
  }

  function bindGlobals() {
    $("#btn-next").onclick = () => {
      const sec = SCHEMA.sections[currentSection];
      if (!sec.special) {
        const st = sectionStats(sec);
        if (st.requiredLeft > 0) {
          markInvalid();
          if (!confirm(`This section has ${st.requiredLeft} required field(s) left (highlighted in red).\n\nContinue anyway?`)) {
            scrollToFirstInvalid();
            return;
          }
        }
      }
      goTo(currentSection + 1);
    };
    $("#btn-prev").onclick = () => goTo(currentSection - 1);
  }

  function markInvalid() {
    const sec = SCHEMA.sections[currentSection];
    if (sec.special) return;
    const card = $("#sec-" + sec.id);
    if (!card) return;
    $$(".invalid", card).forEach((el) => el.classList.remove("invalid"));
    sec.fields.forEach((f) => {
      if (!f.r || !fieldVisible(f)) return;
      $$(`[data-grid="${sec.id}"] > [data-path="${cssEsc(f.k)}"]`, card).forEach((w) => {
        const el = $("input, select, textarea", w);
        if (el && isEmpty(state[sec.id][f.k])) el.classList.add("invalid");
      });
    });
  }

  function scrollToFirstInvalid() {
    const card = $("#sec-" + SCHEMA.sections[currentSection].id);
    const el = card && $(".invalid", card);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }), el.focus({ preventScroll: true });
  }

  /* ------------------------------- boot -------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    const hadDraft = loadDraft();
    render();
    if (hadDraft) {
      toast(state.meta.migrated_from ? "Draft restored. Earlier detailed answers are preserved." : "Draft restored from this device.");
      setSaveIndicator("", "Draft restored");
    }
    probeServer();

    $("#menu-btn").onclick = () => $("#sidebar").classList.toggle("open");

    document.addEventListener("keydown", (e) => {
      if (e.altKey && e.key === "ArrowRight") goTo(currentSection + 1);
      if (e.altKey && e.key === "ArrowLeft") goTo(currentSection - 1);
    });

    // clear the red "required" highlight as soon as a field is answered
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains("invalid")) t.classList.remove("invalid");
    }, true);
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains("invalid")) t.classList.remove("invalid");
    }, true);

  });
  // Flush a pending keystroke before navigation; debounce must not lose it.
  window.addEventListener("pagehide", () => {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) { /* a JSON copy remains available */ }
    saveTimer = null;
  });
})();
