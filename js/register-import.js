/* =============================================================
   register-import.js — imports the Excel hours register used
   today with the managers ("2026_Registres_Heures.xlsx": one row
   per day; French column titles, compared without accents:
   DATE, Heure de debut, Heures d'Aller, Heures de Travail, Heures
   de Retour, Heure de fin, Heures de Repas, Recuperation, CLIENT,
   Commentaire…).

   Columns are found by their TITLE (row 1), not by position, so
   that a moved column does not break the import.

   Each day becomes time-stamped entries:
     start time → travel out → work → lunch → work → travel back.
   The register does not say when lunch was taken: it is placed at
   12:00 when noon falls inside the working time, otherwise in the
   middle of it. A day whose span (end − start) does not match the
   typed durations, or with no start time (08:00 assumed), is
   flagged "to check".
   - "Recuperation" > 0 → approved time-off day (history);
   - holidays, night hours, standard hours, premiums: NOT imported,
     the app computes them itself (the register values are known to
     be unreliable — see the analysis of the file);
   - CLIENT → client (created when unknown); Commentaire → note;
   - only days up to today; re-importing the same file adds nothing
     (same duplicate rule as the CSV import).
   ============================================================= */

const RegisterImport = (() => {
    "use strict";

    /* simplified header text → field (first match wins) */
    const HEADERS = [
        ["date", ["date"]],
        ["start", ["heure de debut"]],
        ["travelOut", ["heures d'aller", "heures daller"]],
        ["work", ["heures de travail"]],
        ["travelBack", ["heures de retour"]],
        ["end", ["heure de fin"]],
        ["lunch", ["heures de repas"]],
        ["recovery", ["heures jours recuperation", "recuperation"]],
        ["client", ["client"]],
        ["comment", ["commentaire"]]
    ];

    function columns(headerRow) {
        const map = {};
        (headerRow || []).forEach((cell, i) => {
            const s = Utils.simplify(cell);
            if (!s) return;
            HEADERS.forEach(([field, names]) => {
                if (map[field] === undefined && names.some(n => s === n)) map[field] = i;
            });
        });
        return map;
    }

    /* Sheets that look like an hours register */
    function registerSheets(sheets) {
        return sheets.filter(s => {
            const c = columns(s.rows[0]);
            return c.date !== undefined && c.start !== undefined && c.work !== undefined;
        });
    }

    const hoursToMin = v => (typeof v === "number" && v > 0 ? Math.round(v * 60) : 0);

    /* Entries of one register row (pure: no storage) */
    function dayPlan(row, c) {
        const iso = XlsxReader.toIsoDate(row[c.date]);
        if (!iso) return null;
        const out = hoursToMin(row[c.travelOut]);
        const work = hoursToMin(row[c.work]);
        const back = hoursToMin(row[c.travelBack]);
        const lunch = hoursToMin(row[c.lunch]);
        const startMin = XlsxReader.toMinutes(row[c.start]);
        const endMin = XlsxReader.toMinutes(row[c.end]);
        const plan = { iso, segments: [], toCheck: false, reasons: [],
            recovery: typeof row[c.recovery] === "number" && row[c.recovery] > 0,
            client: c.client !== undefined && row[c.client] != null ? String(row[c.client]).trim() : "",
            comment: c.comment !== undefined && row[c.comment] != null ? String(row[c.comment]).trim() : "" };
        if (out + work + back === 0) return plan;

        let t = startMin;
        if (t === null) { t = 8 * 60; plan.toCheck = true; plan.reasons.push("noStart"); }
        const push = (category, minutes) => { if (minutes > 0) { plan.segments.push({ category, from: t, to: t + minutes }); t += minutes; } };

        push("travel", out);
        if (work > 0) {
            const noon = 12 * 60;
            const split = lunch > 0 ? (t <= noon && noon <= t + work ? noon - t : Math.round(work / 2)) : work;
            push("work", split);
            push("lunch", lunch);
            push("work", work - split);
        } else {
            push("lunch", lunch);
        }
        push("travel", back);

        if (startMin !== null && endMin !== null) {
            const span = (endMin < startMin ? endMin + 1440 : endMin) - startMin;
            if (Math.abs(span - (out + work + back + lunch)) > 3) { plan.toCheck = true; plan.reasons.push("span"); }
        }
        return plan;
    }

    /* Segments of a day plan as timestamps (local time) */
    function segmentTimes(plan) {
        const p = plan.iso.split("-").map(Number);
        const at = minutes => new Date(p[0], p[1] - 1, p[2], 0, minutes).getTime();
        return plan.segments.map(s => ({ category: s.category, start: at(s.from), end: at(s.to) }));
    }
    const minute = ms => Math.floor(ms / 60000);
    const isDuplicate = (list, s) => list.some(e => e.end != null && e.category === s.category &&
        minute(e.start) === minute(s.start) && minute(e.end) === minute(s.end));
    const overlaps = (list, s) => list.some(e => e.start < s.end && (e.end == null ? Date.now() : e.end) > s.start);
    const counted = { work: "work", travel: "travel" };   /* lunch is not working time */

    /* 4.5.1: pre-validation — the same reading as importSheet, NOTHING is written.
       Returns { name, from, to, days, entries, work, travel (minutes), timeOff, duplicates,
       overlaps, future, toCheck: [{ iso, reasons }], months: { "YYYY-MM": { days, work, travel, timeOff, toCheck } } } */
    function analyse(sheet) {
        const c = columns(sheet.rows[0]);
        const today = Utils.isoLocal(Date.now());
        const existing = Store.entries();
        /* same duplicate rule as Store.addApprovedRequest: a day already approved is not counted again */
        const approvedOff = new Set(Store.requests().filter(x => x.type === "time_off" && x.status === "approved" && x.startDate === x.endDate).map(x => x.startDate));
        const a = { name: sheet.name, from: "", to: "", days: 0, entries: 0, work: 0, travel: 0, timeOff: 0,
            duplicates: 0, overlaps: 0, future: 0, toCheck: [], months: {} };
        sheet.rows.slice(1).forEach(row => {
            if (!row) return;
            const plan = dayPlan(row, c);
            if (!plan || (!plan.recovery && !plan.segments.length)) return;
            if (plan.iso > today) { a.future += 1; return; }
            const key = plan.iso.slice(0, 7);
            const m = a.months[key] || (a.months[key] = { days: 0, work: 0, travel: 0, timeOff: 0, toCheck: 0 });
            if (plan.recovery && !approvedOff.has(plan.iso)) { a.timeOff += 1; m.timeOff += 1; }
            let added = 0;
            segmentTimes(plan).forEach(s => {
                if (isDuplicate(existing, s)) { a.duplicates += 1; return; }
                if (overlaps(existing, s)) a.overlaps += 1;
                added += 1;
                const k = counted[s.category];
                if (k) { const min = minute(s.end) - minute(s.start); a[k] += min; m[k] += min; }
            });
            if (!added) return;
            a.days += 1; m.days += 1; a.entries += added;
            if (!a.from || plan.iso < a.from) a.from = plan.iso;
            if (plan.iso > a.to) a.to = plan.iso;
            if (plan.toCheck) { a.toCheck.push({ iso: plan.iso, reasons: plan.reasons }); m.toCheck += 1; }
        });
        Object.keys(a.months).forEach(k => { const m = a.months[k]; if (!m.days && !m.timeOff) delete a.months[k]; });   /* nothing new that month */
        return a;
    }

    /* Imports one sheet. Returns a summary (4.5.1: + from, to, minutes of work and travel saved). */
    function importSheet(sheet) {
        return Store.batch(() => {
            const c = columns(sheet.rows[0]);
            const today = Utils.isoLocal(Date.now());
            const r = { days: 0, entries: 0, duplicates: 0, timeOff: 0, toCheck: 0, overlaps: 0, from: "", to: "", minutes: 0 };
            sheet.rows.slice(1).forEach(row => {
                if (!row) return;
                const plan = dayPlan(row, c);
                if (!plan || plan.iso > today) return;
                if (plan.recovery && Store.addApprovedRequest({ type: "time_off", startDate: plan.iso, endDate: plan.iso,
                    comment: I18n.t("reg.fromRegister") })) r.timeOff += 1;
                if (!plan.segments.length) return;

                const clientId = plan.client ? HoursCsv.clientForName(plan.client, "") : "";
                let added = 0;
                segmentTimes(plan).forEach((s, i) => {
                    const existing = Store.entries();
                    if (isDuplicate(existing, s)) { r.duplicates += 1; return; }
                    if (overlaps(existing, s)) r.overlaps += 1;
                    const withClient = Segments.category(s.category).client;
                    /* counted only when really saved (the store refuses without the right) */
                    if (Store.addEntry({ category: s.category, clientId: withClient ? clientId : "", start: s.start, end: s.end, imported: true,
                        toCheck: plan.toCheck, note: i === 0 ? plan.comment.slice(0, 200) : "" })) {
                        added += 1;
                        if (counted[s.category]) r.minutes += minute(s.end) - minute(s.start);
                    }
                });
                if (added) {
                    r.days += 1; r.entries += added; if (plan.toCheck) r.toCheck += 1;
                    if (!r.from || plan.iso < r.from) r.from = plan.iso;
                    if (plan.iso > r.to) r.to = plan.iso;
                }
            });
            return r;
        });
    }

    function message(r) {
        const parts = [I18n.t("reg.msg.imported", { days: r.days, entries: r.entries })];
        if (r.timeOff) parts.push(I18n.t("reg.msg.timeOff", { n: r.timeOff }));
        if (r.toCheck) parts.push(I18n.t("reg.msg.toCheck", { n: r.toCheck }));
        if (r.duplicates) parts.push(I18n.t("csv.msg.duplicates", { n: r.duplicates }));
        if (r.overlaps) parts.push(I18n.t("csv.msg.overlaps", { n: r.overlaps }));
        return parts.join(" — ") + ".";
    }

    return { columns, registerSheets, analyse, importSheet, message };
})();
