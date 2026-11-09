/* =============================================================
   page-login.js — sign-in screen (same flow as CONGER PAYER)
   1. list of the accounts of the device → the person picks their name;
   2a. account with a password → password → Sign in;
   2b. account without a password (new, seeded or reset by an admin)
       → choose a password (≥ 6 characters) + confirmation + language.
   Forgotten password: an administrator resets it (Administration tab);
   the person then chooses a new one here.
   Calls `onSignedIn` (given by app.js) after a successful sign-in.
   ============================================================= */

const LoginPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let root = null;
    let onSignedIn = () => {};

    function passwordField(id, labelKey, autocomplete) {
        return "<label>" + E(t(labelKey)) + '<input type="password" id="' + id + '" inputmode="numeric" autocomplete="' +
            autocomplete + '" minlength="' + Auth.MIN_LENGTH + '" required></label>';
    }

    /* Frame of every sign-in step: brand, language selector, card */
    function frame(inner) {
        return '<div class="login-card"><div class="login-brand"><img src="images/logo.png" alt=""><span>' + E(t("app.title")) + "</span>" +
            '<select class="language-select" id="lgLang" style="margin-left:auto">' + I18n.optionsHtml(I18n.language()) + "</select></div>" +
            inner + "</div>";
    }

    function wireLanguage(again) {
        const sel = root.querySelector("#lgLang");
        if (sel) sel.addEventListener("change", e => { I18n.setLanguage(e.target.value, false); App.refreshShell(); again(); });
    }

    function shake() {
        const card = root.querySelector(".login-card");
        card.classList.remove("shake");
        void card.offsetWidth;
        card.classList.add("shake");
    }

    function fail(key) {
        root.querySelector("#lgError").textContent = t(key, { n: Auth.MIN_LENGTH });
        shake();
    }

    const roleTag = x => '<span class="tag' + (x.role === "admin" ? " edited" : "") + '">' + E(t("role." + x.role)) + "</span>";

    function renderList() {
        const list = Store.users().filter(x => x.accountStatus !== "disabled");
        root.innerHTML = frame('<div class="card"><h2>' + E(t("login.whoAreYou")) + "</h2>" +
            '<ul class="account-list">' + list.map(x =>
                '<li><button type="button" class="account" data-user="' + E(x.id) + '">' + UI.avatar(x.name) + "<span><strong>" + E(x.name) + "</strong><br>" + roleTag(x) +
                (x.pinHash ? "" : ' <span class="tag running">' + E(t("login.firstSignIn")) + "</span>") + "</span></button></li>").join("") +
            "</ul>" + '<p class="info">' + E(t("login.notInList")) + "</p></div>");
        wireLanguage(renderList);
        root.querySelectorAll("[data-user]").forEach(b => b.addEventListener("click", () => {
            const x = Store.user(b.dataset.user);
            if (x.pinHash) renderSignIn(x); else renderNewPassword(x);
        }));
    }

    const backLink = () => '<p class="center"><button type="button" class="link" id="lgBack">' + E(t("login.otherAccount")) + "</button></p>";
    function wireBack() { root.querySelector("#lgBack").addEventListener("click", renderList); }

    function renderNewPassword(x) {
        const language = x.language || I18n.language();
        root.innerHTML = frame('<form class="card" id="lgForm"><h2>' + E(t("login.newPasswordTitle", { name: x.name })) + "</h2>" +
            '<p class="info">' + E(t("login.firstSignInInfo")) + "</p>" +
            "<label>" + E(t("profile.language")) + '<select id="lgLanguage">' + I18n.optionsHtml(language) + "</select></label>" +
            passwordField("lgPassword", "login.password", "new-password") +
            passwordField("lgConfirm", "login.confirm", "new-password") +
            '<p class="info">' + E(t("login.rule", { n: Auth.MIN_LENGTH })) + "</p>" +
            '<p class="error" id="lgError"></p>' +
            '<div class="actions"><button type="submit" class="button primary wide">' + E(t("common.save")) + "</button></div>" + backLink() + "</form>");
        wireBack();
        wireLanguage(() => renderNewPassword(x));
        root.querySelector("#lgLanguage").addEventListener("change", e => {
            /* immediate preview of the chosen language */
            I18n.setLanguage(e.target.value, false);
            renderNewPassword(Object.assign({}, x, { language: e.target.value }));
            App.refreshShell();
        });
        root.querySelector("#lgForm").addEventListener("submit", async ev => {
            ev.preventDefault();
            const pwd = root.querySelector("#lgPassword").value;
            const err = Auth.checkNewPassword(pwd, root.querySelector("#lgConfirm").value);
            if (err) { fail(err); return; }
            const lang = root.querySelector("#lgLanguage").value;
            if (!(await Auth.setPassword(x.id, pwd))) { fail("login.wrong"); return; }
            Store.updateProfile({ language: lang });
            I18n.setLanguage(lang, false);
            onSignedIn();
        });
    }

    function renderSignIn(x) {
        root.innerHTML = frame('<form class="card" id="lgForm"><h2>' + E(t("login.hello", { name: x.name })) + "</h2>" +
            passwordField("lgPassword", "login.password", "current-password") +
            '<p class="error" id="lgError"></p>' +
            '<div class="actions"><button type="submit" class="button primary wide">' + E(t("login.signIn")) + "</button></div>" +
            '<p class="info center">' + E(t("login.forgotInfo")) + "</p>" + backLink() + "</form>");
        wireBack();
        wireLanguage(() => renderSignIn(x));
        root.querySelector("#lgForm").addEventListener("submit", async ev => {
            ev.preventDefault();
            if (await Auth.signIn(x.id, root.querySelector("#lgPassword").value)) onSignedIn();
            else { root.querySelector("#lgPassword").value = ""; fail("login.wrong"); }
        });
        setTimeout(() => { const f = root.querySelector("#lgPassword"); if (f) f.focus(); }, 0);
    }

    function render() {
        if (!Auth.cryptoAvailable()) {
            root.innerHTML = frame('<div class="card"><p class="error">' + E(t("login.needsHttps")) + "</p></div>");
            return;
        }
        renderList();
    }

    function init(callback) {
        root = document.getElementById("login");
        onSignedIn = callback;
        render();
    }

    return { init, render };
})();
