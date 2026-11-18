/* =============================================================
   page-leave.js — "Leave & absences" (version 2.6, priority screen)
   A. COLLECTIVE CALENDAR (real data: Store.allRequests)
      - month / week / year views, navigation, today;
      - name on each absence, colour per type (paid leave, time off,
        other absence), pending = dashed, rejected hidden (admins can
        show them); public holidays marked;
      - filters: person, type; click on an absence → detail sheet
        (approve / reject for admins, cancel for the requester);
      - "New request" button (admins: for a chosen employee).
      Visibility: admins see everything; technicians see the APPROVED
      absences of the team and all their own requests.
   B. MANAGEMENT
      - technician: balances, own requests (cancel while pending),
        CSV template / import (approved history) / export;
      - admin: requests by status (pending → approve / reject,
        approved, rejected, history), balances of each employee,
        CSV export of every request.
   Rules unchanged: the requester never chooses the status; an admin
   never decides on their own request (Store.decideRequest); days
   counted by Leave.workingDaysOf; "other" absences have no effect on
   any calculation (hours.js).
   ============================================================= */

const LeavePage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    const TYPE_KEYS = UI.LEAVE_TYPE_KEYS;
    /* the 8 statuses of the leave circuit (06/11/2026) → "leave.status.<status>" */
    const STATUS_KEYS = {};
    Store.REQUEST_STATUSES.forEach(k => { STATUS_KEYS[k] = "leave.status." + k; });
    const TYPES = Store.REQUEST_TYPES;
    let root = null;
    const st = { tab: "", view: "month", year: 0, month: 0, weekStart: "", person: "", type: "", showRejected: false, status: "", msg: null };

    /* rights (permissions.js): final decision, team lead's opinion, team view.
       3.0: with rule 10.1 the team lead decides too (first decision is final) */
    const single = () => !!Store.org().leaveSingleDecision;
    const canDecide = () => Permissions.can("leave.global.approve") || (single() && Permissions.can("leave.team.approve"));
    const canDecideFor = ownerId => Store.canDecideLeave(me(), ownerId);
    const canReview = () => Permissions.can("leave.team.review") && !single();
    const seesTeam = () => canDecide() || canReview() || Permissions.canAny(["leave.team.view", "leave.global.view"]);
    const isAdmin = () => Permissions.can("leave.global.approve");   /* request on behalf of a technician */
    const me = () => Store.currentUserId();
    const typeLabel = type => t(TYPE_KEYS[type] || "leave.type.other");
    /* 3.0: what a viewer may read of someone else's absence — a justified absence
       (sickness…) is health-related: its type only with "absence.sensitive.view" */
    function shownType(r) {
        if (r.userId === me()) return typeLabel(r.type);
        if (!seesTeam() && Store.org().calendarForTechnicians !== "withReason") return t("leave.type.absent");
        if (r.type === "justified" && !Permissions.can("absence.sensitive.view")) return t("leave.type.absent");
        return typeLabel(r.type);
    }
    const shownComment = r => (r.userId === me() || (seesTeam() && (r.type !== "justified" || Permissions.can("absence.sensitive.view"))) ? r.comment : "");
    const halfLabel = r => (r.half === "am" ? " (" + t("leave.half.am") + ")" : r.half === "pm" ? " (" + t("leave.half.pm") + ")" : "");

    /* ---------- Data ---------- */

    /* Calendar: drafts and cancelled requests never shown; approved absences of the
       team for everybody; open and refused requests only within one's perimeter. */
    function visibleRequests() {
        const all = Store.allRequests();
        const techMode = Store.org().calendarForTechnicians;
        return all.filter(r => {
            if (r.status === "draft" || r.status === "cancelled") return false;
            /* 3.0 (10.2): a technician sees only his own absences unless the rule opens the team calendar */
            if (r.userId !== me() && !seesTeam() && (techMode === "none" || r.status !== "approved" ||
                Store.user(r.userId) && Store.user(r.userId).role !== "technician")) return false;
            if (r.status !== "approved" && r.userId !== me() && !(seesTeam() && Permissions.canSeeUser(me(), r.userId))) return false;
            if (r.userId !== me() && seesTeam() && !Permissions.canSeeUser(me(), r.userId)) return false;   /* never upwards (3.0) */
            if (r.status === "rejected" && !st.showRejected) return false;
            if (st.person && r.userId !== st.person) return false;
            if (st.type && r.type !== st.type) return false;
            return true;
        });
    }

    /* 3.0.1: a leave is drawn only on the days it counts (Monday → Saturday, holidays excluded) */
    const onDay = (list, iso) => (Leave.countsOn(iso) ? list.filter(r => r.startDate <= iso && iso <= r.endDate) : []);

    function workingDays(r) {
        return Store.withUser(r.userId, () => Leave.workingDaysOf(r, Store.profile(), Store.entries(), Store.settings()));
    }

    /* People offered in the filters: one's perimeter (team lead, managers), else the technicians */
    function people() {
        if (seesTeam()) return Permissions.visibleUsers().filter(x => x.id !== me() && (x.accountStatus !== "disabled" || canDecide()));
        if (Store.org().calendarForTechnicians === "none") return Store.users().filter(x => x.id === me());
        return Store.users().filter(x => x.role === "technician" && (x.accountStatus !== "disabled" || x.id === me()));
    }

    /* Absence label. Background = type of absence (legend); the round badge = the person
       (same colour everywhere). Month view: the name is written where the absence starts
       in the row, the following days continue the band (pos.prev / pos.next). Week view
       (one row per person): the type is written. */
    function chip(r, showType, pos) {
        const p = pos || {};
        const cls = r.userId !== me() && shownType(r) === t("leave.type.absent") ? "other" : r.type;   /* the colour must not reveal a masked type */
        const label = showType ? E(shownType(r)) : p.prev ? "" : UI.who(r.userName) + "<span>" + E(r.userName.split(" ")[0]) + "</span>";
        /* any request not decided yet is drawn dashed ("pending"), whatever its step */
        return '<button type="button" class="absence ' + cls + " " + (Store.isOpenRequest(r) ? "pending" : r.status) + (p.prev ? " cont-prev" : "") + (p.next ? " cont-next" : "") +
            '" data-req="' + E(r.userId + "|" + r.id) + '" title="' + E(r.userName + " — " + shownType(r) + halfLabel(r) + " — " + t(STATUS_KEYS[r.status])) + '">' + label + "</button>";
    }

    /* ---------- Calendar views ---------- */

    /* ISO date of the Monday of the week of `d` */
    function mondayIso(d) {
        const w = Hours.isoWeek(Utils.utcDate(Utils.isoLocal(d)));
        return Utils.isoLocal(Hours.mondayOf(w.year, w.week));
    }

    function ensureDate() {
        if (!st.year) {
            const d = new Date();
            st.year = d.getFullYear(); st.month = d.getMonth();
            st.weekStart = mondayIso(d);
        }
    }

    const weekdayNames = () => [1, 2, 3, 4, 5, 6, 0].map(d => new Date(2024, 0, 7 + d).toLocaleDateString(I18n.locale(), { weekday: "short" }));

    /* Month view (3.1): one LINE per person in each week row — an absence keeps the same
       height from day to day and reads as one band; the holiday name sits next to the day number. */
    const MAX_LINES = 4;
    function monthView(list) {
        const first = new Date(st.year, st.month, 1);
        const lead = (first.getDay() + 6) % 7;
        const daysIn = new Date(st.year, st.month + 1, 0).getDate();
        const today = Utils.isoLocal(Date.now());
        let cells = weekdayNames().map(n => '<div class="cal-head">' + E(n) + "</div>").join("");
        for (let i = 0; i < lead; i++) cells += '<div class="cal-cell empty"></div>';
        const isoOf = d => Utils.isoLocal(new Date(st.year, st.month, d));
        let lines = [];   /* people absent in the current week row, in a fixed order */
        for (let d = 1; d <= daysIn; d++) {
            const date = new Date(st.year, st.month, d);
            const iso = isoOf(d);
            const col = (lead + d - 1) % 7;
            if (col === 0 || d === 1) {
                const seen = {};
                for (let k = d; k <= Math.min(daysIn, d + 6 - col); k++) onDay(list, isoOf(k)).forEach(r => { seen[r.userId] = r.userName; });
                lines = Object.keys(seen).sort((a, b) => seen[a].localeCompare(seen[b]));
            }
            const hol = Holidays.isHoliday(Utils.utcDate(iso));
            const items = onDay(list, iso);
            const of = (uid, day) => (day >= 1 && day <= daysIn ? onDay(list, isoOf(day)).find(r => r.userId === uid) : null);
            const wd = date.getDay();
            cells += '<div class="cal-cell' + (wd === 0 || wd === 6 ? " weekend" : "") + (hol ? " holiday" : "") + (iso === today ? " today" : "") + '">' +
                '<div class="cal-day"><span class="day-num">' + d + "</span>" + (hol ? '<span class="holiday-name">' + E(Holidays.name(Utils.utcDate(iso)) || t("tag.holiday")) + "</span>" : "") + "</div>" +
                lines.slice(0, MAX_LINES).map(uid => {
                    const r = items.find(x => x.userId === uid);
                    if (!r) return '<span class="absence-slot"></span>';
                    const before = col > 0 ? of(uid, d - 1) : null, after = col < 6 ? of(uid, d + 1) : null;
                    return chip(r, false, { prev: !!before && before.id === r.id, next: !!after && after.id === r.id });
                }).join("") +
                (lines.length > MAX_LINES && items.some(r => lines.indexOf(r.userId) >= MAX_LINES)
                    ? '<span class="more">+' + items.filter(r => lines.indexOf(r.userId) >= MAX_LINES).length + "</span>" : "") + "</div>";
        }
        const trail = (7 - (lead + daysIn) % 7) % 7;   /* complete the last week */
        for (let i = 0; i < trail; i++) cells += '<div class="cal-cell empty"></div>';
        return '<div class="calendar">' + cells + "</div>";
    }

    function weekView(list) {
        const monday = st.weekStart;
        const daysIso = [0, 1, 2, 3, 4, 5, 6].map(i => Utils.addDays(monday, i));
        const persons = people().filter(x => !st.person || x.id === st.person);
        const names = weekdayNames();
        let html = '<div class="wg-head"></div>' + daysIso.map((iso, i) => '<div class="wg-head">' + E(names[i]) + " " + Utils.dateDmy(iso).slice(0, 5) +
            (Holidays.isHoliday(Utils.utcDate(iso)) ? '<br><span class="holiday-name">' + E(Holidays.name(Utils.utcDate(iso)) || t("tag.holiday")) + "</span>" : "") + "</div>").join("");
        persons.forEach(x => {
            html += '<div class="wg-person">' + UI.avatar(x.name, "small") + "<span>" + E(x.name) + "</span></div>" +
                daysIso.map(iso => "<div>" + onDay(list.filter(r => r.userId === x.id), iso).map(r => chip(r, true)).join("") + "</div>").join("");
        });
        return '<div class="scroll"><div class="week-grid">' + html + "</div></div>" +
            (persons.length ? "" : '<p class="empty">' + E(t("admin.noTechnician")) + "</p>");
    }

    function yearView(list) {
        let html = "";
        for (let m = 0; m < 12; m++) {
            const first = new Date(st.year, m, 1);
            const lead = (first.getDay() + 6) % 7;
            const daysIn = new Date(st.year, m + 1, 0).getDate();
            let cells = "";
            for (let i = 0; i < lead; i++) cells += "<span></span>";
            for (let d = 1; d <= daysIn; d++) {
                const iso = Utils.isoLocal(new Date(st.year, m, d));
                const items = onDay(list, iso);
                const hol = Holidays.isHoliday(Utils.utcDate(iso));
                const r = items[0];
                const cls = r && r.userId !== me() && shownType(r) === t("leave.type.absent") ? "other" : r ? r.type : "";
                cells += '<span class="' + (r ? cls + (items.every(Store.isOpenRequest) ? " pending" : "") : "") + (hol ? " holiday" : "") + '"' +
                    (items.length ? ' title="' + E(items.map(x => x.userName + " — " + shownType(x)).join("\n")) + '"' : "") + ">" + d + "</span>";
            }
            html += '<div class="card mini-month"><h3>' + E(Utils.monthName(m)) + '</h3><div class="mini-days">' + cells + "</div></div>";
        }
        return '<div class="year-grid">' + html + "</div>";
    }

    function calendarTitle() {
        if (st.view === "year") return String(st.year);
        if (st.view === "week") {
            const w = Hours.isoWeek(Utils.utcDate(st.weekStart));
            return t("sheet.navWeek", { n: w.week, year: w.year });
        }
        return Utils.monthName(st.month) + " " + st.year;
    }

    function move(n) {
        if (n === 0) { st.year = 0; ensureDate(); return; }
        if (st.view === "year") st.year += n;
        else if (st.view === "week") {
            st.weekStart = Utils.addDays(st.weekStart, 7 * n);
            const d = Utils.localDate(st.weekStart); st.year = d.getFullYear(); st.month = d.getMonth();
        } else {
            const d = new Date(st.year, st.month + n, 1); st.year = d.getFullYear(); st.month = d.getMonth();
            st.weekStart = mondayIso(d);
        }
    }

    function calendarHtml() {
        ensureDate();
        const list = visibleRequests();
        const persons = people();
        return '<div class="card"><div class="toolbar">' +
            '<div class="toggle">' + [["month", "cal.month"], ["week", "cal.week"], ["year", "cal.year"]].map(([k, l]) =>
                '<button type="button" data-view="' + k + '" class="' + (st.view === k ? "active" : "") + '">' + E(t(l)) + "</button>").join("") + "</div>" +
            '<div class="nav"><button type="button" class="icon-button" data-move="-1" aria-label="' + E(t("common.previous")) + '">' + UI.icon("left") + "</button>" +
            '<strong style="min-width:150px;text-align:center;text-transform:capitalize">' + E(calendarTitle()) + "</strong>" +
            '<button type="button" class="icon-button" data-move="1" aria-label="' + E(t("common.next")) + '">' + UI.icon("right") + "</button>" +
            '<button type="button" class="button mini" data-move="0">' + E(t("common.today")) + "</button></div></div>" +
            '<div class="filters" style="margin-bottom:1rem">' +
            "<label>" + E(t("cal.filterPerson")) + '<select id="lvPerson"><option value="">' + E(t("cal.everyone")) + "</option>" +
            persons.map(x => '<option value="' + E(x.id) + '"' + (st.person === x.id ? " selected" : "") + ">" + E(x.name) + "</option>").join("") + "</select></label>" +
            "<label>" + E(t("cal.filterType")) + '<select id="lvType"><option value="">' + E(t("cal.allTypes")) + "</option>" +
            TYPES.map(k => '<option value="' + k + '"' + (st.type === k ? " selected" : "") + ">" + E(typeLabel(k)) + "</option>").join("") + "</select></label>" +
            (seesTeam() ? '<label class="check"><input type="checkbox" id="lvRejected"' + (st.showRejected ? " checked" : "") + "> " + E(t("cal.showRejected")) + "</label>" : "") +
            "</div>" +
            (st.view === "month" ? monthView(list) : st.view === "week" ? weekView(list) : yearView(list)) +
            '<div class="legend">' + TYPES.map(k => '<span><i class="legend-swatch ' + k + '"></i>' + E(typeLabel(k)) + "</span>").join("") +
            '<span><i class="legend-swatch pending"></i>' + E(t("leave.status.pending")) + "</span>" +
            '<span><i class="legend-swatch holiday"></i>' + E(t("tag.holiday")) + "</span></div>" +
            (seesTeam() ? "" : '<p class="info">' + E(t("cal.visibilityInfo")) + "</p>") + "</div>";
    }

    /* ---------- Detail and new request (sheets) ---------- */

    /* Other absences of the perimeter overlapping these dates (conflicts) */
    function conflictsOf(r) {
        return Store.allRequests().filter(x => x.userId !== r.userId && (x.status === "approved" || Store.isOpenRequest(x)) &&
            x.startDate <= r.endDate && r.startDate <= x.endDate && Permissions.canSeeUser(me(), x.userId));
    }

    const nameOf = id => UI.nameOf(id, "—");

    /* Detail sheet: dates, timeline of every step, team lead's opinion, conflicts,
       and the actions the signed-in person may take (the store checks again). */
    function openDetail(ownerId, id) {
        const r = Store.allRequests().find(x => x.userId === ownerId && x.id === id);
        if (!r) return;
        const mine = ownerId === me();
        const review = canReview() && !mine && r.status === "pending_lead" && Permissions.canSeeUser(me(), ownerId);
        const decide = canDecideFor(ownerId) && !mine && Store.isOpenRequest(r);
        const needsBypass = decide && r.status === "pending_lead" && Store.leadsOf(ownerId).length > 0;
        /* 3.0 (16): cancellation of an APPROVED leave — asked by the requester, decided by a decider */
        const askCancel = mine && r.status === "approved" && !r.cancelRequest && !r.imported;
        const decideCancel = !mine && r.status === "approved" && !!r.cancelRequest && canDecideFor(ownerId);
        const flags = (decide || seesTeam()) && Store.isOpenRequest(r)
            ? [r.lateNotice && "lv.flag.late", r.overlap && "lv.flag.overlap", r.overBalance && "lv.flag.overBalance"].filter(Boolean) : [];
        const conflicts = !mine || seesTeam() ? conflictsOf(r) : [];
        const editDraft = mine && r.status === "draft";
        UI.openSheet('<div class="title-row"><div class="person">' + UI.avatar(r.userName, "large") + "<div><h2 style=\"margin:0\">" + E(r.userName) + "</h2>" +
            "<small>" + E(shownType(r) + halfLabel(r)) + "</small></div></div>" + UI.badge(t(STATUS_KEYS[r.status]), UI.STATUS_KIND[r.status]) + "</div>" +
            (flags.length ? '<div class="banner warn">' + flags.map(k => E(t(k))).join("<br>") + "</div>" : "") +
            (r.cancelRequest ? '<div class="banner warn">' + E(t("lv.cancelAsked", { date: Utils.dateTime(new Date(r.cancelRequest.at).getTime()) })) +
                (r.cancelRequest.comment ? " — « " + E(r.cancelRequest.comment) + " »" : "") + "</div>" : "") +
            (editDraft
                ? '<div class="grid-2"><label>' + E(t("leave.col.type")) + '<select id="drType">' + TYPES.map(k => '<option value="' + k + '"' + (k === r.type ? " selected" : "") + ">" +
                    E(typeLabel(k)) + "</option>").join("") + "</select></label><span></span>" +
                  "<label>" + E(t("leave.from")) + '<input type="date" id="drStart" value="' + E(r.startDate) + '"></label>' +
                  "<label>" + E(t("leave.to")) + '<input type="date" id="drEnd" value="' + E(r.endDate) + '"></label></div>' +
                  "<label>" + E(t("leave.comment")) + '<input type="text" id="drComment" maxlength="200" value="' + E(r.comment) + '"></label>'
                : "<dl><dt>" + E(t("leave.col.from")) + "</dt><dd>" + Utils.dateDmy(r.startDate) + "</dd>" +
                  "<dt>" + E(t("leave.col.to")) + "</dt><dd>" + Utils.dateDmy(r.endDate) + "</dd>" +
                  "<dt>" + E(t("leave.col.days")) + "</dt><dd>" + (r.type === "paid_leave" ? Utils.days(workingDays(r)) : workingDays(r) + " " + E(t("common.daysShort"))) + "</dd>" +
                  (shownComment(r) ? "<dt>" + E(t("leave.comment")) + "</dt><dd>" + E(shownComment(r)) + "</dd>" : "") +
                  (r.review ? "<dt>" + E(t("lv.review")) + "</dt><dd>" + E(t("lv.opinion." + r.review.opinion)) + " — " + E(nameOf(r.review.by)) +
                      (r.review.comment ? " : « " + E(r.review.comment) + " »" : "") + "</dd>" : "") +
                  (r.decidedBy ? "<dt>" + E(t("cal.decision")) + "</dt><dd>" + E(t("leave.decidedBy", { name: r.decidedBy })) +
                      (r.decisionComment ? " : « " + E(r.decisionComment) + " »" : "") + (r.bypassReason ? "<br><small>" + E(t("lv.bypassDone", { reason: r.bypassReason })) + "</small>" : "") + "</dd>" : "") +
                  (r.imported ? "<dt></dt><dd>" + UI.badge(t("flag.imported"), "neutral") + "</dd>" : "") + "</dl>") +
            (["paid_leave", "time_off"].indexOf(r.type) < 0 ? '<p class="info">' + E(t("leave.otherInfo")) + "</p>" : "") +
            /* conflicts within the perimeter */
            (conflicts.length ? '<div class="banner warn"><strong>' + E(t("lv.conflicts", { n: conflicts.length })) + "</strong><br>" +
                conflicts.map(x => E(x.userName) + " — " + E(typeLabel(x.type)) + " " + Utils.dateDmy(x.startDate) + " → " + Utils.dateDmy(x.endDate) +
                    " (" + E(t(STATUS_KEYS[x.status])) + ")").join("<br>") + "</div>" : "") +
            /* timeline */
            ((r.history || []).length ? "<h3>" + E(t("lv.timeline")) + '</h3><ul class="feed">' + r.history.map(h => "<li>" + UI.avatar(nameOf(h.by), "small") +
                "<div><strong>" + E(nameOf(h.by)) + "</strong> — " + E(t(STATUS_KEYS[h.to] || "leave.status.draft")) + "<br><small class=\"muted\">" +
                E(Utils.dateTime(new Date(h.at).getTime())) + (h.comment ? " · « " + E(h.comment) + " »" : "") + "</small></div></li>").join("") + "</ul>" : "") +
            /* actions */
            (review ? '<div class="ed-section"><h3>' + E(t("lv.giveOpinion")) + "</h3>" +
                "<label>" + E(t("lv.opinionComment")) + '<textarea id="rvComment" rows="2" maxlength="300" style="width:100%"></textarea></label>' +
                '<div class="actions"><button type="button" class="button success" data-review="favorable">' + UI.icon("check") + E(t("lv.opinion.favorable")) + "</button>" +
                '<button type="button" class="button danger solid" data-review="unfavorable">' + UI.icon("x") + E(t("lv.opinion.unfavorable")) + "</button>" +
                '<button type="button" class="button" data-review="changes">' + E(t("lv.opinion.changes")) + "</button></div></div>" : "") +
            (decide ? '<div class="ed-section"><h3>' + E(t("lv.finalDecision")) + "</h3>" +
                (needsBypass ? '<p class="banner warn">' + E(t("lv.noOpinionYet")) + "</p><label>" + E(t("lv.bypassReason")) + '<input type="text" id="dcBypass" maxlength="200"></label>' : "") +
                "<label>" + E(t("lv.decisionComment")) + '<textarea id="dcComment" rows="2" maxlength="300" style="width:100%"></textarea></label>' +
                '<div class="actions"><button type="button" class="button success" data-decide="approved">' + UI.icon("check") + E(t("admin.approve")) + "</button>" +
                '<button type="button" class="button danger solid" data-decide="rejected">' + UI.icon("x") + E(t("admin.reject")) + "</button></div></div>" : "") +
            (decideCancel ? '<div class="ed-section"><h3>' + E(t("lv.cancelDecision")) + "</h3>" +
                "<label>" + E(t("lv.decisionComment")) + '<textarea id="ccComment" rows="2" maxlength="300" style="width:100%"></textarea></label>' +
                '<div class="actions"><button type="button" class="button success" data-cancelok="1">' + UI.icon("check") + E(t("lv.cancelAccept")) + "</button>" +
                '<button type="button" class="button danger solid" data-cancelok="0">' + UI.icon("x") + E(t("lv.cancelRefuse")) + "</button></div></div>" : "") +
            (askCancel ? '<div class="ed-section"><h3>' + E(t("lv.askCancel")) + "</h3>" +
                "<label>" + E(t("leave.comment")) + '<input type="text" id="acComment" maxlength="200"></label>' +
                '<div class="actions"><button type="button" class="button danger" data-askcancel>' + E(t("lv.askCancelBtn")) + "</button></div></div>" : "") +
            '<p class="error" id="dtErr"></p><div class="actions">' +
            (editDraft ? '<button type="button" class="button primary" data-submit>' + UI.icon("check") + E(t("leave.send")) + "</button>" +
                '<button type="button" class="button" data-savedraft>' + E(t("lv.saveDraft")) + "</button>" : "") +
            (mine && (r.status === "draft" || Store.isOpenRequest(r)) && (r.history || []).length ? '<button type="button" class="button danger" data-cancel>' + E(t("leave.cancelRequest")) + "</button>" : "") +
            (editDraft && !(r.history || []).length ? '<button type="button" class="button danger" data-deldraft>' + E(t("common.delete")) + "</button>" : "") +
            '<span class="spacer"></span><button type="button" class="button" data-close>' + E(t("common.close")) + "</button></div>",
        dlg => {
            const q = x => dlg.querySelector(x);
            const err = code => { q("#dtErr").textContent = t("lv.err." + code); };
            dlg.querySelectorAll("[data-review]").forEach(b => b.addEventListener("click", () => {
                const res = Store.reviewRequest(ownerId, id, b.dataset.review, q("#rvComment").value);
                if (res !== true) return err(res);
                UI.closeSheet();
            }));
            dlg.querySelectorAll("[data-cancelok]").forEach(b => b.addEventListener("click", () => {
                const res = Store.decideCancellation(ownerId, id, b.dataset.cancelok === "1", q("#ccComment").value);
                if (res !== true) return err(res);
                UI.closeSheet();
            }));
            if (q("[data-askcancel]")) q("[data-askcancel]").addEventListener("click", () => {
                if (!Store.requestCancellation(id, q("#acComment").value)) return err("notWaiting");
                UI.closeSheet();
            });
            dlg.querySelectorAll("[data-decide]").forEach(b => b.addEventListener("click", () => {
                const o = { comment: q("#dcComment").value, bypass: q("#dcBypass") ? q("#dcBypass").value : "" };
                if (!Store.decideRequest(ownerId, id, b.dataset.decide, me(), o)) return err(o.result || "forbidden");
                UI.closeSheet();
            }));
            const draftFields = () => ({ type: q("#drType").value, startDate: q("#drStart").value, endDate: q("#drEnd").value, comment: q("#drComment").value.trim() });
            const draftOk = f => {
                if (!f.startDate || !f.endDate) { q("#dtErr").textContent = t("leave.errDates"); return false; }
                if (f.endDate < f.startDate) { q("#dtErr").textContent = t("leave.errOrder"); return false; }
                if (f.type === "other" && !f.comment) { q("#dtErr").textContent = t("leave.errComment"); return false; }
                return true;
            };
            if (q("[data-savedraft]")) q("[data-savedraft]").addEventListener("click", () => {
                const f = draftFields(); if (!draftOk(f)) return;
                Store.updateDraft(id, f); UI.closeSheet();
            });
            if (q("[data-submit]")) q("[data-submit]").addEventListener("click", () => {
                const f = draftFields(); if (!draftOk(f)) return;
                if (overlaps(ownerId, f.startDate, f.endDate, id)) { q("#dtErr").textContent = t("leave.errOverlap"); return; }
                Store.updateDraft(id, f); Store.submitRequest(id); UI.closeSheet();
            });
            if (q("[data-cancel]")) q("[data-cancel]").addEventListener("click", () => {
                if (confirm(t("leave.confirmCancel"))) { Store.cancelRequest(id); UI.closeSheet(); }
            });
            if (q("[data-deldraft]")) q("[data-deldraft]").addEventListener("click", () => {
                if (confirm(t("lv.confirmDeleteDraft"))) { Store.deleteRequest(id); UI.closeSheet(); }
            });
        });
    }

    function overlaps(ownerId, start, end, exceptId) {
        return Store.allRequests().some(r => r.userId === ownerId && r.id !== exceptId && (r.status === "approved" || Store.isOpenRequest(r)) &&
            r.startDate <= end && start <= r.endDate);
    }

    function openNewRequest() {
        const admin = isAdmin();
        const persons = people().filter(x => x.accountStatus !== "disabled" && Permissions.has(x.id, "leave.self.request"));
        UI.openSheet("<h2>" + E(t("leave.newRequest")) + "</h2>" +
            (admin ? "<label>" + E(t("cal.employee")) + '<select id="nrWho">' + persons.map(x => '<option value="' + E(x.id) + '">' + E(x.name) + "</option>").join("") + "</select></label>" : "") +
            "<label>" + E(t("leave.col.type")) + '<select id="nrType">' + TYPES.map(k => '<option value="' + k + '">' + E(typeLabel(k)) + "</option>").join("") + "</select></label>" +
            '<div class="grid-2"><label>' + E(t("leave.from")) + '<input type="date" id="nrStart"></label><label>' + E(t("leave.to")) + '<input type="date" id="nrEnd"></label></div>' +
            /* 3.0: half day, only for a one-day request */
            '<label id="nrHalfRow" hidden>' + E(t("leave.half")) + '<select id="nrHalf"><option value="">' + E(t("leave.half.full")) + "</option>" +
                '<option value="am">' + E(t("leave.half.am")) + '</option><option value="pm">' + E(t("leave.half.pm")) + "</option></select></label>" +
            "<label>" + E(t("leave.comment")) + '<input type="text" id="nrComment" maxlength="200"></label>' +
            '<p class="info" id="nrDays"></p>' +
            '<p class="banner warn" id="nrWarn" hidden></p>' +
            '<p class="info">' + E(t(admin ? "cal.adminRequestInfo" : "leave.requestInfo")) + "</p>" +
            '<p id="nrError" class="error"></p>' +
            '<div class="actions"><button type="button" class="button primary" id="nrSend">' + UI.icon("check") + E(t("leave.send")) + "</button>" +
            (admin ? "" : '<button type="button" class="button" id="nrDraft">' + E(t("lv.saveDraft")) + "</button>") +
            '<span class="spacer"></span><button type="button" class="button" data-close>' + E(t("common.cancel")) + "</button></div>",
        dlg => {
            const q = s => dlg.querySelector(s);
            const owner = () => (admin ? q("#nrWho").value : me());
            const fields = () => ({ type: q("#nrType").value, startDate: q("#nrStart").value, endDate: q("#nrEnd").value,
                half: q("#nrStart").value && q("#nrStart").value === q("#nrEnd").value ? q("#nrHalf").value : "", comment: q("#nrComment").value.trim() });
            /* live preview: days counted, notice period (15 + 10.4), balance exceeded — shown when typing (10/11/2026) */
            const preview = () => {
                const f = fields();
                q("#nrHalfRow").hidden = !(f.startDate && f.startDate === f.endDate);
                const ok = f.startDate && f.endDate && f.endDate >= f.startDate;
                const r = Object.assign({ userId: owner() }, f);
                q("#nrDays").textContent = ok ? t("cal.daysPreview", { n: workingDays(r) }) : "";
                const warn = [];
                if (ok && owner()) {
                    const n = Store.noticeOf(r, owner());
                    if (n.late) warn.push(t("lv.warn.late", { required: n.required, given: Math.max(0, n.given) }) +
                        (Store.org().leaveNoticeBlocks && !admin ? " " + t("lv.warn.lateBlocked") : ""));
                    if (f.type === "paid_leave") {
                        const b = Store.withUser(owner(), () => Leave.balance());
                        if (b && b.available - b.pending - workingDays(r) < -1e-9) warn.push(t("lv.warn.overBalance"));
                    }
                }
                q("#nrWarn").hidden = !warn.length;
                q("#nrWarn").textContent = warn.join(" ");
            };
            ["#nrStart", "#nrEnd", "#nrType", "#nrHalf"].forEach(s => q(s).addEventListener("change", preview));
            if (admin) q("#nrWho").addEventListener("change", preview);
            const create = draft => {
                const f = fields();
                if (!f.startDate || !f.endDate) { q("#nrError").textContent = t("leave.errDates"); return; }
                if (f.endDate < f.startDate) { q("#nrError").textContent = t("leave.errOrder"); return; }
                if (admin && !owner()) { q("#nrError").textContent = t("admin.noTechnician"); return; }
                if (f.type === "other" && !f.comment) { q("#nrError").textContent = t("leave.errComment"); return; }
                if (overlaps(owner(), f.startDate, f.endDate)) { q("#nrError").textContent = t("leave.errOverlap"); return; }
                if (!Store.withUser(owner(), () => Store.addRequest(Object.assign(f, { draft })))) {
                    q("#nrError").textContent = t(Store.org().leaveNoticeBlocks && Store.noticeOf(f, owner()).late ? "lv.warn.lateBlocked" : "lv.err.forbidden");
                    return;
                }
                UI.closeSheet();
                st.year = 0; ensureDate();
                const d = Utils.localDate(f.startDate); st.year = d.getFullYear(); st.month = d.getMonth();
                render();
            };
            q("#nrSend").addEventListener("click", () => create(false));
            if (q("#nrDraft")) q("#nrDraft").addEventListener("click", () => create(true));
        });
    }

    /* ---------- Management ---------- */

    function card(title, big, cls, lines) {
        return '<div class="balance-card"><span class="balance-title">' + E(title) + '</span><strong class="balance-value ' + (cls || "") + '">' +
            E(big) + "</strong>" + (lines.length ? "<dl>" + lines.map(l => "<dt>" + E(l[0]) + "</dt><dd>" + E(l[1]) + "</dd>").join("") + "</dl>" : "") + "</div>";
    }

    /* Balances of the current account. 3.0: leave of the current period (May → May) with
       the days carried over; recovery like the managers' register "OK" (valued weeks,
       time off taken, hours to be PAID for the summer weeks). */
    function recoveryCard(r) {
        if (r.method === "register") return card(t("leave.recoveryBalance"), Utils.hours(r.total), r.total < 0 ? "negative" : "", [
            [t("leave.l.valued", { date: Utils.dateDmy(r.upTo) }), Utils.hours(r.bank)],
            [t("leave.l.taken"), (r.taken > 0 ? "−" : "") + Utils.hours(r.taken)]]
            .concat(r.toPay ? [[t("leave.l.toPay"), Utils.hours(r.toPay)]] : [])
            .concat(r.sundayPremium ? [[t("leave.l.sunday"), Utils.hours(r.sundayPremium)]] : []));
        return card(t("leave.recoveryBalance"), Utils.hours(r.total), r.total < 0 ? "negative" : "", [
            [t("leave.l.weeks", { date: Utils.dateDmy(r.upTo) }), Utils.hours(r.bank)],
            [t("leave.l.night"), "+" + Utils.hours(r.premiumNight)],
            [t("leave.l.holiday"), "+" + Utils.hours(r.premiumHoliday)],
            [t("leave.l.taken"), (r.taken > 0 ? "−" : "") + Utils.hours(r.taken)]]);
    }

    function balancesHtml() {
        const b = Leave.balance();
        const r = Hours.recoveryBalance();
        const c = r.counters;
        return '<div class="balance-grid">' +
            (b ? card(t("leave.available"), Utils.days(b.available), "", [[t("leave.earned") + (b.period ? " (" + t("leave.since", { date: Utils.dateDmy(b.period) }) + ")" : ""), Utils.days(b.earned)]]
                    .concat(b.carried ? [[t("leave.carriedDays"), Utils.days(b.carried)]] : [])
                    .concat([[t("leave.taken"), Utils.days(b.taken)]])
                    .concat(b.pending ? [[t("leave.pending"), Utils.days(b.pending)]] : [])
                    .concat(b.previousLeft ? [[t("leave.previousLeft"), Utils.days(b.previousLeft)]] : []))
               : card(t("leave.paidLeave"), "—", "", [[t("leave.needHireDate"), ""]])) +
            recoveryCard(r) +
            card(t("leave.overtime"), Utils.hours(c.h25 + c.h50), "", [[t("leave.l.ot25"), Utils.hours(c.h25)], [t("leave.l.ot50"), Utils.hours(c.h50)]]) +
            /* 4.7.1: the figure alone in big, its meaning on the line under it */
            (r.current ? card(t("leave.currentWeekTitle", { n: r.current.week }), Countdown.parts(r.current.toRecover).value,
                r.current.toRecover < 0 ? "negative" : "positive", [[Countdown.parts(r.current.toRecover).label, ""], [t("leave.l.notYet"), ""]]) : "") +
            "</div>" +
            /* 3.0 (13): carry-over on request — the deciders record it */
            (b && b.previousLeft > 0 && Permissions.can("leave.self.request")
                ? '<div class="card" style="margin-top:1rem"><p>' + E(t("leave.carryInfo", { n: Utils.days(b.previousLeft) })) + "</p>" +
                  '<div class="actions"><input type="number" id="lvCarryDays" min="0.5" step="0.5" max="' + b.previousLeft + '" value="' + b.previousLeft + '" style="max-width:7rem" aria-label="' + E(t("leave.carryDays")) + '">' +
                  '<button type="button" class="button" id="lvCarryAsk">' + E(t("leave.carryAsk")) + '</button><span id="lvCarryMsg" class="success"></span></div></div>' : "");
    }

    function requestsTable(list, withPerson, actions) {
        if (!list.length) return '<p class="empty">' + E(t("leave.none")) + "</p>";
        return '<div class="scroll"><table class="table"><thead><tr>' + (withPerson ? "<th>" + E(t("admin.col.person")) + "</th>" : "") +
            "<th>" + E(t("leave.col.type")) + "</th><th>" + E(t("leave.col.from")) + "</th><th>" + E(t("leave.col.to")) + '</th><th class="num">' +
            E(t("leave.col.days")) + "</th><th>" + E(t("leave.col.status")) + "</th><th></th></tr></thead><tbody>" +
            list.map(r => '<tr class="clickable" data-open="' + E(r.userId + "|" + r.id) + '">' +
                (withPerson ? '<td><span class="person">' + UI.avatar(r.userName, "small") + E(r.userName) + "</span></td>" : "") +
                "<td>" + E(shownType(r) + halfLabel(r)) + (shownComment(r) ? "<br><small>" + E(shownComment(r)) + "</small>" : "") +
                (r.cancelRequest ? " " + UI.badge(t("lv.cancelAskedShort"), "warning") : "") +
                (Store.isOpenRequest(r) && (r.lateNotice || r.overlap || r.overBalance) && r.userId !== me() ? " " + UI.badge(t("lv.flagged"), "warning") : "") +
                (r.imported ? " " + UI.badge(t("flag.imported"), "neutral") : "") + "</td>" +
                "<td>" + Utils.dateDmy(r.startDate) + "</td><td>" + Utils.dateDmy(r.endDate) + '</td><td class="num">' + workingDays(r) + "</td>" +
                "<td>" + UI.badge(t(STATUS_KEYS[r.status]), UI.STATUS_KIND[r.status]) +
                (r.decidedBy ? "<br><small>" + E(t("leave.decidedBy", { name: r.decidedBy })) + "</small>" : "") + "</td>" +
                "<td>" + actions(r) + "</td></tr>").join("") + "</tbody></table></div>";
    }

    /* "My requests": own balances and requests, drafts included. Importing approved
       history is a manager's correction (timeclock.correction.approve). */
    function myRequestsHtml() {
        const mine = Store.allRequests().filter(r => r.userId === me()).sort((a, b) => b.startDate.localeCompare(a.startDate));
        const canImport = Permissions.can("timeclock.correction.approve");
        return balancesHtml() +
            '<div class="card" style="margin-top:1rem"><div class="title-row"><h2>' + E(t("leave.myRequests")) + '</h2><div class="actions">' +
            (canImport ? '<button type="button" class="button mini" id="lvTemplate">' + UI.icon("file") + E(t("common.importTemplate")) + "</button>" +
                '<button type="button" class="button mini" id="lvImport">' + UI.icon("upload") + E(t("common.import")) + "</button>" : "") +
            '<button type="button" class="button mini" id="lvExport">' + UI.icon("download") + E(t("common.export")) + "</button>" +
            (canImport ? '<input type="file" id="lvFile" accept=".csv,text/csv" hidden>' : "") + "</div></div>" +
            (canImport ? '<p class="info">' + E(t("leave.importInfo")) + "</p>" : "") +
            '<p id="lvImportMessage"' + (st.msg ? ' class="' + st.msg.cls + '">' + E(st.msg.text) : ">") + "</p>" +
            requestsTable(mine, false, r => r.status === "draft"
                ? '<button type="button" class="button mini primary" data-open-req="' + E(r.userId + "|" + r.id) + '">' + E(t("lv.edit")) + "</button>"
                : Store.isOpenRequest(r) ? '<button type="button" class="button mini danger" data-cancel="' + E(r.id) + '">' + E(t("common.cancel")) + "</button>"
                : r.status === "approved" && !r.cancelRequest && !r.imported ? '<button type="button" class="button mini" data-open-req="' + E(r.userId + "|" + r.id) + '">' + E(t("lv.askCancelBtn")) + "</button>" : "") +
            "</div>";
    }

    /* Queue tabs per profile: team lead (opinion) or managers (final decision) */
    function queueTabs() {
        return canDecide()
            ? [["decide", "lv.q.decide"]].concat(single() ? [] : [["lead", "lv.q.atLead"]],
                [["approved", "cal.approvedPlural"], ["rejected", "cal.rejectedPlural"], ["history", "cal.history"]])
            : [["review", "lv.q.review"], ["sent", "lv.q.sent"], ["decided", "lv.q.decided"], ["history", "cal.history"]];
    }

    /* Requests of the perimeter (never someone else's drafts) */
    function teamRequests() {
        return Store.allRequests().filter(r => r.userId !== me() && r.status !== "draft" && Permissions.canSeeUser(me(), r.userId));
    }

    function inQueue(r, tab) {
        const hasLead = r.status === "pending_lead" && Store.leadsOf(r.userId).length > 0;
        switch (tab) {
            case "decide": return (Store.isOpenRequest(r) && !hasLead) || (r.status === "approved" && !!r.cancelRequest);
            case "lead": return hasLead;
            case "review": return r.status === "pending_lead";
            case "sent": return Store.isOpenRequest(r) && r.status !== "pending_lead";
            case "decided": return r.status === "approved" || r.status === "rejected";
            case "history": return true;
            default: return r.status === tab;
        }
    }

    function queueTableHtml() {
        const tab = st.status || queueTabs()[0][0];
        const list = teamRequests().filter(r => inQueue(r, tab)).sort((a, b) =>
            ["decide", "lead", "review", "sent"].indexOf(tab) >= 0 ? a.startDate.localeCompare(b.startDate) : (b.decidedAt || b.startDate).localeCompare(a.decidedAt || a.startDate));
        return requestsTable(list, true, r => {
            const act = canDecideFor(r.userId) && (Store.isOpenRequest(r) || r.cancelRequest) ? "lv.decideBtn" : canReview() && r.status === "pending_lead" ? "lv.reviewBtn" : "";
            return act ? '<button type="button" class="button mini primary" data-open-req="' + E(r.userId + "|" + r.id) + '">' + E(t(act)) + "</button>" : "";
        });
    }

    function queueHtml() {
        const all = teamRequests();
        const tabs = queueTabs();
        if (!tabs.some(x => x[0] === st.status)) st.status = tabs[0][0];
        const count = k => all.filter(r => inQueue(r, k)).length;
        return '<div class="card"><div class="title-row"><h2>' + E(t(canDecide() ? "admin.requests" : "lv.teamRequests")) + '</h2><div class="actions">' +
            '<button type="button" class="button mini" id="lvExportAll">' + UI.icon("download") + E(t("common.export")) + "</button></div></div>" +
            (canReview() ? '<p class="info">' + E(t("lv.leadInfo")) + "</p>" : "") +
            UI.tabs(tabs.map(([k, label]) => [k, t(label), ["decide", "lead", "review", "sent"].indexOf(k) >= 0 ? count(k) : 0]), st.status, "status", "sub") +
            '<div id="lvReqTable">' + queueTableHtml() + "</div></div>";
    }

    /* 3.0: balances of one's perimeter — the team lead sees his technicians, the managers everybody */
    function balancesAdminHtml() {
        const rows = people().filter(x => Permissions.has(x.id, "leave.self.request"))
            .map(x => Store.withUser(x.id, () => ({ x, lb: Leave.balance(), rb: Hours.recoveryBalance() })));
        return '<div class="card"><h2>' + E(t("cal.balancesTitle")) + '</h2><div class="scroll"><table class="table"><thead><tr><th>' + E(t("admin.col.person")) +
            '</th><th class="num">' + E(t("leave.earned")) + '</th><th class="num">' + E(t("leave.carriedDays")) + '</th><th class="num">' + E(t("leave.taken")) +
            '</th><th class="num">' + E(t("leave.pending")) + '</th><th class="num">' + E(t("leave.available")) + '</th><th class="num">' + E(t("leave.recoveryBalance")) +
            '</th><th class="num">' + E(t("rep.col.toPay")) + "</th><th></th></tr></thead><tbody>" +
            rows.map(({ x, lb, rb }) => '<tr><td><span class="person">' + UI.avatar(x.name, "small") + "<span>" + E(x.name) + "<small>" + E(x.jobTitle || "") + "</small></span></span></td>" +
                (lb ? '<td class="num">' + Utils.days(lb.earned) + '</td><td class="num">' + Utils.days(lb.carried) + '</td><td class="num">' + Utils.days(lb.taken) + '</td><td class="num">' + Utils.days(lb.pending) +
                    '</td><td class="num"><strong>' + Utils.days(lb.available) + "</strong>" + (lb.previousLeft ? "<br><small>" + E(t("leave.previousLeftShort", { n: Utils.days(lb.previousLeft) })) + "</small>" : "") + "</td>"
                    : '<td colspan="5" class="info">' + E(t("leave.needHireDate")) + "</td>") +
                '<td class="num ' + (rb.total < 0 ? "negative" : "") + '">' + Utils.hours(rb.total) + '</td><td class="num">' + Utils.hours(rb.toPay || 0) + "</td>" +
                "<td>" + (lb && canDecideFor(x.id) ? '<button type="button" class="button mini" data-carry="' + E(x.id) + '">' + E(t("leave.carryRecord")) + "</button>" : "") + "</td></tr>").join("") +
            "</tbody></table></div>" + '<p class="info" id="lvCarryResult"></p></div>';
    }

    /* ---------- CSV (technician: own requests) ---------- */

    function matchAny(raw, map) {
        const s = Utils.simplify(raw);
        let found = null;
        Object.keys(map).forEach(value => {
            map[value].forEach(key => {
                if (found) return;
                if (Utils.simplify(key) === s || I18n.allTranslations(key).some(l => Utils.simplify(l) === s)) found = value;
            });
        });
        return found;
    }

    function typeFromCsv(raw) {
        if (String(raw || "").trim() === "") return "paid_leave";
        const direct = matchAny(raw, { paid_leave: ["leave.type.paid", "paid_leave", "conge_paye", "cp"], time_off: ["leave.type.timeOff", "time_off", "heure_recuperer"],
            other: ["leave.type.other", "other"] });
        if (direct) return direct;
        const s = Utils.simplify(raw);
        if (s.includes("recup") || s.includes("recov")) return "time_off";
        if (s.includes("cong") || s.includes("vacac") || s.includes("urlaub") || s.includes("leave")) return "paid_leave";
        return null;
    }

    function statusImportable(raw) {
        return String(raw || "").trim() === "" ||
            matchAny(raw, { approved: ["leave.status.approved", "approved", "acceptee", "accordee"] }) === "approved";
    }

    function importCsv(text) { return Store.batch(() => importRows(text)); }

    function importRows(text) {
        let imported = 0, ignored = 0, notApproved = 0;
        Utils.parseCsv(text).forEach((r, i) => {
            if (i === 0 && !Utils.parseDate(r[0])) return;
            if (!statusImportable(r[4])) { notApproved += 1; return; }
            const start = Utils.parseDate(r[0]);
            const end = Utils.parseDate(r[1]);
            const type = typeFromCsv(r[2]);
            if (!start || !end || !type || end < start) { ignored += 1; return; }
            if (Store.addApprovedRequest({ type, startDate: start, endDate: end, comment: (r[3] || "").trim() })) imported += 1;
            else ignored += 1;
        });
        return { imported, ignored, notApproved };
    }

    const COLUMN_KEYS = ["leave.csv.start", "leave.csv.end", "leave.csv.type", "leave.csv.comment"];

    function template() {
        const rows = [COLUMN_KEYS.map(k => t(k)),
            ["14/07/2025", "25/07/2025", t("leave.type.paid"), ""],
            ["23/12/2025", "31/12/2025", "", ""],
            ["09/03/2026", "09/03/2026", t("leave.type.timeOff"), ""]];
        Utils.download(Utils.toCsv(rows), t("leave.templateFile") + ".csv", "text/csv;charset=utf-8");
    }

    /* Own requests (technician) or every request with the person (admin) */
    function exportCsv(all) {
        /* "all" = the requests of one's perimeter (never other people's drafts) */
        const list = all ? teamRequests() : Store.allRequests().filter(r => r.userId === me());
        const head = (all ? [t("admin.col.person")] : []).concat(COLUMN_KEYS.map(k => t(k)), [t("leave.csv.status"), t("leave.csv.days")]);
        const rows = [head].concat(list.map(r => (all ? [r.userName] : []).concat([Utils.dateDmy(r.startDate), Utils.dateDmy(r.endDate), typeLabel(r.type),
            r.comment, t(STATUS_KEYS[r.status] || r.status), workingDays(r)])));
        Utils.download(Utils.toCsv(rows), t("leave.exportFile") + "_" + Utils.isoLocal(Date.now()) + ".csv", "text/csv;charset=utf-8");
        return rows.length - 1;
    }

    /* ---------- Render ---------- */

    /* Tabs by permission: own requests first (who requests leave), calendar, team balances.
       4.7: the queue (opinion or decision) lives in "To validate" → Leave (queueInto) */
    function tabsOf() {
        return (Permissions.can("leave.self.request") ? [["mine", t("cal.myTab")]] : [])
            .concat([["calendar", t("cal.title")]])
            .concat(Permissions.canAny(["leave.global.view", "leave.team.view"]) ? [["balances", t("cal.balancesTab")]] : []);
    }

    /* 4.7: the leave queue drawn in another page's zone ("To validate" → Leave) */
    function queueInto(zone) {
        zone.innerHTML = queueHtml();
        UI.onTabs(zone, "status", k => {
            st.status = k;
            const table = zone.querySelector("#lvReqTable");
            table.innerHTML = queueTableHtml();
            wireRows(table);
            UI.fadeIn(table);
        });
        wireRows(zone);
        zone.querySelector("#lvExportAll").addEventListener("click", () => exportCsv(true));
    }

    /* Header and tabs are drawn ONCE (init); data changes and tab clicks only
       redraw the body (#lvBody) — no flicker, the indicator slides. */
    function layout() {
        if (!tabsOf().some(x => x[0] === st.tab)) st.tab = tabsOf()[0][0];
        /* 3.0: "New request" for people who request leave, and for the managers (on behalf) */
        const canNew = Permissions.can("leave.self.request") || isAdmin();
        /* 4.1.4: the "+" sits at the end of the tab line (no line of its own) */
        root.innerHTML = UI.pageHeader(t("nav.leave"), t(seesTeam() ? "cal.subtitleAdmin" : "cal.subtitle")) +
            '<div class="tab-row">' + UI.tabs(tabsOf(), st.tab, "leave") +
            (canNew ? '<button type="button" class="button primary plus-only" id="lvNew" aria-label="' + E(t("leave.newRequest")) + '" title="' + E(t("leave.newRequest")) + '">' + UI.icon("plus") + "</button>" : "") +
            "</div>" + '<div id="lvBody"></div>';
        if (canNew) root.querySelector("#lvNew").addEventListener("click", openNewRequest);
        UI.onTabs(root, "leave", k => { st.tab = k; st.msg = null; App.setSub("leave", k); render(); UI.fadeIn(root.querySelector("#lvBody")); });
        render();
    }

    function render() {
        if (!root) return;
        const zone = root.querySelector("#lvBody");
        if (!zone) return;
        zone.innerHTML = st.tab === "calendar" ? calendarHtml() : st.tab === "balances" ? balancesAdminHtml() : myRequestsHtml();
        wire();
    }

    /* A row, a calendar chip or its Review / Decide / Edit button opens the detail
       sheet, where the circuit actions are taken (reason and justification included) */
    function wireRows(scope) {
        scope.querySelectorAll("[data-req], tr[data-open]").forEach(el => el.addEventListener("click", ev => {
            if (ev.target.closest("button[data-cancel]")) return;
            const [owner, id] = (el.dataset.req || el.dataset.open).split("|");
            openDetail(owner, id);
        }));
    }

    function wire() {
        const q = s => root.querySelector(s);
        root.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => { st.view = b.dataset.view; render(); }));
        root.querySelectorAll("[data-move]").forEach(b => b.addEventListener("click", () => { move(+b.dataset.move); render(); }));
        if (q("#lvPerson")) q("#lvPerson").addEventListener("change", e => { st.person = e.target.value; render(); });
        if (q("#lvType")) q("#lvType").addEventListener("change", e => { st.type = e.target.value; render(); });
        if (q("#lvRejected")) q("#lvRejected").addEventListener("change", e => { st.showRejected = e.target.checked; render(); });
        wireRows(q("#lvBody"));
        /* cancelling keeps the request and its history (status "cancelled") */
        root.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", ev => {
            ev.stopPropagation();
            if (confirm(t("leave.confirmCancel"))) Store.cancelRequest(b.dataset.cancel);
        }));
        if (q("#lvCarryAsk")) q("#lvCarryAsk").addEventListener("click", () => {
            const ok = Store.requestCarryOver(q("#lvCarryDays").value, "");
            q("#lvCarryMsg").textContent = ok ? t("leave.carrySent") : t("lv.err.badDays");
        });
        root.querySelectorAll("[data-carry]").forEach(b => b.addEventListener("click", () => {
            const n = prompt(t("leave.carryPrompt", { name: nameOf(b.dataset.carry) }), "");
            if (n === null) return;
            const res = Store.carryOver(b.dataset.carry, String(n).replace(",", "."), "");
            if (res !== true) { q("#lvCarryResult").textContent = t("lv.err." + res); return; }
            render();
        }));
        if (q("#lvExport")) q("#lvExport").addEventListener("click", () => {
            const n = exportCsv(false);
            st.msg = { cls: n ? "success" : "error", text: n ? t("leave.exported", { n }) : t("leave.nothingToExport") };
            render();
        });
        if (q("#lvTemplate")) {
            q("#lvTemplate").addEventListener("click", template);
            const file = q("#lvFile");
            q("#lvImport").addEventListener("click", () => { file.value = ""; file.click(); });
            file.addEventListener("change", () => {
                if (!file.files[0]) return;
                Utils.readText(file.files[0]).then(text => {
                    const r = importCsv(text);
                    const extra = (r.ignored ? " — " + t("leave.importIgnored", { n: r.ignored }) : "") +
                        (r.notApproved ? " — " + t("leave.importNotApproved", { n: r.notApproved }) : "");
                    /* kept in the state: the import redraws the page */
                    st.msg = { cls: r.imported ? "success" : "error", text: (r.imported ? t("leave.imported", { n: r.imported }) : t("leave.importNone")) + extra + "." };
                    render();
                });
            });
        }
    }

    function init() {
        root = document.getElementById("page-leave");
        layout();
    }

    /* Deep link (#leave/mine, #leave/balances) and URL sync */
    function setTab(k) {
        if (!tabsOf().some(x => x[0] === k) || k === st.tab) return;
        st.tab = k;
        if (root) layout();
    }

    return { init, render, setTab, getTab: () => st.tab, importCsv, exportCsv, openNewRequest, openDetail, queueInto };
})();
