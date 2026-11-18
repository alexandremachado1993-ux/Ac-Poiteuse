/* =============================================================
   page-dashboard.js — one dashboard per PROFILE (redesign 2.9)
   Only real data, computed with the existing engine (Hours, Leave,
   Segments). Each block follows a PERMISSION, never a role name:
   - person who clocks (timeclock.self): hero with the live status and
     the week ring, leave / time off / overtime with small charts, week
     bars by activity, own leave request step by step, last week's
     validation, today's log;
   - team view (employees.team.view / timeclock.team.view / employees.manage),
     limited to the viewer's PERIMETER (sections), then:
       · team lead (timesheet.week.review, no final decision): "my team on
         the field" (live), things to do (weeks to validate, opinions on
         leave, error reports), next week's absences;
       · quality manager (timeclock.correction.approve): validation queue,
         compliance checks of the week, last backup;
       · director (leave.global.approve without corrections): 12-month
         figures, decisions, North / South, accounting export;
     plus for all: counters, each technician at a glance, month recap,
     recent activity.
   3.2: each block is described { id, label, kind, size, sizes, html } and
   placed by Layout (order, visibility, width chosen by the person).
   ⚠️ Demo mode: "team" = the accounts of THIS device.
   ============================================================= */

const DashboardPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    const TYPE_KEYS = UI.LEAVE_TYPE_KEYS;
    const STATE = UI.PERSON_STATES;
    /* Compliance thresholds (10/11/2026) — confirmed on 10/11/2026 (alerts only, never blocking) */
    const LIMITS = { dayH: 10, weekH: 48, restH: 11, mealAfterH: 6, openH: 16 };
    let root = null;
    /* 3.2: personal arrangement (layout.js) — widths allowed by the content of each block */
    const FULL = [12], CARD = [4, 6, 8, 12], WIDE = [6, 8, 12], KPI = [3, 4, 6, 12];
    let editing = false;
    let scope = "";   /* 4.1.1: team view filter — "" | "s:<section id>" | "u:<user id>" (this session only) */
    let current = { view: "", blocks: [] };   /* blocks of the last drawing (Settings → My workspace) */
    const block = (id, label, size, sizes, html) => ({ id, label, kind: "block", size, sizes, html });
    const widget = (id, label, html, size) => ({ id, label, kind: "widget", size: size || 3, sizes: KPI, html });
    const editButton = () => '<button type="button" class="button' + (editing ? " primary" : "") + '" id="dbLayout" aria-pressed="' + editing + '">' +
        UI.icon(editing ? "check" : "dashboard") + E(t(editing ? "lay.done" : "lay.edit")) + "</button> ";
    function layoutHtml() {
        return (editing ? '<div class="banner info block">' + UI.icon("dashboard") + "<span>" + E(t("lay.editInfo")) + '</span><span class="spacer"></span>' +
            '<button type="button" class="button" id="dbLayoutReset">' + E(t("lay.resetDash")) + "</button></div>" : "") +
            Layout.grid(current.view, current.blocks, editing);
    }
    function wireLayout() {
        root.querySelector("#dbLayout").addEventListener("click", () => { editing = !editing; render(); });
        const reset = root.querySelector("#dbLayoutReset");
        if (reset) reset.addEventListener("click", () => Layout.save(current.view, null));
        Layout.wireGrid(root, current.view, current.blocks);
    }

    const nameOf = UI.nameOf;

    /* 4.4 (D): the day of the signed-in person against the same thresholds (information only, never blocking) */
    function dayCompliance(iso) {
        const H = 3600000, entries = Store.entries(), settings = Store.settings(), now = Date.now();
        const b = Segments.day(iso, entries, settings, now), prev = Segments.day(Utils.addDays(iso, -1), entries, settings, now);
        const issues = [];
        if (b.totalMs / H > LIMITS.dayH) issues.push(t("dash.c.day", { day: LIMITS.dayH }));
        if (b.totalMs / H >= LIMITS.mealAfterH && !(b.byCategory.lunch > 0) && !(b.homeMs > 0)) issues.push(t("dash.c.meal", { meal: LIMITS.mealAfterH }));
        if (b.pieces.length && prev.pieces.length) {
            const gap = b.pieces[0].start - prev.pieces[prev.pieces.length - 1].end;
            if (gap > 0 && gap < LIMITS.restH * H) issues.push(t("dash.c.rest", { rest: LIMITS.restH }));
        }
        const running = Store.runningEntry();
        if (running && now - running.start > LIMITS.openH * H) issues.push(t("dash.c.open", { open: LIMITS.openH }));
        return { empty: !b.pieces.length, issues };
    }
    function dayBadge(iso) {
        const c = dayCompliance(iso);
        if (c.empty) return "";
        return '<span class="badge ' + (c.issues.length ? "warning" : "success") + '" title="' + E(c.issues.join(" · ")) + '">' + UI.icon(c.issues.length ? "alert" : "check") +
            E(t(c.issues.length ? "dash.day.check" : "dash.day.ok")) + "</span>";
    }

    /* 4.5: annual target of the signed-in person (same function as the reports: Hours.yearProgress) */
    function yearCard() {
        const g = Hours.yearProgress(new Date().getFullYear());
        const gap = Math.abs(g.gap) < 0.5 ? t("rx.g.even") : t(g.gap > 0 ? "rx.g.ahead" : "rx.g.behind", { value: Utils.hours(Math.abs(g.gap)) });
        return '<div class="card year-card"><h2>' + E(t("rx.g.title", { year: String(g.year) })) + '</h2><div class="day-state">' +
            UI.ring(Math.min(1, g.pct), 96, 9, "#801F35", "var(--surface-2)", '<strong class="tight">' + Math.round(g.pct * 100) + " %</strong><small>" + E(t("rx.g.done")) + "</small>") +
            '<div class="figures" style="flex:1"><div><span>' + E(t("rx.x.valued")) + "</span><strong>" + E(Utils.hours(g.valued)) + "</strong><small>" + E(t("rx.g.of", { target: Utils.hours(g.target) })) + "</small></div>" +
            "<div><span>" + E(t("rx.x.toDate", { date: Utils.dateDmy(g.end).slice(0, 5) })) + "</span><strong>" + E(Utils.hours(g.targetToDate)) + "</strong><small>" + E(gap) + "</small></div></div></div>" +
            '<p class="info">' + E(t("rx.g.split", { worked: Utils.hours(g.worked), validated: Utils.hours(g.validated), assimilated: Utils.hours(g.assimilated) })) + " · " +
            E(t("rx.g.remaining", { value: Utils.hours(g.remaining) })) + "</p></div>";
    }

    /* 4.4 (C): month calendar of the signed-in person — clocked days, leave / time off, other absences, holidays */
    let calOffset = 0;
    function miniCalendar() {
        const first = new Date(new Date().getFullYear(), new Date().getMonth() + calOffset, 1);
        const y = first.getFullYear(), m = first.getMonth(), days = new Date(y, m + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
        const entries = Store.entries(), settings = Store.settings(), now = Date.now(), today = Utils.isoLocal(now);
        const names = Array.from({ length: 7 }, (_, i) => Utils.dayName(Utils.addDays("2024-01-01", i)).slice(0, 3));
        let cells = "";
        for (let i = 0; i < lead; i++) cells += "<span></span>";
        for (let d = 1; d <= days; d++) {
            const iso = Utils.isoLocal(new Date(y, m, d));
            const abs = Store.absencesOn(iso);
            const marks = [Segments.day(iso, entries, settings, now).totalMs > 0 ? "clocked" : "",
                abs.some(a => a.type === "paid_leave" || a.type === "time_off") ? "leave" : "",
                abs.some(a => a.type !== "paid_leave" && a.type !== "time_off") ? "absence" : ""].filter(Boolean);
            const holiday = Holidays.isHoliday(Utils.utcDate(iso));
            cells += '<span class="mc-day' + (iso === today ? " today" : "") + (holiday ? " holiday" : "") + ([0, 6].indexOf(new Date(y, m, d).getDay()) >= 0 ? " weekend" : "") + '"' +
                (holiday && Holidays.name ? ' title="' + E(Holidays.name(Utils.utcDate(iso)) || "") + '"' : "") + "><b>" + d + "</b><i>" + marks.map(k => '<em class="' + k + '"></em>').join("") + "</i></span>";
        }
        return '<div class="card mini-cal"><div class="title-row"><h2>' + E(t("dash.cal.title")) + '</h2><div class="actions">' +
            '<button type="button" class="icon-button" data-cal="-1" aria-label="' + E(t("dash.cal.prev")) + '">' + UI.icon("left") + "</button>" +
            "<strong>" + E(Utils.monthName(m) + " " + y) + "</strong>" +
            '<button type="button" class="icon-button" data-cal="1" aria-label="' + E(t("dash.cal.next")) + '">' + UI.icon("right") + "</button></div></div>" +
            '<div class="mc-grid">' + names.map(n => '<span class="mc-head">' + E(n) + "</span>").join("") + cells + "</div>" +
            '<div class="legend mc-legend"><span><i class="clocked"></i>' + E(t("dash.cal.clocked")) + '</span><span><i class="leave"></i>' + E(t("dash.cal.leave")) + "</span>" +
            '<span><i class="absence"></i>' + E(t("dash.cal.absence")) + '</span><span><i class="holiday"></i>' + E(t("dash.cal.holiday")) + "</span></div></div>";
    }

    /* Weeks attached to a month (Thursday rule): totals of the CURRENT account */
    function monthRecap(year, month) {
        const d = new Date();
        const y = year === undefined ? d.getFullYear() : year, m = month === undefined ? d.getMonth() : month;
        /* 4.5: same calculation as Reports (Hours.monthFigures) — the result follows the register "OK" method */
        const f = Hours.monthFigures(y, m);
        return { worked: f.worked, result: f.result, h25: f.ot25, h50: f.ot50, night: f.night };
    }

    /* Last n months, oldest first: [{ worked, h25, h50, night, result }] of the CURRENT account */
    function monthSeries(n) {
        const d = new Date();
        const out = [];
        for (let i = n - 1; i >= 0; i--) {
            const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
            out.push(monthRecap(x.getFullYear(), x.getMonth()));
        }
        return out;
    }

    function weekNow() {
        const today = Utils.isoLocal(Date.now());
        const w = Hours.isoWeek(Utils.utcDate(today));
        return Hours.weekSummary(Segments.weekSheet(w.year, w.week, Store.entries(), Store.settings(), Date.now()));
    }

    const stateOf = UI.personState;

    function feedItem(name, text, when) {
        return "<li>" + UI.avatar(name, "small") + "<div><strong>" + E(name) + "</strong> " + E(text) +
            '<br><small class="muted">' + E(when) + "</small></div></li>";
    }

    /* Recent activity: requests (created / decided) and clock entries */
    function activity(ids) {
        const items = [];
        ids.forEach(id => {
            const u = Store.user(id);
            Store.withUser(id, () => {
                Store.requests().forEach(r => {
                    if (r.createdAt && !r.imported) items.push({ at: r.createdAt, name: u.name, text: t("dash.feed.request", { type: t(TYPE_KEYS[r.type] || "leave.type.other"), from: Utils.dateDmy(r.startDate), to: Utils.dateDmy(r.endDate) }) });
                    if (r.decidedAt) items.push({ at: r.decidedAt, name: r.decidedBy, text: t(r.status === "approved" ? "dash.feed.approved" : "dash.feed.rejected", { name: u.name }) });
                });
                Store.entries().filter(e => !e.imported).sort((a, b) => b.start - a.start).slice(0, 5).forEach(e =>
                    items.push({ at: new Date(e.start).toISOString(), name: u.name, text: t("dash.feed.clock", { activity: Segments.label(e.category), time: Utils.clock(e.start) }) }));
            });
        });
        return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
    }

    function feedHtml(items) {
        return items.length ? '<ul class="feed">' + items.map(i => feedItem(i.name, i.text, Utils.dateTime(new Date(i.at).getTime()))).join("") + "</ul>"
            : '<p class="empty">' + E(t("dash.noActivity")) + "</p>";
    }

    /* Inbox item: icon colour, title, text, age, actions HTML */
    function inboxItem(iconName, color, title, text, age, actions) {
        return '<li><span class="inbox-icon" style="--c:' + color + '">' + UI.icon(iconName) + "</span>" +
            '<span class="inbox-text"><strong>' + E(title) + "</strong>" + (age ? ' <small class="muted">· ' + E(age) + "</small>" : "") + "<br>" + E(text) + "</span>" +
            (actions ? '<span class="actions">' + actions + "</span>" : "") + "</li>";
    }
    const ago = iso => (iso ? Utils.dateTime(new Date(iso).getTime()) : "");

    /* Steps of the person's own open leave request (sent → team lead → decision) */
    function requestSteps(r) {
        const done = s => ["lead_favorable", "lead_unfavorable", "pending_final", "approved", "rejected"].indexOf(s) >= 0;
        const step = (ok, now, title, sub) => '<div class="vstep ' + (ok ? "done" : now ? "now" : "") + '"><span class="vmark">' + UI.icon(ok ? "check" : "clock") + "</span>" +
            '<span class="vtext"><strong>' + E(title) + "</strong><br>" + E(sub) + "</span></div>";
        const lead = r.review && r.review.by ? nameOf(r.review.by).split(" ")[0] : "";
        return '<div class="vflow col">' +
            step(true, false, t("dash.req.sent"), Utils.dateDmy(Utils.isoLocal(new Date(r.createdAt || Date.now()).getTime()))) +
            (r.status !== "pending_final" ? step(done(r.status), r.status === "pending_lead", t("dash.req.lead"), lead ? t(r.review.opinion === "favorable" ? "lv.opinion.favorable" : "lv.opinion.unfavorable") + " · " + lead : t("dash.req.waiting")) : "") +
            step(r.status === "approved" || r.status === "rejected", ["lead_favorable", "lead_unfavorable", "pending_final"].indexOf(r.status) >= 0, t("dash.req.decision"), t("dash.req.deciders")) +
            "</div>";
    }

    /* Mention of the person's status in the company, under the greeting (2.9) */
    function withStatus(headerHtml) {
        const me = Store.profile();
        const secs = me.allSections ? t("team.allSections") : Store.sections().filter(sec => me.sectionIds.indexOf(sec.id) >= 0).map(sec => sec.name).join(", ");
        const mention = '<div class="status-mention">' + UI.icon("shield") + "<strong>" + E(t("role." + me.role)) + "</strong>" +
            (me.jobTitle && Utils.simplify(me.jobTitle) !== Utils.simplify(t("role." + me.role)) ? "<span>" + E(me.jobTitle) + "</span>" : "") + (secs ? "<span>" + E(secs) + "</span>" : "") + "</div>";
        return headerHtml.replace("</h1>", "</h1>" + mention);
    }

    /* ======================= PERSON WHO CLOCKS ======================= */
    function renderTechnician() {
        const me = Store.profile();
        const s = weekNow();
        const lb = Leave.balance();
        const rb = Hours.recoveryBalance();
        const m = monthRecap();
        const series = monthSeries(6);
        const st = stateOf(me.id);
        const running = Store.runningEntry();
        const today = Utils.isoLocal(Date.now());
        const daySum = Segments.day(today, Store.entries(), Store.settings(), Date.now());
        const pending = Store.requests().filter(Store.isOpenRequest);
        const p = Countdown.parts(s.toRecover);
        const pct = s.goal > 0 ? Math.min(1, s.done / s.goal) : 1;
        const canClock = Permissions.can("timeclock.self");
        const w = Hours.isoWeek(Utils.utcDate(today));
        const sheet = Segments.weekSheet(w.year, w.week, Store.entries(), Store.settings(), Date.now());
        const prev = Store.previousWeek();
        const prevRec = Store.weekValidation(me.id, prev.year, prev.week);
        const toSend = Store.weekToSend();

        const hero = '<section class="hero' + (st === "leave" ? " teal" : st === "on" ? " green" : "") + '"><div class="hero-main">' +
            "<div>" + UI.pill(t(STATE[st][0]), st) + "</div>" +
            (running ? '<div class="running-line">' + UI.activityIcon(running.category, true) + '<div><span class="hero-label">' +
                E([Segments.label(running.category), running.clientName].filter(Boolean).join(" · ")) + '</span><div class="hero-figure">' +
                Utils.stopwatch(Date.now() - running.start) + "</div></div></div>"
                : '<div class="hero-figure">' + Utils.clock(Date.now()) + '</div><span class="hero-label">' + E(t("dash.notClocked")) + "</span>") +
            UI.punchLine() +
            (canClock ? '<div class="actions"><a class="button primary" href="#clock">' + UI.icon("clock") + E(t("dash.goClock")) + "</a>" +
                '<a class="button" href="#clock/sheet">' + UI.icon("calendar") + E(t("clock.tabSheet")) + "</a></div>" : "") + "</div>" +
            '<div class="hero-side">' + UI.ring(pct, 128, 12, "#C9566F", "rgba(255,255,255,.12)",
                '<strong class="tight">' + Utils.hours(s.done) + "</strong><small>" + E(t("clock.ofGoal", { goal: Utils.hours(s.goal) })) + "</small>") +
            '<div class="hero-stats"><span class="hero-label">' + E(t("dash.weekN", { n: w.week })) + "</span>" +
            "<span><strong>" + E(p.value.replace("−", "")) + "</strong>" + E(p.label) + "</span>" +
            "<span><strong>" + Utils.hm(daySum.totalMs) + "</strong>" + E(t("clock.today")) + "</span>" + dayBadge(today) + "</div></div></section>";

        const activityCard = '<div class="card"><h2>' + E(t("dash.activity")) + "</h2>" + feedHtml(activity([me.id])) + "</div>";
        /* 3.2: every block is named; Layout puts them in the person's order, width and visibility */
        const blocks = [
            block("status", t("lay.b.hero"), 12, FULL, hero),
            widget("kpiWeek", t("dash.week"), UI.kpi(t("dash.week"), p.value, "hourglass", "", p.label + " · " + t("dash.weekSub", { done: Utils.hours(s.done), goal: Utils.hours(s.goal) }))),
            widget("kpiLeave", t("dash.leaveBalance"), UI.kpi(t("dash.leaveBalance"), lb ? Utils.days(lb.available) : "—", "sun", "", lb ? t("dash.leaveSub", { pending: Utils.days(lb.pending) })
                : t(Permissions.can("employees.manage") ? "leave.needHireDate" : "leave.needHireDateManager"),
                lb && lb.earned > 0 ? UI.ring(Math.max(0, lb.available) / lb.earned, 46, 6, "#2563EB", "var(--surface-2)",
                    '<small class="ring-pct">' + Math.round(Math.max(0, lb.available) / lb.earned * 100) + " %</small>") : "")),
            widget("kpiRecover", t("dash.toRecover"), UI.kpi(t("dash.toRecover"), Utils.hours(rb.total), "briefcase", rb.total < 0 ? "danger" : "", t("dash.upTo", { date: Utils.dateDmy(rb.upTo) }),
                UI.spark(series.map(x => x.result), "#0D9488"))),
            widget("kpiOvertime", t("dash.overtimeMonth"), UI.kpi(t("dash.overtimeMonth"), Utils.hours(m.h25 + m.h50), "reports", "", t("leave.overtimeDetailInline", { h25: Utils.hours(m.h25), h50: Utils.hours(m.h50) }),
                UI.spark(series.map(x => x.h25 + x.h50), "#B45309"))),
            block("myWeek", t("clock.myWeek"), 8, CARD, '<div class="card"><div class="title-row"><h2>' + E(t("clock.myWeek")) + '</h2><div class="actions"><a class="button mini" href="#clock/sheet">' + E(t("clock.tabSheet")) + "</a></div></div>" +
                UI.weekBars(sheet) + UI.weekLegend() + "</div>"),
            block("myRequests", t("dash.myRequests"), 4, CARD, '<div class="card"><div class="title-row"><h2>' + E(t("dash.myRequests")) + '</h2><div class="actions"><a class="button mini" href="#leave">' + E(t("dash.seeAll")) + "</a></div></div>" +
                (pending.length ? pending.slice(0, 1).map(r => '<p style="margin:0 0 .7rem">' + UI.badge(t("leave.status.pending"), "warning") + " " +
                    E(t(TYPE_KEYS[r.type] || "leave.type.other")) + " — " + Utils.dateDmy(r.startDate) + " → " + Utils.dateDmy(r.endDate) + "</p>" + requestSteps(r)).join("") +
                    (pending.length > 1 ? '<p class="info">' + E(t("dash.moreRequests", { n: pending.length - 1 })) + "</p>" : "")
                    : '<p class="empty">' + UI.icon("calendar") + E(t("dash.noPending")) + "</p>") + "</div>"),
            canClock ? block("lastWeek", t("lay.b.lastWeek"), 8, CARD, '<div class="card"><div class="title-row"><h2>' + E(t("week.flowTitle", { week: prev.week })) + "</h2>" + ValidationPage.badgeOf(prevRec) + "</div>" +
                ValidationPage.flowHtml(prevRec, me.id) + "</div>") : block("activity", t("dash.activity"), 8, CARD, activityCard),
            block("monthRecap", t("lay.b.monthRecap"), 4, CARD, '<div class="card"><h2>' + E(t("dash.monthRecap", { month: Utils.monthName(new Date().getMonth()) })) + "</h2>" +
                '<table class="table"><tbody>' +
                "<tr><td>" + E(t("dash.workedMonth")) + '</td><td class="num">' + Utils.hours(m.worked) + "</td></tr>" +
                "<tr><td>" + E(t("dash.resultMonth")) + '</td><td class="num">' + Utils.hours(m.result) + "</td></tr>" +
                "<tr><td>" + E(t("leave.l.ot25")) + '</td><td class="num">' + Utils.hours(m.h25) + "</td></tr>" +
                "<tr><td>" + E(t("leave.l.ot50")) + '</td><td class="num">' + Utils.hours(m.h50) + "</td></tr>" +
                "<tr><td>" + E(t("sheet.col.night")) + '</td><td class="num">' + Utils.hours(m.night) + "</td></tr></tbody></table></div>")
        ].concat(canClock ? [block("calendar", t("dash.cal.title"), 4, CARD, miniCalendar()), block("year", t("dash.year"), 4, CARD, yearCard()),
            block("activity", t("dash.activity"), 4, CARD, activityCard)] : []);
        current = { view: "me", blocks };

        root.innerHTML = withStatus(UI.pageHeader(t("dash.hello", { name: me.name.split(" ")[0] }), Utils.longDate(today),
                editButton() + (Permissions.can("leave.self.request") ? '<button type="button" class="button" id="dbAskLeave">' + UI.icon("calendar") + E(t("dash.askLeave")) + "</button> " : "") +
                (canClock ? '<a class="button primary" href="#clock">' + UI.icon("clock") + E(t("dash.goClock")) + "</a>" : ""))) +
            (toSend ? '<div class="banner warn block">' + UI.icon("send") + "<span>" + E(t("week.banner.toSend", { week: toSend.week, comment: "" })) +
                '</span><span class="spacer"></span><button type="button" class="button primary" id="dbSendWeek">' + E(t("week.review")) + "</button></div>" : "") +
            layoutHtml();
        wireLayout();
        const b = root.querySelector("#dbSendWeek");
        if (b) b.addEventListener("click", () => ValidationPage.openSend(toSend.year, toSend.week));
        /* 4.4 (B): leave request straight from the dashboard; (C): months of the calendar */
        const ask = root.querySelector("#dbAskLeave");
        if (ask) ask.addEventListener("click", () => LeavePage.openNewRequest());
        root.querySelectorAll("[data-cal]").forEach(x => x.addEventListener("click", () => { calOffset += +x.dataset.cal; render(); }));
    }

    /* ======================= TEAM VIEWS ======================= */

    /* Compliance checks (current + previous week) for the given accounts */
    function compliance(ids) {
        const H = 3600000;
        const checks = { day: [], week: [], rest: [], meal: [], night: [], open: [] };
        const today = Utils.isoLocal(Date.now());
        ids.forEach(id => Store.withUser(id, () => {
            const entries = Store.entries(), settings = Store.settings(), now = Date.now();
            const who = nameOf(id).split(" ")[0];
            [Hours.isoWeek(Utils.utcDate(Utils.addDays(today, -7))), Hours.isoWeek(Utils.utcDate(today))].forEach(w => {
                const sheet = Segments.weekSheet(w.year, w.week, entries, settings, now);
                if (Hours.sheetTotal(sheet) > LIMITS.weekH) checks.week.push(who + " · " + t("sum.weekShort") + w.week);
                let prevEnd = null;
                Hours.DAYS.forEach(k => {
                    const j = sheet.days[k], b = j.summary;
                    const label = who + " · " + Utils.dateDmy(j.iso).slice(0, 5);
                    if (j.hours > LIMITS.dayH) checks.day.push(label);
                    if (j.hours >= LIMITS.mealAfterH && !(b.byCategory.lunch > 0) && !(b.homeMs > 0)) checks.meal.push(label);
                    if (j.night > 0) checks.night.push(label + " (" + Utils.hours(j.night) + ")");
                    if (b.pieces.length) {
                        const first = b.pieces[0].start;
                        if (prevEnd !== null && first - prevEnd < LIMITS.restH * H && first > prevEnd) checks.rest.push(label);
                        prevEnd = b.pieces[b.pieces.length - 1].end;
                    }
                });
            });
            const running = Store.runningEntry();
            if (running && now - running.start > LIMITS.openH * H) checks.open.push(who);
        }));
        const rows = [["day", "dash.c.day", "warn"], ["week", "dash.c.week", "warn"], ["rest", "dash.c.rest", "warn"], ["meal", "dash.c.meal", "warn"],
            ["night", "dash.c.night", "info"], ["open", "dash.c.open", "warn"]];
        return rows.map(([k, key, level]) => ({ key, level, n: checks[k].length, who: checks[k].slice(0, 3).join(", "), limit: LIMITS }));
    }

    function complianceHtml(list) {
        return '<ul class="feed">' + list.map(c => {
            const ok = c.n === 0;
            const color = ok ? "#15803D" : c.level === "info" ? "#1D4ED8" : "#B45309";
            return '<li><span class="inbox-icon" style="--c:' + color + ';width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,' + color + ' 12%,transparent);color:' + color + '">' +
                UI.icon(ok ? "check" : c.level === "info" ? "moon" : "alert") + "</span><div><strong>" +
                E(t(c.key, { day: LIMITS.dayH, week: LIMITS.weekH, rest: LIMITS.restH, meal: LIMITS.mealAfterH, open: LIMITS.openH })) + "</strong>" +
                (c.who ? '<br><small class="muted">' + E(c.who) + "</small>" : "") + '</div><strong style="color:' + color + '">' + c.n + "</strong></li>";
        }).join("") + "</ul>" + '<p class="info">' + E(t("dash.c.toConfirm")) + "</p>";
    }

    /* Live card of a technician (dark hero) */
    function liveCard(r) {
        const running = Store.withUser(r.x.id, () => Store.runningEntry());
        const what = running ? UI.activityIcon(running.category, true) + "<div><strong>" + E(Segments.label(running.category)) + "</strong><br><small>" +
                E([running.clientName, t("dash.since", { time: Utils.clock(running.start) })].filter(Boolean).join(" · ")) + "</small></div>"
            : "<div><strong>" + E(t(STATE[r.st][0])) + "</strong><br><small>" + E(r.last ? t("dash.lastSeen", { when: Utils.dateDmy(Utils.isoLocal(r.last.start)) + " " + Utils.clock(r.last.start) }) : "—") + "</small></div>";
        return '<div class="live-card"><div class="live-head">' + UI.avatarStatus(r.x.name, r.st) + "<div><strong>" + E(r.x.name) + "</strong><br><small>" +
            E(Store.sections().filter(sec => r.x.sectionIds.indexOf(sec.id) >= 0).map(sec => sec.name).join(", ")) + "</small></div>" +
            '<span class="live-time">' + (running ? Utils.stopwatch(Date.now() - running.start).slice(0, -3) : Utils.hm(r.todayMs)) + "</span></div>" +
            '<div class="live-what">' + what + "</div></div>";
    }

    function renderTeam() {
        const meId = Store.currentUserId();
        const manager = Permissions.can("leave.global.approve");
        /* 3.0 (10.1): the team lead decides too when the first decision is final */
        const decides = manager || (!!Store.org().leaveSingleDecision && Permissions.can("leave.team.approve"));
        /* 4.1.6: the director now holds the corrections too — his steering view follows his ROLE */
        const role = Store.profile().role;
        const quality = role !== "director" && Permissions.can("timeclock.correction.approve");
        const director = role === "director" || (Permissions.can("reports.export") && !quality);   /* steering view */
        const allTechs = Permissions.visibleUsers().filter(x => x.id !== meId && x.accountStatus !== "disabled" &&
            (x.clockRequired || Permissions.has(x.id, "timeclock.self")));
        /* 4.1.1: who is counted — the whole team, one section of the perimeter or one technician (display only) */
        const mySections = Store.sections().filter(sec => (Store.profile().allSections || Store.profile().sectionIds.indexOf(sec.id) >= 0) &&
            allTechs.some(x => x.sectionIds.indexOf(sec.id) >= 0));
        if (scope && !(scope.indexOf("s:") === 0 ? mySections.some(sec => "s:" + sec.id === scope) : allTechs.some(x => "u:" + x.id === scope))) scope = "";
        const techs = !scope ? allTechs : scope.indexOf("s:") === 0 ? allTechs.filter(x => x.sectionIds.indexOf(scope.slice(2)) >= 0)
            : allTechs.filter(x => "u:" + x.id === scope);
        const scopeLabel = !scope ? t("dash.scopeAll", { n: allTechs.length }) : scope.indexOf("s:") === 0 ? (mySections.find(sec => "s:" + sec.id === scope) || {}).name
            : (allTechs.find(x => "u:" + x.id === scope) || {}).name;
        const opt = (v, label) => '<option value="' + E(v) + '"' + (v === scope ? " selected" : "") + ">" + E(label) + "</option>";
        const scopeBar = '<div class="scope-bar">' + UI.icon("users") + '<label for="dbScope">' + E(t("dash.scope")) + "</label>" +
            '<select id="dbScope">' + opt("", t("dash.scopeAll", { n: allTechs.length })) +
            (mySections.length ? '<optgroup label="' + E(t("dash.scopeSections")) + '">' + mySections.map(sec => opt("s:" + sec.id, sec.name + " (" +
                allTechs.filter(x => x.sectionIds.indexOf(sec.id) >= 0).length + ")")).join("") + "</optgroup>" : "") +
            (allTechs.length ? '<optgroup label="' + E(t("dash.scopeTechs")) + '">' + allTechs.map(x => opt("u:" + x.id, x.name)).join("") + "</optgroup>" : "") +
            '</select><span class="scope-names">' + E(techs.length ? t("dash.scopeWho", { names: techs.map(x => x.name).join(", ") }) : t("dash.noTechs")) + "</span></div>";
        const ids = techs.map(x => x.id);
        const today = Utils.isoLocal(Date.now());
        let weekWorked = 0, h25 = 0, h50 = 0;
        const rows = techs.map(x => Store.withUser(x.id, () => {
            const m = monthRecap(); const w = weekNow();
            const d = Segments.day(today, Store.entries(), Store.settings());
            const last = Store.entries().slice().sort((p, q) => q.start - p.start)[0] || null;
            weekWorked += w.worked; h25 += m.h25; h50 += m.h50;
            return { x, m, w, todayMs: d.totalMs, last, st: stateOf(x.id) };
        }));
        const count = k => rows.filter(z => z.st === k).length;
        /* team lead: what waits for HIS opinion; managers: what waits for a decision */
        const pending = Store.allRequests().filter(r => ids.indexOf(r.userId) >= 0 && (decides ? Store.isOpenRequest(r) || !!r.cancelRequest : r.status === "pending_lead"));
        const reports = Store.correctionRequests().filter(r => r.status === "open" && ids.indexOf(r.userId) >= 0);
        const weeks = ValidationPage.waiting().filter(r => ids.indexOf(r.userId) >= 0);
        const reportsOf = id => reports.filter(r => r.userId === id).length;
        const sections = Store.sections().filter(sec => Store.profile().allSections || Store.profile().sectionIds.indexOf(sec.id) >= 0).map(sec => sec.name).join(", ");

        /* ---- things to do (inbox) ---- */
        const items = weeks.map(r => inboxItem("send", "#801F35", t(r.status === "sent" ? "dash.in.weekReview" : "dash.in.weekLock"),
                nameOf(r.userId) + " · " + t("week.titleShort", { week: r.week, dates: "" }).trim() + " · " + Utils.hours(r.done || 0), ago(r.sentAt),
                '<button type="button" class="button mini primary" data-week="' + E(r.id) + '">' + E(t("week.open")) + "</button>"))
            .concat(pending.slice(0, 6).map(r => inboxItem("calendar", r.type === "time_off" ? "#0D9488" : "#2563EB",
                t(decides ? "dash.in.leaveDecide" : "dash.in.leaveReview"), r.userName + " — " + t(TYPE_KEYS[r.type] || "leave.type.other") + " · " +
                Utils.dateDmy(r.startDate) + " → " + Utils.dateDmy(r.endDate), ago(r.createdAt), '<a class="button mini" href="#validation/leave">' + E(t("week.open")) + "</a>")))
            .concat(reports.slice(0, 6).map(r => inboxItem("flag", "#B45309", t("dash.reportOf", { date: Utils.dateDmy(r.date) }), nameOf(r.userId) + " : " + r.text,
                ago(r.requestedAt), '<a class="button mini" href="#team">' + E(t(quality ? "dash.correct" : "dash.seeTeam")) + "</a>")));
        const inbox = '<div class="card"><div class="title-row"><h2>' + E(t("dash.toLook")) + "</h2>" +
            (items.length ? '<span class="badge brand">' + items.length + "</span>" : "") + "</div>" +
            (items.length ? '<ul class="inbox">' + items.join("") + "</ul>" : '<p class="empty">' + UI.icon("check") + E(t("dash.nothingToLook")) + "</p>") +
            (!decides && pending.length ? '<p class="info">' + E(t("dash.leadInfo")) + "</p>" : "") + "</div>";

        /* ---- hero per profile ---- */
        let hero, extra;
        const inboxBlock = block("inbox", t("dash.toLook"), 6, CARD, inbox);
        if (quality) {
            const comp = compliance(ids);
            const anomalies = comp.filter(c => c.level === "warn").reduce((n, c) => n + c.n, 0);
            const backup = Store.lastFullBackup();
            const ageDays = backup ? Math.floor((Date.now() - new Date(backup).getTime()) / 86400000) : null;
            hero = '<section class="hero"><div class="hero-main"><span class="hero-label">' + E(t("dash.q.queue")) + "</span>" +
                '<div style="display:flex;align-items:baseline;gap:1rem;flex-wrap:wrap"><span class="hero-figure">' + items.length + '</span><span class="muted">' +
                E(t("dash.q.queueSub", { weeks: weeks.length, leave: pending.length, reports: reports.length })) + "</span></div></div>" +
                '<div class="hero-tiles" style="flex:1 1 360px">' +
                '<div class="hero-tile">' + UI.icon("alert") + "<strong>" + anomalies + "</strong><span>" + E(t("dash.q.anomalies")) + "</span></div>" +
                '<div class="hero-tile">' + UI.icon("lock") + "<strong>" + Store.weekValidations().filter(r => r.status === "locked").length + "</strong><span>" + E(t("dash.q.locked")) + "</span></div>" +
                '<div class="hero-tile">' + UI.icon("download") + "<strong>" + (ageDays === null ? "—" : t("dash.q.days", { n: ageDays })) + "</strong><span>" + E(t("dash.q.backup")) + "</span></div>" +
                "</div></section>";
            extra = [inboxBlock, block("compliance", t("dash.c.title"), 6, CARD, '<div class="card"><h2>' + E(t("dash.c.title")) + "</h2>" + complianceHtml(comp) + "</div>")];
        } else if (director) {
            const series = [];
            for (let i = 11; i >= 0; i--) {
                const x = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
                const sum = { worked: 0, h25: 0, h50: 0, night: 0 };
                ids.forEach(id => Store.withUser(id, () => { const m = monthRecap(x.getFullYear(), x.getMonth()); sum.worked += m.worked; sum.h25 += m.h25; sum.h50 += m.h50; sum.night += m.night; }));
                series.push(sum);
            }
            const cur = series[series.length - 1];
            const recovery = ids.reduce((n, id) => n + Store.withUser(id, () => Hours.recoveryBalance().total), 0);
            /* 4.6: a click on a tile shows where its figure comes from (this month: by week and by technician);
               the ⓘ button shows what the figure means. Same functions as the tiles (Hours.monthFigures / recoveryBalance). */
            const now = new Date(), y = now.getFullYear(), mo = now.getMonth();
            const perTech = techs.map(x => Store.withUser(x.id, () => ({ name: x.name, f: Hours.monthFigures(y, mo), rb: Hours.recoveryBalance().total })));
            const weekRows = (perTech[0] ? perTech[0].f.weeks : []).map((w, i) => ({ w, sum: k => perTech.reduce((n, p) => n + p.f.weeks[i][k], 0) }));
            const line = (label, value) => "<li><span>" + E(label) + "</span><strong>" + E(Utils.hours(value)) + "</strong></li>";
            const detail = key => {
                const byTech = perTech.map(p => line(p.name, key === "recovery" ? p.rb : p.f[key])).join("");
                const total = perTech.reduce((n, p) => n + (key === "recovery" ? p.rb : p.f[key]), 0);
                return (key === "recovery" ? "" : "<b>" + E(t("dash.d.byWeek")) + '</b><ul class="hero-list">' + weekRows.map(r =>
                    line(t("tc.weekShort", { n: r.w.week }) + " · " + Utils.dateDmy(r.w.from).slice(0, 5) + " → " + Utils.dateDmy(r.w.to).slice(0, 5), r.sum(key))).join("") + "</ul>") +
                    "<b>" + E(t("dash.d.byTech")) + '</b><ul class="hero-list">' + byTech + "</ul>" +
                    '<ul class="hero-list total">' + line(t("common.total"), total) + "</ul>";
            };
            const tile = (label, value, values, color, sub, key) => '<div class="hero-tile hero-help">' +
                '<button type="button" class="hero-info" data-info aria-expanded="false" aria-label="' + E(t("dash.d.infoLabel", { name: label })) + '" title="' + E(t("dash.d.infoLabel", { name: label })) + '">' + UI.icon("info") + "</button>" +
                '<button type="button" class="hero-open" data-tip aria-expanded="false" title="' + E(t("dash.d.helpHint")) + '">' +
                "<span>" + E(label) + "</span><strong>" + E(value) + "</strong>" + UI.spark(values, color, 200, 40) + "<span>" + E(sub) + "</span></button>" +
                '<div class="hero-tip" data-panel="info" hidden>' + E(t("dash.d.help." + key)) + "</div>" +
                '<div class="hero-tip" data-panel="detail" hidden>' + detail(key) + "</div></div>";
            hero = '<section class="hero"><div class="hero-main" style="flex-basis:100%"><span class="hero-label">' + E(t("dash.d.label")) + "</span><h2>" +
                E(t("dash.d.title", { month: Utils.monthName(new Date().getMonth()) })) + ' <span class="hero-scope">· ' + E(scopeLabel) + "</span></h2></div>" +
                '<div class="hero-tiles">' +
                tile(t("dash.d.worked"), Utils.hours(cur.worked), series.map(x => x.worked), "#FFFFFF", t("dash.d.months"), "worked") +
                tile(t("leave.l.ot25"), Utils.hours(cur.h25), series.map(x => x.h25), "#FBBF24", t("dash.d.months"), "ot25") +
                tile(t("leave.l.ot50"), Utils.hours(cur.h50), series.map(x => x.h50), "#F87171", t("dash.d.months"), "ot50") +
                tile(t("dash.d.recovery"), Utils.hours(recovery), series.map(x => x.night), "#2DD4BF", t("dash.d.recoverySub"), "recovery") +
                "</div></section>";
            const bySection = Store.sections().map(sec => {
                const members = rows.filter(r => r.x.sectionIds.indexOf(sec.id) >= 0);
                return { name: sec.name, worked: members.reduce((n, r) => n + r.m.worked, 0), ot: members.reduce((n, r) => n + r.m.h25 + r.m.h50, 0), n: members.length };
            }).filter(x => x.n);
            const maxW = Math.max.apply(null, bySection.map(x => x.worked).concat([1]));
            const maxO = Math.max.apply(null, bySection.map(x => x.ot).concat([1]));
            const bar = (v, max, color) => '<div class="progress" style="flex:1"><div style="width:' + (v / max * 100).toFixed(0) + "%;background:" + color + '"></div></div>';
            /* the sections and the export stay one block: one column, as designed */
            extra = [inboxBlock, block("sections", t("dash.d.sections"), 6, CARD,
                '<div class="stack"><div class="card"><h2>' + E(t("dash.d.sections")) + "</h2>" + (bySection.length ? bySection.map(x =>
                    '<div style="margin-bottom:.8rem"><strong>' + E(x.name) + '</strong><div style="display:flex;gap:.6rem;align-items:center;font-size:.82rem"><span class="muted" style="width:150px">' + E(t("dash.workedMonth")) +
                    "</span>" + bar(x.worked, maxW, "#2F5D8C") + '<strong style="width:70px;text-align:right">' + Utils.hours(x.worked) + "</strong></div>" +
                    '<div style="display:flex;gap:.6rem;align-items:center;font-size:.82rem"><span class="muted" style="width:150px">' + E(t("dash.teamOvertime")) + "</span>" +
                    bar(x.ot, maxO, "#B45309") + '<strong style="width:70px;text-align:right">' + Utils.hours(x.ot) + "</strong></div></div>").join("") : '<p class="empty">' + E(t("dash.noTechs")) + "</p>") + "</div>" +
                '<div class="card"><h2>' + E(t("dash.d.export")) + '</h2><p class="info">' + E(t("dash.d.exportInfo")) + '</p><a class="button primary" href="#reports">' +
                UI.icon("download") + E(t("dash.d.exportGo")) + "</a></div></div>")];
        } else {
            hero = '<section class="hero"><div class="hero-main" style="flex-basis:100%;flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap">' +
                '<div><span class="hero-label">' + E(t("dash.l.now", { time: Utils.clock(Date.now()) })) + "</span><h2>" + E(t("dash.l.title")) + "</h2></div>" +
                '<div class="actions">' + UI.pill(t("dash.l.active", { n: count("on") + count("break") }), "on") + " " + UI.pill(t("dash.l.leave", { n: count("leave") }), "leave") + "</div></div>" +
                '<div class="live-wrap">' + (rows.length ? rows.map(liveCard).join("") : '<p class="muted">' + E(t("dash.noTechs")) + "</p>") + "</div></section>";
            /* next week's absences: to spot overlaps before giving an opinion */
            const monday = Hours.isoDayOf(Hours.isoWeek(Utils.utcDate(Utils.addDays(today, 7))).year, Hours.isoWeek(Utils.utcDate(Utils.addDays(today, 7))).week, 0);
            const daysIso = [0, 1, 2, 3, 4, 5, 6].map(i => Utils.addDays(monday, i));
            const all = Store.allRequests().filter(r => ids.indexOf(r.userId) >= 0 && (r.status === "approved" || Store.isOpenRequest(r)));
            /* 3.0.1: day name and number on two aligned lines; a coloured bar per counted day
               (dashed = waiting for a decision); Sundays and holidays are not leave days */
            const grid = '<div class="week-grid compact"><div class="wg-head"></div>' + daysIso.map(iso => '<div class="wg-head' +
                    (Leave.countsOn(iso) ? "" : " off") + '"><span>' + E(Utils.dayName(iso).slice(0, 3)) + "</span><strong>" + iso.slice(8) + "</strong></div>").join("") +
                techs.map(x => '<div class="wg-person">' + UI.avatar(x.name, "small") + "<span>" + E(x.name.split(" ")[0]) + "</span></div>" + daysIso.map(iso => {
                    const r = Leave.countsOn(iso) ? all.find(q => q.userId === x.id && q.startDate <= iso && iso <= q.endDate) : null;
                    const label = r ? x.name + " — " + t(TYPE_KEYS[r.type] || "leave.type.other") + " — " + t(r.status === "approved" ? "leave.status.approved" : "leave.status.pending_final") : "";
                    return '<div class="' + (Leave.countsOn(iso) ? "" : "off") + '">' + (r ? '<a class="absence bar ' + E(r.type) + (r.status === "approved" ? "" : " pending") + '" href="#leave/calendar" title="' + E(label) +
                        '" aria-label="' + E(label) + '"></a>' : "") + "</div>";
                }).join("")).join("") + "</div>";
            extra = [inboxBlock, block("nextWeek", t("dash.l.nextWeek"), 6, CARD,
                '<div class="card"><div class="title-row"><h2>' + E(t("dash.l.nextWeek")) + '</h2><div class="actions"><a class="button mini" href="#leave">' + E(t("dash.seeCalendar")) + "</a></div></div>" +
                '<p class="info" style="margin-top:0">' + E(t("dash.l.nextWeekInfo")) + "</p>" + grid + "</div>")];
        }

        const blocks = [block("summary", t("lay.b.hero"), 12, FULL, hero)].concat(extra, [
            widget("kpiPresent", t("dash.present"), UI.kpi(t("dash.present"), String(count("on") + count("break")), "activity", "success", t("dash.onBreak", { n: count("break") }))),
            widget("kpiAbsent", t("dash.absent"), UI.kpi(t("dash.absent"), String(count("off")), "user", "")),
            widget("kpiLeave", t("dash.onLeave"), UI.kpi(t("dash.onLeave"), String(count("leave")), "sun", "warning")),
            widget("kpiToLook", t("dash.toLook"), UI.kpi(t("dash.toLook"), String(pending.length + reports.length), "hourglass", pending.length + reports.length ? "danger" : "",
                t("dash.toLookSub", { leave: pending.length, reports: reports.length }))),
            /* each technician at a glance */
            block("myTechs", t("dash.myTechs"), 12, WIDE, '<div class="card"><div class="title-row"><h2>' + E(t("dash.myTechs")) + "</h2>" +
            '<div class="actions"><a class="button mini" href="#team">' + E(t("dash.seeTeam")) + "</a></div></div>" +
            (rows.length ? '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("admin.col.person")) + "</th><th>" + E(t("dash.status")) +
                '</th><th class="num">' + E(t("dash.today")) + "</th><th>" + E(t("dash.weekDone")) + '</th><th class="num">' + E(t("dash.weekResult")) +
                "</th><th>" + E(t("dash.lastActivity")) + '</th><th class="num">' + E(t("dash.reports")) + "</th></tr></thead><tbody>" +
                rows.map(r => '<tr><td><span class="person">' + UI.avatarStatus(r.x.name, r.st, "small") + "<span><strong>" + E(r.x.name) + "</strong><small>" +
                    E(Store.sections().filter(sec => r.x.sectionIds.indexOf(sec.id) >= 0).map(sec => sec.name).join(", ")) + "</small></span></span></td>" +
                    "<td>" + UI.badge(t(STATE[r.st][0]), STATE[r.st][1]) + "</td>" +
                    '<td class="num">' + Utils.hm(r.todayMs) + "</td>" +
                    '<td><div style="display:flex;align-items:center;gap:.6rem"><div class="progress" style="flex:1;min-width:80px"><div style="width:' +
                    Math.min(100, r.w.goal ? r.w.done / r.w.goal * 100 : 0).toFixed(0) + '%"></div></div><span class="num">' + Utils.hours(r.w.done) + ' <small class="muted">/ ' + Utils.hours(r.w.goal) + "</small></span></div></td>" +
                    '<td class="num">' + Countdown.parts(r.w.toRecover).value + "</td>" +
                    "<td>" + (r.last ? E(Segments.label(r.last.category)) + ' <small class="muted">' + Utils.dateDmy(Utils.isoLocal(r.last.start)) + " " +
                        Utils.clock(r.last.start) + (r.last.end == null ? " · " + E(t("flag.running")) : "") + "</small>" : "—") + "</td>" +
                    '<td class="num">' + (reportsOf(r.x.id) ? UI.badge(String(reportsOf(r.x.id)), "warning") : "—") + "</td></tr>").join("") +
                "</tbody></table></div>" : '<p class="empty">' + E(t("dash.noTechs")) + "</p>") + "</div>"),
            widget("kpiTeamWeek", t("dash.teamWeek"), UI.kpi(t("dash.teamWeek"), Utils.hours(weekWorked), "clock", "", t("dash.teamWeekSub")), 6),
            widget("kpiTeamOvertime", t("dash.teamOvertime"), UI.kpi(t("dash.teamOvertime"), Utils.hours(h25 + h50), "reports", "", t("leave.overtimeDetailInline", { h25: Utils.hours(h25), h50: Utils.hours(h50) })), 6),
            block("monthRecap", t("lay.b.monthRecap"), 6, WIDE, '<div class="card"><h2>' + E(t("dash.monthRecap", { month: Utils.monthName(new Date().getMonth()) })) + "</h2>" +
            '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("admin.col.person")) + '</th><th class="num">' + E(t("dash.workedMonth")) +
            '</th><th class="num">' + E(t("dash.resultMonth")) + '</th><th class="num">25 %</th><th class="num">50 %</th><th class="num">' + E(t("sheet.col.night")) + "</th></tr></thead><tbody>" +
            rows.map(r => '<tr><td><span class="person">' + UI.avatar(r.x.name, "small") + E(r.x.name) + "</span></td>" +
                '<td class="num">' + Utils.hours(r.m.worked) + '</td><td class="num">' + Utils.hours(r.m.result) +
                '</td><td class="num">' + Utils.hours(r.m.h25) + '</td><td class="num">' + Utils.hours(r.m.h50) + '</td><td class="num">' + Utils.hours(r.m.night) + "</td></tr>").join("") +
            "</tbody></table></div></div>"),
            block("activity", t("dash.activity"), 6, CARD, '<div class="card"><h2>' + E(t("dash.activity")) + "</h2>" + feedHtml(activity(ids)) + "</div>")
        ]);
        current = { view: quality ? "quality" : director ? "director" : "lead", blocks };

        root.innerHTML = withStatus(UI.pageHeader(t("dash.hello", { name: Store.profile().name.split(" ")[0] }), t("dash.teamSub", { sections }),
                editButton() +
                (Permissions.can("timeclock.self") ? '<a class="button" href="#clock">' + UI.icon("clock") + E(t("dash.goClock")) + "</a> " : "") +
                (Permissions.canAny(["timesheet.week.review", "timesheet.week.lock"]) ? '<a class="button" href="#validation">' + UI.icon("shield") + E(t("nav.validation")) + "</a> " : "") +
                '<a class="button primary" href="#leave">' + UI.icon("calendar") + E(t("nav.leave")) + "</a>")) +
            scopeBar + layoutHtml();
        wireLayout();
        root.querySelector("#dbScope").addEventListener("change", e => { scope = e.target.value; render(); });
        root.querySelectorAll("[data-week]").forEach(b => b.addEventListener("click", () => ValidationPage.openDetail(b.dataset.week)));
        /* 4.6: steering tiles — the tile shows its detail, the ⓘ its meaning (one panel at a time per tile) */
        const toggle = (b, which) => {
            const tile = b.closest(".hero-tile"), panel = tile.querySelector('[data-panel="' + which + '"]'), open = panel.hidden;
            tile.querySelectorAll("[data-panel]").forEach(p => { p.hidden = true; });
            tile.querySelectorAll("[data-tip], [data-info]").forEach(x => x.setAttribute("aria-expanded", "false"));
            panel.hidden = !open;
            b.setAttribute("aria-expanded", String(open));
        };
        root.querySelectorAll("[data-tip]").forEach(b => b.addEventListener("click", () => toggle(b, "detail")));
        root.querySelectorAll("[data-info]").forEach(b => b.addEventListener("click", () => toggle(b, "info")));
    }

    function render() {
        if (!root || Layout.isDragging()) return;   /* 3.2: never redrawn under a drag */
        /* team view for whoever follows a team (team lead, managers); personal view otherwise */
        if (Permissions.canAny(["employees.team.view", "timeclock.team.view", "employees.manage"])) renderTeam(); else renderTechnician();
    }

    function init() {
        root = document.getElementById("page-dashboard");
        render();
    }

    /* 3.2: blocks of the person's dashboard (name, kind, widths), for Settings → My workspace */
    function catalog() {
        if (!root) init();
        else render();
        return { view: current.view, blocks: current.blocks.map(b => ({ id: b.id, label: b.label, kind: b.kind, size: b.size, sizes: b.sizes })) };
    }
    const setEditing = on => { editing = !!on; };

    return { init, render, compliance, dayCompliance, dayBadge, catalog, setEditing };
})();
