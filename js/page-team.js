/* =============================================================
   page-team.js — Team (administrators only), version 2.6
   Replaces the 2.4 Team and Team timesheets pages, same functions:
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
    let search = "";
    let sheet = null;

    const days = n => (Math.round(n * 100) / 100).toLocaleString(I18n.locale()) + " " + t("common.daysShort");
    const STATE = { on: ["dash.state.on", "success"], break: ["dash.state.break", "warning"], leave: ["dash.state.leave", "info"], off: ["dash.state.off", "neutral"] };

    function stateOf(id) {
        return Store.withUser(id, () => {
            const running = Store.runningEntry();
            if (running) return running.category === "break" || running.category === "lunch" ? "break" : "on";
            return Store.absencesOn(Utils.isoLocal(Date.now())).length ? "leave" : "off";
        });
    }

    function listHtml() {
        const s = Utils.simplify(search);
        /* only the accounts of the viewer's perimeter (sections) — permissions.js */
        const list = Permissions.visibleUsers().filter(x => !s || Utils.simplify(x.name + " " + x.jobTitle).includes(s));
        return '<div class="card"><input type="search" id="tmSearch" placeholder="' + E(t("team.search")) + '" value="' + E(search) + '">' +
            '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("admin.col.person")) + "</th><th>" + E(t("team.jobTitle")) + "</th><th>" +
            E(t("profile.hireDate")) + '</th><th class="num">' + E(t("leave.available")) + "</th><th>" + E(t("team.status")) + "</th><th></th></tr></thead><tbody>" +
            list.map(x => {
                const tech = x.role === "technician";
                const lb = tech ? Store.withUser(x.id, () => Leave.balance()) : null;
                const stt = tech ? STATE[stateOf(x.id)] : null;
                return '<tr class="clickable" data-open="' + E(x.id) + '"><td><span class="person">' + UI.avatar(x.name) + "<span><strong>" + E(x.name) + "</strong><small>" +
                    E(t("role." + x.role)) + "</small></span></span></td>" +
                    "<td>" + E(x.jobTitle || "—") + "</td><td>" + (x.hireDate ? Utils.dateDmy(x.hireDate) : "—") + "</td>" +
                    '<td class="num">' + (lb ? days(lb.available) : "—") + "</td>" +
                    "<td>" + (x.accountStatus === "disabled" ? UI.badge(t("admin.inactive"), "danger") : stt ? UI.badge(t(stt[0]), stt[1]) : "") +
                    (x.pinHash ? "" : " " + UI.badge(t("admin.noPasswordYet"), "warning")) + "</td>" +
                    '<td class="num">' + UI.icon("right") + "</td></tr>";
            }).join("") + "</tbody></table></div></div>";
    }

    function fileHtml(x) {
        const manage = Permissions.can("users.manage");
        const self = x.id === Store.currentUserId() || !manage;   /* read-only without "users.manage" */
        const tech = x.role === "technician";
        const f = tech ? Store.withUser(x.id, () => ({ lb: Leave.balance(), rb: Hours.recoveryBalance() })) : null;
        return '<div class="actions" style="margin-bottom:1rem"><button type="button" class="button" id="tmBack">' + UI.icon("left") + E(t("team.back")) + "</button></div>" +
            '<div class="card"><div class="title-row"><div class="person">' + UI.avatar(x.name, "large") + '<div><h2 style="margin:0">' + E(x.name) + "</h2><small>" +
            E(x.jobTitle || t("role." + x.role)) + "</small></div></div>" +
            (x.accountStatus === "disabled" ? UI.badge(t("admin.inactive"), "danger") : UI.badge(t("team.activeAccount"), "success")) + "</div>" +
            '<div class="grid-2"><label>' + E(t("team.jobTitle")) + '<input type="text" data-field="jobTitle" maxlength="80" value="' + E(x.jobTitle) + '"' + (manage ? "" : " disabled") + "></label>" +
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
            '<div class="actions">' + (x.pinHash && !self ? '<button type="button" class="button" id="tmReset">' + E(t("admin.resetPassword")) + "</button>" : "") + "</div>" +
            /* effective rights with their origin */
            "<h3>" + E(t("team.rights")) + '</h3><div class="actions">' + Permissions.effective(x.id).map(r =>
                UI.badge(t("perm." + r.permission) + (r.source === "role" ? "" : " · " + t("acc.kind." + r.source) + (r.grant && r.grant.end ? " → " + Utils.dateDmy(r.grant.end) : "")),
                    r.source === "role" ? "neutral" : "info")).join(" ") +
            (Permissions.can("permissions.manage") && x.id !== Store.currentUserId() ? ' <button type="button" class="button mini" id="tmGrant">' + UI.icon("plus") + E(t("acc.grant")) + "</button>" : "") + "</div>" +
            (manage ? "" : '<p class="info">' + E(t("team.readOnly")) + "</p>") +
            '<p class="info">' + E(t("admin.teamDetailInfo")) + '</p><p id="tmMsg"></p></div>' +
            (f ? '<div class="grid cols-3">' +
                UI.kpi(t("leave.available"), f.lb ? days(f.lb.available) : "—", "sun", "", f.lb ? t("dash.leaveSub", { pending: days(f.lb.pending) }) : t("leave.needHireDate")) +
                UI.kpi(t("leave.recoveryBalance"), Utils.hours(f.rb.total), "briefcase", f.rb.total < 0 ? "danger" : "", t("dash.upTo", { date: Utils.dateDmy(f.rb.upTo) })) +
                UI.kpi(t("leave.overtime"), Utils.hours(f.rb.counters.h25 + f.rb.counters.h50), "reports", "", t("leave.overtimeDetailInline", { h25: Utils.hours(f.rb.counters.h25), h50: Utils.hours(f.rb.counters.h50) })) +
                "</div>" +
                '<h2 style="margin:1.5rem 0 .8rem">' + E(t("team.timesheet")) + '</h2><p class="info">' +
                E(t(Permissions.can("timesheet.correct.approve") ? "team.sheetCorrectInfo" : "admin.readOnlyInfo")) + '</p><div id="tmSheet"></div>' : "");
    }

    function render() {
        if (!root) return;
        const x = openId ? Store.user(openId) : null;
        if (!x) openId = "";
        root.innerHTML = UI.pageHeader(t("nav.team"), t("team.subtitle"),
                x || !Permissions.can("users.manage") ? "" : '<button type="button" class="button primary" id="tmNew">' + UI.icon("plus") + E(t("team.new")) + "</button>") +
            '<p class="banner">' + E(t("admin.demoWarning")) + "</p>" + (x ? fileHtml(x) : listHtml());
        wire(x);
    }

    function wire(x) {
        const q = s => root.querySelector(s);
        if (!x) {
            if (q("#tmNew")) q("#tmNew").addEventListener("click", openNew);
            const se = q("#tmSearch");
            se.addEventListener("input", () => { search = se.value; render(); const n = root.querySelector("#tmSearch"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
            root.querySelectorAll("tr[data-open]").forEach(tr => tr.addEventListener("click", () => { openId = tr.dataset.open; render(); }));
            return;
        }
        q("#tmBack").addEventListener("click", () => { openId = ""; render(); });
        root.querySelectorAll("[data-field]").forEach(f => f.addEventListener("change", () => {
            const o = {}; o[f.dataset.field] = f.type === "checkbox" ? f.checked : f.value;
            if (!Store.updateUser(x.id, o)) { q("#tmMsg").className = "error"; q("#tmMsg").textContent = t("team.refused"); }
            else if (f.dataset.field === "allSections" || f.dataset.field === "role") render();
        }));
        root.querySelectorAll("[data-sec]").forEach(c => c.addEventListener("change", () => {
            const ids = Array.from(root.querySelectorAll("[data-sec]:checked")).map(i => i.dataset.sec);
            if (!Store.updateUser(x.id, { sectionIds: ids })) { q("#tmMsg").className = "error"; q("#tmMsg").textContent = t("team.refused"); }
        }));
        if (q("#tmGrant")) q("#tmGrant").addEventListener("click", () => AdminPanels.grantSheet(x.id, render));
        const reset = q("#tmReset");
        if (reset) reset.addEventListener("click", () => { if (confirm(t("admin.confirmReset", { name: x.name }))) Auth.resetPassword(x.id); });
        if (q("#tmSheet")) {
            /* corrections allowed by the "timesheet.correct.approve" right (managers); team leads read only */
            sheet = makeTimesheet({ rootId: "tmSheet", userId: () => openId });
            sheet.init();
        }
    }

    function openNew() {
        UI.openSheet("<h2>" + E(t("team.new")) + "</h2>" +
            "<label>" + E(t("profile.name")) + '<input type="text" id="nuName" maxlength="120"></label>' +
            "<label>" + E(t("team.jobTitle")) + '<input type="text" id="nuJob" maxlength="80"></label>' +
            '<div class="grid-2"><label>' + E(t("admin.role")) + '<select id="nuRole"><option value="technician">' + E(t("role.technician")) + "</option>" +
            '<option value="admin">' + E(t("role.admin")) + "</option></select></label>" +
            "<label>" + E(t("profile.hireDate")) + '<input type="date" id="nuHire"></label></div>' +
            '<p class="info">' + E(t("team.newInfo")) + '</p><p class="error" id="nuError"></p>' +
            '<div class="actions"><button type="button" class="button primary" id="nuCreate">' + UI.icon("check") + E(t("admin.create")) + "</button>" +
            '<span class="spacer"></span><button type="button" class="button" data-close>' + E(t("common.cancel")) + "</button></div>",
        dlg => dlg.querySelector("#nuCreate").addEventListener("click", () => {
            const created = Store.addUser({ name: dlg.querySelector("#nuName").value, jobTitle: dlg.querySelector("#nuJob").value,
                role: dlg.querySelector("#nuRole").value, hireDate: dlg.querySelector("#nuHire").value });
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
        if (openId && sheet) sheet.render(); else render();
    }

    return { init, render: refresh };
})();
