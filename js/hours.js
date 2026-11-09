/* =============================================================
   hours.js — working hours engine (version 2.4)
   ---------------------------------------------------------------
   Every value comes from the TEAM RULES set by administrators
   (Store.org(), defaults in store.js): weekly base, value of a day,
   overtime thresholds, night period, premium rates…

   - WEEK = MONDAY → SUNDAY. The GOAL of the week is FIXED: weeklyBase
     (39 h = contract 35 h + 4 h paid at +25 % in the salary).
   - HOURS DONE (2.5) = counted hours worked + CREDITED days: each day
     of APPROVED leave or time off, and each public holiday, is ADDED
     at dayHours = 39 h ÷ 7 = 5 h 34 (any day Monday → Sunday; weekend
     holidays: rule weekendHolidays). A full week off = 7 × 5 h 34 =
     39 h. A day of leave/time off that was WORKED is not credited.
   - Result of the week = hours done − goal (countdown: starts at −39 h,
     −39 h + 10 h on Monday = −29 h still to work). Taking time off
     never makes the week negative by itself: its hours are added;
     they are taken from the time-off balance instead.
   - OVERTIME COUNTERS on the extra hours, by rank of the hour worked
     in the week: hours overtime25From+1 → overtime50From (40th → 43rd)
     "to be paid +25 %"; from overtime50From+1 (44th) "+50 %". Hours
     36 → 39 are paid by the contract: in no counter. Counters for
     payroll, NOT added to the total.
   - TOTAL to recover, like the managers' register (AB2): sum of the
     completed weeks − time off taken + night hours × nightRate +
     holiday hours worked × holidayRate (one rate per hour: a holiday
     hour is never also a night hour).
   - TRANSPARENCY: lunch (and short breaks when not counted) are
     deducted and shown in the summary: clocked − lunch − breaks =
     counted.
   - Time off taken = dayHours per credited (not worked, not holiday) day
     of approved time off, deducted from the total balance.
   - Only COMPLETED weeks count (known on Sunday evening).
   - Night-worker thresholds (agreement art. 108): information only.
   - A week belongs to the month of its Thursday.
   ============================================================= */

const Hours = (() => {
    "use strict";

    const MONTHLY_REFERENCE = 169;
    const NIGHT_HABITUAL_H = 3;       /* art. 108: ≥ 3 h of night work… */
    const NIGHT_HABITUAL_TIMES = 2;   /* …at least twice a week */
    const NIGHT_YEARLY_H = 320;       /* art. 108: ≥ 320 h over 12 months */
    const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const EPS = 1e-9;
    const H = 3600000;

    /* ---------- ISO calendar (UTC, identical to CONGER PAYER) ---------- */

    function mondayOf(year, week) {
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const day = jan4.getUTCDay() || 7;
        const monday1 = new Date(jan4);
        monday1.setUTCDate(jan4.getUTCDate() - day + 1);
        const monday = new Date(monday1);
        monday.setUTCDate(monday1.getUTCDate() + (week - 1) * 7);
        return monday;
    }

    function isoWeek(date) {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - day);
        const year = d.getUTCFullYear();
        const yearStart = new Date(Date.UTC(year, 0, 1));
        return { year, week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7) };
    }

    /* Month of a week = month of its Thursday */
    function monthOfWeek(year, week) {
        const thursday = mondayOf(year, week);
        thursday.setUTCDate(thursday.getUTCDate() + 3);
        return { year: thursday.getUTCFullYear(), month: thursday.getUTCMonth() };
    }

    function isoDayOf(year, week, index) {
        const d = mondayOf(year, week);
        d.setUTCDate(d.getUTCDate() + index);
        return d.toISOString().slice(0, 10);
    }

    /* ---------- Sheet totals ---------- */

    const dayTotal = j => (j && j.hours > 0 ? j.hours : 0);
    const sheetTotal = s => DAYS.reduce((sum, k) => sum + dayTotal(s.days[k]), 0);
    const sundayTotal = s => dayTotal(s.days.sunday);
    const nightTotal = s => DAYS.reduce((sum, k) => sum + ((s.days[k] && s.days[k].night) || 0), 0);
    const isHolidayIso = iso => Holidays.isHoliday(Utils.utcDate(iso));
    const overlap = (a1, b1, a2, b2) => Math.max(0, Math.min(b1, b2) - Math.max(a1, a2));

    /* Credited days of a week (2.5): holidays and approved, not worked
       leave / time off, each worth dayHours. */
    function weekCredits(year, week, sheet) {
        const o = Store.org();
        const out = { holiday: 0, leave: 0, timeOff: 0, days: 0 };
        for (let i = 0; i < 7; i++) {
            const iso = isoDayOf(year, week, i);
            const worked = sheet ? dayTotal(sheet.days[DAYS[i]]) : 0;
            if (isHolidayIso(iso)) {
                if (i <= 4 || o.weekendHolidays) { out.holiday += o.dayHours; out.days += 1; }
                continue;
            }
            /* only paid leave and time off are credited ("other" absences: no effect) */
            const abs = Store.absencesOn(iso).filter(a => a.type === "paid_leave" || a.type === "time_off");
            if (!abs.length || worked > 0) continue;
            if (abs.some(a => a.type === "paid_leave")) out.leave += o.dayHours; else out.timeOff += o.dayHours;
            out.days += 1;
        }
        out.total = out.holiday + out.leave + out.timeOff;
        return out;
    }

    /* Kept for the overtime ranks: goal minus credited hours */
    function weekBase(year, week, sheet) {
        return Math.max(0, Store.org().weeklyBase - weekCredits(year, week, sheet).total);
    }

    /* Overtime counters on the extra hours, by rank of the hour in the week */
    function overtime(total, base) {
        const o = Store.org();
        if (total - base <= 0) return { h25: 0, h50: 0 };
        return { h25: overlap(base, total, o.overtime25From, o.overtime50From), h50: overlap(base, total, o.overtime50From, Infinity) };
    }

    /* Counters of a week. nightPremium = night hours that get the night rate
       (not on a holiday: one rate per hour, the highest). */
    function counters(sheet) {
        let holidayWorked = 0, nightPremium = 0, clockedMs = 0, lunchMs = 0, breakMs = 0;
        const countBreaks = Store.settings().countShortBreaks;
        DAYS.forEach((key, i) => {
            const j = sheet.days[key];
            if (isHolidayIso(isoDayOf(sheet.year, sheet.week, i))) holidayWorked += dayTotal(j);
            else nightPremium += (j && j.night) || 0;
            const by = (j && j.summary && j.summary.byCategory) || {};
            Object.keys(by).forEach(c => { clockedMs += by[c]; });
            lunchMs += by.lunch || 0;
            if (!countBreaks) breakMs += by.break || 0;
        });
        return { sunday: sundayTotal(sheet), holidayWorked, night: nightTotal(sheet), nightPremium,
            clocked: clockedMs / H, lunch: lunchMs / H, breaks: breakMs / H };
    }

    function weekSummary(sheet) {
        const o = Store.org();
        const worked = sheetTotal(sheet);
        const credits = weekCredits(sheet.year, sheet.week, sheet);
        /* Home work days (05/11/2026): on the 35 h basis — the goal of the week
           loses the habitual overtime of each such day: (39 − 35) ÷ 5 = 0 h 48.
           Intervention days stay on the 39 h basis (35 h + 4 h at +25 %). */
        const homeDays = DAYS.filter(k => sheet.days[k] && sheet.days[k].summary && sheet.days[k].summary.homeMs > 0).length;
        const habitualPerDay = (o.weeklyBase - o.normalWeeklyHours) / 5;
        const homeReduction = o.homeReducesHabitual ? homeDays * habitualPerDay : 0;
        const homeHours = DAYS.reduce((n, k) => n + ((sheet.days[k] && sheet.days[k].summary && sheet.days[k].summary.homeMs) || 0), 0) / H;
        const goal = Math.max(0, o.weeklyBase - homeReduction);
        const done = worked + credits.total;
        /* ranks for the overtime counters: worked hours above the goal once the
           credited days are taken into account (base = goal − credits) */
        const base = Math.max(0, goal - credits.total);
        const c = counters(sheet);
        const nightByDay = DAYS.map(k => (sheet.days[k] && sheet.days[k].night) || 0);
        const nightDays3 = nightByDay.filter(n => n >= NIGHT_HABITUAL_H - EPS).length;
        return {
            worked, goal, credits, done, base,
            contractGoal: o.weeklyBase, homeDays, homeHours, homeReduction,
            /* habitual overtime (+25 %) EARNED this week, for the payroll preparation:
               the habitual hours, minus those of the home work days */
            habitualEarned: Math.max(0, o.habitualOvertimeHours - homeReduction),
            /* countdown: starts at −goal, ends at hours done − goal */
            toRecover: done - goal,
            overtime: overtime(worked, base),
            counters: c,
            premiumNight: c.nightPremium * o.nightRate,
            premiumHoliday: c.holidayWorked * o.holidayRate,
            premiums: c.nightPremium * o.nightRate + c.holidayWorked * o.holidayRate,
            nightDays3,
            habitualNight: nightDays3 >= NIGHT_HABITUAL_TIMES,
            complete: isoDayOf(sheet.year, sheet.week, 6) < Utils.isoLocal(Date.now()),
            empty: worked <= 0
        };
    }

    /* Time off taken: filter = { year, month (0-11, optional), upTo ("YYYY-MM-DD", optional) }.
       A worked day of approved time off is NOT counted (it would be charged twice). */
    function timeOffTaken(filter) {
        let days = 0;
        const entries = Store.entries();
        const settings = Store.settings();
        const worked = iso => Segments.day(iso, entries, settings, Date.now()).totalMs > 0;
        Store.requests()
            .filter(r => r.status === "approved" && r.type === "time_off")
            .forEach(r => {
                const date = Utils.utcDate(r.startDate);
                const end = Utils.utcDate(r.endDate);
                while (date <= end) {
                    const iso = date.toISOString().slice(0, 10);
                    /* 2.5: any day Monday → Sunday (39 h ÷ 7); not a holiday, not a day
                       already credited as paid leave (same rule as weekCredits) */
                    const leaveSameDay = Store.absencesOn(iso).some(a => a.type === "paid_leave");
                    if (!Holidays.isHoliday(date) && !leaveSameDay) {
                        const match = (filter.year === undefined || date.getUTCFullYear() === filter.year) &&
                            (filter.month === undefined || date.getUTCMonth() === filter.month) &&
                            (filter.upTo === undefined || iso <= filter.upTo);
                        if (match && !worked(iso)) days += 1;
                    }
                    date.setUTCDate(date.getUTCDate() + 1);
                }
            });
        return days * Store.org().dayHours;
    }

    /* Last Sunday before today ("YYYY-MM-DD"): end of the last completed week */
    function lastCompletedSunday() {
        const d = Utils.localDate(Utils.isoLocal(Date.now()));
        d.setDate(d.getDate() - (d.getDay() === 0 ? 7 : d.getDay()));
        return Utils.isoLocal(d);
    }

    function forEachWeek(fn) {
        const entries = Store.entries();
        const settings = Store.settings();
        const now = Date.now();
        Segments.weeksWithEntries(entries, now).forEach(w => {
            const sheet = Segments.weekSheet(w.year, w.week, entries, settings, now);
            if (sheetTotal(sheet) > 0) fn(w, sheet);
        });
    }

    /* Balance of COMPLETED weeks − time off taken up to the same date.
       `current` = the week in progress (not counted yet), or null. */
    function recoveryBalance() {
        const upTo = lastCompletedSunday();
        let bank = 0, premiums = 0, premiumNight = 0, premiumHoliday = 0;
        let current = null;
        const totals = { sunday: 0, holidayWorked: 0, night: 0, nightPremium: 0, h25: 0, h50: 0 };
        forEachWeek((w, sheet) => {
            const s = weekSummary(sheet);
            if (isoDayOf(w.year, w.week, 6) <= upTo) {
                bank += s.toRecover;
                premiums += s.premiums;
                premiumNight += s.premiumNight;
                premiumHoliday += s.premiumHoliday;
                ["sunday", "holidayWorked", "night", "nightPremium"].forEach(k => { totals[k] += s.counters[k]; });
                totals.h25 += s.overtime.h25;
                totals.h50 += s.overtime.h50;
            } else if (!current || w.year * 100 + w.week > current.year * 100 + current.week) {
                current = { year: w.year, week: w.week, worked: s.worked, done: s.done, goal: s.goal, toRecover: s.toRecover };
            }
        });
        const taken = timeOffTaken({ upTo });
        const balance = bank - taken;
        /* final = like the register's AB2: raw balance + night 25 % + holiday 50 % */
        return { bank, taken, balance, premiums, premiumNight, premiumHoliday, total: balance + premiums, counters: totals, current, upTo };
    }

    /* Counted night hours over the last 12 rolling months (art. 108). */
    function nightLast12Months(now) {
        const end = now || Date.now();
        const d = new Date(end);
        const start = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()).getTime();
        const settings = Store.settings();
        let ms = 0;
        Store.entries().forEach(e => {
            if (!Segments.isCounted(e.category, settings)) return;
            const a = Math.max(e.start, start);
            const b = Math.min(e.end == null ? end : e.end, end);
            if (b > a) Segments.pieces(a, b).forEach(p => { ms += p.night; });
        });
        return ms / 3600000;
    }

    /* ISO weeks belonging to a month (Thursday rule). */
    function weeksOfMonth(year, month) {
        const list = [];
        const seen = new Set();
        const d = new Date(Date.UTC(year, month, 1));
        d.setUTCDate(d.getUTCDate() - 7);
        for (let i = 0; i < 45; i++) {
            const w = isoWeek(d);
            const k = w.year + "-" + w.week;
            const m = monthOfWeek(w.year, w.week);
            if (!seen.has(k) && m.year === year && m.month === month) { seen.add(k); list.push(w); }
            d.setUTCDate(d.getUTCDate() + 1);
        }
        return list;
    }

    return {
        MONTHLY_REFERENCE, DAYS, NIGHT_YEARLY_H, NIGHT_HABITUAL_H, NIGHT_HABITUAL_TIMES,
        mondayOf, isoWeek, monthOfWeek, isoDayOf,
        dayTotal, sheetTotal, sundayTotal, nightTotal,
        weekBase, weekCredits, overtime, counters, weekSummary, timeOffTaken, lastCompletedSunday, recoveryBalance,
        nightLast12Months, weeksOfMonth
    };
})();
