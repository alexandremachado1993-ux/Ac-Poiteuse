/* =============================================================
   leave.js — paid leave balance (taken from CONGER PAYER)
   - leaveDaysPerMonth days per full month since the hire date (team
     rule, 2.5 = 30 days a year, 2.8),
     accumulated with no yearly reset;
   - days taken = Monday→Friday, French public holidays excluded
     (entity "france");
   - a day of APPROVED leave that was nevertheless worked (counted
     clocked time that day) is credited back.
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

    function dayWorked(iso, entries, settings) {
        return Segments.day(iso, entries, settings, Date.now()).totalMs > 0;
    }

    function workingDaysOf(request, profile, entries, settings) {
        let days = 0;
        const end = Utils.utcDate(request.endDate);
        const date = Utils.utcDate(request.startDate);
        while (date <= end) {
            const wd = date.getUTCDay();
            if (wd >= 1 && wd <= 5) {
                const iso = date.toISOString().slice(0, 10);
                const holiday = profile.entity === "france" && Holidays.isHoliday(date);
                if (!holiday && !dayWorked(iso, entries, settings)) days += 1;
            }
            date.setUTCDate(date.getUTCDate() + 1);
        }
        return days;
    }

    /* { earned, taken, available, pending } or null when the hire date is missing */
    function balance(refIso) {
        const profile = Store.profile();
        if (!profile.hireDate) return null;
        const ref = refIso || Utils.isoLocal(new Date());
        const entries = Store.entries();
        const settings = Store.settings();
        const earned = fullMonthsSince(profile.hireDate, ref) * perMonth();
        let taken = 0, pending = 0;
        Store.requests().filter(r => r.type === "paid_leave").forEach(r => {
            const n = workingDaysOf(r, profile, entries, settings);
            if (r.status === "approved") taken += n;
            else if (r.status === "pending") pending += n;
        });
        return { earned, taken, available: earned - taken, pending };
    }

    return { fullMonthsSince, workingDaysOf, balance };
})();
