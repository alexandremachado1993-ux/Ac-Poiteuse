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
    const TYPE_KEYS = { paid_leave: "leave.type.paid", time_off: "leave.type.timeOff", other: "leave.type.other" };
    const STATUS_KEYS = { pending: "leave.status.pending", approved: "leave.status.approved", rejected: "leave.status.rejected" };
    const TYPES = ["paid_leave", "time_off", "other"];
    let root = null;
    const st = { tab: "calendar", view: "month", year: 0, month: 0, weekStart: "", person: "", type: "", showRejected: false, status: "pending", msg: null };

    const days = n => (Math.round(n * 100) / 100).toLocaleString(I18n.locale()) + " " + t("common.daysShort");
    const isAdmin = () => Auth.isAdmin();
    const me = () => Store.currentUserId();
    const typeLabel = type => t(TYPE_KEYS[type] || "leave.type.other");

    /* ---------- Data ---------- */

    function visibleRequests() {
        const all = Store.allRequests();
        return all.filter(r => {
            if (!isAdmin() && !(r.status === "approved" || r.userId === me())) return false;
            if (r.status === "rejected" && !st.showRejected) return false;
            if (st.person && r.userId !== st.person) return false;
            if (st.type && r.type !== st.type) return false;
            return true;
        });
    }

    const onDay = (list, iso) => list.filter(r => r.startDate <= iso && iso <= r.endDate);

    function workingDays(r) {
        return Store.withUser(r.userId, () => Leave.workingDaysOf(r, Store.profile(), Store.entries(), Store.settings()));
    }

    function people() {
        const list = Store.users().filter(x => x.role === "technician");
        return isAdmin() ? list : list.filter(x => x.accountStatus !== "disabled" || x.id === me());
    }

    /* Absence chip: first name (month view) or the type (week view, one row per person) */
    function chip(r, showType) {
        const label = showType ? typeLabel(r.type) : r.userName.split(" ")[0];
        return '<button type="button" class="absence ' + r.type + " " + r.status + '" data-req="' + E(r.userId + "|" + r.id) + '" title="' +
            E(r.userName + " — " + typeLabel(r.type) + " — " + t(STATUS_KEYS[r.status])) + '">' + E(label) + "</button>";
    }

    /* ---------- Calendar views ---------- */

    function ensureDate() {
        if (!st.year) {
            const d = new Date();
            st.year = d.getFullYear(); st.month = d.getMonth();
            st.weekStart = Utils.isoLocal(Hours.mondayOf(Hours.isoWeek(Utils.utcDate(Utils.isoLocal(d))).year, Hours.isoWeek(Utils.utcDate(Utils.isoLocal(d))).week));
        }
    }

    const weekdayNames = () => [1, 2, 3, 4, 5, 6, 0].map(d => new Date(2024, 0, 7 + d).toLocaleDateString(I18n.locale(), { weekday: "short" }));

    function monthView(list) {
        const first = new Date(st.year, st.month, 1);
        const lead = (first.getDay() + 6) % 7;
        const daysIn = new Date(st.year, st.month + 1, 0).getDate();
        const today = Utils.isoLocal(Date.now());
        let cells = weekdayNames().map(n => '<div class="cal-head">' + E(n) + "</div>").join("");
        for (let i = 0; i < lead; i++) cells += '<div class="cal-cell empty"></div>';
        for (let d = 1; d <= daysIn; d++) {
            const date = new Date(st.year, st.month, d);
            const iso = Utils.isoLocal(date);
            const hol = Holidays.isHoliday(Utils.utcDate(iso));
            const items = onDay(list, iso);
            const wd = date.getDay();
            cells += '<div class="cal-cell' + (wd === 0 || wd === 6 ? " weekend" : "") + (hol ? " holiday" : "") + (iso === today ? " today" : "") + '">' +
                '<span class="day-num">' + d + "</span>" + (hol ? '<span class="holiday-name">' + E(t("tag.holiday")) + "</span>" : "") +
                items.slice(0, 3).map(r => chip(r, false)).join("") + (items.length > 3 ? '<span class="more">+' + (items.length - 3) + "</span>" : "") + "</div>";
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
            (Holidays.isHoliday(Utils.utcDate(iso)) ? '<br><span class="holiday-name" style="color:var(--red)">' + E(t("tag.holiday")) + "</span>" : "") + "</div>").join("");
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
                cells += '<span class="' + (r ? r.type + (items.every(x => x.status === "pending") ? " pending" : "") : "") + (hol ? " holiday" : "") + '"' +
                    (items.length ? ' title="' + E(items.map(x => x.userName + " — " + typeLabel(x.type)).join("\n")) + '"' : "") + ">" + d + "</span>";
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
            st.weekStart = Utils.isoLocal(Hours.mondayOf(Hours.isoWeek(Utils.utcDate(Utils.isoLocal(d))).year, Hours.isoWeek(Utils.utcDate(Utils.isoLocal(d))).week));
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
            (isAdmin() ? '<label class="check"><input type="checkbox" id="lvRejected"' + (st.showRejected ? " checked" : "") + "> " + E(t("cal.showRejected")) + "</label>" : "") +
            "</div>" +
            (st.view === "month" ? monthView(list) : st.view === "week" ? weekView(list) : yearView(list)) +
            '<div class="legend">' + TYPES.map(k => '<span><i class="legend-swatch ' + k + '"></i>' + E(typeLabel(k)) + "</span>").join("") +
            '<span><i class="legend-swatch pending"></i>' + E(t("leave.status.pending")) + "</span>" +
            '<span><i class="legend-swatch holiday"></i>' + E(t("tag.holiday")) + "</span></div>" +
            (isAdmin() ? "" : '<p class="info">' + E(t("cal.visibilityInfo")) + "</p>") + "</div>";
    }

    /* ---------- Detail and new request (sheets) ---------- */

    function openDetail(ownerId, id) {
        const r = Store.allRequests().find(x => x.userId === ownerId && x.id === id);
        if (!r) return;
        const canDecide = isAdmin() && r.status === "pending" && ownerId !== me();
        const canCancel = r.status === "pending" && ownerId === me();
        UI.openSheet('<div class="title-row"><div class="person">' + UI.avatar(r.userName, "large") + "<div><h2 style=\"margin:0\">" + E(r.userName) + "</h2>" +
            "<small>" + E(typeLabel(r.type)) + "</small></div></div>" + UI.badge(t(STATUS_KEYS[r.status]), UI.STATUS_KIND[r.status]) + "</div>" +
            "<dl><dt>" + E(t("leave.col.from")) + "</dt><dd>" + Utils.dateDmy(r.startDate) + "</dd>" +
            "<dt>" + E(t("leave.col.to")) + "</dt><dd>" + Utils.dateDmy(r.endDate) + "</dd>" +
            "<dt>" + E(t("leave.col.days")) + "</dt><dd>" + (r.type === "paid_leave" ? days(workingDays(r)) : workingDays(r) + " " + E(t("common.daysShort"))) + "</dd>" +
            (r.comment ? "<dt>" + E(t("leave.comment")) + "</dt><dd>" + E(r.comment) + "</dd>" : "") +
            (r.decidedBy ? "<dt>" + E(t("cal.decision")) + "</dt><dd>" + E(t("leave.decidedBy", { name: r.decidedBy })) + "</dd>" : "") +
            (r.imported ? "<dt></dt><dd>" + UI.badge(t("flag.imported"), "neutral") + "</dd>" : "") + "</dl>" +
            (r.type === "other" ? '<p class="info">' + E(t("leave.otherInfo")) + "</p>" : "") +
            '<div class="actions">' +
            (canDecide ? '<button type="button" class="button success" data-decide="approved">' + UI.icon("check") + E(t("admin.approve")) + "</button>" +
                '<button type="button" class="button danger solid" data-decide="rejected">' + UI.icon("x") + E(t("admin.reject")) + "</button>" : "") +
            (canCancel ? '<button type="button" class="button danger" data-cancel>' + E(t("leave.cancelRequest")) + "</button>" : "") +
            '<span class="spacer"></span><button type="button" class="button" data-close>' + E(t("common.close")) + "</button></div>",
        dlg => {
            dlg.querySelectorAll("[data-decide]").forEach(b => b.addEventListener("click", () => {
                if (!Store.decideRequest(ownerId, id, b.dataset.decide, me())) alert(t("admin.decisionRefused"));
                UI.closeSheet();
            }));
            const c = dlg.querySelector("[data-cancel]");
            if (c) c.addEventListener("click", () => { if (confirm(t("leave.confirmCancel"))) { Store.deleteRequest(id); UI.closeSheet(); } });
        });
    }

    function overlaps(ownerId, start, end) {
        return Store.allRequests().some(r => r.userId === ownerId && r.status !== "rejected" && r.startDate <= end && start <= r.endDate);
    }

    function openNewRequest() {
        const admin = isAdmin();
        const persons = people().filter(x => x.accountStatus !== "disabled");
        UI.openSheet("<h2>" + E(t("leave.newRequest")) + "</h2>" +
            (admin ? "<label>" + E(t("cal.employee")) + '<select id="nrWho">' + persons.map(x => '<option value="' + E(x.id) + '">' + E(x.name) + "</option>").join("") + "</select></label>" : "") +
            "<label>" + E(t("leave.col.type")) + '<select id="nrType">' + TYPES.map(k => '<option value="' + k + '">' + E(typeLabel(k)) + "</option>").join("") + "</select></label>" +
            '<div class="grid-2"><label>' + E(t("leave.from")) + '<input type="date" id="nrStart"></label><label>' + E(t("leave.to")) + '<input type="date" id="nrEnd"></label></div>' +
            "<label>" + E(t("leave.comment")) + '<input type="text" id="nrComment" maxlength="200"></label>' +
            '<p class="info" id="nrDays"></p>' +
            '<p class="info">' + E(t(admin ? "cal.adminRequestInfo" : "leave.requestInfo")) + "</p>" +
            '<p id="nrError" class="error"></p>' +
            '<div class="actions"><button type="button" class="button primary" id="nrSend">' + UI.icon("check") + E(t("leave.send")) + "</button>" +
            '<span class="spacer"></span><button type="button" class="button" data-close>' + E(t("common.cancel")) + "</button></div>",
        dlg => {
            const q = s => dlg.querySelector(s);
            const owner = () => (admin ? q("#nrWho").value : me());
            const preview = () => {
                const s = q("#nrStart").value, e = q("#nrEnd").value;
                q("#nrDays").textContent = s && e && e >= s ? t("cal.daysPreview", { n: workingDays({ userId: owner(), startDate: s, endDate: e, type: q("#nrType").value }) }) : "";
            };
            ["#nrStart", "#nrEnd", "#nrType"].forEach(s => q(s).addEventListener("change", preview));
            if (admin) q("#nrWho").addEventListener("change", preview);
            q("#nrSend").addEventListener("click", () => {
                const s = q("#nrStart").value, e = q("#nrEnd").value;
                if (!s || !e) { q("#nrError").textContent = t("leave.errDates"); return; }
                if (e < s) { q("#nrError").textContent = t("leave.errOrder"); return; }
                if (admin && !owner()) { q("#nrError").textContent = t("admin.noTechnician"); return; }
                if (overlaps(owner(), s, e)) { q("#nrError").textContent = t("leave.errOverlap"); return; }
                const fields = { type: q("#nrType").value, startDate: s, endDate: e, comment: q("#nrComment").value.trim() };
                Store.withUser(owner(), () => Store.addRequest(fields));
                UI.closeSheet();
                st.year = 0; ensureDate();
                const d = Utils.localDate(s); st.year = d.getFullYear(); st.month = d.getMonth();
                render();
            });
        });
    }

    /* ---------- Management ---------- */

    function card(title, big, cls, lines) {
        return '<div class="balance-card"><span class="balance-title">' + E(title) + '</span><strong class="balance-value ' + (cls || "") + '">' +
            E(big) + "</strong>" + (lines.length ? "<dl>" + lines.map(l => "<dt>" + E(l[0]) + "</dt><dd>" + E(l[1]) + "</dd>").join("") + "</dl>" : "") + "</div>";
    }

    /* Balances of the current account (unchanged rules) */
    function balancesHtml() {
        const b = Leave.balance();
        const r = Hours.recoveryBalance();
        const c = r.counters;
        return '<div class="balance-grid">' +
            (b ? card(t("leave.available"), days(b.available), "", [[t("leave.earned"), days(b.earned)], [t("leave.taken"), days(b.taken)]]
                    .concat(b.pending ? [[t("leave.pending"), days(b.pending)]] : []))
               : card(t("leave.paidLeave"), "—", "", [[t("leave.needHireDate"), ""]])) +
            card(t("leave.recoveryBalance"), Utils.hours(r.total), r.total < 0 ? "negative" : "", [
                [t("leave.l.weeks", { date: Utils.dateDmy(r.upTo) }), Utils.hours(r.bank)],
                [t("leave.l.night"), "+" + Utils.hours(r.premiumNight)],
                [t("leave.l.holiday"), "+" + Utils.hours(r.premiumHoliday)],
                [t("leave.l.taken"), "−" + Utils.hours(r.taken)]]) +
            card(t("leave.overtime"), Utils.hours(c.h25 + c.h50), "", [[t("leave.l.ot25"), Utils.hours(c.h25)], [t("leave.l.ot50"), Utils.hours(c.h50)]]) +
            (r.current ? card(t("leave.currentWeekTitle", { n: r.current.week }), Countdown.text(r.current.toRecover),
                r.current.toRecover < 0 ? "negative" : "positive", [[t("leave.l.notYet"), ""]]) : "") +
            "</div>";
    }

    function requestsTable(list, withPerson, actions) {
        if (!list.length) return '<p class="empty">' + E(t("leave.none")) + "</p>";
        return '<div class="scroll"><table class="table"><thead><tr>' + (withPerson ? "<th>" + E(t("admin.col.person")) + "</th>" : "") +
            "<th>" + E(t("leave.col.type")) + "</th><th>" + E(t("leave.col.from")) + "</th><th>" + E(t("leave.col.to")) + '</th><th class="num">' +
            E(t("leave.col.days")) + "</th><th>" + E(t("leave.col.status")) + "</th><th></th></tr></thead><tbody>" +
            list.map(r => '<tr class="clickable" data-open="' + E(r.userId + "|" + r.id) + '">' +
                (withPerson ? '<td><span class="person">' + UI.avatar(r.userName, "small") + E(r.userName) + "</span></td>" : "") +
                "<td>" + E(typeLabel(r.type)) + (r.comment ? "<br><small>" + E(r.comment) + "</small>" : "") +
                (r.imported ? " " + UI.badge(t("flag.imported"), "neutral") : "") + "</td>" +
                "<td>" + Utils.dateDmy(r.startDate) + "</td><td>" + Utils.dateDmy(r.endDate) + '</td><td class="num">' + workingDays(r) + "</td>" +
                "<td>" + UI.badge(t(STATUS_KEYS[r.status]), UI.STATUS_KIND[r.status]) +
                (r.decidedBy ? "<br><small>" + E(t("leave.decidedBy", { name: r.decidedBy })) + "</small>" : "") + "</td>" +
                "<td>" + actions(r) + "</td></tr>").join("") + "</tbody></table></div>";
    }

    function technicianManagement() {
        const mine = Store.allRequests().filter(r => r.userId === me()).sort((a, b) => b.startDate.localeCompare(a.startDate));
        return balancesHtml() +
            '<div class="card" style="margin-top:1rem"><div class="title-row"><h2>' + E(t("leave.myRequests")) + '</h2><div class="actions">' +
            '<button type="button" class="button mini" id="lvTemplate">' + UI.icon("file") + E(t("common.importTemplate")) + "</button>" +
            '<button type="button" class="button mini" id="lvImport">' + UI.icon("upload") + E(t("common.import")) + "</button>" +
            '<button type="button" class="button mini" id="lvExport">' + UI.icon("download") + E(t("common.export")) + "</button>" +
            '<input type="file" id="lvFile" accept=".csv,text/csv" hidden></div></div>' +
            '<p class="info">' + E(t("leave.importInfo")) + '</p><p id="lvImportMessage"' + (st.msg ? ' class="' + st.msg.cls + '">' + E(st.msg.text) : ">") + "</p>" +
            requestsTable(mine, false, r => r.status === "pending"
                ? '<button type="button" class="button mini danger" data-cancel="' + E(r.id) + '">' + E(t("common.cancel")) + "</button>"
                : r.imported ? '<button type="button" class="button mini danger" data-delete="' + E(r.id) + '" aria-label="' + E(t("common.delete")) + '">' + UI.icon("x") + "</button>" : "") +
            "</div>";
    }

    function adminTableHtml() {
        const all = Store.allRequests();
        const list = (st.status === "history" ? all.slice() : all.filter(r => r.status === st.status)).sort((a, b) =>
            st.status === "pending" ? a.startDate.localeCompare(b.startDate) : (b.decidedAt || b.startDate).localeCompare(a.decidedAt || a.startDate));
        return requestsTable(list, true, r => r.status === "pending" && r.userId !== me()
            ? '<div class="actions"><button type="button" class="button mini success" data-approve="' + E(r.userId + "|" + r.id) + '">' + E(t("admin.approve")) + "</button>" +
              '<button type="button" class="button mini danger" data-reject="' + E(r.userId + "|" + r.id) + '">' + E(t("admin.reject")) + "</button></div>" : "");
    }

    function adminManagement() {
        const all = Store.allRequests();
        const n = s2 => all.filter(r => r.status === s2).length;
        return '<div class="card"><div class="title-row"><h2>' + E(t("admin.requests")) + '</h2><div class="actions">' +
            '<button type="button" class="button mini" id="lvExportAll">' + UI.icon("download") + E(t("common.export")) + "</button></div></div>" +
            UI.tabs([["pending", t("leave.status.pending") + " (" + n("pending") + ")"], ["approved", t("cal.approvedPlural")],
                ["rejected", t("cal.rejectedPlural")], ["history", t("cal.history")]], st.status, "status").replace('class="segmented"', 'class="segmented inner"') +
            '<div id="lvReqTable">' + adminTableHtml() + "</div></div>";
    }

    function balancesAdminHtml() {
        const rows = people().map(x => Store.withUser(x.id, () => ({ x, lb: Leave.balance(), rb: Hours.recoveryBalance() })));
        return '<div class="card"><h2>' + E(t("cal.balancesTitle")) + '</h2><div class="scroll"><table class="table"><thead><tr><th>' + E(t("admin.col.person")) +
            '</th><th class="num">' + E(t("leave.earned")) + '</th><th class="num">' + E(t("leave.taken")) + '</th><th class="num">' + E(t("leave.pending")) +
            '</th><th class="num">' + E(t("leave.available")) + '</th><th class="num">' + E(t("leave.recoveryBalance")) + "</th></tr></thead><tbody>" +
            rows.map(({ x, lb, rb }) => '<tr><td><span class="person">' + UI.avatar(x.name, "small") + "<span>" + E(x.name) + "<small>" + E(x.jobTitle || "") + "</small></span></span></td>" +
                (lb ? '<td class="num">' + days(lb.earned) + '</td><td class="num">' + days(lb.taken) + '</td><td class="num">' + days(lb.pending) +
                    '</td><td class="num"><strong>' + days(lb.available) + "</strong></td>"
                    : '<td colspan="4" class="info">' + E(t("leave.needHireDate")) + "</td>") +
                '<td class="num ' + (rb.total < 0 ? "negative" : "") + '">' + Utils.hours(rb.total) + "</td></tr>").join("") +
            "</tbody></table></div></div>";
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
        const list = all ? Store.allRequests() : Store.allRequests().filter(r => r.userId === me());
        const head = (all ? [t("admin.col.person")] : []).concat(COLUMN_KEYS.map(k => t(k)), [t("leave.csv.status"), t("leave.csv.days")]);
        const rows = [head].concat(list.map(r => (all ? [r.userName] : []).concat([Utils.dateDmy(r.startDate), Utils.dateDmy(r.endDate), typeLabel(r.type),
            r.comment, t(STATUS_KEYS[r.status] || r.status), workingDays(r)])));
        Utils.download(Utils.toCsv(rows), t("leave.exportFile") + "_" + Utils.isoLocal(Date.now()) + ".csv", "text/csv;charset=utf-8");
        return rows.length - 1;
    }

    /* ---------- Render ---------- */

    function tabsOf() {
        return isAdmin() ? [["calendar", t("cal.title")], ["requests", t("cal.requestsTab")], ["balances", t("cal.balancesTab")]]
            : [["calendar", t("cal.title")], ["requests", t("cal.myTab")]];
    }

    /* Header and tabs are drawn ONCE (init); data changes and tab clicks only
       redraw the body (#lvBody) — no flicker, the indicator slides. */
    function layout() {
        if (!tabsOf().some(x => x[0] === st.tab)) st.tab = "calendar";
        root.innerHTML = UI.pageHeader(t("nav.leave"), t(isAdmin() ? "cal.subtitleAdmin" : "cal.subtitle"),
                '<button type="button" class="button primary" id="lvNew">' + UI.icon("plus") + E(t("leave.newRequest")) + "</button>") +
            UI.tabs(tabsOf(), st.tab, "leave") + '<div id="lvBody"></div>';
        root.querySelector("#lvNew").addEventListener("click", openNewRequest);
        UI.onTabs(root, "leave", k => { st.tab = k; st.msg = null; App.setSub("leave", k); render(); UI.fadeIn(root.querySelector("#lvBody")); });
        render();
    }

    function render() {
        if (!root) return;
        const zone = root.querySelector("#lvBody");
        if (!zone) return;
        zone.innerHTML = st.tab === "calendar" ? calendarHtml() : st.tab === "balances" ? balancesAdminHtml() : isAdmin() ? adminManagement() : technicianManagement();
        wire();
    }

    function wireRows(scope) {
        scope.querySelectorAll("[data-req], tr[data-open]").forEach(el => el.addEventListener("click", ev => {
            if (ev.target.closest("button[data-approve], button[data-reject], button[data-cancel], button[data-delete]")) return;
            const [owner, id] = (el.dataset.req || el.dataset.open).split("|");
            openDetail(owner, id);
        }));
        const decide = (attr, status) => scope.querySelectorAll("[" + attr + "]").forEach(b => b.addEventListener("click", ev => {
            ev.stopPropagation();
            const [owner, id] = b.getAttribute(attr).split("|");
            if (!Store.decideRequest(owner, id, status, me())) alert(t("admin.decisionRefused"));
        }));
        decide("data-approve", "approved");
        decide("data-reject", "rejected");
    }

    function wire() {
        const q = s => root.querySelector(s);
        UI.onTabs(root, "status", k => {
            st.status = k;
            const zone = q("#lvReqTable");
            zone.innerHTML = adminTableHtml();
            wireRows(zone);
            UI.fadeIn(zone);
        });
        root.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => { st.view = b.dataset.view; render(); }));
        root.querySelectorAll("[data-move]").forEach(b => b.addEventListener("click", () => { move(+b.dataset.move); render(); }));
        if (q("#lvPerson")) q("#lvPerson").addEventListener("change", e => { st.person = e.target.value; render(); });
        if (q("#lvType")) q("#lvType").addEventListener("change", e => { st.type = e.target.value; render(); });
        if (q("#lvRejected")) q("#lvRejected").addEventListener("change", e => { st.showRejected = e.target.checked; render(); });
        wireRows(q("#lvBody"));
        root.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", ev => {
            ev.stopPropagation();
            if (confirm(t("leave.confirmCancel"))) Store.deleteRequest(b.dataset.cancel);
        }));
        root.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", ev => {
            ev.stopPropagation();
            if (confirm(t("leave.confirmDeleteImported"))) Store.deleteRequest(b.dataset.delete);
        }));
        if (q("#lvExportAll")) q("#lvExportAll").addEventListener("click", () => exportCsv(true));
        if (q("#lvTemplate")) {
            q("#lvTemplate").addEventListener("click", template);
            q("#lvExport").addEventListener("click", () => {
                const n = exportCsv(false);
                st.msg = { cls: n ? "success" : "error", text: n ? t("leave.exported", { n }) : t("leave.nothingToExport") };
                render();
            });
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

    /* Deep link (#leave/requests) and URL sync */
    function setTab(k) {
        if (!tabsOf().some(x => x[0] === k) || k === st.tab) return;
        st.tab = k;
        if (root) layout();
    }

    return { init, render, setTab, getTab: () => st.tab, importCsv, exportCsv, openNewRequest };
})();
