/* =============================================================
   countdown.js — display of the WEEKLY COUNTDOWN (shared by the
   Clock, Timesheet and Administration screens)
   Each week starts at −39 h (fixed goal); counted hours and credited
   days (leave, time off, holidays at 39 h ÷ 7) are added:
     −39 h + 10 h on Monday = −29 h still to work;
   above zero the hours are "extra", split into the two overtime
   counters (+25 % / +50 %) of hours.js.
   ============================================================= */

const Countdown = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;

    /* "−29 h 00 still to work" | "+2 h 00 extra" | "0 h 00 — week complete" */
    function text(value) {
        if (value < -1e-9) return t("countdown.remaining", { value: Utils.hours(value) });
        if (value > 1e-9) return t("countdown.extra", { value: "+" + Utils.hours(value) });
        return t("countdown.done");
    }

    /* { value: "−29 h 00", label: "still to work" } — for tiles where the
       sentence would be too long on one line */
    function parts(value) {
        if (value < -1e-9) return { value: Utils.hours(value), label: t("countdown.remainingLabel") };
        if (value > 1e-9) return { value: "+" + Utils.hours(value), label: t("countdown.extraLabel") };
        return { value: Utils.hours(0), label: t("countdown.doneLabel") };
    }

    /* Figure block (label + value) for a .figures grid */
    function figureHtml(summary, label) {
        const cls = summary.toRecover < 0 ? "negative" : "positive";
        const p = parts(summary.toRecover);
        return "<div><span>" + E(label) + '</span><strong class="' + cls + '">' + E(p.value) + '</strong><span class="figure-label ' + cls + '">' + E(p.label) + "</span>" +
            "<small>" + E(t("countdown.start", { base: Utils.hours(-summary.goal) })) + "</small></div>";
    }

    /* Overtime counters line, shown only when there are extra hours */
    function detailHtml(summary) {
        const o = summary.overtime;
        if (!(o.h25 > 0 || o.h50 > 0)) return "";
        return '<p class="info">' + E(t("countdown.overtime", { h25: Utils.hours(o.h25), h50: Utils.hours(o.h50) })) + "</p>";
    }

    return { text, parts, figureHtml, detailHtml };
})();
