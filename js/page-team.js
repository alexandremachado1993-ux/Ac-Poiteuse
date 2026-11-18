/* =============================================================
   page-team.js — Team (accounts with a team right: team lead, managers)
   Only the people of the viewer's perimeter (sections) are listed:
   - list: avatar, name, job title, hire date, leave balance, status
     (now: working / break / on leave / off; account deactivated);
     search; "New employee" (name, job title, role, hire date — no
     password: chosen at the first sign-in);
   - individual file: job title, hire date, role, active account,
     password reset (never for oneself), balances (same engine), and
     the timesheet with its exports (makeTimesheet): managers correct the
     days there (reason mandatory), team leads read and report errors.
   ⚠️ Demo mode: the accounts of THIS device.
   ============================================================= */

const TeamPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let root = null;
    let openId = "";
    let fileTab = "sheet";   /* 4.6: file of a technician — "sheet" (timesheet, first) or "info" */
    let section = "";        /* 4.7: "clockings" (team clocking, ClockingsPage) or "people" (list and files) */
    const canClockings = () => Permissions.can("reports.team.view");
    let search = "";
    let sheet = null;

    const STATE = UI.PERSON_STATES;
    const stateOf = UI.personState;

    function listHtml() {
        const s = Utils.simplify(search);
        /* only the accounts of the viewer's perimeter (sections) — permissions.js */
        /* 3.0: the IT account manages every ACCOUNT but sees nobody's hours or leave */
        const it = Permissions.levelOf(Store.profile()) < 0 && Permissions.can("employees.manage");
        const list = (it ? Store.users() : Permissions.visibleUsers()).filter(x => !s || Utils.simplify(x.name + " " + x.jobTitle).includes(s));
        return '<div class="card"><input type="search" id="tmSearch" placeholder="' + E(t("team.search")) + '" value="' + E(search) + '">' +
            '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("admin.col.person")) + "</th><th>" + E(t("team.jobTitle")) + "</th><th>" +
            E(t("profile.hireDate")) + '</th><th class="num">' + E(t("leave.available")) + "</th><th>" + E(t("team.status")) + "</th><th>" + E(t("dash.weekDone")) +
            "</th><th>" + E(t("team.lastWeek")) + "</th><th></th></tr></thead><tbody>" +
            list.map(x => {
                const tech = x.role === "technician" && Permissions.canSeeUser(Store.currentUserId(), x.id);
                const lb = tech ? Store.withUser(x.id, () => Leave.balance()) : null;
                const stt = tech ? STATE[stateOf(x.id)] : null;
                const wk = tech ? Store.withUser(x.id, () => { const iso = Utils.isoLocal(Date.now()); const w = Hours.isoWeek(Utils.utcDate(iso));
                    return Hours.weekSummary(Segments.weekSheet(w.year, w.week, Store.entries(), Store.settings(), Date.now())); }) : null;
                const prev = Store.previousWeek();
                const weekCells = tech ? '<td><div style="display:flex;align-items:center;gap:.5rem"><div class="progress" style="flex:1;min-width:70px"><div style="width:' +
                    Math.min(100, wk.goal ? wk.done / wk.goal * 100 : 0).toFixed(0) + '%"></div></div><span class="num">' + Utils.hours(wk.done) + "</span></div></td>" +
                    "<td>" + ValidationPage.badgeOf(Store.weekValidation(x.id, prev.year, prev.week)) + "</td>" : "<td>—</td><td>—</td>";
                return '<tr class="clickable" data-open="' + E(x.id) + '"><td><span class="person">' + (stt ? UI.avatarStatus(x.name, stateOf(x.id)) : UI.avatar(x.name)) + "<span><strong>" + E(x.name) + "</strong><small>" +
                    E(t("role." + x.role)) + "</small></span></span></td>" +
                    "<td>" + E(x.jobTitle || "—") + "</td><td>" + (x.hireDate ? Utils.dateDmy(x.hireDate) : "—") + "</td>" +
                    '<td class="num">' + (lb ? Utils.days(lb.available) : "—") + "</td>" +
                    "<td>" + (x.accountStatus === "disabled" ? UI.badge(t("admin.inactive"), "danger") : stt ? UI.badge(t(stt[0]), stt[1]) : "") +
                    (x.pinHash || !tech ? "" : " " + UI.badge(t("admin.noPasswordYet"), "warning")) +
                    (x.unlockAskedAt && Permissions.canResetPassword(Store.currentUserId(), x.id) ? " " + UI.badge(t("team.unlockBadge"), "warning") : "") + "</td>" + weekCells +
                    '<td class="num">' + UI.icon("right") + "</td></tr>";
            }).join("") + "</tbody></table></div></div>";
    }

    /* 4.5: contract(s) and leaving date — they drive the annual target (Hours.yearProgress, calendar-day prorata) */
    function contractHtml(x, manage) {
        const dis = manage ? "" : " disabled";
        const year = new Date().getFullYear();
        const g = Store.withUser(x.id, () => Hours.yearProgress(year));
        const team = Hours.defaultContract();
        const row = (c, i) => '<tr data-contract="' + i + '"><td><input type="date" data-c="from" value="' + E(c.from) + '"' + dis + "></td>" +
            '<td><input type="number" data-c="weeklyHours" min="1" max="60" step="0.5" value="' + c.weeklyHours + '"' + dis + "></td>" +
            '<td><input type="number" data-c="normalHours" min="0" max="60" step="0.5" value="' + c.normalHours + '"' + dis + "></td>" +
            '<td><select data-c="workDays"' + dis + ">" + [5, 6].map(n => '<option value="' + n + '"' + (+c.workDays === n ? " selected" : "") + ">" + E(t("team.c.days" + n)) + "</option>").join("") + "</select></td>" +
            '<td class="num">' + E(Utils.hours(Hours.monthlyHours(c))) + "</td>" +
            "<td>" + (manage ? '<button type="button" class="icon-button" data-c-remove="' + i + '" aria-label="' + E(t("team.c.remove")) + '">' + UI.icon("trash") + "</button>" : "") + "</td></tr>";
        return '<h3>' + E(t("team.c.title")) + "</h3>" +
            '<div class="grid-2"><label>' + E(t("team.c.leaveDate")) + '<input type="date" data-field="leaveDate" value="' + E(x.leaveDate || "") + '"' + dis + "></label>" +
            '<div class="info" style="align-self:end">' + E(t("team.c.target", { year: String(year), target: Utils.hours(g.target), valued: Utils.hours(g.valued) })) + "</div></div>" +
            '<div class="scroll"><table class="table contracts"><thead><tr><th>' + E(t("team.c.from")) + "</th><th>" + E(t("team.c.weekly")) + "</th><th>" + E(t("team.c.normal")) + "</th><th>" +
            E(t("team.c.days")) + '</th><th class="num">' + E(t("team.c.monthly")) + "</th><th></th></tr></thead><tbody>" +
            (Hours.contractsOf(x).map(row).join("") || '<tr><td colspan="6" class="muted">' + E(t("team.c.none", { weekly: String(team.weeklyHours), monthly: Utils.hours(Hours.monthlyHours(team)) })) + "</td></tr>") +
            "</tbody></table></div>" + (manage ? '<div class="actions"><button type="button" class="button" id="tmContractAdd">' + UI.icon("plus") + E(t("team.c.add")) + "</button></div>" : "") +
            '<p class="info">' + E(t("team.c.info")) + "</p>";
    }

    function fileHtml(x) {
        const manage = Permissions.can("employees.manage");
        const self = x.id === Store.currentUserId() || !manage;   /* read-only without "employees.manage" */
        const tech = x.role === "technician" && Permissions.canSeeUser(Store.currentUserId(), x.id);
        const f = tech ? Store.withUser(x.id, () => ({ lb: Leave.balance(), rb: Hours.recoveryBalance() })) : null;
        /* 4.3: forgotten password — reset by a manager or by the team lead of the person (hierarchy) */
        const canReset = !!x.pinHash && Permissions.canResetPassword(Store.currentUserId(), x.id);
        const contact = Permissions.canSeeUser(Store.currentUserId(), x.id);
        return '<div class="actions" style="margin-bottom:1rem"><button type="button" class="button" id="tmBack">' + UI.icon("left") + E(t("team.back")) + "</button></div>" +
            '<div class="card"><div class="title-row"><div class="person">' + UI.avatar(x.name, "large") + '<div><h2 style="margin:0">' + E(x.name) + "</h2><small>" +
            E(x.jobTitle || t("role." + x.role)) + "</small></div></div>" +
            (x.accountStatus === "disabled" ? UI.badge(t("admin.inactive"), "danger") : UI.badge(t("team.activeAccount"), "success")) + "</div>" +
            (x.unlockAskedAt && canReset ? '<div class="banner warn block">' + UI.icon("lock") + "<span>" + E(t("team.unlockAsked", { date: Utils.dateTime(new Date(x.unlockAskedAt).getTime()) })) +
                '</span><span class="spacer"></span><button type="button" class="button primary" data-reset>' + E(t("admin.resetPassword")) + "</button></div>" : "") +
            /* 4.6: a technician's file opens on the timesheet; the profile is in its own tab */
            (f ? "</div>" + UI.tabs([["sheet", t("team.timesheet")], ["info", t("team.tab.profile")]], fileTab, "teamFile", "sub") +
                (fileTab === "sheet" ? '<div class="grid cols-3">' +
                    UI.kpi(t("leave.available"), f.lb ? Utils.days(f.lb.available) : "—", "sun", "", f.lb ? t("dash.leaveSub", { pending: Utils.days(f.lb.pending) }) : t("leave.needHireDate")) +
                    UI.kpi(t("leave.recoveryBalance"), Utils.hours(f.rb.total), "briefcase", f.rb.total < 0 ? "danger" : "", t("dash.upTo", { date: Utils.dateDmy(f.rb.upTo) })) +
                    UI.kpi(t("leave.overtime"), Utils.hours(f.rb.counters.h25 + f.rb.counters.h50), "reports", "", t("leave.overtimeDetailInline", { h25: Utils.hours(f.rb.counters.h25), h50: Utils.hours(f.rb.counters.h50) })) +
                    '</div><p class="info">' + E(t(Permissions.can("timeclock.correction.approve") ? "team.sheetCorrectInfo" : "admin.readOnlyInfo")) + '</p><div id="tmSheet"></div>' : '<div class="card">')
                : "") +
            (f && fileTab === "sheet" ? "" : '<div class="grid-2"><label>' + E(t("team.jobTitle")) + '<input type="text" data-field="jobTitle" maxlength="80" value="' + E(x.jobTitle) + '"' + (manage ? "" : " disabled") + "></label>" +
            "<label>" + E(t("profile.hireDate")) + '<input type="date" data-field="hireDate" value="' + E(x.hireDate) + '"' + (manage ? "" : " disabled") + "></label>" +
            "<label>" + E(t("admin.role")) + '<select data-field="role"' + (self ? " disabled" : "") + ">" + Store.ROLES.map(r =>
                '<option value="' + r + '"' + (x.role === r ? " selected" : "") + ">" + E(t("role." + r)) + "</option>").join("") + "</select></label>" +
            '<label class="check" style="align-self:end"><input type="checkbox" data-field="active"' + (x.accountStatus !== "disabled" ? " checked" : "") + (self ? " disabled" : "") + "> " +
            E(t("admin.active")) + "</label></div>" +
            /* sections (perimeter) and clocking obligation: separate from the role (2.8) */
            '<fieldset class="choices" style="border:0;padding:0;margin:.5rem 0"><legend class="muted" style="font-size:.85rem;margin-bottom:.4rem">' + E(t("team.sections")) + "</legend>" +
            Store.sections().map(sec => '<label><input type="checkbox" data-sec="' + E(sec.id) + '"' + (x.sectionIds.indexOf(sec.id) >= 0 ? " checked" : "") +
                (self || x.allSections ? " disabled" : "") + "> " + E(sec.name) + "</label>").join("") +
            '<label><input type="checkbox" data-field="allSections"' + (x.allSections ? " checked" : "") + (self ? " disabled" : "") + "> " + E(t("team.allSections")) + "</label></fieldset>" +
            '<label class="check"><input type="checkbox" data-field="clockRequired"' + (x.clockRequired ? " checked" : "") + (manage ? "" : " disabled") + "> " +
            E(t("team.clockRequired")) + "</label>" +
            (contact ? '<div class="grid-2"><label>' + E(t("profile.email")) + '<input type="email" data-field="email" maxlength="120" autocomplete="off" value="' + E(x.email) + '"' + (manage ? "" : " disabled") + "></label>" +
                "<label>" + E(t("profile.phone")) + '<input type="tel" data-field="phone" maxlength="20" autocomplete="off" value="' + E(x.phone) + '"' + (manage ? "" : " disabled") + "></label></div>" : "") +
            (contact && x.role !== "it_admin" ? contractHtml(x, manage) : "") +
            '<div class="actions">' + (canReset && !x.unlockAskedAt ? '<button type="button" class="button" data-reset>' + E(t("admin.resetPassword")) + "</button>" : "") + "</div>" +
            /* effective rights with their origin */
            "<h3>" + E(t("team.rights")) + '</h3><div class="actions">' + Permissions.effective(x.id).map(r =>
                UI.badge(t("perm." + r.permission) + (r.source === "role" ? "" : " · " + t("acc.kind." + r.source) + (r.grant && r.grant.end ? " → " + Utils.dateDmy(r.grant.end) : "")),
                    r.source === "role" ? "neutral" : "info")).join(" ") +
            (Permissions.can("permissions.manage") && x.id !== Store.currentUserId() ? ' <button type="button" class="button mini" id="tmGrant">' + UI.icon("plus") + E(t("acc.grant")) + "</button>" : "") + "</div>" +
            (manage ? "" : '<p class="info">' + E(t("team.readOnly")) + "</p>") +
            '<p class="info">' + E(t("admin.teamDetailInfo")) + '</p><p id="tmMsg"></p></div>');
    }

    function render() {
        if (!root) return;
        const x = openId ? Store.user(openId) : null;
        if (!x) openId = "";
        if (!canClockings()) section = "people";
        else if (!section) section = "clockings";
        const people = x || section === "people";
        root.innerHTML = UI.pageHeader(t("nav.team"), t("team.subtitle"),
                !people || x || !Permissions.can("employees.manage") ? "" : '<button type="button" class="button primary" id="tmNew">' + UI.icon("plus") + E(t("team.new")) + "</button>") +
            '<p class="banner">' + E(t("admin.demoWarning")) + "</p>" +
            (canClockings() && !x ? UI.tabs([["clockings", t("team.tab.clockings")], ["people", t("team.tab.people")]], section, "team") : "") +
            (x ? fileHtml(x) : section === "people" ? listHtml() : '<div id="tmClockings"></div>');
        if (!x && section === "clockings") {
            ClockingsPage.init(root.querySelector("#tmClockings"));
            UI.onTabs(root, "team", k => { section = k; App.setSub("team", k); render(); });
            return;
        }
        UI.onTabs(root, "team", k => { section = k; App.setSub("team", k); render(); });
        wire(x);
    }

    function wire(x) {
        const q = s => root.querySelector(s);
        if (!x) {
            if (q("#tmNew")) q("#tmNew").addEventListener("click", openNew);
            const se = q("#tmSearch");
            se.addEventListener("input", () => { search = se.value; render(); const n = root.querySelector("#tmSearch"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
            root.querySelectorAll("tr[data-open]").forEach(tr => tr.addEventListener("click", () => { openId = tr.dataset.open; fileTab = "sheet"; App.setSub("team", openId); render(); }));
            return;
        }
        q("#tmBack").addEventListener("click", () => { openId = ""; App.setSub("team", "people"); render(); });
        UI.onTabs(root, "teamFile", k => { fileTab = k; render(); });
        root.querySelectorAll("[data-field]").forEach(f => f.addEventListener("change", () => {
            const o = {}; o[f.dataset.field] = f.type === "checkbox" ? f.checked : f.value;
            const k = f.dataset.field;
            if (!Store.updateUser(x.id, o)) { q("#tmMsg").className = "error"; q("#tmMsg").textContent = t(k === "email" ? "profile.errEmail" : k === "phone" ? "profile.errPhone" : "team.refused"); }
            else if (f.dataset.field === "allSections" || f.dataset.field === "role") render();
        }));
        root.querySelectorAll("[data-sec]").forEach(c => c.addEventListener("change", () => {
            const ids = Array.from(root.querySelectorAll("[data-sec]:checked")).map(i => i.dataset.sec);
            if (!Store.updateUser(x.id, { sectionIds: ids })) { q("#tmMsg").className = "error"; q("#tmMsg").textContent = t("team.refused"); }
        }));
        if (q("#tmGrant")) q("#tmGrant").addEventListener("click", () => AdminPanels.grantSheet(x.id, render));
        /* 4.5: contracts — saved as a whole list (a date per contract, the team rule before the first one) */
        const contracts = () => [].slice.call(root.querySelectorAll("tr[data-contract]")).map(tr => {
            const v = k => tr.querySelector('[data-c="' + k + '"]').value;
            return { from: v("from"), weeklyHours: +v("weeklyHours"), normalHours: +v("normalHours"), workDays: +v("workDays") };
        });
        const saveContracts = list => {
            if (Store.updateUser(x.id, { contracts: list })) { render(); return; }
            q("#tmMsg").className = "error"; q("#tmMsg").textContent = t("team.c.refused");
        };
        root.querySelectorAll("tr[data-contract] [data-c]").forEach(f => f.addEventListener("change", () => saveContracts(contracts())));
        root.querySelectorAll("[data-c-remove]").forEach(b => b.addEventListener("click", () => saveContracts(contracts().filter((c, i) => i !== +b.dataset.cRemove))));
        if (q("#tmContractAdd")) q("#tmContractAdd").addEventListener("click", () => {
            const list = contracts(), last = list[list.length - 1] || Hours.defaultContract();
            saveContracts(list.concat([{ from: Utils.isoLocal(Date.now()), weeklyHours: last.weeklyHours, normalHours: last.normalHours, workDays: last.workDays || 5 }]));
        });
        root.querySelectorAll("[data-reset]").forEach(b => b.addEventListener("click", () => {
            if (!confirm(t("admin.confirmReset", { name: x.name }))) return;
            const done = Auth.resetPassword(x.id);
            render();
            if (done) UI.toast(E(t("team.resetDone", { name: x.name })), null, 6);
            else { const m = root.querySelector("#tmMsg"); if (m) { m.className = "error"; m.textContent = t("team.refused"); } else UI.toast(E(t("team.refused")), null, 6); }
        }));
        if (q("#tmSheet")) {
            /* corrections allowed by the "timeclock.correction.approve" right (managers); team leads read only */
            sheet = makeTimesheet({ rootId: "tmSheet", userId: () => openId });
            sheet.init();
        }
    }

    function openNew() {
        UI.openSheet("<h2>" + E(t("team.new")) + "</h2>" +
            "<label>" + E(t("profile.name")) + '<input type="text" id="nuName" maxlength="120"></label>' +
            "<label>" + E(t("team.jobTitle")) + '<input type="text" id="nuJob" maxlength="80"></label>' +
            '<div class="grid-2"><label>' + E(t("admin.role")) + '<select id="nuRole">' +
            Store.ROLES.map(r => '<option value="' + r + '">' + E(t("role." + r)) + "</option>").join("") + "</select></label>" +
            "<label>" + E(t("profile.hireDate")) + '<input type="date" id="nuHire"></label></div>' +
            /* sections at creation: without one, nobody but the managers would see the new employee */
            '<fieldset class="choices" style="border:0;padding:0;margin:.3rem 0"><legend class="muted" style="font-size:.85rem;margin-bottom:.3rem">' + E(t("team.sections")) + "</legend>" +
            Store.sections().map(sec => '<label><input type="checkbox" data-nusec="' + E(sec.id) + '"> ' + E(sec.name) + "</label>").join("") + "</fieldset>" +
            '<p class="info">' + E(t("team.newInfo")) + '</p><p class="error" id="nuError"></p>' +
            '<div class="actions"><button type="button" class="button primary" id="nuCreate">' + UI.icon("check") + E(t("admin.create")) + "</button>" +
            '<span class="spacer"></span><button type="button" class="button" data-close>' + E(t("common.cancel")) + "</button></div>",
        dlg => dlg.querySelector("#nuCreate").addEventListener("click", () => {
            const created = Store.addUser({ name: dlg.querySelector("#nuName").value, jobTitle: dlg.querySelector("#nuJob").value,
                role: dlg.querySelector("#nuRole").value, hireDate: dlg.querySelector("#nuHire").value,
                sectionIds: Array.from(dlg.querySelectorAll("[data-nusec]:checked")).map(c => c.dataset.nusec) });
            if (!created) { dlg.querySelector("#nuError").textContent = t("admin.errName"); return; }
            UI.closeSheet();
        }));
    }

    function init() {
        root = document.getElementById("page-team");
        render();
    }

    /* While a file is open, data changes only refresh its timesheet (keeps typing) */
    function refresh() {
        if (openId && sheet) sheet.render();
        else if (!openId && section === "clockings" && root && root.querySelector("#tmClockings")) ClockingsPage.render();
        else render();
    }

    /* "#team/clockings", "#team/people", or "#team/<account id>" (notifications, Clockings, To validate) opens the file */
    function setTab(id) {
        if (id === (openId || section)) return;   /* already shown: keep the timesheet and what is being typed */
        if (id === "clockings" || id === "people") { section = id; openId = ""; }
        else {
            openId = id && Permissions.visibleUsers().some(u => u.id === id) ? id : "";
            if (openId) section = "people";
        }
        fileTab = "sheet";
        if (root) render();
    }

    return { init, render: refresh, setTab, getTab: () => openId || section };
})();
