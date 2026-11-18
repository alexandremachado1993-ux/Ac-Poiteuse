/* =============================================================
   leave.js — paid leave balance (taken from CONGER PAYER, 3.0)
   - leaveDaysPerMonth days per full month (team rule, 2.5 = 30
     days a year counted Monday → Saturday);
   - 3.0: acquisition period May → May (rule leaveAcquisitionStart
     "MM-DD"; "" = since the hire date, no reset). The balance is
     the CURRENT period: earned since max(hire date, period start)
     + days carried over (on request, recorded by a decider:
     Store.carryOver) − leave taken in the period. What was left at
     the end of the previous period is shown as "can be carried
     over on request";
   - 3.0: days counted Monday → SATURDAY (French "jours ouvrables", consistent
     with 2.5 days a month), French public holidays excluded
     (entity "france"); a half day (one-day request, morning or
     afternoon) counts 0.5;
   - a day of APPROVED leave that was nevertheless worked (urgent
     call-out) STAYS taken (decision of 10/11/2026).
   ============================================================= */

const Leave = (() => {
    "use strict";

    const perMonth = () => Number(Store.org().leaveDaysPerMonth) || 0;   /* team rule: 2.5 days a month (2.8) */

    function fullMonthsSince(startIso, refIso) {
        const start = Utils.utcDate(startIso);
        const ref = Utils.utcDate(refIso);
        let months = (ref.getUTCFullYear() - start.getUTCFullYear()) * 12 + (ref.getUTCMonth() - start.getUTCMonth());
        if (ref.getUTCDate() < start.getUTCDate()) months -= 1;
        return Math.max(0, months);
    }

    /* Is this day counted as a leave day? Monday → Friday ("monFri", default) or → Saturday ("monSat"), public holidays
       excluded (entity "france"). Sundays and holidays are never counted nor drawn as leave. */
    function countsOn(iso, profile) {
        const date = Utils.utcDate(iso);
        const wd = date.getUTCDay();
        const last = Store.org().leaveDayMode === "monSat" ? 6 : 5;   /* 3.1: "monFri" = Monday → Friday (a week = 5 days) */
        return wd >= 1 && wd <= last && !((!profile || profile.entity === "france") && Holidays.isHoliday(date));
    }

    /* Leave days of a request (countsOn: weekdays of the rule, holidays excluded); half day = 0.5 */
    function workingDaysOf(request, profile) {
        let days = 0;
        const end = Utils.utcDate(request.endDate);
        const date = Utils.utcDate(request.startDate);
        while (date <= end) {
            if (countsOn(date.toISOString().slice(0, 10), profile)) days += 1;
            date.setUTCDate(date.getUTCDate() + 1);
        }
        if (days && request.startDate === request.endDate && (request.half === "am" || request.half === "pm")) days = 0.5;
        return days;
    }

    /* Start ("YYYY-MM-DD") of the acquisition period containing refIso, or "" (no period) */
    function periodStart(refIso) {
        const mmdd = String(Store.org().leaveAcquisitionStart || "");
        if (!/^\d\d-\d\d$/.test(mmdd)) return "";
        const year = Number(refIso.slice(0, 4));
        const candidate = year + "-" + mmdd;
        return candidate <= refIso ? candidate : (year - 1) + "-" + mmdd;
    }

    const minusYear = iso => (Number(iso.slice(0, 4)) - 1) + iso.slice(4);
    const later = (a, b) => (a > b ? a : b);

    /* Earned / taken / pending between `from` (inclusive) and `to` (exclusive, "" = open) */
    function slice(profile, from, to, ref) {
        const begin = later(profile.hireDate, from || profile.hireDate);
        const earned = begin <= ref ? fullMonthsSince(begin, ref) * perMonth() : 0;
        let taken = 0, pending = 0;
        Store.requests().filter(r => r.type === "paid_leave" && (!from || r.startDate >= from) && (!to || r.startDate < to)).forEach(r => {
            const n = workingDaysOf(r, profile);
            if (r.status === "approved") taken += n;
            else if (Store.isOpenRequest(r)) pending += n;   /* submitted, not decided yet: forecast only */
        });
        return { earned, taken, pending };
    }

    /* { earned, carried, taken, available, pending, period, previousLeft } or null when the hire date is missing */
    function balance(refIso) {
        const profile = Store.profile();
        if (!profile.hireDate) return null;
        const ref = refIso || Utils.isoLocal(new Date());
        const start = periodStart(ref);
        const cur = slice(profile, start, "", ref);
        const carried = start ? Store.leaveMovements(profile.id).filter(m => m.kind === "carry" && m.period === start)
            .reduce((n, m) => n + (Number(m.days) || 0), 0) : 0;
        let previousLeft = 0;
        if (start && profile.hireDate < start) {
            const prevStart = minusYear(start);
            const prev = slice(profile, prevStart, start, start);
            const prevCarried = Store.leaveMovements(profile.id).filter(m => m.kind === "carry" && m.period === prevStart)
                .reduce((n, m) => n + (Number(m.days) || 0), 0);
            previousLeft = Math.max(0, prev.earned + prevCarried - prev.taken - carried);
        }
        return { earned: cur.earned, carried, taken: cur.taken, available: cur.earned + carried - cur.taken, pending: cur.pending,
            period: start, previousLeft };
    }

    return { fullMonthsSince, countsOn, workingDaysOf, periodStart, balance };
})();
