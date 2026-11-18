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

    const passwordField = (id, labelKey, autocomplete) => UI.passwordField(id, labelKey, autocomplete, ' minlength="' + Auth.MIN_LENGTH + '" required');

    /* Frame of every sign-in step: brand, language selector, card */
    /* 2.9: dark brand panel (logo, live clock, language) + the profiles on the right */
    function frame(inner) {
        const now = Date.now();
        /* 4.0.1: full navy screen with burgundy curves (mock-up); language at the top right */
        return '<div class="login-lang">' + UI.icon("globe") + '<select class="language-select" id="lgLang" aria-label="' + E(t("app.language")) + '">' +
            I18n.optionsHtml(I18n.language()) + "</select></div>" +
            '<aside class="login-side"><div class="login-brand"><img src="images/app-icon.svg" alt=""><span>' + E(t("app.title")) +
            "<small>" + E(t("app.tagline")) + "</small></span></div>" +
            '<div class="login-time"><div class="login-clock">' + Utils.clock(now) + '</div><div class="login-date">' + UI.icon("calendar") +
            "<span>" + E(Utils.longDate(Utils.isoLocal(now))) + "</span></div></div>" +
            '<div class="login-company"><img src="images/logo.png" alt="Auxiliar Conservera"><span>Auxiliar Conservera</span></div></aside>' +
            '<div class="login-main"><div class="login-card">' + inner + "</div></div>";
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

    /* 4.1.2: on-screen keyboard — the password (or PIN) can be typed with the keyboard OR clicked with the
       mouse / finger. Keys are out of the Tab order (keyboard users type in the field as usual).
       4.3.1 (mock-up of 17/11/2026): digit pad only, full width — 1 to 9, a wide 0, erase. A password with
       letters is still typed with the computer or phone keyboard. Same pad for the PIN code. */
    const key = k => '<button type="button" tabindex="-1" class="kp-key' + (k === "0" ? " kp-wide" : "") + '" data-key="' + k + '">' + k + "</button>";
    function keypadHtml() {
        return '<div class="keypad" role="group" aria-label="' + E(t("login.keypad")) + '">' + "1234567890".split("").map(key).join("") +
            '<button type="button" tabindex="-1" class="kp-key kp-fn" data-kp="erase" aria-label="' + E(t("login.keyErase")) + '">' + UI.icon("backspace") + "</button></div>";
    }
    function wireKeypad(form) {
        const pad = form.querySelector(".keypad");
        if (!pad) return;
        let target = form.querySelector('input[type="password"], input.pw-input');
        form.querySelectorAll('input[type="password"], input.pw-input').forEach(f => f.addEventListener("focus", () => { target = f; }));
        pad.addEventListener("mousedown", e => e.preventDefault());   /* the field keeps the focus */
        pad.addEventListener("click", e => {
            const b = e.target.closest("button");
            if (!b || !target) return;
            if (b.dataset.kp === "erase") target.value = target.value.slice(0, -1);
            else if (b.dataset.key !== undefined) {
                if (target.maxLength > 0 && target.value.length >= target.maxLength) return;
                target.value += b.dataset.key;
            } else return;
            target.dispatchEvent(new Event("input", { bubbles: true }));
        });
    }

    function fail(key) {
        root.querySelector("#lgError").textContent = t(key, { n: Auth.MIN_LENGTH });
        shake();
    }

    function renderList() {
        const list = Store.users().filter(x => x.accountStatus !== "disabled");
        root.innerHTML = frame('<div class="card"><h2>' + E(t("login.welcome")) + ' <span aria-hidden="true">👋</span></h2>' +
            '<p class="login-sub">' + E(t("login.pickProfile")) + "</p>" +
            '<ul class="account-list">' + list.map(x =>
                /* 2.9: no role on the sign-in list (not needed to know who is who); the
                   "first sign-in" mention only for technicians (request of 10/11/2026) */
                '<li><button type="button" class="account" data-user="' + E(x.id) + '">' + UI.avatar(x.name) + "<span><strong>" + E(x.name) + "</strong>" +
                (x.pinHash || x.role !== "technician" ? "" : '<br><span class="tag running">' + E(t("login.firstSignIn")) + "</span>") + "</span></button></li>").join("") +
            "</ul>" +
            '<p class="login-foot">' + UI.icon("info") + "<span>" + E(t("login.notInList")) + "</span></p></div>");
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
            passwordField("lgConfirm", "login.confirm", "new-password") + keypadHtml() +
            '<p class="info">' + E(t("login.rule", { n: Auth.MIN_LENGTH })) + "</p>" +
            '<p class="error" id="lgError"></p>' +
            '<div class="actions"><button type="submit" class="button primary wide">' + E(t("common.save")) + "</button></div>" + backLink() + "</form>");
        wireBack();
        wireLanguage(() => renderNewPassword(x));
        wireKeypad(root.querySelector("#lgForm"));
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

    /* 3.3: fingerprint / face button (when activated on this device) */
    const bioButton = x => (QuickUnlock.state(x.id).bio ? '<div class="actions"><button type="button" class="button wide" id="lgBio">' + UI.icon("user") +
        E(t("quick.useBio")) + "</button></div>" : "");
    function wireBio(x) {
        const b = root.querySelector("#lgBio");
        if (!b) return;
        b.addEventListener("click", async () => {
            b.disabled = true;
            const r = await QuickUnlock.signInWithBio(x.id);
            b.disabled = false;
            if (r === "ok") onSignedIn(); else fail(r === "unavailable" ? "quick.bioNotHere" : "quick.bioFailedLogin");
        });
    }

    /* 3.3: 4-digit PIN code (when chosen on this device); the password stays available */
    function renderPin(x) {
        root.innerHTML = frame('<form class="card" id="lgPinForm"><h2>' + E(t("login.hello", { name: x.name })) + "</h2>" +
            "<label>" + E(t("quick.pin")) + '<input type="password" id="lgPin" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="' +
            QuickUnlock.PIN_LENGTH + '" autocomplete="off" required></label>' +
            '<p class="error" id="lgError"></p>' + keypadHtml() +
            '<div class="actions"><button type="submit" class="button primary wide">' + E(t("login.signIn")) + "</button></div>" + bioButton(x) +
            '<p class="center"><button type="button" class="link" id="lgUsePassword">' + E(t("quick.usePassword")) + "</button></p>" + forgotLink() + backLink() + "</form>");
        wireBack();
        wireBio(x);
        wireLanguage(() => renderPin(x));
        wireKeypad(root.querySelector("#lgPinForm"));
        wireForgot(x);
        root.querySelector("#lgUsePassword").addEventListener("click", () => renderSignIn(x, true));
        const field = root.querySelector("#lgPin");
        const submit = async () => {
            const r = await QuickUnlock.signInWithPin(x.id, field.value);
            if (r === "ok") { onSignedIn(); return; }
            if (r === "wrong") { field.value = ""; fail("quick.wrongPin"); return; }
            renderSignIn(x, true);
            fail(r === "locked" ? "quick.locked" : "quick.pinGone");
        };
        root.querySelector("#lgPinForm").addEventListener("submit", ev => { ev.preventDefault(); submit(); });
        field.addEventListener("input", () => { if (field.value.length === QuickUnlock.PIN_LENGTH) submit(); });
        setTimeout(() => field.focus(), 0);
    }

    function renderSignIn(x, usePassword) {
        if (!usePassword && QuickUnlock.state(x.id).pin) { renderPin(x); return; }
        root.innerHTML = frame('<form class="card" id="lgForm"><h2>' + E(t("login.hello", { name: x.name })) + "</h2>" +
            passwordField("lgPassword", "login.password", "current-password") +
            '<p class="error" id="lgError"></p>' + keypadHtml() +
            '<div class="actions"><button type="submit" class="button primary wide">' + E(t("login.signIn")) + "</button></div>" + bioButton(x) +
            (QuickUnlock.state(x.id).pin ? '<p class="center"><button type="button" class="link" id="lgUsePin">' + E(t("quick.usePin")) + "</button></p>" : "") +
            forgotLink() + backLink() + "</form>");
        wireBack();
        wireBio(x);
        wireLanguage(() => renderSignIn(x, usePassword));
        wireKeypad(root.querySelector("#lgForm"));
        wireForgot(x);
        if (root.querySelector("#lgUsePin")) root.querySelector("#lgUsePin").addEventListener("click", () => renderPin(x));
        root.querySelector("#lgForm").addEventListener("submit", async ev => {
            ev.preventDefault();
            if (await Auth.signIn(x.id, root.querySelector("#lgPassword").value)) onSignedIn();
            else { root.querySelector("#lgPassword").value = ""; fail("login.wrong"); }
        });
        setTimeout(() => { const f = root.querySelector("#lgPassword"); if (f) f.focus(); }, 0);
    }

    /* 4.3: forgotten password — 1) ask the managers of the person (hierarchy: Permissions.canResetPassword),
       2) code by e-mail / SMS: needs the company server (prepared, not active yet). */
    const forgotLink = () => '<p class="center"><button type="button" class="link" id="lgForgot">' + E(t("forgot.link")) + "</button></p>";
    function wireForgot(x) { root.querySelector("#lgForgot").addEventListener("click", () => renderForgot(x)); }

    function renderForgot(x) {
        const fresh = Store.user(x.id) || x;
        const names = Store.passwordResetters(x.id).map(id => Store.user(id)).filter(u => u.role !== "it_admin").map(u => u.name);
        const asked = fresh.unlockAskedAt;
        const option = (icon, title, text, action, off) => '<div class="forgot-option' + (off ? " off" : "") + '"><span class="forgot-icon">' + UI.icon(icon) + "</span>" +
            "<div><strong>" + E(title) + "</strong><small>" + E(text) + "</small>" + action + "</div></div>";
        root.innerHTML = frame('<div class="card" id="lgForgotCard"><h2>' + E(t("forgot.title")) + "</h2>" +
            '<p class="login-sub">' + E(x.name) + "</p>" +
            option("shield", t("forgot.askTitle"), names.length ? t("forgot.askTo", { names: names.join(", ") }) : t("forgot.nobody"),
                asked ? '<p class="success" id="lgAsked">' + UI.icon("check") + E(t("forgot.asked", { date: Utils.dateTime(new Date(asked).getTime()) })) + "</p>"
                    : names.length ? '<div class="actions"><button type="button" class="button primary" id="lgAsk">' + UI.icon("send") + E(t("forgot.askButton")) + "</button></div>" : "") +
            option("mail", t("forgot.codeTitle"), t("forgot.codeLater"),
                '<div class="actions"><button type="button" class="button" disabled>' + UI.icon("mail") + E(t("forgot.byEmail")) + "</button>" +
                '<button type="button" class="button" disabled>' + UI.icon("phone") + E(t("forgot.bySms")) + "</button></div>", true) +
            '<p class="error" id="lgError"></p>' +
            '<p class="center"><button type="button" class="link" id="lgRetry">' + E(t("forgot.back")) + "</button></p>" + backLink() + "</div>");
        wireBack();
        wireLanguage(() => renderForgot(x));
        root.querySelector("#lgRetry").addEventListener("click", () => renderSignIn(fresh));
        const ask = root.querySelector("#lgAsk");
        if (ask) ask.addEventListener("click", () => {
            const r = Store.askPasswordUnlock(x.id);
            if (r === "ok" || r === "already") renderForgot(x); else fail("forgot.err." + r);
        });
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
