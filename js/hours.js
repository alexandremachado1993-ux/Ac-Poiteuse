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
     39 h. A day of leave/time off that was WORKED (urgent call-out,
     decision of 10/11/2026) STAYS credited and taken; the hours worked
     that day are paid on top with the absenceWorkedRate premium (50 %).
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
     holiday hours worked × holidayRate + hours worked on a day of
     approved leave / time off × absenceWorkedRate (one rate per hour,
     the highest: a holiday or leave hour is never also a night hour).
   - TRANSPARENCY: lunch (and short breaks when not counted) are
     deducted and shown in the summary: clocked − lunch − breaks =
     counted.
   - Time off taken = dayHours per credited (not holiday) day
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

    /* Approved paid leave / time off covering a day ("other" absences: no effect) */
    const creditedAbsences = iso => Store.absencesOn(iso).filter(a => a.type === "paid_leave" || a.type === "time_off");

    /* Credited days of a week (2.5): holidays and approved
       leave / time off, each worth dayHours. */
    function weekCredits(year, week, sheet) {
        const o = Store.org();
        const out = { holiday: 0, leave: 0, timeOff: 0, days: 0, workedDays: 0, beforeHire: 0 };
        const hire = (Store.profile() || {}).hireDate || "";   /* 4.1.7: nothing counts before the hire date */
        for (let i = 0; i < 7; i++) {
            const iso = isoDayOf(year, week, i);
            const worked = sheet ? dayTotal(sheet.days[DAYS[i]]) : 0;
            const weekend = i > 4;
            if (hire && iso < hire) {   /* not employed yet: no credit, and the day leaves the goal (prorata) */
                if (!(weekend && o.creditWeekdaysOnly)) out.beforeHire += 1;
                continue;
            }
            if (isHolidayIso(iso)) {
                if (!weekend || (o.weekendHolidays && !o.creditWeekdaysOnly)) { out.holiday += o.dayHours; out.days += 1; }
                continue;
            }
            if (weekend && o.creditWeekdaysOnly) continue;   /* 3.0: 39 h ÷ 5, Monday → Friday (register "OK") */
            /* only paid leave and time off are credited ("other" absences: no effect) */
            const abs = creditedAbsences(iso);
            if (!abs.length) continue;
            if (worked > 0) out.workedDays += 1;   /* urgent call-out: the day stays credited (10/11/2026) */
            const share = abs.every(a => a.half === "am" || a.half === "pm") ? 0.5 : 1;   /* 3.0: half day */
            if (abs.some(a => a.type === "paid_leave")) out.leave += o.dayHours * share; else out.timeOff += o.dayHours * share;
            out.days += share;
        }
        out.total = out.holiday + out.leave + out.timeOff;
        return out;
    }

    /* Overtime counters on the extra hours, by rank of the hour in the week */
    function overtime(total, base) {
        const o = Store.org();
        if (total - base <= 0) return { h25: 0, h50: 0 };
        return { h25: overlap(base, total, o.overtime25From, o.overtime50From), h50: overlap(base, total, o.overtime50From, Infinity) };
    }

    /* Counters of a week. nightPremium = night hours that get the night rate
       (not on a holiday nor on a day of leave / time off: one rate per hour, the highest). */
    function counters(sheet) {
        let holidayWorked = 0, absenceWorked = 0, nightPremium = 0, clockedMs = 0, lunchMs = 0, breakMs = 0;
        const countBreaks = Store.settings().countShortBreaks;
        DAYS.forEach((key, i) => {
            const j = sheet.days[key];
            const iso = isoDayOf(sheet.year, sheet.week, i);
            if (isHolidayIso(iso)) holidayWorked += dayTotal(j);
            else if (dayTotal(j) > 0 && creditedAbsences(iso).length) absenceWorked += dayTotal(j);
            else nightPremium += (j && j.night) || 0;
            const by = (j && j.summary && j.summary.byCategory) || {};
            Object.keys(by).forEach(c => { clockedMs += by[c]; });
            lunchMs += by.lunch || 0;
            if (!countBreaks) breakMs += by.break || 0;
        });
        return { sunday: sundayTotal(sheet), holidayWorked, absenceWorked, night: nightTotal(sheet), nightPremium,
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
        /* 4.1.7: week of the hiring (or before): the goal loses the days not yet employed, prorata of dayHours */
        const goal = Math.max(0, o.weeklyBase - homeReduction - credits.beforeHire * o.dayHours);
        const done = worked + credits.total;
        /* ranks for the overtime counters: worked hours above the goal once the
           credited days are taken into account (base = goal − credits) */
        const base = Math.max(0, goal - credits.total);
        const c = counters(sheet);
        const nightByDay = DAYS.map(k => (sheet.days[k] && sheet.days[k].night) || 0);
        const nightDays3 = nightByDay.filter(n => n >= NIGHT_HABITUAL_H - EPS).length;
        /* 3.0: the managers' register "OK" (rules 11.1 → 11.8). cumul = hours worked
           (+ night / holiday / urgent premiums when premiumsBeforeOvertime); goal = 39 h −
           the credited holidays (− time off / leave when the rule says so); every hour above
           is valued × (1 + overtimeRecoveryRate); a week under the goal counts 0 (or its
           shortfall with negativeWeeks = "carry"). Weeks paidOvertimeFromWeek → ToWeek:
           the valued hours are PAID (not banked). Sunday hours: separate counter. */
        /* hours worked during approved leave / time off (urgent call-out): the day stays
           credited and the hours are PAID with the absenceWorkedRate premium — outside
           the week's value, like the register (which only notes "to be paid") */
        const premiumsAll = c.night * o.nightRate + c.holidayWorked * o.holidayRate;
        const before = o.premiumsBeforeOvertime ? premiumsAll : 0;
        const regGoal = Math.max(0, goal - credits.holiday - (o.timeOffReducesGoal ? credits.timeOff : 0) - (o.leaveReducesGoal ? credits.leave : 0));
        const cumul = worked + before;
        const extra = cumul - regGoal;
        const rate = 1 + (Number(o.overtimeRecoveryRate) || 0);
        const band = Math.max(0, o.overtime50From - o.overtime25From);
        const valued = extra > 0
            ? (o.overtime50InRecovery ? Math.min(extra, band) * rate + Math.max(0, extra - band) * 1.5 : extra * rate)
            : (o.negativeWeeks === "carry" ? extra : 0);
        const paid = Number(o.paidOvertimeFromWeek) > 0 && sheet.week >= Number(o.paidOvertimeFromWeek) && sheet.week <= Number(o.paidOvertimeToWeek);
        const register = { cumul, goal: regGoal, extra, valued, paid, premiumsIn: before, premiumsAfter: o.premiumsBeforeOvertime ? 0 : premiumsAll,
            absencePay: c.absenceWorked * (1 + (Number(o.absenceWorkedRate) || 0)), sundayPremium: c.sunday * (Number(o.sundayRate) || 0) };
        return {
            worked, goal, credits, done, base, register,
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
            premiumAbsence: c.absenceWorked * o.absenceWorkedRate,
            premiums: c.nightPremium * o.nightRate + c.holidayWorked * o.holidayRate + c.absenceWorked * o.absenceWorkedRate,
            nightDays3,
            habitualNight: nightDays3 >= NIGHT_HABITUAL_TIMES,
            complete: isoDayOf(sheet.year, sheet.week, 6) < Utils.isoLocal(Date.now()),
            empty: worked <= 0
        };
    }

    /* Time off taken: filter = { year, month (0-11, optional), upTo ("YYYY-MM-DD", optional) }.
       A worked day of approved time off STAYS taken (10/11/2026): the hours worked
       that day are paid on top with the absenceWorkedRate premium. */
    function timeOffTaken(filter) {
        let days = 0;
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
                    const weekendOff = Store.org().creditWeekdaysOnly && (date.getUTCDay() === 0 || date.getUTCDay() === 6);
                    if (!Holidays.isHoliday(date) && !leaveSameDay && !weekendOff) {
                        const match = (filter.year === undefined || date.getUTCFullYear() === filter.year) &&
                            (filter.month === undefined || date.getUTCMonth() === filter.month) &&
                            (filter.upTo === undefined || iso <= filter.upTo) &&
                            (filter.from === undefined || iso >= filter.from) && (filter.to === undefined || iso <= filter.to);   /* 4.4: one week of a report */
                        if (match) days += r.startDate === r.endDate && (r.half === "am" || r.half === "pm") ? 0.5 : 1;
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
        const registerMethod = Store.org().hoursMethod !== "countdown";
        let bank = 0, premiums = 0, premiumNight = 0, premiumHoliday = 0, premiumAbsence = 0, toPay = 0, sundayPremium = 0, valued = 0;
        let current = null;
        const totals = { sunday: 0, holidayWorked: 0, absenceWorked: 0, night: 0, nightPremium: 0, h25: 0, h50: 0 };
        forEachWeek((w, sheet) => {
            const s = weekSummary(sheet);
            if (isoDayOf(w.year, w.week, 6) <= upTo) {
                if (registerMethod) {
                    const v = s.register.valued + s.register.premiumsAfter;
                    valued += v;
                    if (s.register.paid) toPay += v; else bank += v;
                    toPay += s.register.absencePay;   /* urgent hours during leave / time off: paid + 50 % */
                    sundayPremium += s.register.sundayPremium;
                } else bank += s.toRecover;
                premiums += s.premiums;
                premiumNight += s.premiumNight;
                premiumHoliday += s.premiumHoliday;
                premiumAbsence += s.premiumAbsence;
                ["sunday", "holidayWorked", "absenceWorked", "night", "nightPremium"].forEach(k => { totals[k] += s.counters[k]; });
                totals.h25 += s.overtime.h25;
                totals.h50 += s.overtime.h50;
            } else if (!current || w.year * 100 + w.week > current.year * 100 + current.week) {
                current = { year: w.year, week: w.week, worked: s.worked, done: s.done, goal: s.goal, toRecover: s.toRecover };
            }
        });
        const taken = timeOffTaken({ upTo });
        const balance = bank - taken;
        /* register method (3.0): premiums are already inside the valued weeks → total = balance;
           countdown method (2.9.1): raw balance + night 25 % + holiday 50 % (+ leave worked 50 %) */
        return { method: registerMethod ? "register" : "countdown", bank, taken, balance, premiums, premiumNight, premiumHoliday, premiumAbsence,
            total: registerMethod ? balance : balance + premiums, toPay, valued, sundayPremium, counters: totals, current, upTo };
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

    /* ---------------- 4.5: figures of a week / a month (Reports, dashboards, exports) ----------------
       One calculation for every screen (moved from page-reports.js, unchanged):
       weeks attached to the month by their Thursday; leave and time off by calendar month. */
    const FIGURES = ["worked", "normal", "ot25", "ot50", "result", "toPay", "timeOff", "leaveDays", "night", "sunday"];

    /* Paid leave days taken between two dates (same rule as leave.js) */
    function leaveDaysBetween(fromIso, toIso) {
        const entries = Store.entries(), settings = Store.settings();
        let n = 0;
        for (let iso = fromIso; iso <= toIso; iso = Utils.addDays(iso, 1)) {
            /* same rule as leave.js (Leave.countsOn: days of the rule, holidays excluded), half day = 0.5 */
            if (!Leave.countsOn(iso)) continue;
            const leave = Store.absencesOn(iso).filter(a => a.type === "paid_leave");
            if (!leave.length) continue;
            if (Segments.day(iso, entries, settings, Date.now()).totalMs > 0) continue;
            n += leave.every(a => a.startDate === a.endDate && (a.half === "am" || a.half === "pm")) ? 0.5 : 1;
        }
        return n;
    }

    /* 4.4: other approved absences (justified, family event, training…) in days of the rule */
    function absenceDaysBetween(fromIso, toIso) {
        let n = 0;
        for (let iso = fromIso; iso <= toIso; iso = Utils.addDays(iso, 1)) {
            if (!Leave.countsOn(iso)) continue;
            const other = Store.absencesOn(iso).filter(a => a.type !== "paid_leave" && a.type !== "time_off");
            if (other.length) n += other.every(a => a.startDate === a.endDate && (a.half === "am" || a.half === "pm")) ? 0.5 : 1;
        }
        return n;
    }

    const monthBounds = (year, m) => [Utils.isoLocal(new Date(year, m, 1)), Utils.isoLocal(new Date(year, m + 1, 0))];
    const empty = () => FIGURES.reduce((o, k) => { o[k] = 0; return o; }, {});

    /* Figures of one week attached to month m (current account) */
    function weekFigures(year, m, w, entries, settings, now, register) {
        const r = empty();
        const s = weekSummary(Segments.weekSheet(w.year, w.week, entries, settings, now));
        r.worked = s.worked; r.ot25 = s.overtime.h25; r.ot50 = s.overtime.h50;
        r.night = s.counters.night; r.sunday = s.counters.sunday;
        if (!s.empty && s.complete) {
            /* 3.0 (register "OK"): banked value, or PAID for the summer weeks; urgent hours during leave always paid */
            if (!register) r.result = s.toRecover;
            else {
                const v = s.register.valued + s.register.premiumsAfter;
                if (s.register.paid) r.toPay += v; else r.result += v;
                r.toPay += s.register.absencePay;
            }
        }
        r.normal = r.worked - r.ot25 - r.ot50;
        /* leave and time off: the days of this week inside the month */
        const [first, last] = monthBounds(year, m);
        const from = isoDayOf(w.year, w.week, 0), to = isoDayOf(w.year, w.week, 6);
        const a = from > first ? from : first, b = to < last ? to : last;
        if (a <= b) { r.timeOff = timeOffTaken({ from: a, to: b }); r.leaveDays = leaveDaysBetween(a, b); }
        /* 4.4.1: hours of the week imported from an Excel file (managers' register, timesheet import) */
        const t0 = Utils.localDate(from).getTime(), t1 = Utils.localDate(Utils.addDays(to, 1)).getTime();
        const imported = entries.some(e => e.imported && e.start >= t0 && e.start < t1);
        return Object.assign(r, { year: w.year, week: w.week, from, to, imported, record: Store.weekValidation(null, w.year, w.week) });
    }

    /* Figures of one month for the current account: the sum of its weeks; leave and time off by calendar month */
    function monthFigures(year, m) {
        const entries = Store.entries(), settings = Store.settings(), now = Date.now();
        const register = Store.org().hoursMethod !== "countdown";
        const weeks = weeksOfMonth(year, m).map(w => weekFigures(year, m, w, entries, settings, now, register));
        const r = sumFigures(weeks);
        const [first, last] = monthBounds(year, m);
        r.timeOff = timeOffTaken({ year, month: m });
        r.leaveDays = leaveDaysBetween(first, last);
        r.weeks = weeks;
        return r;
    }

    const sumFigures = rows => FIGURES.reduce((o, k) => { o[k] = rows.reduce((s, r) => s + r[k], 0); return o; }, {});


    /* ---------------- 4.5: contract and annual target (decisions of 17/11/2026) ----------------
       - contract of a person: user.contracts = [{ from, weeklyHours, normalHours, workDays }],
         each one applies from its date until the next one; before the first one (or with
         none) the team rule applies (org.weeklyBase, 35 h normal, 5 days). Monthly hours =
         weekly × 52 ÷ 12 (39 h → 169 h; × 12 = 2 028 h a year).
       - prorata in CALENDAR DAYS: each employed day of a year is worth weekly × 52 ÷ (days of
         that year: 365 or 366), from the hire date (user.hireDate) to the leaving date
         (user.leaveDate); a change of contract applies from its date. One function, used
         by every screen and every document.
       - three counters: worked (every clocked hour; "validated" = weeks validated by the team
         lead or locked), assimilated (holidays on a working day, approved absences of every
         type — paid leave, time off, justified, family event, training, other — worth the
         contract hours of a day: weekly ÷ working days), valued = worked + assimilated. */
    const TARGET_ABSENCE_KEYS = { paid_leave: "leave", time_off: "timeOff" };
    function defaultContract() {
        const o = Store.org();
        return { from: "", weeklyHours: o.weeklyBase, normalHours: Math.min(35, o.weeklyBase), workDays: 5 };
    }
    function contractsOf(user) {
        return (user && Array.isArray(user.contracts) ? user.contracts : []).filter(c => c && c.from).slice().sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    }
    function contractOn(user, iso) {
        let c = null;
        contractsOf(user).forEach(x => { if (x.from <= iso) c = x; });
        return Object.assign(defaultContract(), c || {});
    }
    const monthlyHours = c => c.weeklyHours * 52 / 12;
    const daysInYear = y => (new Date(y, 1, 29).getMonth() === 1 ? 366 : 365);
    const contractDayHours = c => c.weeklyHours / (c.workDays || 5);
    /* working day of the contract: Monday → Friday (5 days) or Monday → Saturday (6 days) */
    const isWorkingDay = (iso, c) => { const d = Utils.utcDate(iso).getUTCDay(); return d >= 1 && d <= Math.min(6, c.workDays || 5); };

    /* employed part of [from, to] (null when none) */
    function employedSpan(user, from, to) {
        const a = user && user.hireDate && user.hireDate > from ? user.hireDate : from;
        const b = user && user.leaveDate && user.leaveDate < to ? user.leaveDate : to;
        return a <= b ? [a, b] : null;
    }

    /* Target hours between two dates (calendar-day prorata) */
    function targetBetween(user, from, to) {
        const span = employedSpan(user, from, to);
        if (!span) return 0;
        let total = 0;
        for (let iso = span[0]; iso <= span[1]; iso = Utils.addDays(iso, 1)) {
            const c = contractOn(user, iso);
            total += c.weeklyHours * 52 / daysInYear(+iso.slice(0, 4));
        }
        return total;
    }

    /* Worked / validated / assimilated hours between two dates — CURRENT account (Store.withUser) */
    function hoursBetween(from, to) {
        const user = Store.profile();
        const out = { worked: 0, validated: 0, assimilated: 0, holiday: 0, leave: 0, timeOff: 0, other: 0 };
        const span = employedSpan(user, from, to);
        if (!span) return out;
        const entries = Store.entries(), settings = Store.settings(), now = Date.now();
        const status = {};
        for (let iso = span[0]; iso <= span[1]; iso = Utils.addDays(iso, 1)) {
            const h = Segments.day(iso, entries, settings, now).totalMs / 3600000;
            out.worked += h;
            if (h) {
                const w = isoWeek(Utils.utcDate(iso)), k = w.year + "-" + w.week;
                if (!(k in status)) { const r = Store.weekValidation(null, w.year, w.week); status[k] = !!r && (r.status === "pending_lock" || r.status === "locked"); }
                if (status[k]) out.validated += h;
            }
            const c = contractOn(user, iso);
            if (!isWorkingDay(iso, c)) continue;
            const dayH = contractDayHours(c);
            if (isHolidayIso(iso)) { out.holiday += dayH; continue; }   /* holiday not worked: credited (no deficit) */
            const abs = Store.absencesOn(iso);
            if (!abs.length) continue;
            const share = abs.every(a => a.startDate === a.endDate && (a.half === "am" || a.half === "pm")) ? 0.5 : 1;
            const kind = abs.map(a => TARGET_ABSENCE_KEYS[a.type]).filter(Boolean)[0] || "other";
            out[kind] += dayH * share;
        }
        out.assimilated = out.holiday + out.leave + out.timeOff + out.other;
        return out;
    }

    /* Annual target of the CURRENT account for `year`, as at `endIso` (end of a report, never after today) */
    function yearProgress(year, endIso) {
        const user = Store.profile();
        const first = year + "-01-01", last = year + "-12-31";
        const today = Utils.isoLocal(Date.now());
        const end = [endIso || last, last, today].sort()[0];
        const target = targetBetween(user, first, last);
        const targetToDate = end >= first ? targetBetween(user, first, end) : 0;
        const h = end >= first ? hoursBetween(first, end) : hoursBetween(last, first);
        const valued = h.worked + h.assimilated;
        return Object.assign({ year, end, target, targetToDate, valued, gap: valued - targetToDate, remaining: Math.max(0, target - valued),
            pct: target > 0 ? valued / target : 0, contract: contractOn(user, end >= first ? end : first), monthly: monthlyHours(contractOn(user, end >= first ? end : first)) }, h);
    }

    return {
        MONTHLY_REFERENCE, DAYS, NIGHT_YEARLY_H, NIGHT_HABITUAL_H, NIGHT_HABITUAL_TIMES,
        mondayOf, isoWeek, monthOfWeek, isoDayOf,
        dayTotal, sheetTotal, sundayTotal, nightTotal,
        weekCredits, overtime, counters, weekSummary, timeOffTaken, lastCompletedSunday, recoveryBalance,
        nightLast12Months, weeksOfMonth,
        FIGURES, monthBounds, defaultContract, contractsOf, contractOn, monthlyHours, targetBetween, hoursBetween, yearProgress, weekFigures, monthFigures, sumFigures, leaveDaysBetween, absenceDaysBetween};
})();
