/* =============================================================
   welcome.js — first sign-in presentation + accesses of the app (3.3)
   - Presentation: the same short slides for everybody (computer, tablet,
     phone), shown once per account (setting "introDone"), can be skipped,
     seen again from Settings → Preferences.
   - Accesses, asked like the other apps, only when the person taps:
       · notifications (accounts that clock: forgotten clocking reminder);
       · protected storage (navigator.storage.persist: the browser does not
         erase the data of the app when the device lacks space);
       · installation (Chrome / Edge / Android prompt; Safari: instructions).
     Each one says honestly when the browser or the address does not allow it.
   ============================================================= */

const Welcome = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let installEvent = null;   /* kept until the person taps "Install" */
    let installed = false;

    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; });
    window.addEventListener("appinstalled", () => { installed = true; installEvent = null; });

    /* [icon, title key, text key] */
    const SLIDES = [
        ["dashboard", "intro.welcome.title", "intro.welcome.text"],
        ["arrow", "intro.menu.title", "intro.menu.text"],
        ["clock", "intro.clock.title", "intro.clock.text"],
        ["calendar", "intro.leave.title", "intro.leave.text"],
        ["bell", "intro.validation.title", "intro.validation.text"],
        ["settings", "intro.workspace.title", "intro.workspace.text"]
    ];
    const NAMES = { notif: "access.notif", storage: "access.storage", install: "access.install" };

    /* ---------------- Accesses ---------------- */
    const webAddress = () => location.protocol === "http:" || location.protocol === "https:";
    const standalone = () => installed || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    const appleDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    /* [{ key, icon, state: "on" | "todo" | "off", note }] — state "off" = not possible here */
    async function accesses() {
        const list = [];
        if (Permissions.can("timeclock.self")) {
            const p = typeof Notification === "undefined" ? "off" : Notification.permission;
            list.push({ key: "notif", icon: "bell", state: p === "granted" && Store.settings().notifications ? "on" : p === "denied" || p === "off" ? "off" : "todo",
                note: p === "denied" ? "access.notif.denied" : p === "off" ? "access.notif.unsupported" : "access.notif.info" });
        }
        let persisted = false, canPersist = false;
        try { canPersist = !!(navigator.storage && navigator.storage.persist); persisted = canPersist && await navigator.storage.persisted(); } catch (e) { canPersist = false; }
        list.push({ key: "storage", icon: "lock", state: persisted ? "on" : canPersist ? "todo" : "off", note: canPersist ? "access.storage.info" : "access.storage.unsupported" });
        list.push({ key: "install", icon: "download",
            state: standalone() ? "on" : installEvent ? "todo" : webAddress() ? "manual" : "off",
            note: standalone() ? "access.install.done" : installEvent ? "access.install.info" : !webAddress() ? "access.needsWeb" : appleDevice() ? "access.install.apple" : "access.install.menu" });
        return list;
    }

    async function ask(key) {
        if (key === "notif" && typeof Notification !== "undefined") {
            const perm = await Notification.requestPermission();
            Store.updateSettings({ notifications: perm === "granted" });
        } else if (key === "storage" && navigator.storage && navigator.storage.persist) {
            try { await navigator.storage.persist(); } catch (e) { /* the browser decides */ }
        } else if (key === "install" && installEvent) {
            const ev = installEvent;
            installEvent = null;
            ev.prompt();
            try { installed = (await ev.userChoice).outcome === "accepted"; } catch (e) { /* nothing */ }
        }
    }

    /* List of the accesses with their button; redrawn after each answer */
    async function accessesHtml() {
        const list = await accesses();
        return '<ul class="access-list">' + list.map(a => '<li class="' + a.state + '"><span class="access-icon">' + UI.icon(a.icon) + "</span>" +
            "<div><strong>" + E(t(NAMES[a.key])) + "</strong><small>" + E(t(a.note)) + "</small></div>" +
            (a.state === "todo" ? '<button type="button" class="button mini primary" data-access="' + a.key + '">' + E(t("access.allow")) + "</button>"
                : UI.badge(t(a.state === "on" ? "access.state.on" : a.state === "manual" ? "access.state.manual" : "access.state.off"), a.state === "on" ? "success" : "neutral")) + "</li>").join("") + "</ul>";
    }

    async function fillAccesses(zone) {
        zone.innerHTML = await accessesHtml();
        zone.querySelectorAll("[data-access]").forEach(b => b.addEventListener("click", async () => {
            b.disabled = true;
            await ask(b.dataset.access);
            await fillAccesses(zone);
        }));
    }

    /* ---------------- Presentation ---------------- */
    function open() {
        let i = 0;
        const last = SLIDES.length;   /* index of the "accesses" slide */
        const done = () => { if (!Store.settings().introDone) Store.updateSettings({ introDone: true }); UI.closeSheet(); };
        const draw = dlg => {
            const body = dlg.querySelector(".sheet-body");
            const dots = '<div class="intro-dots" aria-hidden="true">' + SLIDES.concat([null]).map((x, k) => "<span" + (k === i ? ' class="on"' : "") + "></span>").join("") + "</div>";
            const step = i < last
                ? '<div class="intro-art">' + UI.icon(SLIDES[i][0]) + "</div><h2>" + E(t(SLIDES[i][1])) + "</h2><p>" + E(t(SLIDES[i][2])) + "</p>"
                : '<div class="intro-art">' + UI.icon("shield") + "</div><h2>" + E(t("intro.access.title")) + "</h2><p>" + E(t("intro.access.text")) + "</p>" +
                  '<div id="introAccess"></div><p class="info">' + E(t("intro.quick")) + ' <a href="#settings/profile" id="introQuick">' + E(t("intro.quickLink")) + "</a></p>";
            body.innerHTML = '<div class="intro" role="group" aria-roledescription="carousel" aria-label="' + E(t("intro.label")) + '">' +
                '<p class="intro-count">' + E(t("intro.step", { n: i + 1, total: last + 1 })) + "</p>" + step + dots +
                '<div class="actions"><button type="button" class="button" id="introSkip">' + E(t(i < last ? "intro.skip" : "intro.close")) + '</button><span class="spacer"></span>' +
                (i > 0 ? '<button type="button" class="button" id="introPrev">' + UI.icon("left") + E(t("intro.prev")) + "</button>" : "") +
                (i < last ? '<button type="button" class="button primary" id="introNext">' + E(t("intro.next")) + UI.icon("right") + "</button>"
                    : '<button type="button" class="button primary" id="introDone">' + UI.icon("check") + E(t("intro.start")) + "</button>") + "</div></div>";
            body.querySelector("#introSkip").addEventListener("click", done);
            const prev = body.querySelector("#introPrev"), next = body.querySelector("#introNext"), end = body.querySelector("#introDone");
            if (prev) prev.addEventListener("click", () => { i--; draw(dlg); });
            if (next) next.addEventListener("click", () => { i++; draw(dlg); });
            if (end) end.addEventListener("click", done);
            const quick = body.querySelector("#introQuick");
            if (quick) quick.addEventListener("click", done);
            if (i === last) fillAccesses(body.querySelector("#introAccess"));
            const focus = next || end;
            if (focus) focus.focus();
        };
        UI.openSheet("", draw);
        /* closed with Escape: seen as well (the person chose to leave it) */
        const dlg = document.getElementById("sheet");
        dlg.addEventListener("close", () => { if (!Store.settings().introDone) Store.updateSettings({ introDone: true }); }, { once: true });
    }

    /* At sign-in: once per account */
    function maybeOpen() { if (!Store.settings().introDone) open(); }

    return { open, maybeOpen, accesses, fillAccesses };
})();
