/* =============================================================
   exports.js — "Save as" and "Print" of the timesheet, for the
   displayed period (ISO week, or month).

   - Excel (.xlsx): 3 sheets → Summary (one column per week, one line per
     figure), Days (clocked − lunch = day total), Hours (entries);
   - HTML: standalone page (summary per week as a 2-column table, recap
     per day, then detail of the entries). The rules are in
     the separate REFERENCE DOCUMENT (explanations.js), not here;
   - PDF: prints that same document → choose "Save as PDF" in the
     browser's print window (a web app cannot produce a PDF on its
     own without a heavy library);
   - Print: same document;
   - CSV: re-importable format (hours-csv.js).
   Everything is written in the current language.

   "Month" period: entries from the 1st to the last day; summaries
   = weeks attached to the month by their Thursday (CONGER PAYER
   rule) — a week across two months may hold days of the other one.
   ============================================================= */

const Exports = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    const round = n => Math.round(n * 100) / 100;

    /* Name of the account in file names: "Damien Morvan" → "damien-morvan" */
    const nameSlug = () => Utils.simplify(Store.profile().name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    /* state = { mode, year, week, monthYear, month } (timesheet) — called in
       the context of the account shown (admin view: Store.withUser) */
    function period(state) {
        const p = periodOf(state);
        const slug = nameSlug();
        if (slug) p.fileName = p.fileName + "_" + slug;
        return p;
    }

    function periodOf(state) {
        if (state.mode === "week") {
            const mondayIso = Hours.mondayOf(state.year, state.week).toISOString().slice(0, 10);
            return {
                start: Utils.localDate(mondayIso).getTime(),
                end: Utils.localDate(Utils.addDays(mondayIso, 7)).getTime(),
                title: t("sheet.weekTitle", { n: state.week, from: Utils.dateDmy(mondayIso), to: Utils.dateDmy(Utils.addDays(mondayIso, 6)) }),
                fileName: t("export.filePrefix") + "_" + state.year + "_W" + Utils.pad(state.week),
                weeks: [{ year: state.year, week: state.week }]
            };
        }
        return {
            start: new Date(state.monthYear, state.month, 1).getTime(),
            end: new Date(state.monthYear, state.month + 1, 1).getTime(),
            title: Utils.monthName(state.month) + " " + state.monthYear,
            fileName: t("export.filePrefix") + "_" + state.monthYear + "-" + Utils.pad(state.month + 1),
            weeks: Hours.weeksOfMonth(state.monthYear, state.month)
        };
    }

    function entriesOf(p) {
        return Store.entries().filter(e => e.end != null && e.start >= p.start && e.start < p.end).sort((a, b) => a.start - b.start);
    }

    function summaries(p) {
        const entries = Store.entries();
        const settings = Store.settings();
        const now = Date.now();
        return p.weeks.map(w => {
            const sheet = Segments.weekSheet(w.year, w.week, entries, settings, now);
            return { w, sheet, s: Hours.weekSummary(sheet) };
        });
    }

    /* Summary of a week (2.5): one [label key, value in hours] per line, in the
       order of reading — clocked → lunch → worked → credited → done → goal → result */
    function summaryLines(x) {
        const s = x.s, c = s.counters, cr = s.credits;
        return [
            ["sum.clocked", c.clocked], ["sum.lunch", -c.lunch], ["sum.breaks", -c.breaks], ["sum.worked", s.worked],
            ["sum.leave", cr.leave], ["sum.timeOff", cr.timeOff], ["sum.holiday", cr.holiday],
            ["sum.done", s.done], ["sum.goal", s.goal], ["sum.toRecover", s.toRecover],
            ["sum.ot25", s.overtime.h25], ["sum.ot50", s.overtime.h50],
            ["sum.night", c.night], ["sum.premiumNight", s.premiumNight],
            ["sum.holidayWorked", c.holidayWorked], ["sum.premiumHoliday", s.premiumHoliday], ["sum.sunday", c.sunday]
        ];
    }

    const weekLabel = x => t("sum.weekShort") + x.w.week + " " + x.w.year + " (" + Utils.dateDmy(x.sheet.days.monday.iso) +
        " → " + Utils.dateDmy(x.sheet.days.sunday.iso) + ")";

    /* Per-day recap: date, clocked, lunch, day total, night (request 2.5) */
    function dayRows(p) {
        const out = [];
        summaries(p).forEach(x => Hours.DAYS.forEach(k => {
            const j = x.sheet.days[k];
            const b = j.summary;
            const clocked = Object.keys(b.byCategory).reduce((sum, c) => sum + b.byCategory[c], 0) / 3600000;
            if (clocked <= 0 || j.iso < Utils.isoLocal(p.start) || j.iso >= Utils.isoLocal(p.end)) return;
            out.push([Utils.dayName(j.iso) + " " + Utils.dateDmy(j.iso), round(clocked), round((b.byCategory.lunch || 0) / 3600000), round(j.hours), round(j.night)]);
        }));
        return out;
    }
    const DAY_KEYS = ["export.col.date", "sheet.col.clocked", "sheet.col.lunch", "sheet.col.dayTotal", "sheet.col.night"];

    /* ---------------- Excel ---------------- */

    function xlsx(p) {
        const settings = Store.settings();
        const entries = entriesOf(p);
        const weeks = summaries(p);
        const header = [[{ v: t("export.docTitle", { period: p.title }), bold: true }],
            [t("export.employee"), Store.profile().name || ""], [t("export.printedOn"), Utils.dateTime(Date.now())], []];
        /* Summary: one column per week, one line per figure */
        const lineKeys = weeks.length ? summaryLines(weeks[0]).map(l => l[0]) : [];
        const summaryRows = [[{ v: "" }].concat(weeks.map(x => ({ v: weekLabel(x), bold: true, wrap: true })))]
            .concat(lineKeys.map((key, i) => [t(key)].concat(weeks.map(x => round(summaryLines(x)[i][1])))));
        const bytes = Xlsx.create([
            { name: t("export.sheetSummary"), widths: [42].concat(weeks.map(() => 24)), rows: header.concat(summaryRows) },
            { name: t("export.sheetDays"), widths: [26, 12, 12, 12, 12],
              rows: header.concat([DAY_KEYS.map(k => ({ v: t(k), bold: true }))], dayRows(p)) },
            { name: t("export.sheetHours"), widths: [12, 8, 8, 12, 28, 12, 30, 10, 16, 10],
              rows: header.concat([HoursCsv.columns().map(v => ({ v, bold: true }))], entries.map(e => HoursCsv.rowOf(e, settings))) }
        ]);
        Utils.download(bytes, p.fileName + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return entries.length;
    }

    /* ---------------- HTML document (HTML, PDF, print) ---------------- */

    const DOCUMENT_CSS =
        "body{font:13px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111;margin:24px;max-width:1000px}" +
        "h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}h3{font-size:14px;margin:16px 0 6px}" +
        "table{width:100%;border-collapse:collapse;margin:6px 0 12px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}" +
        "th{background:#f2f2f2}.num{text-align:right;white-space:nowrap}.info{color:#555}" +
        "table.summary{width:auto;min-width:360px}table.summary tr.strong td{font-weight:700;background:#fafafa}" +
        ".doc-header{border-bottom:3px solid #C8102E;padding-bottom:8px;margin-bottom:16px}" +
        "@page{margin:14mm}@media print{body{margin:0}}";

    function documentHtml(p) {
        const settings = Store.settings();
        const name = Store.profile().name;
        const entries = entriesOf(p);
        const title = t("export.docTitle", { period: p.title });
        return '<!DOCTYPE html><html lang="' + I18n.language() + '"><head><meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            "<title>" + E(title) + "</title><style>" + DOCUMENT_CSS + "</style></head><body>" +
            '<div class="doc-header"><h1>' + E(title) + "</h1>" +
            '<div class="info">' + (name ? E(name) + " · " : "") + E(t("export.printedOn")) + " " + E(Utils.dateTime(Date.now())) + "</div></div>" +
            "<h2>" + E(t("export.sheetSummary")) + "</h2>" +
            summaries(p).map(x => '<table class="summary"><thead><tr><th colspan="2">' + E(weekLabel(x)) + "</th></tr></thead><tbody>" +
                summaryLines(x).filter(l => Math.abs(l[1]) > 1e-9 || ["sum.worked", "sum.done", "sum.goal", "sum.toRecover"].indexOf(l[0]) >= 0)
                    .map(l => '<tr class="' + (["sum.done", "sum.toRecover"].indexOf(l[0]) >= 0 ? "strong" : "") + '"><td>' + E(t(l[0])) +
                        '</td><td class="num">' + E(l[0] === "sum.toRecover" ? Countdown.text(l[1]) : Utils.hours(l[1])) + "</td></tr>").join("") +
                "</tbody></table>").join("") +
            "<h2>" + E(t("export.days")) + "</h2>" +
            (dayRows(p).length
                ? "<table><thead><tr>" + DAY_KEYS.map(k => "<th>" + E(t(k)) + "</th>").join("") + "</tr></thead><tbody>" +
                  dayRows(p).map(r => "<tr><td>" + E(r[0]) + '</td><td class="num">' + Utils.hours(r[1]) + '</td><td class="num">' +
                      (r[2] ? "−" + Utils.hours(r[2]) : "—") + '</td><td class="num"><strong>' + Utils.hours(r[3]) + '</strong></td><td class="num">' +
                      (r[4] ? Utils.hours(r[4]) : "—") + "</td></tr>").join("") + "</tbody></table>"
                : '<p class="info">' + E(t("export.noEntries")) + "</p>") +
            "<h2>" + E(t("export.detail")) + "</h2>" +
            (entries.length
                ? "<table><thead><tr>" + HoursCsv.columns().map(c => "<th>" + E(c) + "</th>").join("") + "</tr></thead><tbody>" +
                  entries.map(e => "<tr>" + HoursCsv.rowOf(e, settings).map((v, i) =>
                      "<td" + (i === 7 ? ' class="num"' : "") + ">" + E(i === 7 ? Utils.hours(v) : v) + "</td>").join("") + "</tr>").join("") +
                  "</tbody></table>"
                : '<p class="info">' + E(t("export.noEntries")) + "</p>") +
            "</body></html>";
    }

    function html(p) {
        Utils.download(documentHtml(p), p.fileName + ".html", "text/html;charset=utf-8");
        return entriesOf(p).length;
    }

    /* Prints the document in an invisible frame (print or PDF). */
    function print(p) {
        const old = document.getElementById("printFrame");
        if (old) old.remove();
        const frame = document.createElement("iframe");
        frame.id = "printFrame";
        frame.setAttribute("aria-hidden", "true");
        frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
        document.body.appendChild(frame);
        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(documentHtml(p));
        doc.close();
        setTimeout(() => {
            try { frame.contentWindow.focus(); frame.contentWindow.print(); }
            catch (e) { alert(t("export.printFailed")); }
        }, 250);
        return entriesOf(p).length;
    }

    function csv(p) {
        return HoursCsv.exportCsv(entriesOf(p), p.fileName);
    }

    const FORMATS = {
        xlsx: { label: "export.fmt.xlsx", run: xlsx, message: "export.msg.xlsx" },
        pdf: { label: "export.fmt.pdf", run: print, message: "export.msg.pdf" },
        html: { label: "export.fmt.html", run: html, message: "export.msg.html" },
        csv: { label: "export.fmt.csv", run: csv, message: "export.msg.csv" }
    };

    return { period, entriesOf, summaries, documentHtml, xlsx, html, print, csv, FORMATS };
})();
