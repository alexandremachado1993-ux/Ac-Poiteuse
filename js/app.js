/* =============================================================
   app.js — start-up and orchestration (version 2.6 redesign)
   - sign-in first (auth.js / page-login.js), then the application
     shell: side menu (desktop/tablet), top bar + bottom tabs (phone);
   - address = #page/tab (2.7): reload keeps the tab, Back returns to
     the previous page (tabs do not add history entries);
   - MENUS PER ROLE (rights kept from 2.4):
       technician → Dashboard, Clock, Leave & absences, Reports, Settings
       admin      → Dashboard, Leave & absences, Team, Reports, Settings
     a page outside the role's menu is never shown, even by typing it;
   - quick language selector, saved in the profile;
   - every data change redraws the displayed page;
   - every second: clock/timer; every minute: reminders + clock page;
   - home-screen shortcuts (technicians): index.html?start=work;
   - entry correction: one delegated listener on [data-edit].
   ============================================================= */

const App = (() => {
    "use strict";

    const t = I18n.t;
    const PAGES = {
        dashboard: DashboardPage, clock: ClockPage, leave: LeavePage,
        team: TeamPage, reports: ReportsPage, settings: SettingsPage
    };
    /* Menus from the PERMISSIONS (2.8), not from the role name: a page is
       shown when the account holds one of its permissions (permissions.js). */
    const ORDER = ["dashboard", "clock", "leave", "team", "reports", "settings"];
    const PAGE_RIGHTS = {
        dashboard: null, settings: null,
        clock: ["clock.own"],
        leave: ["leave.request", "leave.review", "leave.approve"],
        team: ["team.view", "users.manage"],
        reports: ["reports.view", "timesheet.own"]
    };
    const ICONS = { dashboard: "dashboard", clock: "clock", leave: "calendar", team: "team", reports: "reports", settings: "settings" };
    const SHORT = { dashboard: "nav.short.dashboard", clock: "nav.short.clock", leave: "nav.short.leave", team: "nav.short.team", reports: "nav.short.reports", settings: "nav.short.settings" };
    const LABELS = { dashboard: "nav.dashboard", clock: "nav.clock", leave: "nav.leave", team: "nav.team", reports: "nav.reports", settings: "nav.settings" };
    /* Pages with forms being typed in: only their live parts are refreshed */
    const LIGHT_REFRESH = { settings: true };
    const initialised = {};
    let activePage = "dashboard";
    let signedIn = false;
    let lastMinute = -1;
    let timersStarted = false;

    const $ = id => document.getElementById(id);
    const allowed = name => ORDER.indexOf(name) >= 0 && (!PAGE_RIGHTS[name] || Permissions.canAny(PAGE_RIGHTS[name]));
    const pagesOfUser = () => ORDER.filter(allowed);

    function buildNav() {
        const links = pagesOfUser().map(p => ({ p, label: t(LABELS[p]) }));
        $("sideNav").innerHTML = links.map(l => '<a href="#' + l.p + '" data-page="' + l.p + '">' + UI.icon(ICONS[l.p]) + "<span>" + Utils.escape(l.label) + "</span></a>").join("");
        $("bottomNav").innerHTML = links.map(l => '<a href="#' + l.p + '" data-page="' + l.p + '">' + UI.icon(ICONS[l.p]) +
            '<span class="long">' + Utils.escape(l.label) + '</span><span class="short">' + Utils.escape(t(SHORT[l.p])) + "</span></a>").join("");
        const me = Store.profile();
        $("sideUser").innerHTML = UI.avatar(me.name) + "<div>" + Utils.escape(me.name) + "<small>" +
            Utils.escape(me.jobTitle || t("role." + me.role)) + "</small></div>";
        $("signOutButton").innerHTML = UI.icon("logout") + "<span>" + Utils.escape(t("common.signOut")) + "</span>";
        $("signOutMobile").innerHTML = UI.icon("logout");
    }

    /* ---------- Internal notifications (2.8): bell + list ---------- */
    function notificationText(n) {
        const p = Object.assign({}, n.params);
        if (p.permission) p.permission = t("perm." + p.permission);
        if (p.type) p.type = t("leave.type." + p.type);
        return t("notif." + n.type, p);
    }

    function refreshBell() {
        if (!signedIn) return;
        const unread = Store.notifications().filter(n => !n.read).length;
        const badge = unread ? '<span class="count">' + unread + "</span>" : "";
        $("notifButton").innerHTML = UI.icon("bell") + "<span>" + Utils.escape(t("notif.title")) + "</span>" + badge;
        $("notifButtonMobile").innerHTML = UI.icon("bell") + badge;
        $("notifButton").setAttribute("aria-label", t("notif.title") + (unread ? " (" + unread + ")" : ""));
        $("notifButtonMobile").setAttribute("aria-label", t("notif.title") + (unread ? " (" + unread + ")" : ""));
    }

    function openNotifications() {
        const list = Store.notifications();
        UI.openSheet('<div class="title-row"><h2>' + Utils.escape(t("notif.title")) + '</h2><div class="actions">' +
            (list.some(n => !n.read) ? '<button type="button" class="button mini" id="ntRead">' + UI.icon("check") + Utils.escape(t("notif.markRead")) + "</button>" : "") +
            "</div></div>" +
            (list.length ? '<ul class="feed">' + list.slice(0, 100).map(n => '<li class="' + (n.read ? "" : "unread") + '">' + UI.icon("bell") +
                "<div>" + Utils.escape(notificationText(n)) + '<br><small class="muted">' + Utils.escape(Utils.dateTime(new Date(n.at).getTime())) + "</small></div>" +
                (n.link ? '<a class="button mini" href="#' + Utils.escape(n.link) + '" data-close>' + Utils.escape(t("notif.open")) + "</a>" : "") + "</li>").join("") + "</ul>"
                : '<p class="empty">' + Utils.escape(t("notif.none")) + "</p>") +
            '<div class="actions"><span class="spacer"></span><button type="button" class="button" data-close>' + Utils.escape(t("common.close")) + "</button></div>",
        dlg => { const b = dlg.querySelector("#ntRead"); if (b) b.addEventListener("click", () => { Store.markNotificationsRead(); UI.closeSheet(); }); });
    }

    function showAlerts() {
        const zone = $("alerts");
        if (!signedIn) { zone.innerHTML = ""; return; }
        const messages = [];
        if (Store.readFailed()) messages.push({ level: "warn", text: t("app.unreadable") });
        zone.innerHTML = messages.concat(Reminders.current()).map(a =>
            '<div class="banner ' + a.level + '">' + Utils.escape(a.text) + "</div>").join("");
    }

    function refreshPage() {
        if (!signedIn || !initialised[activePage]) return;
        const p = PAGES[activePage];
        if (LIGHT_REFRESH[activePage] && p.refresh) p.refresh();
        else p.render();
    }

    /* "#leave/requests" → ["leave", "requests"] */
    const parse = hash => String(hash || "").replace(/^#/, "").split("/");

    /* Keeps the address in line with the page and its tab, WITHOUT adding a
       history entry (Back goes to the previous page, not the previous tab) */
    function setSub(page, sub) {
        if (page !== activePage) return;
        const target = "#" + page + (sub ? "/" + sub : "");
        if (location.hash !== target) history.replaceState(null, "", target);
    }

    function show(name, sub) {
        if (!PAGES[name] || !allowed(name)) { name = pagesOfUser()[0]; sub = ""; }
        const changed = activePage !== name;
        activePage = name;
        if (sub && PAGES[name].setTab) PAGES[name].setTab(sub);
        Object.keys(PAGES).forEach(k => { $("page-" + k).hidden = k !== name; });
        if (changed) UI.fadeIn($("page-" + name));
        document.querySelectorAll("#sideNav a, #bottomNav a").forEach(a => {
            const on = a.dataset.page === name;
            a.classList.toggle("active", on);
            if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
        });
        if (!initialised[name]) { PAGES[name].init(); initialised[name] = true; }
        else refreshPage();
        setSub(name, PAGES[name].getTab ? PAGES[name].getTab() : "");
        if (changed) window.scrollTo(0, 0);
    }

    function checkReminders() {
        if (!signedIn || !Permissions.can("clock.own")) return;   /* reminders only for accounts that clock */
        Reminders.check();
        showAlerts();
    }

    function connectionState() {
        $("connectionState").textContent = navigator.onLine ? "" : t("app.offline");
    }

    function refreshShell() {
        I18n.apply();
        const opts = I18n.optionsHtml(I18n.language());
        $("languageSelect").innerHTML = opts;
        $("languageSelectMobile").innerHTML = opts;
        connectionState();
    }

    function shortcut() {
        const params = new URLSearchParams(location.search);
        const key = params.get("start");
        if (key && key !== "home" && Segments.CATEGORIES.some(c => c.key === key)) ClockPage.start(key, ClockPage.context());
        if (key) history.replaceState(null, "", location.pathname + location.hash);
    }

    function startTimers() {
        if (timersStarted) return;
        timersStarted = true;
        setInterval(() => {
            if (!signedIn) return;
            if (activePage === "clock" && initialised.clock) ClockPage.tick();
            const minute = new Date().getMinutes();
            if (minute !== lastMinute) {
                lastMinute = minute;
                checkReminders();
                if (activePage === "clock" && initialised.clock) ClockPage.render();
            }
        }, 1000);
    }

    function enter() {
        /* The profile language wins (same as CONGER PAYER at each sign-in) */
        const lang = Store.profile().language;
        if (lang && lang !== I18n.language()) {
            I18n.setLanguage(lang, false);
            if (I18n.language() === lang) { location.reload(); return; }
        }
        signedIn = true;
        $("login").hidden = true;
        $("shell").hidden = false;
        refreshShell();
        buildNav();
        refreshBell();
        checkReminders();
        const [page, sub] = parse(location.hash);
        show(page || pagesOfUser()[0], sub);
        if (Permissions.can("clock.own")) shortcut();
        startTimers();
    }

    function showLogin() {
        signedIn = false;
        $("shell").hidden = true;
        $("login").hidden = false;
        LoginPage.init(enter);
    }

    function signOut() {
        Auth.signOut();
        history.replaceState(null, "", location.pathname);
        location.reload();
    }

    function init() {
        Store.load();
        refreshShell();
        Store.onChange(() => { refreshPage(); showAlerts(); refreshBell(); });

        const changeLanguage = e => {
            if (signedIn) Store.updateProfile({ language: e.target.value });
            I18n.setLanguage(e.target.value);
        };
        $("languageSelect").addEventListener("change", changeLanguage);
        $("languageSelectMobile").addEventListener("change", changeLanguage);
        $("signOutButton").addEventListener("click", signOut);
        $("signOutMobile").addEventListener("click", signOut);
        $("notifButton").addEventListener("click", openNotifications);
        $("notifButtonMobile").addEventListener("click", openNotifications);

        document.addEventListener("click", ev => {
            const b = ev.target.closest("[data-edit]");
            if (b) { ev.stopPropagation(); Editor.open({ id: b.dataset.edit, userId: b.dataset.owner || "" }); }
        }, true);

        window.addEventListener("hashchange", () => { if (signedIn) { const [page, sub] = parse(location.hash); show(page, sub); } });
        window.addEventListener("online", connectionState);
        window.addEventListener("offline", connectionState);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") { checkReminders(); refreshPage(); }
        });

        if (Auth.session()) enter();
        else showLogin();

        if ("serviceWorker" in navigator && location.protocol !== "file:") {
            navigator.serviceWorker.register("sw.js").catch(() => { /* offline mode unavailable, the app still works */ });
        }
    }

    document.addEventListener("DOMContentLoaded", init);

    return { show, setSub, signOut, refreshShell, buildNav };
})();
