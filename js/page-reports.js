/* =============================================================
   page-reports.js — Reports (version 2.6)
   Filters: person (technicians: themselves; admins: one technician or
   the whole team) and period (year, from month, to month).
   Figures — ONLY existing engine functions, no new formula:
   - per month (weeks attached to the month by their Thursday, as in
     the timesheet): hours worked, normal hours (= worked − overtime
     counters), overtime +25 % / +50 % (Hours.overtime), result of the
     completed weeks, time off taken (Hours.timeOffTaken), paid leave
     days taken (approved, Monday→Friday, not holiday, not worked —
     same rule as leave.js), night and Sunday hours;
   - whole team: one line per technician for the period.
   Export: Excel (.xlsx, xlsx.js) and PDF (print of a standalone page).
   ============================================================= */

const ReportsPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let root = null;
    const st = { person: "", year: 0, from: 0, to: 11 };

    const KEYS = ["rep.worked", "rep.normal", "rep.ot25", "rep.ot50", "rep.result", "rep.timeOff", "rep.leaveDays", "rep.night", "rep.sunday"];
    /* short column titles for the on-screen table (full titles in the tiles and exports) */
    const SHORT_KEYS = ["rep.col.worked", "rep.col.normal", "rep.col.ot25", "rep.col.ot50", "rep.col.result", "rep.col.timeOff", "rep.col.leaveDays", "rep.col.night", "rep.col.sunday"];

    /* Paid leave days taken in a month (same rule as leave.js) */
    function leaveDaysInMonth(year, month) {
        const entries = Store.entries(), settings = Store.settings();
        let n = 0;
        const daysIn = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= daysIn; d++) {
            const date = new Date(year, month, d);
            const wd = date.getDay();
            const iso = Utils.isoLocal(date);
            if (wd === 0 || wd === 6 || Holidays.isHoliday(Utils.utcDate(iso))) continue;
            if (!Store.absencesOn(iso).some(a => a.type === "paid_leave")) continue;
            if (Segments.day(iso, entries, settings, Date.now()).totalMs > 0) continue;
            n += 1;
        }
        return n;
    }

    /* Figures of one month for the current account */
    function month(year, m) {
        const entries = Store.entries(), settings = Store.settings(), now = Date.now();
        const r = { worked: 0, normal: 0, ot25: 0, ot50: 0, result: 0, timeOff: 0, leaveDays: 0, night: 0, sunday: 0 };
        Hours.weeksOfMonth(year, m).forEach(w => {
            const s = Hours.weekSummary(Segments.weekSheet(w.year, w.week, entries, settings, now));
            r.worked += s.worked; r.ot25 += s.overtime.h25; r.ot50 += s.overtime.h50;
            r.night += s.counters.night; r.sunday += s.counters.sunday;
            if (!s.empty && s.complete) r.result += s.toRecover;
        });
        r.normal = r.worked - r.ot25 - r.ot50;
        r.timeOff = Hours.timeOffTaken({ year, month: m });
        r.leaveDays = leaveDaysInMonth(year, m);
        return r;
    }

    const FIELDS = ["worked", "normal", "ot25", "ot50", "result", "timeOff", "leaveDays", "night", "sunday"];
    const sum = rows => FIELDS.reduce((o, k) => { o[k] = rows.reduce((s, r) => s + r[k], 0); return o; }, {});
    const fmt = (k, v) => (k === "leaveDays" ? (Math.round(v * 100) / 100).toLocaleString(I18n.locale()) + " " + t("common.daysShort") : Utils.hours(v));

    function technicians() { return Store.users().filter(x => x.role === "technician"); }

    function data() {
        const months = [];
        for (let m = st.from; m <= st.to; m++) months.push(m);
        if (st.person === "all") {
            const rows = technicians().map(x => Object.assign({ label: x.name }, Store.withUser(x.id, () => sum(months.map(m => month(st.year, m))))));
            return { team: true, rows, total: sum(rows) };
        }
        const rows = Store.withUser(st.person, () => months.map(m => Object.assign({ label: Utils.monthName(m) }, month(st.year, m))));
        return { team: false, rows, total: sum(rows) };
    }

    function periodLabel() {
        return Utils.monthName(st.from) + " → " + Utils.monthName(st.to) + " " + st.year;
    }

    function tableHtml(d, full) {
        return '<div class="scroll"><table class="table"><thead><tr><th>' + E(t(d.team ? "admin.col.person" : "rep.month")) + "</th>" +
            (full ? KEYS : SHORT_KEYS).map(k => '<th class="num">' + E(t(k)) + "</th>").join("") + "</tr></thead><tbody>" +
            d.rows.map(r => "<tr><td>" + (d.team ? '<span class="person">' + UI.avatar(r.label, "small") + E(r.label) + "</span>" : E(r.label)) + "</td>" +
                FIELDS.map(k => '<td class="num' + (k === "result" && r[k] < 0 ? " negative" : "") + '">' + E(fmt(k, r[k])) + "</td>").join("") + "</tr>").join("") +
            "</tbody><tfoot><tr><td>" + E(t("rep.total")) + "</td>" + FIELDS.map(k => '<td class="num">' + E(fmt(k, d.total[k])) + "</td>").join("") +
            "</tr></tfoot></table></div>";
    }

    function who() {
        return st.person === "all" ? t("rep.wholeTeam") : (Store.user(st.person) || {}).name || "";
    }

    function fileBase() {
        const slug = Utils.simplify(who()).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        return t("rep.fileName") + "_" + st.year + "-" + Utils.pad(st.from + 1) + "_" + Utils.pad(st.to + 1) + (slug ? "_" + slug : "");
    }

    function exportXlsx() {
        const d = data();
        const head = [[{ v: t("rep.docTitle", { who: who(), period: periodLabel() }), bold: true }], [t("export.printedOn"), Utils.dateTime(Date.now())], []];
        const rows = head.concat([[{ v: t(d.team ? "admin.col.person" : "rep.month"), bold: true }].concat(KEYS.map(k => ({ v: t(k), bold: true, wrap: true })))])
            .concat(d.rows.map(r => [r.label].concat(FIELDS.map(k => Math.round(r[k] * 100) / 100))))
            .concat([[{ v: t("rep.total"), bold: true }].concat(FIELDS.map(k => ({ v: Math.round(d.total[k] * 100) / 100, bold: true })))]);
        const bytes = Xlsx.create([{ name: t("nav.reports"), widths: [28].concat(KEYS.map(() => 14)), rows }]);
        Utils.download(bytes, fileBase() + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }

    function exportPdf() {
        const d = data();
        const css = "body{font:12px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#333333;margin:20px}h1{font-size:18px;margin:0 0 4px;color:#C8102E}" +
            "p{color:#6B6B6B;margin:0 0 12px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #E2E2E2;padding:5px 6px;text-align:left}" +
            "th{background:#F5F5F5;font-size:10px;text-transform:uppercase;color:#6B6B6B}.num{text-align:right;white-space:nowrap}tfoot td{font-weight:700}.avatar{display:none}" +
            ".negative{color:#B91C1C}@page{size:landscape;margin:12mm}";
        const html = '<!DOCTYPE html><html lang="' + I18n.language() + '"><head><meta charset="UTF-8"><title>' + E(fileBase()) + "</title><style>" + css + "</style></head><body>" +
            "<h1>" + E(t("rep.docTitle", { who: who(), period: periodLabel() })) + "</h1><p>" + E(t("export.printedOn")) + " " + E(Utils.dateTime(Date.now())) + "</p>" +
            tableHtml(d, true) + "</body></html>";
        const old = document.getElementById("repFrame");
        if (old) old.remove();
        const frame = document.createElement("iframe");
        frame.id = "repFrame";
        frame.setAttribute("aria-hidden", "true");
        frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
        document.body.appendChild(frame);
        const doc = frame.contentWindow.document;
        doc.open(); doc.write(html); doc.close();
        setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { alert(t("export.printFailed")); } }, 250);
        return html;
    }

    function render() {
        if (!root) return;
        const admin = Auth.isAdmin();
        if (!st.year) { const d = new Date(); st.year = d.getFullYear(); st.to = d.getMonth(); st.from = 0; }
        if (!admin) st.person = Store.currentUserId();
        else if (!st.person) st.person = "all";
        const d = data();
        const monthOptions = sel => Array.from({ length: 12 }, (_, m) => '<option value="' + m + '"' + (m === sel ? " selected" : "") + ">" + E(Utils.monthName(m)) + "</option>").join("");
        const years = []; for (let y = new Date().getFullYear() + 1; y >= 2024; y--) years.push(y);
        root.innerHTML = UI.pageHeader(t("nav.reports"), t("rep.subtitle"),
                '<button type="button" class="button" id="rpXlsx">' + UI.icon("download") + "Excel</button>" +
                '<button type="button" class="button" id="rpPdf">' + UI.icon("print") + "PDF</button>") +
            '<div class="card"><div class="filters">' +
            (admin ? "<label>" + E(t("cal.filterPerson")) + '<select id="rpWho"><option value="all">' + E(t("rep.wholeTeam")) + "</option>" +
                technicians().map(x => '<option value="' + E(x.id) + '"' + (st.person === x.id ? " selected" : "") + ">" + E(x.name) + "</option>").join("") + "</select></label>" : "") +
            "<label>" + E(t("rep.year")) + '<select id="rpYear">' + years.map(y => '<option value="' + y + '"' + (y === st.year ? " selected" : "") + ">" + y + "</option>").join("") + "</select></label>" +
            "<label>" + E(t("rep.fromMonth")) + '<select id="rpFrom">' + monthOptions(st.from) + "</select></label>" +
            "<label>" + E(t("rep.toMonth")) + '<select id="rpTo">' + monthOptions(st.to) + "</select></label></div></div>" +
            '<div class="grid cols-4">' +
            UI.kpi(t("rep.normal"), Utils.hours(d.total.normal), "clock", "") +
            UI.kpi(t("rep.ot25"), Utils.hours(d.total.ot25), "reports", "warning") +
            UI.kpi(t("rep.ot50"), Utils.hours(d.total.ot50), "reports", "danger") +
            UI.kpi(t("rep.leaveDays"), fmt("leaveDays", d.total.leaveDays), "sun", "success", t("rep.timeOffSub", { value: Utils.hours(d.total.timeOff) })) +
            "</div>" +
            '<div class="card" style="margin-top:1rem"><h2>' + E(t(d.team ? "rep.teamTitle" : "rep.historyTitle", { period: periodLabel() })) + "</h2>" + tableHtml(d) +
            '<p class="info">' + E(t("rep.info")) + "</p></div>";
        const q = s => root.querySelector(s);
        if (q("#rpWho")) q("#rpWho").addEventListener("change", e => { st.person = e.target.value; render(); });
        q("#rpYear").addEventListener("change", e => { st.year = +e.target.value; render(); });
        q("#rpFrom").addEventListener("change", e => { st.from = +e.target.value; if (st.to < st.from) st.to = st.from; render(); });
        q("#rpTo").addEventListener("change", e => { st.to = +e.target.value; if (st.from > st.to) st.from = st.to; render(); });
        q("#rpXlsx").addEventListener("click", exportXlsx);
        q("#rpPdf").addEventListener("click", exportPdf);
    }

    function init() {
        root = document.getElementById("page-reports");
        render();
    }

    return { init, render, data };
})();
