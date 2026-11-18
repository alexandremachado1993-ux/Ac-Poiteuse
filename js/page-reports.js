/* =============================================================
   page-reports.js — Reports
   Filters: people (technicians: themselves; team lead and managers —
   "reports.team.view" — choose SEVERAL technicians of their perimeter,
   2.9, or everybody) and period (year, from month, to month; 4.4:
   shortcuts "This month" / "This year").
   Figures — ONLY existing engine functions, no new formula:
   - per week (weeks attached to the month by their Thursday, as in the
     timesheet), summed into the month: hours worked, normal hours
     (= worked − overtime counters), overtime +25 % / +50 % (Hours.overtime),
     result of the completed weeks, hours to be paid, night and Sunday;
   - per month (calendar days): time off taken (Hours.timeOffTaken), paid
     leave days taken (approved, days of the rule, not holiday, not worked —
     same rule as leave.js); a week shows the days of the week inside the month;
   - 4.4: other absences (days) and time split per activity (Segments.day);
   - whole team: one line per technician for the period.
   Export (4.4): one "Export" button → choices (format, parts, several
   technicians, language of the document) → report-doc.js.
   ============================================================= */

const ReportsPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let root = null;
    const st = { people: null, year: 0, from: 0, to: 11 };   /* people: null = every technician shown, else the chosen ids */

    /* short column titles for the on-screen table (full titles in the tiles and exports) */
    const SHORT_KEYS = ["rep.col.worked", "rep.col.normal", "rep.col.ot25", "rep.col.ot50", "rep.col.result", "rep.col.toPay", "rep.col.timeOff", "rep.col.leaveDays", "rep.col.night", "rep.col.sunday"];
    const FIELDS = Hours.FIGURES;
    const ACTIVITIES = ["work", "travel", "meeting", "training", "home"];

    /* 4.5: weeks, months and day counts come from the engine (Hours) — one calculation for every screen */
    const { absenceDaysBetween, monthBounds } = Hours;
    const month = (year, m) => Hours.monthFigures(year, m);
    const sum = Hours.sumFigures;
    const fmt = (k, v) => (k === "leaveDays" ? Utils.days(v) : Utils.hours(v));

    /* Technicians of the viewer's perimeter (sections), active accounts */
    function technicians() {
        return Permissions.visibleUsers().filter(x => x.accountStatus !== "disabled" && (x.role === "technician" || Permissions.has(x.id, "timeclock.self")) &&
            x.id !== Store.currentUserId());
    }
    const teamView = () => Permissions.can("reports.team.view") && technicians().length > 0;

    /* ids shown: the person themselves, or the technicians chosen (all by default) */
    function selected() {
        if (!teamView()) return [Store.currentUserId()];
        const all = technicians().map(x => x.id);
        const chosen = (st.people || all).filter(id => all.indexOf(id) >= 0);
        return chosen.length ? chosen : all;
    }

    function months() {
        const list = [];
        for (let m = st.from; m <= st.to; m++) list.push(m);
        return list;
    }

    /* Everything about one person for the period (exports and screen) */
    function personData(id) {
        return Store.withUser(id, () => {
            const rows = months().map(m => Object.assign({ label: Utils.monthName(m), month: m }, month(st.year, m)));
            const [first] = monthBounds(st.year, st.from), [, last] = monthBounds(st.year, st.to);
            /* 4.5: annual target as at the end of the report, recovery balance (same functions as the dashboard) */
            return { user: Store.user(id), rows, total: sum(rows), absences: absenceDaysBetween(first, last), split: activitySplit(first, last),
                year: Hours.yearProgress(st.year, last), balance: Hours.recoveryBalance() };
        });
    }

    function data() {
        const ids = selected();
        if (ids.length > 1) {
            const rows = ids.map(id => { const p = personData(id); return Object.assign({ label: p.user.name || "", id }, p.total); });
            return { team: true, rows, total: sum(rows) };
        }
        const p = personData(ids[0]);
        return { team: false, rows: p.rows, total: p.total };
    }

    /* 4.4 (E): hours per activity over the period (current account), counted activities only */
    function activitySplit(fromIso, toIso) {
        const entries = Store.entries(), settings = Store.settings(), now = Date.now();
        const out = ACTIVITIES.reduce((o, k) => { o[k] = 0; return o; }, {});
        for (let iso = fromIso; iso <= toIso; iso = Utils.addDays(iso, 1)) {
            const d = Segments.day(iso, entries, settings, now);
            ACTIVITIES.forEach(k => { out[k] += (k === "home" ? d.homeMs : d.byCategory[k] || 0) / 3600000; });
        }
        return out;
    }

    /* Month by month for the chart (2.9): the person shown, or the whole team summed */
    function monthly(people) {
        return months().map((m, i) => {
            const r = { label: new Date(2000, m, 1).toLocaleDateString(I18n.locale(), { month: "short" }), normal: 0, ot25: 0, ot50: 0 };
            people.forEach(p => { const x = p.rows[i]; r.normal += x.normal; r.ot25 += x.ot25; r.ot50 += x.ot50; });
            return r;
        });
    }

    function chartHtml(people) {
        const list = monthly(people);
        const max = Math.max.apply(null, list.map(r => r.normal + r.ot25 + r.ot50).concat([1]));
        const parts = [["normal", "var(--chart-normal)"], ["ot25", "var(--chart-ot25)"], ["ot50", "var(--chart-ot50)"]];   /* 4.0: navy, warning, burgundy (style.css) */
        return '<div class="card"><div class="title-row"><h2>' + E(t("rep.chartTitle")) + '</h2><div class="legend" style="margin:0">' +
            parts.map(([k, c]) => '<span><i style="background:' + c + '"></i>' + E(t("rep." + k)) + "</span>").join("") + "</div></div>" +
            '<div class="wk-bars" style="grid-template-columns:repeat(' + list.length + ',minmax(0,1fr))">' + list.map(r => {
                const total = r.normal + r.ot25 + r.ot50;
                return '<div class="wk-bar"><span class="wk-val">' + (total ? Utils.hours(total) : "—") + '</span><div class="wk-col" style="height:180px">' +
                    parts.map(([k, c]) => r[k] > 0 ? '<span style="height:' + (r[k] / max * 100).toFixed(1) + "%;background:" + c + '"></span>' : "").join("") +
                    '</div><span class="wk-day">' + E(r.label) + "</span></div>";
            }).join("") + "</div></div>";
    }

    /* 4.4 (E): time split per activity (bars with %) */
    function splitHtml(people) {
        const tot = ACTIVITIES.reduce((o, k) => { o[k] = people.reduce((s, p) => s + p.split[k], 0); return o; }, {});
        const all = ACTIVITIES.reduce((s, k) => s + tot[k], 0);
        return '<div class="card"><h2>' + E(t("rep.splitTitle")) + "</h2>" + (all > 0 ? '<ul class="split">' + ACTIVITIES.map(k => {
            const c = Segments.category(k), pct = tot[k] / all * 100;
            return '<li><span class="split-name">' + UI.activityIcon(k) + E(Segments.label(k)) + '</span><span class="split-bar"><i style="width:' + pct.toFixed(1) + "%;background:" + c.color + '"></i></span>' +
                '<span class="split-val"><strong>' + Math.round(pct) + " %</strong> " + E(Utils.hours(tot[k])) + "</span></li>";
        }).join("") + "</ul>" : '<p class="empty">' + E(t("rep.splitNone")) + "</p>") + "</div>";
    }

    function periodLabel() {
        return Utils.monthName(st.from) + " → " + Utils.monthName(st.to) + " " + st.year;
    }

    function tableHtml(d) {
        return '<div class="scroll"><table class="table"><thead><tr><th>' + E(t(d.team ? "admin.col.person" : "rep.month")) + "</th>" +
            SHORT_KEYS.map(k => '<th class="num">' + E(t(k)) + "</th>").join("") + "</tr></thead><tbody>" +
            d.rows.map(r => "<tr><td>" + (d.team ? '<span class="person">' + UI.avatar(r.label, "small") + E(r.label) + "</span>" : E(r.label)) + "</td>" +
                FIELDS.map(k => '<td class="num' + (k === "result" && r[k] < 0 ? " negative" : "") + '">' + E(fmt(k, r[k])) + "</td>").join("") + "</tr>").join("") +
            "</tbody><tfoot><tr><td>" + E(t("rep.total")) + "</td>" + FIELDS.map(k => '<td class="num">' + E(fmt(k, d.total[k])) + "</td>").join("") +
            "</tr></tfoot></table></div>";
    }

    function who() {
        const ids = selected();
        if (teamView() && ids.length === technicians().length && ids.length > 1) return t("rep.wholeTeam");
        return ids.map(id => (Store.user(id) || {}).name || "").join(", ");
    }

    function fileBase() {
        const slug = Utils.simplify(who()).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        return t("rep.fileName") + "_" + st.year + "-" + Utils.pad(st.from + 1) + "_" + Utils.pad(st.to + 1) + (slug ? "_" + slug : "");
    }

    /* ---------------- 4.4: export window ---------------- */
    const PARTS = [["summary", "rx.p.summary"], ["pay", "rx.p.pay"], ["recovery", "rx.p.recovery"], ["chart", "rx.p.chart"], ["table", "rx.p.table"]];
    const DEFAULTS = { format: "pdf", parts: { summary: true, pay: true, recovery: true, chart: true, table: true, weeks: false }, team: "each", lang: "" };
    function exportPrefs() {
        const p = Store.settings().reportExport || {};
        return { format: p.format === "xlsx" ? "xlsx" : "pdf", parts: Object.assign({}, DEFAULTS.parts, p.parts || {}), team: p.team === "table" ? "table" : "each",
            lang: I18n.LANGUAGES.indexOf(p.lang) >= 0 ? p.lang : I18n.language() };
    }

    function openExport() {
        const p = exportPrefs();
        const several = selected().length > 1;
        const check = (key, label, sub) => '<label class="check' + (sub ? " rx-sub" : "") + '"><input type="checkbox" data-part="' + key + '"' + (p.parts[key] ? " checked" : "") + "> " + E(t(label)) + "</label>";
        UI.openSheet("<h2>" + E(t("rx.title")) + '</h2><p class="muted" style="margin:0 0 1rem">' + E(who() + " · " + periodLabel()) + "</p>" +
            '<div class="segmented" role="radiogroup" aria-label="' + E(t("rx.format")) + '">' +
            [["pdf", "PDF"], ["xlsx", "Excel"]].map(([k, l]) => '<button type="button" role="radio" data-format="' + k + '" aria-checked="' + (p.format === k) + '"' + (p.format === k ? ' class="active"' : "") + ">" + l + "</button>").join("") + "</div>" +
            '<fieldset class="choices rx-parts"><legend>' + E(t("rx.content")) + "</legend>" +
            PARTS.map(([k, l]) => check(k, l)).join("") + check("weeks", "rx.p.weeks", true) + "</fieldset>" +
            (several ? '<fieldset class="choices"><legend>' + E(t("rx.several")) + "</legend>" +
                [["each", "rx.each"], ["table", "rx.teamOnly"]].map(([k, l]) => '<label class="check"><input type="radio" name="rxTeam" value="' + k + '"' + (p.team === k ? " checked" : "") + "> " + E(t(l)) + "</label>").join("") + "</fieldset>" : "") +
            "<label>" + E(t("rx.lang")) + '<select id="rxLang">' + I18n.optionsHtml(p.lang) + "</select></label>" +
            '<p class="info" id="rxInfo"></p><p class="error" id="rxError"></p>' +
            '<div class="actions"><span class="spacer"></span><button type="button" class="button" data-close>' + E(t("common.cancel")) + "</button>" +
            '<button type="button" class="button primary" id="rxGo">' + UI.icon("download") + E(t("rx.go")) + "</button></div>",
        dlg => {
            let format = p.format;
            const sync = () => {
                dlg.querySelectorAll("[data-format]").forEach(b => { const on = b.dataset.format === format; b.classList.toggle("active", on); b.setAttribute("aria-checked", String(on)); });
                const table = dlg.querySelector('[data-part="table"]').checked, weeks = dlg.querySelector('[data-part="weeks"]');
                weeks.disabled = !table;
                dlg.querySelector('[data-part="chart"]').disabled = format === "xlsx";
                dlg.querySelector("#rxInfo").textContent = format === "xlsx" ? t("rx.excelInfo") : t("rx.pdfInfo");
            };
            dlg.querySelectorAll("[data-format]").forEach(b => b.addEventListener("click", () => { format = b.dataset.format; sync(); }));
            dlg.querySelector('[data-part="table"]').addEventListener("change", sync);
            sync();
            dlg.querySelector("#rxGo").addEventListener("click", () => {
                const parts = {};
                dlg.querySelectorAll("[data-part]").forEach(c => { parts[c.dataset.part] = c.checked; });
                const team = (dlg.querySelector('input[name="rxTeam"]:checked') || { value: p.team }).value;
                const lang = dlg.querySelector("#rxLang").value;
                const usable = ["summary", "pay", "recovery", "table"].concat(format === "pdf" ? ["chart"] : []).some(k => parts[k]);
                if (!usable && !(several && team === "table")) { dlg.querySelector("#rxError").textContent = t("rx.none"); return; }
                Store.updateSettings({ reportExport: { format, parts, team, lang } });
                UI.closeSheet();
                runExport({ format, parts, team: several ? team : "each", lang });
            });
        });
    }

    /* Builds the document in the chosen language (the app keeps its own) */
    function runExport(opts) {
        return I18n.withLanguage(opts.lang, () => {
            const ids = selected();
            const people = ids.map(personData);
            const period = periodLabel().charAt(0).toUpperCase() + periodLabel().slice(1);
            const model = { people, team: opts.team === "table", period, year: st.year, from: st.from, to: st.to,
                who: who(), fileBase: fileBase(), printedAt: Date.now(), parts: opts.parts };
            if (opts.format === "xlsx") {
                Utils.download(ReportDoc.workbook(model), model.fileBase + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                return model;
            }
            const html = ReportDoc.html(model);
            Utils.printHtml(html);
            return html;
        });
    }

    /* 4.7.1: "this year" of someone who only sees his own hours starts at his hiring month (no empty months) */
    function yearStart(year) {
        const hire = teamView() ? "" : String(Store.profile().hireDate || "");
        return hire && +hire.slice(0, 4) === year ? +hire.slice(5, 7) - 1 : 0;
    }

    /* 4.4 (F): period shortcuts */
    function setPeriod(kind) {
        const d = new Date();
        st.year = d.getFullYear();
        if (kind === "month") { st.from = st.to = d.getMonth(); } else { st.from = Math.min(yearStart(st.year), d.getMonth()); st.to = d.getMonth(); }
        render();
    }

    function render() {
        if (!root) return;
        const team = teamView();
        if (!st.year) { const d = new Date(); st.year = d.getFullYear(); st.to = d.getMonth(); st.from = Math.min(yearStart(st.year), st.to); }
        const ids = selected();
        const people = ids.map(personData);
        const d = ids.length > 1
            ? { team: true, rows: people.map(p => Object.assign({ label: p.user.name || "", id: p.user.id }, p.total)), total: sum(people.map(p => p.total)) }
            : { team: false, rows: people[0].rows, total: people[0].total };
        const absences = people.reduce((s, p) => s + p.absences, 0);
        const chosen = selected();
        const allOn = team && (!st.people || chosen.length === technicians().length);
        const now = new Date();
        const isMonth = st.year === now.getFullYear() && st.from === now.getMonth() && st.to === now.getMonth();
        const isYear = st.year === now.getFullYear() && st.from === Math.min(yearStart(st.year), now.getMonth()) && st.to === now.getMonth();
        const monthOptions = sel => Array.from({ length: 12 }, (_, m) => '<option value="' + m + '"' + (m === sel ? " selected" : "") + ">" + E(Utils.monthName(m)) + "</option>").join("");
        const years = []; for (let y = new Date().getFullYear() + 1; y >= 2024; y--) years.push(y);
        root.innerHTML = UI.pageHeader(App.labelOf("reports"), t("rep.subtitle"),
                '<button type="button" class="button primary" id="rpExport">' + UI.icon("download") + E(t("rx.export")) + "</button>") +
            /* 4.5: where the reading guide of the report is */
            '<p class="rp-help">' + UI.icon("info") + "<span>" + E(t("rep.help")) + ' <a href="#settings/readReport">' + E(t("rep.helpLink")) + "</a></span></p>" +
            '<div class="card"><div class="filters">' +
            '<div class="chips rp-quick" role="group" aria-label="' + E(t("rep.quick")) + '">' +
            '<button type="button" class="chip' + (isMonth ? " active" : "") + '" data-period="month" aria-pressed="' + isMonth + '">' + E(t("rep.thisMonth")) + "</button>" +
            '<button type="button" class="chip' + (isYear ? " active" : "") + '" data-period="year" aria-pressed="' + isYear + '">' + E(t("rep.thisYear")) + "</button></div>" +
            "<label>" + E(t("rep.year")) + '<select id="rpYear">' + years.map(y => '<option value="' + y + '"' + (y === st.year ? " selected" : "") + ">" + y + "</option>").join("") + "</select></label>" +
            "<label>" + E(t("rep.fromMonth")) + '<select id="rpFrom">' + monthOptions(st.from) + "</select></label>" +
            "<label>" + E(t("rep.toMonth")) + '<select id="rpTo">' + monthOptions(st.to) + "</select></label></div>" +
            /* 2.9: several technicians at once (team lead and managers) */
            (team ? '<div style="margin-top:1rem"><span class="muted" style="font-size:.85rem;font-weight:600">' + E(t("rep.chooseTechs")) + "</span>" +
                '<div class="chips" id="rpWho" role="group" aria-label="' + E(t("rep.chooseTechs")) + '" style="margin:.5rem 0 0">' +
                '<button type="button" class="chip' + (allOn ? " active" : "") + '" data-who="all" aria-pressed="' + allOn + '">' + E(t("rep.wholeTeam")) + "</button>" +
                technicians().map(x => { const on = !allOn && chosen.indexOf(x.id) >= 0;
                    return '<button type="button" class="chip' + (on ? " active" : "") + '" data-who="' + E(x.id) + '" aria-pressed="' + on + '">' + UI.avatar(x.name, "tiny") + E(x.name) + "</button>"; }).join("") +
                "</div></div>" : "") + "</div>" +
            '<div class="grid cols-5">' +
            UI.kpi(t("rep.normal"), Utils.hours(d.total.normal), "clock", "") +
            UI.kpi(t("rep.ot25"), Utils.hours(d.total.ot25), "reports", "warning") +
            UI.kpi(t("rep.ot50"), Utils.hours(d.total.ot50), "reports", "danger") +
            UI.kpi(t("rep.leaveDays"), fmt("leaveDays", d.total.leaveDays), "sun", "success", t("rep.timeOffSub", { value: Utils.hours(d.total.timeOff) })) +
            UI.kpi(t("rep.absences"), Utils.days(absences), "calendar", "", t("rep.absencesSub")) +
            "</div>" +
            '<div class="grid rp-charts" style="margin-top:1.1rem">' + chartHtml(people) + splitHtml(people) + "</div>" +
            '<div class="card"><h2>' + E(t(d.team ? "rep.teamTitle" : "rep.historyTitle", { period: periodLabel() })) + "</h2>" + tableHtml(d) +
            '<p class="info">' + E(t("rep.info")) + "</p>" +
            /* 4.1.7: nothing is counted before the hire date of each person (engine: Hours.weekSummary) */
            (people.filter(p => p.user && p.user.hireDate).length ? '<p class="info">' + E(t("rep.fromHire", { list: people.map(p => p.user)
                .filter(u => u && u.hireDate).map(u => (people.length > 1 ? u.name + " " : "") + Utils.dateDmy(u.hireDate)).join(", ") })) + "</p>" : "") + "</div>";
        const q = s => root.querySelector(s);
        root.querySelectorAll("[data-who]").forEach(b => b.addEventListener("click", () => {
            const id = b.dataset.who;
            if (id === "all") st.people = null;
            else {
                const cur = st.people ? st.people.slice() : [];
                const i = cur.indexOf(id);
                if (i >= 0) cur.splice(i, 1); else cur.push(id);
                st.people = cur.length ? cur : null;
            }
            render();
        }));
        root.querySelectorAll("[data-period]").forEach(b => b.addEventListener("click", () => setPeriod(b.dataset.period)));
        q("#rpYear").addEventListener("change", e => { st.year = +e.target.value; render(); });
        q("#rpFrom").addEventListener("change", e => { st.from = +e.target.value; if (st.to < st.from) st.to = st.from; render(); });
        q("#rpTo").addEventListener("change", e => { st.to = +e.target.value; if (st.from > st.to) st.from = st.to; render(); });
        q("#rpExport").addEventListener("click", openExport);
    }

    function init() {
        root = document.getElementById("page-reports");
        render();
    }

    return { init, render, data, runExport, FIELDS, fmt };
})();
