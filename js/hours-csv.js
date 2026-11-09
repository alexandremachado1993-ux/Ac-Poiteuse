/* =============================================================
   hours-csv.js — CSV export / import of clocked hours
   ---------------------------------------------------------------
   ONE file, ONE row per entry, opened and edited in Excel
   (";" separator, UTF-8 with BOM):

     Date;Start;End;Activity;Client;Line;Note;Duration (h);Pay;Origin
   ("Pay" = paid, or "deducted (not paid)" for lunch and uncounted breaks)

   (column titles in the current language)
   - Import reads only the first 7 columns; the last 3 are
     informative (export). An exported file can be re-imported.
   - Date DD/MM/YYYY (or YYYY-MM-DD), times HH:MM.
   - End ≤ start = the next day (night work).
   - Activity recognised in French, English, Spanish and German
     (case and accents ignored), and the version 1 French keys.
   - Client found by name; created when unknown. An unknown line
     is added to the client.
   - An identical entry (same category, same start and end to the
     minute) is ignored: re-importing a file adds nothing.
   - Imported entries are flagged "imported"; overlaps with
     existing hours are imported but shown under "To check".
   - Limit: an entry of 24 h or more cannot be written with a
     single date (it is flagged "to check" anyway).
   ============================================================= */

const HoursCsv = (() => {
    "use strict";

    const COLUMN_KEYS = ["csv.date", "csv.start", "csv.end", "csv.activity", "csv.client", "csv.line",
        "csv.note", "csv.duration", "csv.counted", "csv.flag"];

    const columns = () => COLUMN_KEYS.map(k => I18n.t(k));

    /* simplified label (any language, or v1 French key) → category key */
    let categoryMap = null;
    function categoryFromText(raw) {
        if (!categoryMap) {
            categoryMap = {};
            Segments.CATEGORIES.forEach(c => {
                categoryMap[c.key] = c.key;
                I18n.allTranslations("cat." + c.key).forEach(l => { categoryMap[Utils.simplify(l)] = c.key; });
            });
            Object.assign(categoryMap, { travail: "work", trajet: "travel", reunion: "meeting", pause: "break",
                pause_dejeuner: "lunch", dejeuner: "lunch", repas: "lunch", autre: "other" });
        }
        return categoryMap[Utils.simplify(raw)] || null;
    }

    function flagOf(e) {
        if (e.edited) return I18n.t("flag.edited");
        if (e.manual) return I18n.t("flag.manual");
        if (e.imported) return I18n.t("flag.imported");
        return "";
    }

    /* Row of an entry (also used by exports.js) */
    function rowOf(e, settings) {
        return [Utils.dateDmy(Utils.isoLocal(e.start)), Utils.clock(e.start), Utils.clock(e.end),
            Segments.label(e.category), e.clientName, e.line, e.note,
            Math.round((e.end - e.start) / 36000) / 100,
            I18n.t(Segments.isCounted(e.category, settings) ? "csv.paid" : "csv.unpaid"),
            flagOf(e)];
    }

    /* ---------------- Export ---------------- */

    function exportCsv(entries, fileName) {
        const settings = Store.settings();
        const rows = [columns()].concat(entries.map(e => {
            const r = rowOf(e, settings);
            r[7] = String(r[7]).replace(".", I18n.language() === "en" ? "." : ",");
            return r;
        }));
        Utils.download(Utils.toCsv(rows), fileName + ".csv", "text/csv;charset=utf-8");
        return entries.length;
    }

    function template() {
        const c = columns().slice(0, 7);
        const client = I18n.t("csv.sampleClient");
        const rows = [c,
            ["03/11/2026", "06:30", "08:00", Segments.label("travel"), client, "", ""],
            ["03/11/2026", "08:00", "12:00", Segments.label("work"), client, I18n.t("csv.sampleLine") + " 1", I18n.t("csv.sampleNote")],
            ["03/11/2026", "12:00", "13:00", Segments.label("lunch"), "", "", ""],
            ["03/11/2026", "13:00", "17:30", Segments.label("work"), client, I18n.t("csv.sampleLine") + " 1", ""],
            ["03/11/2026", "22:00", "02:00", Segments.label("work"), client, I18n.t("csv.sampleLine") + " 2", I18n.t("csv.sampleNight")]];
        Utils.download(Utils.toCsv(rows), I18n.t("csv.templateFile") + ".csv", "text/csv;charset=utf-8");
    }

    /* ---------------- Import ---------------- */

    function clientForName(name, line) {
        if (!name) return "";
        const target = Utils.simplify(name);
        const c = Store.clients().find(x => Utils.simplify(x.name) === target);
        if (!c) {
            const r = Store.addClient({ name, city: "", lines: line ? [line] : [] });
            return r ? r.client.id : "";
        }
        if (line && !c.lines.some(l => Utils.simplify(l) === Utils.simplify(line))) {
            Store.updateClient(c.id, { name: c.name, city: c.city, lines: c.lines.concat([line]) });
        }
        return c.id;
    }

    /* Returns { imported, duplicates, overlaps, errors: [row numbers…] } */
    function importCsv(text) {
        return Store.batch(() => importRows(text));
    }

    function importRows(text) {
        const result = { imported: 0, duplicates: 0, overlaps: 0, errors: [] };
        const minute = ms => Math.floor(ms / 60000);
        Utils.parseCsv(text).forEach((r, i) => {
            const number = i + 1;
            if (i === 0 && !Utils.parseDate(r[0])) return;   /* header row, whatever its language */
            const date = Utils.parseDate(r[0]);
            const startTime = Utils.parseTime(r[1]);
            const endTime = Utils.parseTime(r[2]);
            const cat = categoryFromText(r[3]);
            if (!date || !startTime || !endTime || !cat) { result.errors.push(number); return; }

            const start = Utils.timestamp(date, startTime);
            let end = Utils.timestamp(date, endTime);
            if (end <= start) end = Utils.timestamp(Utils.addDays(date, 1), endTime);
            if (end > Date.now()) { result.errors.push(number); return; }

            const existing = Store.entries();
            /* Compared to the minute: clocking stores seconds, the file does not.
               Without this, re-importing an export would double everything. */
            if (existing.some(e => e.end != null && e.category === cat &&
                minute(e.start) === minute(start) && minute(e.end) === minute(end))) {
                result.duplicates += 1; return;
            }
            if (existing.some(e => e.start < end && (e.end == null ? Date.now() : e.end) > start)) result.overlaps += 1;

            const withClient = Segments.category(cat).client;
            const line = withClient ? String(r[5] || "").trim() : "";
            /* counted only when really saved (the store refuses without the right) */
            const saved = Store.addEntry({
                category: cat,
                clientId: withClient ? clientForName(String(r[4] || "").trim(), line) : "",
                line,
                note: String(r[6] || "").trim(),
                start, end,
                imported: true
            });
            if (saved) result.imported += 1;
        });
        return result;
    }

    function resultMessage(r) {
        const parts = [I18n.t("csv.msg.imported", { n: r.imported })];
        if (r.duplicates) parts.push(I18n.t("csv.msg.duplicates", { n: r.duplicates }));
        if (r.overlaps) parts.push(I18n.t("csv.msg.overlaps", { n: r.overlaps }));
        if (r.errors.length) parts.push(I18n.t("csv.msg.errors", { n: r.errors.length,
            rows: r.errors.slice(0, 10).join(", ") + (r.errors.length > 10 ? "…" : "") }));
        return parts.join(" — ") + ".";
    }

    return { columns, rowOf, exportCsv, template, importCsv, resultMessage, categoryFromText, clientForName };
})();
