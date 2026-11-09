/* =============================================================
   segments.js — turns time-stamped clock entries into hours
   ---------------------------------------------------------------
   The BRIDGE between clocking (start/end entries) and the hours
   engine (one sheet per day, hours.js).

   Rules:
   - counted time of a day = travel + work + meeting + other
     (+ short break IF the "count short breaks" setting is on);
     lunch is never counted;
   - travel is counted as clocked, with no distinction between
     outward / between clients / return;
   - night = part of the counted entries in the night period (team
     rules, 21:00 → 06:00 by default), calculated automatically;
   - an entry crossing midnight is split: each piece goes to its
     own day (Sunday stays Sunday).
   Device local time.
   ============================================================= */

const Segments = (() => {
    "use strict";

    /* label: translation key; client: can be attached to a client */
    const CATEGORIES = [
        { key: "work", color: "#16A34A", client: true },
        { key: "travel", color: "#2563EB", client: true },
        { key: "meeting", color: "#7E22CE", client: true },
        { key: "break", color: "#EA580C", client: false },
        { key: "lunch", color: "#B45309", client: false },
        { key: "other", color: "#475569", client: true },
        /* 2.8: home work day — fixed value (team rule homeWorkHours, 7 h), declared
           in one tap (Store.declareHomeDay), never a running timer */
        { key: "home", color: "#0D9488", client: false }
    ];
    const BY_KEY = {};
    CATEGORIES.forEach(c => { BY_KEY[c.key] = c; });

    const H = 3600000;

    function category(key) {
        return BY_KEY[key] || BY_KEY.other;
    }

    function label(key) {
        return I18n.t("cat." + category(key).key);
    }

    function isCounted(key, settings) {
        if (key === "lunch") return false;
        if (key === "break") return !!(settings && settings.countShortBreaks);
        return true;
    }

    const overlap = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));

    /* Part of [a, b) in the night period of the local day of `a` (a and b
       in the same day): 00:00 → nightEnd and nightStart → 24:00 (team rules,
       21:00 → 06:00 by default). */
    function nightWithinDay(a, b) {
        const o = Store.org();
        const x = new Date(a);
        const y = x.getFullYear(), m = x.getMonth(), d = x.getDate();
        return overlap(a, b, new Date(y, m, d, 0).getTime(), new Date(y, m, d, o.nightEnd).getTime()) +
            overlap(a, b, new Date(y, m, d, o.nightStart).getTime(), new Date(y, m, d + 1, 0).getTime());
    }

    /* Splits [start, end) at local midnights. */
    function pieces(start, end) {
        const list = [];
        let t = start;
        while (t < end) {
            const x = new Date(t);
            const midnight = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1).getTime();
            const f = Math.min(end, midnight);
            list.push({ day: Utils.isoLocal(t), start: t, end: f, night: nightWithinDay(t, f) });
            t = f;
        }
        return list;
    }

    /* Pieces of every entry for a given day. The running entry is cut at `now`. */
    function piecesOfDay(iso, entries, now) {
        const dayStart = Utils.localDate(iso).getTime();
        const dayEnd = Utils.localDate(Utils.addDays(iso, 1)).getTime();
        const result = [];
        entries.forEach(e => {
            const end = e.end == null ? now : e.end;
            if (end <= dayStart || e.start >= dayEnd || end <= e.start) return;
            pieces(Math.max(e.start, dayStart), Math.min(end, dayEnd)).forEach(p => result.push(Object.assign({ entry: e }, p)));
        });
        return result.sort((a, b) => a.start - b.start);
    }

    /* Summary of a day (ms). */
    function day(iso, entries, settings, now) {
        const summary = {
            iso, totalMs: 0, nightMs: 0, byCategory: {}, byClient: {},
            pieces: piecesOfDay(iso, entries, now || Date.now()),
            edited: false, toCheck: false
        };
        CATEGORIES.forEach(c => { summary.byCategory[c.key] = 0; });
        summary.pieces.forEach(p => {
            const e = p.entry;
            const duration = p.end - p.start;
            summary.byCategory[e.category] = (summary.byCategory[e.category] || 0) + duration;
            if (e.edited) summary.edited = true;
            if (e.toCheck) summary.toCheck = true;
            if (!isCounted(e.category, settings)) return;
            summary.totalMs += duration;
            if (e.category !== "home") summary.nightMs += p.night;   /* home day: fixed value, no night hours */
            const name = e.clientName || I18n.t("common.noClient");
            summary.byClient[name] = (summary.byClient[name] || 0) + duration;
        });
        /* home work is counted at most homeWorkHours a day ("7 h maximum") */
        const cap = (Number(Store.org().homeWorkHours) || 0) * H;
        summary.homeMs = Math.min(summary.byCategory.home || 0, cap);
        if ((summary.byCategory.home || 0) > cap) {
            const excess = summary.byCategory.home - cap;
            summary.totalMs -= excess;
            const noClient = I18n.t("common.noClient");
            summary.byClient[noClient] = Math.max(0, (summary.byClient[noClient] || 0) - excess);
        }
        return summary;
    }

    /* Sheet of an ISO week, in the format expected by Hours:
       { year, week, days: { monday: { hours, night, iso, summary } … } } */
    function weekSheet(year, week, entries, settings, now) {
        const monday = Hours.mondayOf(year, week);
        const sheet = { year, week, days: {} };
        Hours.DAYS.forEach((key, i) => {
            const d = new Date(monday);
            d.setUTCDate(monday.getUTCDate() + i);
            const iso = d.toISOString().slice(0, 10);
            const s = day(iso, entries, settings, now);
            sheet.days[key] = { iso, hours: s.totalMs / H, night: s.nightMs / H, summary: s };
        });
        return sheet;
    }

    /* ISO weeks (year/week) containing at least one entry. */
    function weeksWithEntries(entries, now) {
        const seen = {};
        entries.forEach(e => {
            const end = e.end == null ? (now || Date.now()) : e.end;
            pieces(e.start, Math.max(end, e.start)).forEach(p => {
                const w = Hours.isoWeek(Utils.utcDate(p.day));
                seen[w.year + "-" + w.week] = w;
            });
        });
        return Object.keys(seen).map(k => seen[k]);
    }

    /* Anomalies: overlaps, very long entries, "to check" flags. */
    function anomalies(entries, now) {
        const sorted = entries.slice().sort((a, b) => a.start - b.start);
        const list = [];
        for (let i = 0; i < sorted.length; i++) {
            const e = sorted[i];
            const end = e.end == null ? (now || Date.now()) : e.end;
            if (e.toCheck) list.push({ type: "toCheck", entry: e, text: I18n.t("anomaly.toCheck") });
            if (end - e.start > 16 * H) list.push({ type: "long", entry: e, text: I18n.t("anomaly.long") });
            const next = sorted[i + 1];
            if (next && end > next.start) {
                /* a meal INSIDE an activity (older data): the meal is NOT deducted — say it plainly */
                const mealInside = next.category === "lunch" && e.category !== "lunch" && e.category !== "break" && next.end != null && next.end <= end;
                list.push(mealInside
                    ? { type: "mealInside", entry: e, other: next, text: I18n.t("anomaly.mealInside", { from: Utils.clock(next.start), to: Utils.clock(next.end) }) }
                    : { type: "overlap", entry: e, other: next, text: I18n.t("anomaly.overlap", { time: Utils.clock(next.start) }) });
            }
        }
        return list;
    }

    /* Gaps longer than `minutes` between two pieces of the same day. */
    function gaps(daySummary, minutes) {
        const limit = (minutes || 15) * 60000;
        const list = [];
        const p = daySummary.pieces;
        for (let i = 1; i < p.length; i++) {
            if (p[i].start - p[i - 1].end > limit) list.push({ from: p[i - 1].end, to: p[i].start });
        }
        return list;
    }

    return { CATEGORIES, category, label, isCounted, nightWithinDay, pieces, day, weekSheet, weeksWithEntries, anomalies, gaps };
})();
