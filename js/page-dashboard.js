/* =============================================================
   page-dashboard.js — dashboard (2.6, team view 06/11/2026)
   Only real data, computed with the existing engine (Hours, Leave,
   Segments). The view follows the PERMISSIONS, not the role name:
   - personal view (accounts that clock): status now, week countdown,
     leave balance, hours to recover, own requests, activity, month;
     "Clock" button only with clock.own;
   - team view (team.view / timesheet.team.view / users.manage: team
     lead AND managers), limited to the viewer's PERIMETER (sections):
     present / on a break / off / on leave, each technician at a glance
     (status, today, week done / goal, result, last activity, open
     error reports), leave requests and error reports to look at
     (managers decide, team leads follow), team hours, overtime,
     activity, month recap per technician.
   ⚠️ Demo mode: "team" = the accounts of THIS device.
   ============================================================= */

const DashboardPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    const TYPE_KEYS = { paid_leave: "leave.type.paid", time_off: "leave.type.timeOff", other: "leave.type.other" };
    let root = null;

    const days = n => (Math.round(n * 100) / 100).toLocaleString(I18n.locale()) + " " + t("common.daysShort");

    /* Month recap of the current account: weeks attached to the month */
    function monthRecap() {
        const d = new Date();
        const entries = Store.entries(), settings = Store.settings(), now = Date.now();
        const r = { worked: 0, result: 0, h25: 0, h50: 0, night: 0 };
        Hours.weeksOfMonth(d.getFullYear(), d.getMonth()).forEach(w => {
            const s = Hours.weekSummary(Segments.weekSheet(w.year, w.week, entries, settings, now));
            r.worked += s.worked; r.h25 += s.overtime.h25; r.h50 += s.overtime.h50; r.night += s.counters.night;
            if (!s.empty && s.complete) r.result += s.toRecover;
        });
        return r;
    }

    function weekNow() {
        const today = Utils.isoLocal(Date.now());
        const w = Hours.isoWeek(Utils.utcDate(today));
        return Hours.weekSummary(Segments.weekSheet(w.year, w.week, Store.entries(), Store.settings(), Date.now()));
    }

    /* State of an account right now: "on" | "break" | "leave" | "off" */
    function stateOf(id) {
        return Store.withUser(id, () => {
            const today = Utils.isoLocal(Date.now());
            const running = Store.runningEntry();
            if (running) return running.category === "break" || running.category === "lunch" ? "break" : "on";
            if (Store.absencesOn(today).length) return "leave";
            return "off";
        });
    }

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

    function renderTechnician() {
        const me = Store.profile();
        const s = weekNow();
        const lb = Leave.balance();
        const rb = Hours.recoveryBalance();
        const m = monthRecap();
        const st = stateOf(me.id);
        const pending = Store.requests().filter(r => r.status === "pending");
        const STATE = { on: ["dash.state.on", "success"], break: ["dash.state.break", "warning"], leave: ["dash.state.leave", "info"], off: ["dash.state.off", ""] };
        root.innerHTML = UI.pageHeader(t("dash.hello", { name: me.name.split(" ")[0] }), Utils.longDate(Utils.isoLocal(Date.now())),
                Permissions.can("clock.own") ? '<a class="button primary" href="#clock">' + UI.icon("clock") + E(t("dash.goClock")) + "</a>" : "") +
            '<div class="grid cols-4">' +
            UI.kpi(t("dash.status"), t(STATE[st][0]), "activity", STATE[st][1]) +
            UI.kpi(t("dash.week"), Countdown.parts(s.toRecover).value, "hourglass", s.toRecover < 0 ? "warning" : "success",
                Countdown.parts(s.toRecover).label + " · " + t("dash.weekSub", { done: Utils.hours(s.done), goal: Utils.hours(s.goal) })) +
            UI.kpi(t("dash.leaveBalance"), lb ? days(lb.available) : "—", "sun", "", lb ? t("dash.leaveSub", { pending: days(lb.pending) })
                : t(Permissions.can("users.manage") ? "leave.needHireDate" : "leave.needHireDateManager")) +
            UI.kpi(t("dash.toRecover"), Utils.hours(rb.total), "briefcase", rb.total < 0 ? "danger" : "", t("dash.upTo", { date: Utils.dateDmy(rb.upTo) })) +
            "</div>" +
            '<div class="grid cols-2" style="margin-top:1rem">' +
            '<div class="card"><div class="title-row"><h2>' + E(t("dash.monthRecap", { month: Utils.monthName(new Date().getMonth()) })) + "</h2></div>" +
            '<table class="table"><tbody>' +
            "<tr><td>" + E(t("dash.workedMonth")) + '</td><td class="num">' + Utils.hours(m.worked) + "</td></tr>" +
            "<tr><td>" + E(t("dash.resultMonth")) + '</td><td class="num ' + (m.result < 0 ? "negative" : "") + '">' + Utils.hours(m.result) + "</td></tr>" +
            "<tr><td>" + E(t("leave.l.ot25")) + '</td><td class="num">' + Utils.hours(m.h25) + "</td></tr>" +
            "<tr><td>" + E(t("leave.l.ot50")) + '</td><td class="num">' + Utils.hours(m.h50) + "</td></tr>" +
            "<tr><td>" + E(t("sheet.col.night")) + '</td><td class="num">' + Utils.hours(m.night) + "</td></tr></tbody></table></div>" +
            '<div class="card"><div class="title-row"><h2>' + E(t("dash.myRequests")) + '</h2><div class="actions"><a class="button mini" href="#leave">' + E(t("dash.seeAll")) + "</a></div></div>" +
            (pending.length ? '<ul class="feed">' + pending.map(r => "<li>" + UI.badge(t("leave.status.pending"), "warning") + "<div>" + E(t(TYPE_KEYS[r.type] || "leave.type.other")) +
                " — " + Utils.dateDmy(r.startDate) + " → " + Utils.dateDmy(r.endDate) + "</div></li>").join("") + "</ul>"
                : '<p class="empty">' + E(t("dash.noPending")) + "</p>") +
            "<h3>" + E(t("dash.activity")) + "</h3>" + feedHtml(activity([me.id])) + "</div></div>";
    }

    /* TEAM view (06/11/2026): team leads AND managers, limited to the viewer's
       PERIMETER (sections, permissions.js). Live status, today, week and month
       of each technician; leave requests and error reports to look at.
       Managers decide; team leads look and follow (no final decision). */
    function renderTeam() {
        const meId = Store.currentUserId();
        const manager = Permissions.can("leave.approve");
        const techs = Permissions.visibleUsers().filter(x => x.id !== meId && x.accountStatus !== "disabled" &&
            (x.clockRequired || Permissions.has(x.id, "clock.own")));
        const ids = techs.map(x => x.id);
        const states = techs.map(x => ({ x, st: stateOf(x.id) }));
        const count = k => states.filter(z => z.st === k).length;
        const today = Utils.isoLocal(Date.now());
        let weekWorked = 0, h25 = 0, h50 = 0;
        const rows = techs.map(x => Store.withUser(x.id, () => {
            const m = monthRecap(); const w = weekNow();
            const d = Segments.day(today, Store.entries(), Store.settings());
            const last = Store.entries().slice().sort((p, q) => q.start - p.start)[0] || null;
            weekWorked += w.worked; h25 += m.h25; h50 += m.h50;
            return { x, m, w, todayMs: d.totalMs, last, st: stateOf(x.id) };
        }));
        const pending = Store.allRequests().filter(r => r.status === "pending" && ids.indexOf(r.userId) >= 0);
        const reports = Store.correctionRequests().filter(r => r.status === "open" && ids.indexOf(r.userId) >= 0);
        const reportsOf = id => reports.filter(r => r.userId === id).length;
        const STATE = { on: ["dash.state.on", "success"], break: ["dash.state.break", "warning"], leave: ["dash.state.leave", "info"], off: ["dash.state.off", "neutral"] };
        const sections = Store.sections().filter(sec => Store.profile().allSections || Store.profile().sectionIds.indexOf(sec.id) >= 0).map(sec => sec.name).join(", ");
        const nameOf = id => (Store.user(id) || {}).name || "";
        root.innerHTML = UI.pageHeader(t("dash.hello", { name: Store.profile().name.split(" ")[0] }), t("dash.teamSub", { sections }),
                (Permissions.can("clock.own") ? '<a class="button" href="#clock">' + UI.icon("clock") + E(t("dash.goClock")) + "</a> " : "") +
                '<a class="button primary" href="#leave">' + UI.icon("calendar") + E(t("dash.goLeave")) + "</a>") +
            '<p class="banner">' + E(t("admin.demoWarning")) + "</p>" +
            '<div class="grid cols-4">' +
            UI.kpi(t("dash.present"), String(count("on") + count("break")), "activity", "success", t("dash.onBreak", { n: count("break") })) +
            UI.kpi(t("dash.absent"), String(count("off")), "user", "") +
            UI.kpi(t("dash.onLeave"), String(count("leave")), "sun", "warning") +
            UI.kpi(t("dash.toLook"), String(pending.length + reports.length), "hourglass", pending.length + reports.length ? "danger" : "",
                t("dash.toLookSub", { leave: pending.length, reports: reports.length })) +
            "</div>" +
            /* each technician at a glance */
            '<div class="card" style="margin-top:1rem"><div class="title-row"><h2>' + E(t("dash.myTechs")) + "</h2>" +
            '<div class="actions"><a class="button mini" href="#team">' + E(t("dash.seeTeam")) + "</a></div></div>" +
            (rows.length ? '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("admin.col.person")) + "</th><th>" + E(t("dash.status")) +
                '</th><th class="num">' + E(t("dash.today")) + '</th><th class="num">' + E(t("dash.weekDone")) + '</th><th class="num">' + E(t("dash.weekResult")) +
                "</th><th>" + E(t("dash.lastActivity")) + '</th><th class="num">' + E(t("dash.reports")) + "</th></tr></thead><tbody>" +
                rows.map(r => '<tr><td><span class="person">' + UI.avatar(r.x.name, "small") + "<span><strong>" + E(r.x.name) + "</strong><small>" +
                    E(Store.sections().filter(sec => r.x.sectionIds.indexOf(sec.id) >= 0).map(sec => sec.name).join(", ")) + "</small></span></span></td>" +
                    "<td>" + UI.badge(t(STATE[r.st][0]), STATE[r.st][1]) + "</td>" +
                    '<td class="num">' + Utils.hm(r.todayMs) + "</td>" +
                    '<td class="num">' + Utils.hours(r.w.done) + ' <small class="muted">/ ' + Utils.hours(r.w.goal) + "</small></td>" +
                    '<td class="num ' + (r.w.toRecover < 0 ? "negative" : "positive") + '">' + Countdown.parts(r.w.toRecover).value + "</td>" +
                    "<td>" + (r.last ? E(Segments.label(r.last.category)) + ' <small class="muted">' + Utils.dateDmy(Utils.isoLocal(r.last.start)) + " " +
                        Utils.clock(r.last.start) + (r.last.end == null ? " · " + E(t("flag.running")) : "") + "</small>" : "—") + "</td>" +
                    '<td class="num">' + (reportsOf(r.x.id) ? UI.badge(String(reportsOf(r.x.id)), "warning") : "—") + "</td></tr>").join("") +
                "</tbody></table></div>" : '<p class="empty">' + E(t("dash.noTechs")) + "</p>") + "</div>" +
            '<div class="grid cols-2" style="margin-top:1rem">' +
            UI.kpi(t("dash.teamWeek"), Utils.hours(weekWorked), "clock", "", t("dash.teamWeekSub")) +
            UI.kpi(t("dash.teamOvertime"), Utils.hours(h25 + h50), "reports", "", t("leave.overtimeDetailInline", { h25: Utils.hours(h25), h50: Utils.hours(h50) })) +
            "</div>" +
            '<div class="grid cols-2" style="margin-top:1rem">' +
            /* requests and error reports to look at */
            '<div class="card"><h2>' + E(t("dash.toLook")) + "</h2>" +
            (pending.length || reports.length ? '<ul class="feed">' +
                pending.slice(0, 6).map(r => "<li>" + UI.avatar(r.userName, "small") + "<div><strong>" + E(r.userName) + "</strong> — " +
                    E(t(TYPE_KEYS[r.type] || "leave.type.other")) + "<br><small>" + Utils.dateDmy(r.startDate) + " → " + Utils.dateDmy(r.endDate) + "</small></div>" +
                    UI.badge(t("leave.status.pending"), "warning") + "</li>").join("") +
                reports.slice(0, 6).map(r => "<li>" + UI.avatar(nameOf(r.userId), "small") + "<div><strong>" + E(nameOf(r.userId)) + "</strong> — " +
                    E(t("dash.reportOf", { date: Utils.dateDmy(r.date) })) + "<br><small>" + E(r.text) + "</small></div>" + UI.badge(t("report.status.open"), "warning") + "</li>").join("") +
                "</ul>" + '<div class="actions">' + (pending.length ? '<a class="button mini" href="#leave">' + E(t(manager ? "dash.decide" : "dash.seeCalendar")) + "</a>" : "") +
                (reports.length ? '<a class="button mini" href="#team">' + E(t(manager ? "dash.correct" : "dash.seeTeam")) + "</a>" : "") + "</div>"
                : '<p class="empty">' + E(t("dash.nothingToLook")) + "</p>") +
            (!manager && pending.length ? '<p class="info">' + E(t("dash.leadInfo")) + "</p>" : "") + "</div>" +
            '<div class="card"><h2>' + E(t("dash.activity")) + "</h2>" + feedHtml(activity(ids)) + "</div></div>" +
            '<div class="card" style="margin-top:1rem"><h2>' + E(t("dash.monthRecap", { month: Utils.monthName(new Date().getMonth()) })) + "</h2>" +
            '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("admin.col.person")) + '</th><th class="num">' + E(t("dash.workedMonth")) +
            '</th><th class="num">' + E(t("dash.resultMonth")) + '</th><th class="num">25 %</th><th class="num">50 %</th><th class="num">' + E(t("sheet.col.night")) + "</th></tr></thead><tbody>" +
            rows.map(r => '<tr><td><span class="person">' + UI.avatar(r.x.name, "small") + E(r.x.name) + "</span></td>" +
                '<td class="num">' + Utils.hours(r.m.worked) + '</td><td class="num ' + (r.m.result < 0 ? "negative" : "") + '">' + Utils.hours(r.m.result) +
                '</td><td class="num">' + Utils.hours(r.m.h25) + '</td><td class="num">' + Utils.hours(r.m.h50) + '</td><td class="num">' + Utils.hours(r.m.night) + "</td></tr>").join("") +
            "</tbody></table></div></div>";
    }

    function render() {
        if (!root) return;
        /* team view for whoever follows a team (team lead, managers); personal view otherwise */
        if (Permissions.canAny(["team.view", "timesheet.team.view", "users.manage"])) renderTeam(); else renderTechnician();
    }

    function init() {
        root = document.getElementById("page-dashboard");
        render();
    }

    return { init, render };
})();
