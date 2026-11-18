/* =============================================================
   page-admin-panels.js — panels shown as Settings tabs, by PERMISSION
   (version 2.8). Each panel: init(zone) draws into the given zone.
   - SectionsPanel  (users.manage)       : list, add, edit (name + people), delete when empty;
   - AccessPanel    (permissions.request / permissions.manage):
       own requests (reason mandatory, temporary or permanent, answer a
       request for details) and, for managers, the requests to decide
       (approve / refuse / ask details / other period) + individual rights
       of each account (grant, revoke);
   - AuditPanel     (audit.view)         : search by user, period, action
       type, text; old and new values; reason; CSV and JSON export;
   - BackupPanel    : own account backup (everyone) and, with
       users.manage, FULL backup, restore TEST on a copy (nothing is
       written), restore (previous data saved first), storage use and
       safety copies.
   Every write goes through store.js, which checks the rights again.
   ============================================================= */

const AdminPanels = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    const nameOf = id => UI.nameOf(id, id ? "?" : t("audit.system"));
    const permLabel = p => t("perm." + p);
    const msg = (zone, cls, text) => { const m = zone.querySelector("[data-msg]"); if (m) { m.className = cls; m.textContent = text; } };

    /* ---------------- Sections ---------------- */
    /* 4.1.7: each section can be edited (name + people attached) and deleted when empty.
       Managers (all sections) are shown, not editable: they see every section by their role. */
    const SectionsPanel = {
        init(zone) {
            let editing = "";
            /* disabled accounts are listed too: their attachment would otherwise block the deletion forever */
            const eligible = () => Store.users().filter(u => !u.allSections);
            const draw = () => {
                const users = Store.users();
                const row = sec => {
                    const members = users.filter(u => u.allSections || u.sectionIds.indexOf(sec.id) >= 0);
                    const used = users.some(u => u.sectionIds.indexOf(sec.id) >= 0);
                    if (editing === sec.id) return '<tr class="editing"><td><input type="text" id="secName" value="' + E(sec.name) + '" maxlength="60" aria-label="' + E(t("sec.name")) + '"></td><td>' +
                        '<p class="info" style="margin:0 0 .5rem">' + E(t("sec.membersHelp")) + '</p><div class="choices">' +
                        eligible().map(u => '<label><input type="checkbox" data-member="' + E(u.id) + '"' + (u.sectionIds.indexOf(sec.id) >= 0 ? " checked" : "") + "> " + E(u.name) + "</label>").join("") +
                        "</div></td><td class=\"num\"><div class=\"actions\" style=\"justify-content:flex-end\"><button type=\"button\" class=\"button mini\" id=\"secCancel\">" + E(t("common.cancel")) + "</button>" +
                        '<button type="button" class="button mini primary" id="secSave">' + UI.icon("check") + E(t("config.validate")) + "</button></div></td></tr>";
                    return '<tr><td><strong>' + E(sec.name) + "</strong></td><td>" +
                        members.map(u => '<span class="person" style="margin:2px 12px 2px 0">' + UI.avatar(u.name, "small") + E(u.name) + (u.allSections ? ' <small class="muted">(' + E(t("sec.allSections")) + ")</small>" : "") + "</span>").join("") +
                        '</td><td class="num"><div class="actions" style="justify-content:flex-end;flex-wrap:nowrap">' +
                        '<button type="button" class="button mini" data-sec-edit="' + E(sec.id) + '"' + (editing ? " disabled" : "") + ">" + E(t("sec.edit")) + "</button>" +
                        '<button type="button" class="button mini danger" data-sec-del="' + E(sec.id) + '"' + (used || editing ? " disabled" : "") +
                        (used ? ' title="' + E(t("sec.deleteBlocked")) + '"' : "") + ">" + E(t("sec.delete")) + "</button></div></td></tr>";
                };
                zone.innerHTML = '<div class="card"><h2>' + E(t("sec.title")) + '</h2><p class="info">' + E(t("sec.info")) + "</p>" +
                    '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("sec.name")) + "</th><th>" + E(t("sec.members")) + "</th><th></th></tr></thead><tbody>" +
                    Store.sections().map(row).join("") + "</tbody></table></div>" +
                    '<div class="actions" style="margin-top:1rem"><input type="text" id="secNew" maxlength="60" placeholder="' + E(t("sec.newPlaceholder")) + '" style="max-width:260px;margin:0">' +
                    '<button type="button" class="button primary" id="secAdd">' + UI.icon("plus") + E(t("sec.add")) + "</button></div><p data-msg></p></div>";
                zone.querySelectorAll("[data-sec-edit]").forEach(b => b.addEventListener("click", () => { editing = b.dataset.secEdit; draw(); }));
                zone.querySelectorAll("[data-sec-del]").forEach(b => b.addEventListener("click", () => {
                    const sec = Store.sections().find(x => x.id === b.dataset.secDel);
                    if (!sec || !confirm(t("sec.deleteConfirm", { name: sec.name }))) return;
                    if (Store.removeSection(sec.id)) { draw(); UI.toast(E(t("sec.deleted")), null, 4); } else msg(zone, "error", t("sec.deleteBlocked"));
                }));
                const cancel = zone.querySelector("#secCancel");
                if (cancel) cancel.addEventListener("click", () => { editing = ""; draw(); });
                const save = zone.querySelector("#secSave");
                if (save) save.addEventListener("click", () => {
                    const sec = Store.sections().find(x => x.id === editing);
                    const name = zone.querySelector("#secName").value;
                    if (name.trim() !== sec.name && !Store.renameSection(sec.id, name)) { msg(zone, "error", t("sec.errName")); return; }
                    zone.querySelectorAll("[data-member]").forEach(c => {
                        const u = Store.user(c.dataset.member);
                        const has = u.sectionIds.indexOf(sec.id) >= 0;
                        if (c.checked !== has) Store.updateUser(u.id, { sectionIds: c.checked ? u.sectionIds.concat([sec.id]) : u.sectionIds.filter(x => x !== sec.id) });
                    });
                    editing = "";
                    draw();
                    UI.toast(E(t("sec.updated", { name: name.trim() })), null, 4);
                });
                zone.querySelector("#secAdd").addEventListener("click", () => {
                    if (Store.addSection(zone.querySelector("#secNew").value)) draw(); else msg(zone, "error", t("sec.errName"));
                });
            };
            draw();
        }
    };

    /* ---------------- Rights and access requests ---------------- */
    const STATUS_KIND = { pending: "warning", info_requested: "info", approved: "success", rejected: "danger", expired: "neutral", revoked: "neutral" };

    function requestRow(r, manage) {
        const me = Store.currentUserId();
        return '<tr><td><span class="person">' + UI.avatar(nameOf(r.userId), "small") + E(nameOf(r.userId)) + "</span></td>" +
            "<td><strong>" + E(permLabel(r.permission)) + "</strong><br><small>" + E(t("acc.kind." + r.kind)) +
            (r.kind === "temporary" ? " · " + Utils.dateDmy(r.start) + " → " + Utils.dateDmy(r.end) : "") + "</small></td>" +
            "<td>" + E(r.reason) + (r.exchanges.length ? '<br><small class="muted">' + r.exchanges.map(x => E(nameOf(x.by)) + " : " + E(x.text)).join("<br>") + "</small>" : "") + "</td>" +
            "<td>" + UI.badge(t("acc.status." + r.status), STATUS_KIND[r.status]) + (r.decidedBy ? "<br><small>" + E(nameOf(r.decidedBy)) + "</small>" : "") + "</td>" +
            "<td>" + (manage && r.status === "pending" && r.userId !== me
                ? '<div class="actions"><button type="button" class="button mini success" data-acc="approved" data-id="' + E(r.id) + '">' + E(t("admin.approve")) + "</button>" +
                  '<button type="button" class="button mini" data-acc="info_requested" data-id="' + E(r.id) + '">' + E(t("acc.askInfo")) + "</button>" +
                  '<button type="button" class="button mini danger" data-acc="rejected" data-id="' + E(r.id) + '">' + E(t("admin.reject")) + "</button></div>"
                : !manage && r.status === "info_requested" && r.userId === me
                ? '<button type="button" class="button mini" data-answer="' + E(r.id) + '">' + E(t("acc.answer")) + "</button>" : "") + "</td></tr>";
    }

    const AccessPanel = {
        init(zone) {
            const manage = Permissions.can("permissions.manage");
            const canRequest = Permissions.can("permissions.request");
            const draw = () => {
                const me = Store.currentUserId();
                const all = Store.accessRequests();
                const mine = all.filter(r => r.userId === me);
                const toDecide = all.filter(r => r.userId !== me && (r.status === "pending" || r.status === "info_requested"));
                const missing = Permissions.ALL.filter(p => !Permissions.has(me, p));
                zone.innerHTML =
                    (canRequest ? '<div class="card"><h2>' + E(t("acc.requestTitle")) + '</h2><p class="info">' + E(t("acc.requestInfo")) + "</p>" +
                        '<div class="grid-2"><label>' + E(t("acc.permission")) + '<select id="accPerm">' + missing.map(p => '<option value="' + p + '">' + E(permLabel(p)) + "</option>").join("") + "</select></label>" +
                        "<label>" + E(t("acc.kind")) + '<select id="accKind"><option value="temporary">' + E(t("acc.kind.temporary")) + '</option><option value="permanent">' +
                        E(t("acc.kind.permanent")) + "</option></select></label>" +
                        "<label>" + E(t("leave.from")) + '<input type="date" id="accStart"></label><label>' + E(t("leave.to")) + '<input type="date" id="accEnd"></label></div>' +
                        "<label>" + E(t("acc.reason")) + '<input type="text" id="accReason" maxlength="300"></label>' +
                        '<div class="actions"><button type="button" class="button primary" id="accSend">' + UI.icon("check") + E(t("acc.send")) + "</button></div><p data-msg></p></div>" : "") +
                    (manage ? '<div class="card"><h2>' + E(t("acc.toDecide")) + "</h2>" + (toDecide.length ? tableOf(toDecide, true) : '<p class="empty">' + E(t("acc.none")) + "</p>") + "</div>" : "") +
                    '<div class="card"><h2>' + E(t(manage ? "acc.allRequests" : "acc.myRequests")) + "</h2>" +
                    ((manage ? all : mine).length ? tableOf(manage ? all : mine, manage) : '<p class="empty">' + E(t("acc.none")) + "</p>") + "</div>" +
                    (manage ? rightsHtml() : "");
                wire();
            };
            const tableOf = (list, manage) => '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("admin.col.person")) + "</th><th>" +
                E(t("acc.permission")) + "</th><th>" + E(t("acc.reason")) + "</th><th>" + E(t("leave.col.status")) + "</th><th></th></tr></thead><tbody>" +
                list.map(r => requestRow(r, manage)).join("") + "</tbody></table></div>";
            /* individual rights of every account (managers) */
            const rightsHtml = () => '<div class="card"><h2>' + E(t("acc.rightsTitle")) + '</h2><p class="info">' + E(t("acc.rightsInfo")) + "</p>" +
                Store.users().filter(u => u.id !== Store.currentUserId()).map(u => {
                    const extra = Permissions.effective(u.id).filter(x => x.source !== "role");
                    return '<div class="title-row" style="border-top:1px solid var(--border);padding-top:.6rem"><span class="person">' + UI.avatar(u.name, "small") +
                        "<span><strong>" + E(u.name) + "</strong><small>" + E(u.jobTitle || t("role." + u.role)) + " · " + E(t("role." + u.role)) + "</small></span></span>" +
                        '<div class="actions">' + extra.map(x => UI.badge(permLabel(x.permission) + (x.grant.end ? " → " + Utils.dateDmy(x.grant.end) : ""), "info") +
                            ' <button type="button" class="button mini danger" data-revoke="' + E(x.grant.id) + '">' + E(t("acc.revoke")) + "</button>").join(" ") +
                        '<button type="button" class="button mini" data-grant="' + E(u.id) + '">' + UI.icon("plus") + E(t("acc.grant")) + "</button></div></div>";
                }).join("") + "</div>";
            const wire = () => {
                const q = s => zone.querySelector(s);
                if (q("#accSend")) q("#accSend").addEventListener("click", () => {
                    const r = Store.requestAccess({ permission: q("#accPerm").value, kind: q("#accKind").value, start: q("#accStart").value,
                        end: q("#accEnd").value, reason: q("#accReason").value });
                    if (typeof r === "string") { msg(zone, "error", t("acc.err." + r)); return; }
                    draw(); msg(zone, "success", t("acc.sent"));
                });
                zone.querySelectorAll("[data-acc]").forEach(b => b.addEventListener("click", () => decide(b.dataset.id, b.dataset.acc)));
                zone.querySelectorAll("[data-answer]").forEach(b => b.addEventListener("click", () => {
                    const text = prompt(t("acc.answerPrompt"));
                    if (text && Store.answerAccess(b.dataset.answer, text)) draw();
                }));
                zone.querySelectorAll("[data-revoke]").forEach(b => b.addEventListener("click", () => {
                    const reason = prompt(t("acc.revokePrompt"));
                    if (reason !== null && Store.revokeGrant(b.dataset.revoke, reason)) draw();
                }));
                zone.querySelectorAll("[data-grant]").forEach(b => b.addEventListener("click", () => grantSheet(b.dataset.grant, draw)));
            };
            const decide = (id, decision) => {
                const r = Store.accessRequests().find(x => x.id === id);
                UI.openSheet("<h2>" + E(t("acc.decision." + decision)) + "</h2><p>" + E(nameOf(r.userId)) + " — <strong>" + E(permLabel(r.permission)) + "</strong></p>" +
                    (decision === "approved" && r.kind === "temporary" ? '<div class="grid-2"><label>' + E(t("leave.from")) + '<input type="date" id="dsStart" value="' + E(r.start) +
                        '"></label><label>' + E(t("leave.to")) + '<input type="date" id="dsEnd" value="' + E(r.end) + '"></label></div>' : "") +
                    "<label>" + E(t("acc.comment")) + '<input type="text" id="dsComment" maxlength="300"></label><p class="error" id="dsErr"></p>' +
                    '<div class="actions"><button type="button" class="button primary" id="dsOk">' + E(t("common.confirm")) + '</button><span class="spacer"></span>' +
                    '<button type="button" class="button" data-close>' + E(t("common.cancel")) + "</button></div>", dlg => {
                    dlg.querySelector("#dsOk").addEventListener("click", () => {
                        const o = { comment: dlg.querySelector("#dsComment").value };
                        if (dlg.querySelector("#dsStart")) { o.start = dlg.querySelector("#dsStart").value; o.end = dlg.querySelector("#dsEnd").value; }
                        const res = Store.decideAccess(id, decision, o);
                        if (res !== true) { dlg.querySelector("#dsErr").textContent = t("acc.err." + res); return; }
                        UI.closeSheet(); draw();
                    });
                });
            };
            draw();
        }
    };

    /* Direct grant by a manager (e.g. activate clocking for an account) */
    function grantSheet(userId, done) {
        const u = Store.user(userId);
        const missing = Permissions.ALL.filter(p => !Permissions.has(userId, p));
        UI.openSheet("<h2>" + E(t("acc.grant")) + " — " + E(u.name) + "</h2>" +
            "<label>" + E(t("acc.permission")) + '<select id="gsPerm">' + missing.map(p => '<option value="' + p + '">' + E(permLabel(p)) + "</option>").join("") + "</select></label>" +
            "<label>" + E(t("acc.kind")) + '<select id="gsKind"><option value="permanent">' + E(t("acc.kind.permanent")) + '</option><option value="temporary">' +
            E(t("acc.kind.temporary")) + "</option></select></label>" +
            '<div class="grid-2"><label>' + E(t("leave.from")) + '<input type="date" id="gsStart"></label><label>' + E(t("leave.to")) + '<input type="date" id="gsEnd"></label></div>' +
            "<label>" + E(t("acc.reason")) + '<input type="text" id="gsReason" maxlength="300"></label><p class="error" id="gsErr"></p>' +
            '<div class="actions"><button type="button" class="button primary" id="gsOk">' + E(t("acc.grant")) + '</button><span class="spacer"></span>' +
            '<button type="button" class="button" data-close>' + E(t("common.cancel")) + "</button></div>", dlg => {
            dlg.querySelector("#gsOk").addEventListener("click", () => {
                const q = s => dlg.querySelector(s);
                if (!q("#gsReason").value.trim()) { q("#gsErr").textContent = t("acc.err.reasonRequired"); return; }
                const g = Store.grant({ userId, permission: q("#gsPerm").value, kind: q("#gsKind").value, start: q("#gsStart").value, end: q("#gsEnd").value, reason: q("#gsReason").value });
                if (!g) { q("#gsErr").textContent = t("acc.err.badDates"); return; }
                UI.closeSheet(); done();
            });
        });
    }

    /* ---------------- Audit trail ---------------- */
    /* Readable old / new values (precision 4): field names and values translated */
    const FIELDS = ["permission", "kind", "start", "end", "role", "accountStatus", "sectionIds", "allSections", "clockRequired", "jobTitle",
        "name", "hireDate", "status", "version", "detail", "count", "anomalies", "backupKey", "users", "date", "hours", "category", "lunch",
        "applied", "ignoredEntries", "ignoredRequests", "ignoredClients", "safetyCopy", "scope", "reason", "result", "errors", "warnings"];
    function readable(k, v) {
        if (v === null || v === undefined || v === "") return "—";
        if (typeof v === "boolean") return t(v ? "common.yes" : "common.no");
        if (k === "permission") return t("perm." + v);
        if (k === "kind") return t("acc.kind." + v);
        if (k === "role") return t("role." + v);
        if (k === "category") return Segments.label(v);
        if (k === "lunch") return v.start + " → " + v.end;
        if (k === "sectionIds") return v.map(id => (Store.sections().find(x => x.id === id) || { name: id }).name).join(", ") || "—";
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return Utils.dateDmy(v);
        if (typeof v === "boolean") return t(v ? "common.yes" : "common.no");
        if (typeof v === "number") return String(Math.round(v * 100) / 100);   /* 4.1.7: 5.571428… shown 5.57 */
        return Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
    }
    const val = v => (v === null || v === undefined ? "—" : typeof v === "object" && !Array.isArray(v)
        ? Object.keys(v).map(k => (FIELDS.indexOf(k) >= 0 ? t("field." + k) : k) + " : " + readable(k, v[k])).join(" · ") : readable("", v));
    const targetLabel = a => {
        /* 4.1.7: a team rule is shown by its name on screen, not by its code */
        if (a.action === "setting.changed" && TRANSLATIONS["config." + a.target]) return t("config." + a.target);
        const u = Store.user(a.target);
        if (u) return u.name;
        const sec = Store.sections().find(x => x.id === a.target);
        return sec ? sec.name : a.target;
    };

    const AuditPanel = {
        init(zone) {
            const f = { userId: "", from: "", to: "", action: "", text: "" };
            const families = ["session.", "user.", "permission.", "access.", "leave.", "timesheet.", "clock.", "week.", "setting.", "section.", "backup.", "data."];
            const draw = () => {
                const rows = Store.auditQuery(f);
                zone.querySelector("#auRows").innerHTML = rows.length
                    ? '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("audit.col.when")) + "</th><th>" + E(t("audit.col.who")) + "</th><th>" +
                      E(t("audit.col.action")) + "</th><th>" + E(t("audit.col.target")) + "</th><th>" + E(t("audit.col.before")) + "</th><th>" + E(t("audit.col.after")) +
                      "</th><th>" + E(t("audit.col.reason")) + "</th></tr></thead><tbody>" +
                      rows.slice(0, 500).map(a => "<tr><td>" + E(Utils.dateTime(new Date(a.at).getTime())) + "</td><td>" + E(nameOf(a.by)) + "</td><td>" +
                        E(t("audit." + a.action)) + "</td><td>" + E(targetLabel(a)) + "</td><td><small>" + E(val(a.before)) + "</small></td><td><small>" +
                        E(val(a.after)) + "</small></td><td><small>" + E(a.reason || "") + "</small></td></tr>").join("") + "</tbody></table></div>" +
                      (rows.length > 500 ? '<p class="info">' + E(t("audit.more", { n: rows.length - 500 })) + "</p>" : "")
                    : '<p class="empty">' + E(t("audit.none")) + "</p>";
                zone.querySelector("#auCount").textContent = t("audit.count", { n: rows.length });
            };
            zone.innerHTML = '<div class="card"><h2>' + E(t("audit.title")) + '</h2><p class="info">' + E(t("audit.info")) + "</p>" +
                '<div class="filters">' +
                "<label>" + E(t("audit.col.who")) + '<select data-f="userId"><option value="">' + E(t("cal.everyone")) + "</option>" +
                Store.users().map(u => '<option value="' + E(u.id) + '">' + E(u.name) + "</option>").join("") + "</select></label>" +
                "<label>" + E(t("leave.from")) + '<input type="date" data-f="from"></label><label>' + E(t("leave.to")) + '<input type="date" data-f="to"></label>' +
                "<label>" + E(t("audit.col.action")) + '<select data-f="action"><option value="">' + E(t("audit.allActions")) + "</option>" +
                families.map(x => '<option value="' + x + '">' + E(t("audit.family." + x.slice(0, -1))) + "</option>").join("") + "</select></label>" +
                "<label>" + E(t("audit.search")) + '<input type="search" data-f="text" style="margin:0"></label></div>' +
                '<div class="title-row" style="margin-top:1rem"><strong id="auCount"></strong><div class="actions">' +
                '<button type="button" class="button mini" id="auCsv">' + UI.icon("download") + "CSV</button>" +
                '<button type="button" class="button mini" id="auJson">' + UI.icon("download") + "JSON</button></div></div>" +
                '<div id="auRows"></div></div>';
            zone.querySelectorAll("[data-f]").forEach(i => i.addEventListener(i.tagName === "INPUT" && i.type === "search" ? "input" : "change", () => { f[i.dataset.f] = i.value; draw(); }));
            const stamp = () => Utils.isoLocal(Date.now());
            zone.querySelector("#auCsv").addEventListener("click", () => {
                const rows = [[t("audit.col.when"), t("audit.col.who"), t("audit.col.action"), t("audit.col.target"), t("audit.col.before"), t("audit.col.after"), t("audit.col.reason")]]
                    .concat(Store.auditQuery(f).map(a => [a.at, nameOf(a.by), t("audit." + a.action), targetLabel(a), val(a.before), val(a.after), a.reason || ""]));
                Utils.download(Utils.toCsv(rows), t("audit.fileName") + "_" + stamp() + ".csv", "text/csv;charset=utf-8");
                Store.recordExport("audit", "csv");
            });
            zone.querySelector("#auJson").addEventListener("click", () => {
                Utils.download(JSON.stringify(Store.auditQuery(f), null, 2), t("audit.fileName") + "_" + stamp() + ".json", "application/json");
                Store.recordExport("audit", "json");
            });
            draw();
        }
    };

    /* ---------------- Backups ---------------- */
    const kb = b => (Math.round(b / 102.4) / 10).toLocaleString(I18n.locale()) + " Ko";

    const BackupPanel = {
        init(zone) {
            const admin = Permissions.can("backups.manage");
            const draw = () => {
                const u = Store.storageUsage();
                const pct = Math.round(u.ratio * 100);
                zone.innerHTML = '<div class="card"><h2>' + E(t("settings.backup")) + '</h2><p class="info">' + E(t("settings.backupInfo")) + "</p>" +
                    '<div class="actions"><button type="button" class="button primary" id="bkOwn">' + UI.icon("download") + E(t("settings.download")) + "</button>" +
                    '<button type="button" class="button" id="bkOwnRestore">' + UI.icon("upload") + E(t("settings.restore")) + "</button>" +
                    '<input type="file" id="bkOwnFile" accept=".json,application/json" hidden></div></div>' +
                    (admin ? '<div class="card"><h2>' + E(t("bk.fullTitle")) + '</h2><p class="info">' + E(t("bk.fullInfo")) + "</p>" +
                        '<div class="actions"><button type="button" class="button primary" id="bkFull">' + UI.icon("download") + E(t("bk.export")) + "</button>" +
                        '<button type="button" class="button" id="bkTest">' + UI.icon("check") + E(t("bk.test")) + "</button>" +
                        '<button type="button" class="button danger" id="bkRestore">' + UI.icon("upload") + E(t("bk.restore")) + "</button>" +
                        '<input type="file" id="bkFile" accept=".json,application/json" hidden></div><div id="bkReport"></div></div>' +
                        '<div class="card"><h2>' + E(t("bk.storageTitle")) + "</h2>" +
                        '<p>' + E(t("bk.usage", { used: kb(u.bytes), quota: kb(u.quotaEstimate), pct, copies: kb(u.backupBytes) })) + "</p>" +
                        '<div class="bar"><div style="width:' + Math.min(100, pct) + "%" + (pct > 80 ? ";background:var(--red)" : "") + '"></div></div>' +
                        (pct > 80 ? '<p class="banner warn">' + E(t("bk.nearQuota")) + "</p>" : "") +
                        '<p class="info">' + E(t("bk.quotaInfo")) + "</p>" +
                        '<table class="table"><tbody>' + Store.localBackups().map(b => "<tr><td><code>" + E(b.key) + '</code></td><td class="num">' + kb(b.bytes) +
                            '</td><td class="num"><button type="button" class="button mini danger" data-rmbk="' + E(b.key) + '">' + E(t("common.delete")) + "</button></td></tr>").join("") +
                        "</tbody></table></div>" : "") + "<p data-msg></p>";
                wire();
            };
            const pick = (input, fn) => { input.value = ""; input.onchange = () => { if (input.files[0]) Utils.readText(input.files[0]).then(fn); }; input.click(); };
            /* Preview of a full restore: counts now / in the file / after, accounts, roles, rules,
               approved leave, refused data and warnings. Nothing is written (Store.previewRestore). */
            const report = r => {
                const z = zone.querySelector("#bkReport");
                if (!r.ok) { z.innerHTML = '<p class="error">' + E(t("bk.err." + r.error)) + "</p>"; return; }
                const names = list => (list.length ? list.join(", ") : t("bk.preview.none"));
                z.innerHTML = "<h3>" + E(t("bk.preview.title")) + "</h3>" +
                    '<p class="' + (r.sound ? "success" : "error") + '">' + E(t(r.sound ? "bk.testOk" : "bk.testKo")) + "</p>" +
                    '<table class="table"><thead><tr><th></th><th class="num">' + E(t("bk.now")) + '</th><th class="num">' + E(t("bk.inFile")) + '</th><th class="num">' + E(t("bk.restored")) + "</th></tr></thead><tbody>" +
                    Object.keys(r.inFile).map(k => "<tr><td>" + E(t("bk.count." + k)) + '</td><td class="num">' + r.diff.counts[k].now + '</td><td class="num">' + r.inFile[k] +
                        '</td><td class="num' + (r.lost.indexOf(k) >= 0 ? " negative" : "") + '">' + r.restored[k] + "</td></tr>").join("") + "</tbody></table>" +
                    '<ul class="feed"><li><div>' + E(t("bk.preview.removed", { names: names(r.diff.users.removed) })) + "</div></li>" +
                    "<li><div>" + E(t("bk.preview.added", { names: names(r.diff.users.added) })) + "</div></li>" +
                    "<li><div>" + E(t("bk.preview.roles", { names: names(r.diff.users.roleChanged.map(x => x.name + " (" + t("role." + x.from) + " → " + t("role." + x.to) + ")")) })) + "</div></li>" +
                    "<li><div>" + E(t("bk.preview.rules", { names: names(r.diff.org.changed) })) + "</div></li>" +
                    "<li><div>" + E(t("bk.preview.approved", r.diff.approved)) + "</div></li></ul>" +
                    (r.errors.length ? '<p class="error">' + E(t("bk.preview.errors", { n: r.errors.length })) + " " + E(r.errors.slice(0, 12).join(" · ")) + (r.errors.length > 12 ? " …" : "") + "</p>" : "") +
                    (r.warnings.length ? '<p class="info">' + E(t("bk.anomalies")) + " " + E(r.warnings.join(" · ")) + "</p>" : "");
            };
            const wire = () => {
                const q = s => zone.querySelector(s);
                q("#bkOwn").addEventListener("click", () => Utils.download(Store.exportJson(), t("settings.backupFile") + "_" + Utils.isoLocal(Date.now()) + ".json", "application/json"));
                q("#bkOwnRestore").addEventListener("click", () => pick(q("#bkOwnFile"), text => {
                    if (!confirm(t("settings.confirmRestore"))) return;
                    const err = Store.importJson(text);
                    if (err) { msg(zone, "error", t("settings.restore." + err)); return; }
                    const rp = Store.lastPersonalRestore();   /* what was applied, what was ignored */
                    msg(zone, "success", t("settings.restoredPersonal", { n: rp.applied.length, entries: rp.ignored.entries, requests: rp.ignored.requests, clients: rp.ignored.clients }));
                }));
                if (!admin) return;
                q("#bkFull").addEventListener("click", () => Utils.download(Store.exportAll(), t("bk.fileName") + "_" + Utils.isoLocal(Date.now()) + ".json", "application/json"));
                q("#bkTest").addEventListener("click", () => pick(q("#bkFile"), text => report(Store.testRestore(text))));
                q("#bkRestore").addEventListener("click", () => pick(q("#bkFile"), text => {
                    const r = Store.previewRestore(text);
                    report(r);
                    if (!r.ok || !r.sound) return;   /* inconsistent or forged data: no restore is offered */
                    if (!confirm(t(r.warnings.length ? "bk.confirmRestoreAnomalies" : "bk.confirmRestore"))) return;
                    const res = Store.importAll(text);
                    if (!res.ok) { msg(zone, "error", t("bk.err." + res.error)); return; }
                    alert(t("bk.restoredReload", { key: res.backupKey }));
                    location.reload();
                }));
                zone.querySelectorAll("[data-rmbk]").forEach(b => b.addEventListener("click", () => {
                    if (confirm(t("bk.confirmRemove", { key: b.dataset.rmbk })) && Store.removeLocalBackup(b.dataset.rmbk)) draw();
                }));
            };
            draw();
        }
    };

    return { SectionsPanel, AccessPanel, AuditPanel, BackupPanel, grantSheet };
})();
