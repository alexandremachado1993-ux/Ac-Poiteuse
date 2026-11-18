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

    const passwordField = UI.passwordField;

    /* container: the zone given by the Settings page (2.6) */
    function init(container) {
        root = container;
        const p = Store.profile();
        root.innerHTML =
            '<div class="card"><h2>' + E(t("profile.title")) + "</h2>" +
            '<div class="grid-2"><label>' + E(t("profile.name")) + '<input type="text" id="pfName" maxlength="120" value="' + E(p.name) + '"></label>' +
            /* the hire date drives the leave balance: managed by "employees.manage" only (2.8) */
            "<label>" + E(t("profile.hireDate")) + '<input type="date" id="pfHire" value="' + E(p.hireDate) + '"' +
            (Permissions.can("employees.manage") ? "" : ' disabled title="' + E(t("profile.hireDateManaged")) + '"') + "></label></div>" +
            (Permissions.can("employees.manage") ? "" : '<p class="info">' + E(t("profile.hireDateManaged")) + "</p>") +
            '<p class="info">' + E(t("profile.hireInfo")) + "</p>" +
            "<label>" + E(t("profile.language")) + '<select id="pfLanguage">' + I18n.optionsHtml(I18n.language()) + "</select></label>" +
            '<p class="error" id="pfError"></p></div>' +

            /* 4.3: contact for the forgotten password (code by e-mail / SMS once the server exists) */
            '<div class="card"><h2>' + E(t("profile.contact")) + '</h2><div class="grid-2">' +
            "<label>" + E(t("profile.email")) + '<input type="email" id="pfEmail" maxlength="120" autocomplete="email" value="' + E(p.email) + '"></label>' +
            "<label>" + E(t("profile.phone")) + '<input type="tel" id="pfPhone" maxlength="20" autocomplete="tel" value="' + E(p.phone) + '"></label></div>' +
            '<p class="info">' + E(t("profile.contactInfo")) + '</p><p id="pfContactMsg"></p></div>' +

            '<div class="card"><h2>' + E(t("profile.account")) + "</h2>" +
            /* job title (e.g. quality manager) shown apart from the technical role (precision 2) */
            '<div class="person" style="margin-bottom:.6rem">' + UI.avatar(p.name, "large") + '<div><strong style="font-size:1.1rem">' + E(p.name) + "</strong><br>" +
            '<span class="muted">' + E(p.jobTitle || t("role." + p.role)) + "</span></div></div>" +
            '<p><span class="tag">' + E(t("profile.accountLocal")) + '</span> <span class="tag' + (p.role === "quality" || p.role === "director" ? " edited" : "") + '">' +
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

            /* 3.3: quick sign-in on this device (quick-unlock.js) */
            '<div class="card" id="pfQuick"></div>' +

            /* 3.0: my data — export (Backup tab) and request to delete the account */
            '<div class="card"><h2>' + E(t("profile.myData")) + "</h2>" + '<p class="info">' + E(t("profile.myDataInfo")) + "</p>" +
            '<div class="actions"><a class="button" href="#settings/backup">' + UI.icon("download") + E(t("profile.exportMine")) + "</a>" +
            '<button type="button" class="button danger" id="pfDeletion">' + E(t("profile.askDeletion")) + '</button><span id="pfDelMsg" class="success"></span></div></div>' +
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
        [["#pfEmail", "email", "profile.errEmail"], ["#pfPhone", "phone", "profile.errPhone"]].forEach(([sel, k, err]) =>
            root.querySelector(sel).addEventListener("change", e => {
                const m = root.querySelector("#pfContactMsg");
                const o = {}; o[k] = e.target.value.trim();
                const ok = Store.updateProfile(o);
                m.className = ok ? "success" : "error";
                m.textContent = t(ok ? "pref.saved" : err);
                if (!ok) e.target.value = Store.profile()[k];
            }));
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
        quickCard(root.querySelector("#pfQuick"));
        root.querySelector("#pfDeletion").addEventListener("click", () => {
            if (!confirm(t("profile.askDeletionConfirm"))) return;
            if (Store.requestDeletion("")) root.querySelector("#pfDelMsg").textContent = t("profile.deletionAsked");
        });
        root.querySelector("#pfSignOut").addEventListener("click", () => App.signOut());
    }

    /* 3.3: PIN code and fingerprint / face — the current password is asked for every change */
    async function quickCard(card) {
        const st = QuickUnlock.state(Store.currentUserId());
        const bio = await QuickUnlock.bioAvailable();
        const pinField = (id, key) => "<label>" + E(t(key)) + '<input type="password" id="' + id + '" inputmode="numeric" pattern="[0-9]*" maxlength="' +
            QuickUnlock.PIN_LENGTH + '" autocomplete="off"></label>';
        const status = on => UI.badge(t(on ? "quick.on" : "quick.off"), on ? "success" : "neutral");
        card.innerHTML = "<h2>" + E(t("quick.title")) + '</h2><p class="info">' + E(t("quick.info", { n: QuickUnlock.MAX_FAILS })) + "</p>" +
            passwordField("pfQuickPassword", "profile.currentPassword", "current-password") +
            "<h3>" + E(t("quick.pin")) + " " + status(st.pin) + "</h3>" +
            '<div class="grid-2">' + pinField("pfPin", "quick.newPin") + pinField("pfPinConfirm", "quick.confirmPin") + "</div>" +
            '<div class="actions"><button type="button" class="button primary" id="pfPinSave">' + E(t(st.pin ? "quick.pinChange" : "quick.pinSave")) + "</button>" +
            (st.pin ? '<button type="button" class="button" id="pfPinRemove">' + E(t("quick.pinRemove")) + "</button>" : "") + "</div>" +
            "<h3>" + E(t("quick.bio")) + " " + status(st.bio) + "</h3>" +
            (bio ? '<div class="actions"><button type="button" class="button primary" id="pfBioOn">' + UI.icon("user") + E(t(st.bio ? "quick.bioRedo" : "quick.bioOn")) + "</button>" +
                (st.bio ? '<button type="button" class="button" id="pfBioOff">' + E(t("quick.bioOff")) + "</button>" : "") + "</div>"
                : '<p class="info">' + E(t("quick.bioUnavailable")) + "</p>") +
            '<p id="pfQuickMsg"></p>';
        const q = x => card.querySelector(x);
        const say = (ok, key) => { q("#pfQuickMsg").className = ok ? "success" : "error"; q("#pfQuickMsg").textContent = t(key); };
        const after = key => quickCard(card).then(() => say(true, key));
        q("#pfPinSave").addEventListener("click", async () => {
            const err = await QuickUnlock.setPin(q("#pfQuickPassword").value, q("#pfPin").value, q("#pfPinConfirm").value);
            if (err) say(false, err); else after("quick.pinSaved");
        });
        if (q("#pfPinRemove")) q("#pfPinRemove").addEventListener("click", () => { QuickUnlock.remove("pin"); after("quick.removed"); });
        if (q("#pfBioOn")) q("#pfBioOn").addEventListener("click", async () => {
            const r = await QuickUnlock.enrolBio(q("#pfQuickPassword").value);
            if (r === "ok") after("quick.bioSaved"); else say(false, r);
        });
        if (q("#pfBioOff")) q("#pfBioOff").addEventListener("click", () => { QuickUnlock.remove("bio"); after("quick.removed"); });
    }

    return { init };
})();
