/* =============================================================
   page-profile.js — profile tab
   - name, hire date (used for the leave balance), language;
   - account: "local to this device" today; the connection to the
     internal server / CONGER PAYER will be shown here later
     (see auth.js);
   - change password (current + new + confirmation);
   - sign out.
   Every field is saved as soon as it changes.
   ============================================================= */

const ProfilePage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let root = null;

    function passwordField(id, labelKey, autocomplete) {
        return "<label>" + E(t(labelKey)) + '<input type="password" id="' + id + '" inputmode="numeric" autocomplete="' + autocomplete + '"></label>';
    }

    /* container: the zone given by the Settings page (2.6) */
    function init(container) {
        root = container;
        const p = Store.profile();
        root.innerHTML =
            '<div class="card"><h2>' + E(t("profile.title")) + "</h2>" +
            '<div class="grid-2"><label>' + E(t("profile.name")) + '<input type="text" id="pfName" maxlength="120" value="' + E(p.name) + '"></label>' +
            /* the hire date drives the leave balance: managed by "users.manage" only (2.8) */
            "<label>" + E(t("profile.hireDate")) + '<input type="date" id="pfHire" value="' + E(p.hireDate) + '"' +
            (Permissions.can("users.manage") ? "" : ' disabled title="' + E(t("profile.hireDateManaged")) + '"') + "></label></div>" +
            (Permissions.can("users.manage") ? "" : '<p class="info">' + E(t("profile.hireDateManaged")) + "</p>") +
            '<p class="info">' + E(t("profile.hireInfo")) + "</p>" +
            "<label>" + E(t("profile.language")) + '<select id="pfLanguage">' + I18n.optionsHtml(I18n.language()) + "</select></label>" +
            '<p class="error" id="pfError"></p></div>' +

            '<div class="card"><h2>' + E(t("profile.account")) + "</h2>" +
            /* job title (e.g. quality manager) shown apart from the technical role (precision 2) */
            '<div class="person" style="margin-bottom:.6rem">' + UI.avatar(p.name, "large") + '<div><strong style="font-size:1.1rem">' + E(p.name) + "</strong><br>" +
            '<span class="muted">' + E(p.jobTitle || t("role." + p.role)) + "</span></div></div>" +
            '<p><span class="tag">' + E(t("profile.accountLocal")) + '</span> <span class="tag' + (p.role === "admin" ? " edited" : "") + '">' +
            E(t("role." + p.role)) + "</span>" +
            Store.sections().filter(sec => p.allSections || p.sectionIds.indexOf(sec.id) >= 0).map(sec => ' <span class="tag">' + E(sec.name) + "</span>").join("") + "</p>" +
            '<p class="info">' + E(t("profile.accountInfo")) + "</p></div>" +

            '<div class="card"><h2>' + E(t("profile.changePassword")) + "</h2>" +
            passwordField("pfCurrent", "profile.currentPassword", "current-password") +
            '<div class="grid-2">' + passwordField("pfNew", "login.password", "new-password") +
            passwordField("pfConfirm", "login.confirm", "new-password") + "</div>" +
            '<p class="info">' + E(t("login.rule", { n: Auth.MIN_LENGTH })) + "</p>" +
            '<p id="pfPwdMessage"></p>' +
            '<div class="actions"><button type="button" class="button primary" id="pfChange">' + E(t("profile.changePassword")) + "</button></div></div>" +

            '<div class="card"><div class="actions"><button type="button" class="button danger" id="pfSignOut">' + E(t("common.signOut")) + "</button></div></div>";

        root.querySelector("#pfName").addEventListener("change", e => {
            const v = e.target.value.trim();
            if (!v) { e.target.value = Store.profile().name; root.querySelector("#pfError").textContent = t("login.errName"); return; }
            if (!Store.updateProfile({ name: v })) {
                e.target.value = Store.profile().name;
                root.querySelector("#pfError").textContent = t("admin.errName");
                return;
            }
            root.querySelector("#pfError").textContent = "";
            App.buildNav();   /* name shown in the menu */
        });
        root.querySelector("#pfHire").addEventListener("change", e => Store.updateProfile({ hireDate: e.target.value }));
        root.querySelector("#pfLanguage").addEventListener("change", e => {
            Store.updateProfile({ language: e.target.value });
            I18n.setLanguage(e.target.value);
        });
        root.querySelector("#pfChange").addEventListener("click", async () => {
            const m = root.querySelector("#pfPwdMessage");
            const next = root.querySelector("#pfNew").value;
            const err = Auth.checkNewPassword(next, root.querySelector("#pfConfirm").value);
            if (err) { m.className = "error"; m.textContent = t(err, { n: Auth.MIN_LENGTH }); return; }
            const r = await Auth.changePassword(root.querySelector("#pfCurrent").value, next);
            m.className = r === "ok" ? "success" : "error";
            m.textContent = t(r === "ok" ? "profile.passwordChanged" : "profile.wrongCurrent");
            if (r === "ok") ["#pfCurrent", "#pfNew", "#pfConfirm"].forEach(id => { root.querySelector(id).value = ""; });
        });
        root.querySelector("#pfSignOut").addEventListener("click", () => App.signOut());
    }

    return { init, refresh: () => {} };
})();
