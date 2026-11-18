/* =============================================================
   page-weeks.js — week validation (2.9, decision of 10/11/2026)
   Circuit: the technician reviews and SENDS a completed week → the
   team lead validates FIRST (or returns it) → the quality manager OR
   the director locks it (or returns it): the first of the two
   decides. Rules and rights: store.js (sendWeek, reviewWeek, lockWeek).
   This module gives:
   - the "To validate" page (team lead, managers): weeks waiting for
     the person, then the latest decisions;
   - the detail sheet of a week (days, totals, flow, decision);
   - the review / send sheet of the technician (openSend);
   - flowHtml(): the 3 steps with WHO decided, shown everywhere.
   ============================================================= */

const ValidationPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let root = null;
    const ERR = { forbidden: "week.err.forbidden", notComplete: "week.err.notComplete", alreadySent: "week.err.alreadySent", notFound: "week.err.notFound",
        ownWeek: "week.err.ownWeek", notWaiting: "week.err.notWaiting", commentRequired: "week.err.commentRequired", badDecision: "week.err.notWaiting" };
    const errText = code => t(ERR[code] || "week.err.notWaiting");
    const STEP = { sent: "week.step.sent", pending_lock: "week.step.validated", locked: "week.step.locked", returned: "week.step.returned" };

    const nameOf = UI.nameOf;
    const first = id => nameOf(id).split(" ")[0];
    const datesOf = (y, w) => Utils.dateDmy(Hours.isoDayOf(y, w, 0)).slice(0, 5) + " → " + Utils.dateDmy(Hours.isoDayOf(y, w, 6)).slice(0, 5);

    /* [text, badge kind] of a record (or of a week never sent) — screens and exported reports */
    function statusOf(r) {
        if (!r) return [t("week.status.none"), "neutral"];
        if (r.status === "sent") return [t("week.status.sent"), "warning"];
        if (r.status === "pending_lock") return [r.leadBy ? t("week.status.validatedBy", { name: first(r.leadBy) }) : t("week.status.toLock"), "info"];
        if (r.status === "locked") return [t("week.status.lockedBy", { name: first(r.lockedBy) }), "success"];
        return [t("week.status.returnedBy", { name: first(r.returnedBy) }), "danger"];
    }
    const badgeOf = r => UI.badge.apply(null, statusOf(r));

    /* The 3 steps: sent by → team lead → quality OR director (who decided, when) */
    function flowHtml(r, ownerId) {
        const owner = ownerId || (r && r.userId) || Store.currentUserId();
        const at = iso => (iso ? Utils.dateTime(new Date(iso).getTime()) : "");
        const leads = Store.weekLeadsOf(owner);
        const lockers = Store.users().filter(x => x.id !== owner && x.accountStatus !== "disabled" && Permissions.has(x.id, "timesheet.week.lock"));
        const done = '<span class="check">' + UI.icon("check") + "</span>";
        const step = (cls, avatars, title, sub) => '<div class="vstep ' + cls + '"><span class="vmark">' + avatars + (cls === "done" ? done : "") + "</span>" +
            '<span class="vtext"><strong>' + E(title) + "</strong><br>" + sub + "</span></div>";
        const arrow = '<span class="varrow">' + UI.icon("arrow") + "</span>";
        const st = r ? r.status : "";
        const sent = r && r.sentAt;
        let html = step(sent && st !== "returned" ? "done" : st === "returned" ? "back" : "now", UI.avatar(nameOf(owner)),
            sent && st !== "returned" ? t("week.flow.sentBy", { name: first(owner) }) : st === "returned" ? t("week.flow.returnedBy", { name: first(r.returnedBy) }) : t("week.flow.toSend"),
            E(sent && st !== "returned" ? at(r.sentAt) : st === "returned" ? r.comment : t("week.flow.toSendSub")));
        if (leads.length || (r && r.leadBy)) {
            const lead = r && r.leadBy ? r.leadBy : leads[0];
            const ok = r && r.leadBy && ["pending_lock", "locked"].indexOf(st) >= 0;
            html += arrow + step(ok ? "done" : st === "sent" ? "now" : "", UI.avatar(nameOf(lead)),
                ok ? t("week.flow.validatedBy", { name: first(lead) }) : t("week.flow.lead", { name: first(lead) }),
                E(ok ? at(r.leadAt) : st === "sent" ? t("week.flow.waiting") : t("week.flow.first")));
        }
        if (st === "locked") {
            const other = lockers.filter(x => x.id !== r.lockedBy).map(x => x.name.split(" ")[0]);
            html += arrow + step("done", UI.avatar(nameOf(r.lockedBy)), t("week.flow.lockedBy", { name: first(r.lockedBy) }),
                E(at(r.lockedAt)) + (other.length ? '<br><span class="faded">' + E(t("week.flow.notNeeded", { names: other.join(", ") })) + "</span>" : ""));
        } else {
            html += arrow + step(st === "pending_lock" ? "now" : "", '<span style="display:flex">' + lockers.slice(0, 2).map((x, i) =>
                    '<span style="display:flex' + (i ? ";margin-left:-12px" : "") + '">' + UI.avatar(x.name) + "</span>").join("") + "</span>",
                t("week.flow.lock"), E(t("week.flow.lockSub", { names: lockers.map(x => x.name.split(" ")[0]).join(t("week.flow.or")) })));
        }
        return '<div class="vflow">' + html + "</div>";
    }

    /* Days of a week of a person: table rows with the activity bar */
    function weekTable(uid, year, week) {
        return Store.withUser(uid, () => {
            const sheet = Segments.weekSheet(year, week, Store.entries(), Store.settings(), Date.now());
            const s = Hours.weekSummary(sheet);
            const rows = Hours.DAYS.map(k => {
                const j = sheet.days[k], b = j.summary;
                const bar = Segments.CATEGORIES.filter(c => c.key !== "lunch" && c.key !== "break" && b.byCategory[c.key] > 0)
                    .map(c => '<span style="width:' + Math.min(100, b.byCategory[c.key] / 36000000 * 100).toFixed(1) + "%;background:" + c.color + '"></span>').join("");
                const span = b.pieces.length ? Utils.clock(b.pieces[0].start) + " → " + Utils.clock(b.pieces[b.pieces.length - 1].end) : "—";
                const hol = Holidays.name(Utils.utcDate(j.iso));
                return "<tr><td><strong>" + E(Utils.dayName(j.iso)) + "</strong> " + Utils.dateDmy(j.iso).slice(0, 5) + (hol ? ' <span class="tag holiday">' + E(hol) + "</span>" : "") + "</td>" +
                    '<td class="muted">' + E(span) + '</td><td><div class="mini-bar">' + bar + '</div></td><td class="num"><strong>' + (b.totalMs ? Utils.hm(b.totalMs) : "—") + "</strong></td></tr>";
            }).join("");
            return { s, html: '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("sheet.col.day")) + "</th><th>" + E(t("week.col.span")) + "</th><th>" +
                E(t("sheet.col.detail")) + '</th><th class="num">' + E(t("sheet.col.dayTotal")) + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
                '<div class="figures" style="margin-top:1rem">' +
                "<div><span>" + E(t("sheet.done")) + "</span><strong>" + Utils.hours(s.done) + "</strong><small>" + E(t("week.goalOf", { goal: Utils.hours(s.goal) })) + "</small></div>" +
                "<div><span>" + E(t("leave.l.ot25")) + "</span><strong>" + Utils.hours(s.overtime.h25) + "</strong></div>" +
                "<div><span>" + E(t("leave.l.ot50")) + "</span><strong>" + Utils.hours(s.overtime.h50) + "</strong></div>" +
                "<div><span>" + E(t("sheet.col.night")) + "</span><strong>" + Utils.hours(s.counters.night) + "</strong></div>" +
                /* 3.0: the value of the week like the managers' register "OK" */
                (Store.org().hoursMethod !== "countdown" ? "<div><span>" + E(t(s.register.paid ? "week.valuedPaid" : "week.valuedBank")) + "</span><strong>" +
                    Utils.hours(s.register.valued) + "</strong><small>" + E(t("week.valuedOf", { extra: Utils.hours(Math.max(0, s.register.extra)), goal: Utils.hours(s.register.goal) })) + "</small></div>" : "") +
                "</div>" };
        });
    }

    /* ---------- Technician: review and send ---------- */
    function openSend(year, week) {
        const me = Store.currentUserId();
        const r = Store.weekValidation(me, year, week);
        const tb = weekTable(me, year, week);
        UI.openSheet('<div class="title-row"><h2>' + E(t("week.sendTitle", { week })) + "</h2>" + badgeOf(r) + "</div>" +
            '<p class="info">' + E(t("week.sendInfo", { dates: datesOf(year, week) })) + "</p>" +
            (r && r.status === "returned" ? '<p class="banner warn">' + E(t("week.returnedInfo", { name: nameOf(r.returnedBy), comment: r.comment })) + "</p>" : "") +
            tb.html +
            '<label class="check" style="margin-top:1rem"><input type="checkbox" id="wsOk"> ' + E(t("week.certify", { week })) + "</label>" +
            '<p class="info">' + E(t("week.sendRoute")) + '</p><p class="error" id="wsErr"></p>' +
            '<div class="actions"><button type="button" class="button" data-close>' + E(t("common.cancel")) + '</button><span class="spacer"></span>' +
            (Permissions.can("timeclock.report_issue") ? '<a class="button" href="#clock/sheet" data-close>' + UI.icon("flag") + E(t("clock.reportLink")) + "</a>" : "") +
            '<button type="button" class="button primary" id="wsSend">' + UI.icon("send") + E(t("week.send")) + "</button></div>", dlg => {
            dlg.querySelector("#wsSend").addEventListener("click", () => {
                if (!dlg.querySelector("#wsOk").checked) { dlg.querySelector("#wsErr").textContent = t("week.err.certify"); return; }
                const res = Store.sendWeek(year, week);
                if (typeof res === "string") { dlg.querySelector("#wsErr").textContent = errText(res); return; }
                UI.closeSheet();
                UI.toast("<strong>" + E(t("week.sentOk", { week })) + "</strong>", "", 0, null);
            });
        });
    }

    /* ---------- Reviewer / locker: detail and decision ---------- */
    function openDetail(id) {
        const r = Store.weekValidations().find(x => x.id === id);
        if (!r) return;
        const me = Store.currentUserId();
        const canReview = r.status === "sent" && Permissions.can("timesheet.week.review") && r.userId !== me;
        const canLock = Permissions.can("timesheet.week.lock") && r.userId !== me;
        /* 3.0 (8): team lead away → the week can be locked directly; (7) the team lead asks for an unlock */
        const leads = Store.weekLeadsOf(r.userId);
        const leadAway = r.status === "sent" && leads.length > 0 && leads.every(id => Store.isAway(id));
        const askUnlock = r.status === "locked" && !r.unlockRequest && Permissions.can("timesheet.week.review") && !canLock && r.userId !== me;
        const tb = weekTable(r.userId, r.year, r.week);
        const reports = Store.correctionRequests(r.userId).filter(x => x.status === "open");
        UI.openSheet('<div class="title-row"><span class="person">' + UI.avatar(nameOf(r.userId)) + "<span><strong>" + E(nameOf(r.userId)) + "</strong><small>" +
                E(t("week.titleShort", { week: r.week, dates: datesOf(r.year, r.week) })) + "</small></span></span>" + badgeOf(r) + "</div>" +
            flowHtml(r, r.userId) + '<div style="height:1rem"></div>' + tb.html +
            (reports.length ? '<p class="banner warn">' + E(t("week.openReports", { n: reports.length })) + "</p>" : "") +
            (leadAway && canLock ? '<p class="banner warn">' + E(t("week.leadAway", { name: nameOf(leads[0]) })) + "</p>" : "") +
            (r.unlockRequest ? '<p class="banner warn">' + E(t("week.unlockAskedBy", { name: nameOf(r.unlockRequest.by), comment: r.unlockRequest.comment })) + "</p>" : "") +
            ((r.history || []).length ? "<h3>" + E(t("week.history")) + '</h3><ul class="feed">' + r.history.map(h => "<li>" + UI.avatar(nameOf(h.by), "small") +
                "<div><strong>" + E(nameOf(h.by)) + "</strong> — " + E(t(STEP[h.to] || "week.step.returned")) +
                (h.comment ? " · « " + E(h.comment) + " »" : "") + '<br><small class="muted">' + E(Utils.dateTime(new Date(h.at).getTime())) + "</small></div></li>").join("") + "</ul>" : "") +
            (canReview || askUnlock || (canLock && ["pending_lock", "locked", "sent"].indexOf(r.status) >= 0)
                ? "<label>" + E(t("week.comment")) + '<textarea id="wdComment" rows="2" maxlength="300" style="width:100%"></textarea></label>' : "") +
            '<p class="error" id="wdErr"></p><div class="actions"><button type="button" class="button" data-close>' + E(t("common.close")) + '</button><span class="spacer"></span>' +
            (canReview ? '<button type="button" class="button" data-wd="review:return">' + UI.icon("x") + E(t("week.return")) + "</button>" +
                '<button type="button" class="button ok" data-wd="review:validate">' + UI.icon("check") + E(t("week.validate")) + "</button>" : "") +
            (askUnlock ? '<button type="button" class="button" data-wd="unlock:ask">' + UI.icon("undo") + E(t("week.askUnlock")) + "</button>" : "") +
            (canLock && leadAway ? '<button type="button" class="button ok" data-wd="lock:lock">' + UI.icon("lock") + E(t("week.lock")) + "</button>" : "") +
            (canLock && r.status === "pending_lock" ? '<button type="button" class="button" data-wd="lock:return">' + UI.icon("x") + E(t("week.return")) + "</button>" +
                '<button type="button" class="button ok" data-wd="lock:lock">' + UI.icon("lock") + E(t("week.lock")) + "</button>" : "") +
            (canLock && (r.status === "locked" || r.status === "sent") ? '<button type="button" class="button" data-wd="lock:return">' + UI.icon("undo") +
                E(t(r.status === "locked" ? "week.reopen" : "week.return")) + "</button>" : "") +
            "</div>", dlg => {
            dlg.querySelectorAll("[data-wd]").forEach(b => b.addEventListener("click", () => {
                const [kind, decision] = b.dataset.wd.split(":");
                const comment = (dlg.querySelector("#wdComment") || {}).value || "";
                const res = kind === "review" ? Store.reviewWeek(r.id, decision, comment) : kind === "unlock" ? Store.requestUnlock(r.id, comment) : Store.lockWeek(r.id, decision, comment);
                if (res !== true) { dlg.querySelector("#wdErr").textContent = errText(res); return; }
                UI.closeSheet();
            }));
        });
    }

    /* Weeks waiting for the signed-in person */
    function waiting() {
        const me = Store.currentUserId();
        const review = Permissions.can("timesheet.week.review"), lock = Permissions.can("timesheet.week.lock");
        const leadAway = r => Store.weekLeadsOf(r.userId).length > 0 && Store.weekLeadsOf(r.userId).every(id => Store.isAway(id));
        return Store.weekValidations().filter(r => r.userId !== me &&
            ((review && r.status === "sent") || (lock && r.status === "pending_lock") ||
             (lock && r.status === "sent" && leadAway(r)) || (lock && r.status === "locked" && !!r.unlockRequest)));
    }
    /* 3.0.1: leave requests waiting for the signed-in person (decision, cancellation, or opinion) */
    function leaveWaiting() {
        const me = Store.currentUserId();
        const single = !!Store.org().leaveSingleDecision;
        return Store.allRequests().filter(r => r.userId !== me && (
            (Store.canDecideLeave(me, r.userId) && (Store.isOpenRequest(r) || (r.status === "approved" && !!r.cancelRequest)) &&
                !(r.status === "pending_lead" && Store.leadsOf(r.userId).length && !Permissions.can("leave.global.approve"))) ||
            (!single && Permissions.can("leave.team.review") && r.status === "pending_lead" && Permissions.canSeeUser(me, r.userId))))
            .sort((a, b) => a.startDate.localeCompare(b.startDate));
    }
    const waitingCount = () => waiting().length + leaveWaiting().length;

    function itemHtml(r, action) {
        return '<li><span class="inbox-icon" style="--c:' + (r.status === "locked" ? "#15803D" : r.status === "returned" ? "#B91C1C" : "#801F35") + '">' + UI.icon(r.status === "locked" ? "lock" : "send") + "</span>" +
            '<span class="inbox-text"><strong>' + E(nameOf(r.userId)) + "</strong> · " + E(t("week.titleShort", { week: r.week, dates: datesOf(r.year, r.week) })) +
            "<br>" + E(t("week.total", { done: Utils.hours(r.done || 0) })) + " " + badgeOf(r) + "</span>" +
            '<span class="actions"><button type="button" class="button ' + (action ? "primary" : "") + ' mini" data-open-week="' + E(r.id) + '">' + E(t(action ? "week.open" : "week.see")) + "</button></span></li>";
    }

    /* 4.7: "To validate" = weeks + leave decisions + error reports + history, one tab each */
    let tab = "weeks";
    const canLeave = () => Permissions.canAny(["leave.team.approve", "leave.global.approve", "leave.team.review"]);
    const canReports = () => Permissions.canAny(["timeclock.correction.approve", "timeclock.team.view"]);
    const openReports = () => Store.correctionRequests().filter(r => r.status === "open" && r.userId !== Store.currentUserId());
    function tabsOf() {
        return [["weeks", t("val.tab.weeks"), waiting().length]]
            .concat(canLeave() ? [["leave", t("nav.leave"), leaveWaiting().length]] : [])
            .concat(canReports() ? [["reports", t("val.tab.reports"), openReports().length]] : [])
            .concat([["history", t("cal.history")]]);
    }

    /* Error reports of the perimeter: open first, then the latest answered; handled in the person's timesheet */
    function reportsHtml() {
        const all = Store.correctionRequests().filter(r => r.userId !== Store.currentUserId());
        const shown = all.filter(r => r.status === "open").concat(all.filter(r => r.status !== "open").slice(0, 10));
        const kind = { open: "warning", done: "success", rejected: "danger" };
        return '<div class="card"><h2>' + E(t("val.tab.reports")) + "</h2>" + (shown.length ? '<ul class="inbox">' + shown.map(r =>
            '<li><span class="inbox-icon" style="--c:#B45309">' + UI.icon("alert") + '</span><span class="inbox-text"><strong>' + E(nameOf(r.userId)) + "</strong> · " +
            Utils.dateDmy(r.date) + " " + UI.badge(t("report.status." + r.status), kind[r.status]) + "<br>" + E(r.text) + "</span>" +
            '<span class="actions"><a class="button mini' + (r.status === "open" ? " primary" : "") + '" href="#team/' + E(r.userId) + '">' + E(t("week.open")) + "</a></span></li>").join("") + "</ul>"
            : '<p class="empty">' + UI.icon("check") + E(t("val.reportsNone")) + "</p>") + '<p class="info">' + E(t("val.reportsInfo")) + "</p></div>";
    }

    function body() {
        const zone = root.querySelector("#valBody");
        if (tab === "leave") { LeavePage.queueInto(zone); return; }
        const list = waiting();
        const others = Store.weekValidations().filter(r => r.userId !== Store.currentUserId() && !list.some(x => x.id === r.id)).slice(0, 20);
        zone.innerHTML = tab === "reports" ? reportsHtml()
            : tab === "history" ? '<div class="card"><h2>' + E(t("week.latest")) + "</h2>" +
                (others.length ? '<ul class="inbox">' + others.map(r => itemHtml(r, false)).join("") + "</ul>" : '<p class="empty">' + E(t("week.noneYet")) + "</p>") + "</div>"
            : '<div class="card"><h2>' + E(t("week.toHandle")) + "</h2>" +
                (list.length ? '<ul class="inbox">' + list.map(r => itemHtml(r, true)).join("") + "</ul>" : '<p class="empty">' + UI.icon("check") + E(t("week.nothing")) + "</p>") + "</div>";
        zone.querySelectorAll("[data-open-week]").forEach(b => b.addEventListener("click", () => openDetail(b.dataset.openWeek)));
    }

    function render() {
        if (!root) return;
        const tabs = tabsOf();
        if (!tabs.some(x => x[0] === tab)) tab = "weeks";
        const lock = Permissions.can("timesheet.week.lock");
        root.innerHTML = UI.pageHeader(t("nav.validation"), t(lock ? "week.pageSubLock" : "week.pageSubLead")) +
            '<section class="hero"><div class="hero-main"><span class="hero-label">' + E(t("week.waitingLabel")) + "</span>" +
            '<div style="display:flex;align-items:baseline;gap:1rem"><span class="hero-figure">' + waitingCount() + "</span><span class=\"muted\">" +
            E(t(lock ? "week.waitingLock" : "week.waitingLead")) + "</span></div></div>" +
            '<div class="hero-side"><div class="hero-stats"><span><strong>' + Store.weekValidations().filter(r => r.status === "locked").length + "</strong>" + E(t("week.countLocked")) + "</span>" +
            "<span><strong>" + Store.weekValidations().filter(r => r.status === "returned").length + "</strong>" + E(t("week.countReturned")) + "</span></div></div></section>" +
            UI.tabs(tabs, tab, "validation") + '<div id="valBody"></div>';
        UI.onTabs(root, "validation", k => { tab = k; App.setSub("validation", k); body(); UI.fadeIn(root.querySelector("#valBody")); });
        body();
    }

    function init() {
        root = document.getElementById("page-validation");
        render();
    }

    /* Deep links: #validation/weeks | leave | reports | history (old #leave/requests → leave) */
    function setTab(k) {
        if (!tabsOf().some(x => x[0] === k)) return;
        tab = k;
        if (root) render();
    }

    return { init, render, setTab, getTab: () => tab, openSend, openDetail, flowHtml, badgeOf, statusOf, waitingCount, waiting, leaveWaiting };
})();
