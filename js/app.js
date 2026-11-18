/* =============================================================
   app.js — start-up and orchestration
   - sign-in first (auth.js / page-login.js), then the application
     shell: side menu + header (computer), top bar + bottom tabs (phone);
   - address = #page/tab (2.7): reload keeps the tab, Back returns to
     the previous page (tabs do not add history entries);
   - MENUS FROM THE PERMISSIONS (PAGE_RIGHTS below, permissions.js):
     a page the account has no right to is never shown, even by typing it;
     the person may reorder / hide pages (settings navOrder, navHidden);
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
        dashboard: DashboardPage, clock: ClockPage, validation: ValidationPage, leave: LeavePage,
        team: TeamPage, reports: ReportsPage, settings: SettingsPage
    };
    /* Menus from the PERMISSIONS (2.8), not from the role name: a page is
       shown when the account holds one of its permissions (permissions.js). */
    const ORDER = ["dashboard", "clock", "validation", "leave", "team", "reports", "settings"];
    const PAGE_RIGHTS = {
        dashboard: null, settings: null,
        clock: ["timeclock.self"],
        validation: ["timesheet.week.review", "timesheet.week.lock", "leave.team.approve", "leave.global.approve"],   /* weeks + leave to decide (3.0.1) */
        leave: ["leave.self.request", "leave.team.review", "leave.global.approve"],
        team: ["employees.team.view", "employees.manage"],   /* 3.0: IT (employees.manage) — accounts only, no data */
        reports: ["reports.team.view", "reports.self.view"]
    };
    const ICONS = { dashboard: "dashboard", clock: "clock", validation: "shield", leave: "calendar", team: "team", reports: "reports", settings: "settings" };
    const SHORT = { dashboard: "nav.short.dashboard", clock: "nav.short.clock", validation: "nav.short.validation", leave: "nav.short.leave", team: "nav.short.team", reports: "nav.short.reports", settings: "nav.short.settings" };
    const LABELS = { dashboard: "nav.dashboard", clock: "nav.clock", validation: "nav.validation", leave: "nav.leave", team: "nav.team", reports: "nav.reports", settings: "nav.settings" };
    /* Pages with forms being typed in: only their live parts are refreshed */
    const LIGHT_REFRESH = { settings: true };
    const initialised = {};
    let activePage = "dashboard";
    let lastActivity = Date.now();   /* 3.0: idle sign-out */
    let signedIn = false;
    let lastMinute = -1;
    let timersStarted = false;

    const $ = id => document.getElementById(id);
    const allowed = name => ORDER.indexOf(name) >= 0 && (!PAGE_RIGHTS[name] || Permissions.canAny(PAGE_RIGHTS[name]));
    /* 3.1: each person orders and hides the tabs of HIS menu (Preferences). Rights are
       unchanged: a hidden page stays reachable by its links, a shown one still needs the right.
       The dashboard and the settings can never be hidden. */
    const PINNED = ["dashboard", "settings"];
    /* 4.7: "Reports" is "My hours" for someone who only sees his own hours */
    const labelOf = p => t(p === "reports" && !Permissions.can("reports.team.view") ? "nav.myHours" : LABELS[p]);
    const shortOf = p => t(p === "reports" && !Permissions.can("reports.team.view") ? "nav.short.myHours" : SHORT[p]);
    /* 4.7: former addresses → their new place (notifications, bookmarks) */
    const MOVED = { "leave/requests": ["validation", "leave"], clockings: ["team", "clockings"] };
    const allowedPages = () => ORDER.filter(allowed);
    function pagesOfUser() {
        const s = Store.settings();
        const order = Array.isArray(s.navOrder) ? s.navOrder : [], hidden = Array.isArray(s.navHidden) ? s.navHidden : [];
        const rank = p => (order.indexOf(p) >= 0 ? order.indexOf(p) : order.length + ORDER.indexOf(p));
        return allowedPages().filter(p => PINNED.indexOf(p) >= 0 || hidden.indexOf(p) < 0).sort((a, b) => rank(a) - rank(b));
    }
    function applyDisplay() {
        const s = signedIn ? Store.settings() : {};
        UI.applyTheme(s.theme);
        if (signedIn) themeLabel();
        UI.applyMenuSide(s.menuSide);
    }

    function buildNav() {
        const links = pagesOfUser().map(p => ({ p, label: labelOf(p) }));
        const link = l => '<a href="#' + l.p + '" data-page="' + l.p + '"' + (l.p === "settings" ? ' class="nav-end"' : "") + ">" + UI.icon(ICONS[l.p]) + "<span>" + Utils.escape(l.label) + "</span></a>";
        $("sideNav").innerHTML = links.map(link).join("");
        /* 4.7: phone bar without "Settings" (reached by the gear of the top bar) — five entries at most stay readable */
        $("bottomNav").innerHTML = links.filter(l => l.p !== "settings").map(l => '<a href="#' + l.p + '" data-page="' + l.p + '">' + UI.icon(ICONS[l.p]) +
            '<span class="long">' + Utils.escape(l.label) + '</span><span class="short">' + Utils.escape(shortOf(l.p)) + "</span></a>").join("");
        $("settingsMobile").innerHTML = UI.icon("settings");
        const me = Store.profile();
        $("sideUser").innerHTML = UI.avatar(me.name) + "<div>" + Utils.escape(me.name) + "<small>" +
            Utils.escape(me.jobTitle || t("role." + me.role)) + "</small></div>";
        themeLabel();
        $("signOutButton").innerHTML = UI.icon("logout") + "<span>" + Utils.escape(t("common.signOut")) + "</span>";
        $("userProfileLink").innerHTML = UI.icon("user") + "<span>" + Utils.escape(t("profile.title")) + "</span>";
        $("signOutMobile").innerHTML = UI.icon("logout");
        navCounts();
    }

    /* 4.4.1: light / dark switch of the user menu (same setting as Settings → My workspace) */
    function themeLabel() {
        const dark = document.documentElement.dataset.theme === "dark";
        $("themeButton").innerHTML = UI.icon(dark ? "sun" : "moon") + "<span>" + Utils.escape(t(dark ? "pref.toLight" : "pref.toDark")) + "</span>";
    }

    /* 4.0: user menu of the computer header (My profile, theme, Sign out) */
    function wireUserMenu() {
        const button = $("userMenuButton"), pop = $("userPop");
        $("themeButton").addEventListener("click", () => {
            Store.updateSettings({ theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" });
            applyDisplay();
            themeLabel();
            if (activePage === "settings") refreshPage();
        });
        const close = () => { pop.hidden = true; button.setAttribute("aria-expanded", "false"); };
        button.addEventListener("click", ev => {
            ev.stopPropagation();
            pop.hidden = !pop.hidden;
            button.setAttribute("aria-expanded", String(!pop.hidden));
            if (!pop.hidden) $("userProfileLink").focus();
        });
        pop.addEventListener("click", close);
        document.addEventListener("click", ev => { if (!pop.hidden && !ev.target.closest(".user-menu")) close(); });
        document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !pop.hidden) { close(); button.focus(); } });
    }

    /* Red counters on the menu (2.9): what waits for an action of the person */
    function navCounts() {
        const counts = { validation: allowed("validation") ? ValidationPage.waitingCount() : 0 };
        document.querySelectorAll("#sideNav a, #bottomNav a").forEach(a => {
            const old = a.querySelector(".count");
            if (old) old.remove();
            const n = counts[a.dataset.page];
            if (n) a.insertAdjacentHTML("beforeend", '<span class="count">' + n + "</span>");
        });
    }

    /* ---------- Internal notifications (2.8): bell + list ---------- */
    function notificationText(n) {
        const p = Object.assign({}, n.params);
        if (p.permission) p.permission = t("perm." + p.permission);
        if (p.type) p.type = t(UI.LEAVE_TYPE_KEYS[p.type] || "leave.type.other");
        if (Array.isArray(p.rules)) {
            const v = x => (x === true ? t("common.yes") : x === false ? t("common.no") : x === "" || x == null ? "—" :
                typeof x === "number" ? String(Math.round(x * 100) / 100) : String(x));
            p.rules = p.rules.map(r => (TRANSLATIONS["config." + r.k] ? t("config." + r.k) : r.k) + " : " + v(r.b) + " → " + v(r.a)).join(" ; ");
        }
        return t("notif." + n.type, p);
    }

    function refreshBell() {
        if (!signedIn) return;
        navCounts();
        const unread = Store.notifications().filter(n => !n.read).length;
        const badge = unread ? '<span class="count">' + unread + "</span>" : "";
        $("notifButton").innerHTML = UI.icon("bell") + "<span>" + Utils.escape(t("notif.title")) + "</span>" + badge;
        $("notifButtonMobile").innerHTML = UI.icon("bell") + badge;
        $("notifButton").setAttribute("aria-label", t("notif.title") + (unread ? " (" + unread + ")" : ""));
        $("notifButtonMobile").setAttribute("aria-label", t("notif.title") + (unread ? " (" + unread + ")" : ""));
    }

    /* 3.0.1: where a notification leads (every account): the page concerned, if the person may open it */
    /* family and code of a notification type, e.g. leave / decided (".lead" = the team lead is informed) */
    const MINE = { leave: ["changesAsked", "reviewed", "decided", "cancelAccepted", "cancelRefused", "carried"] };
    function notificationTarget(n) {
        if (n.link) return n.link;
        const parts = String(n.type || "").split(".");
        const family = parts[0], code = parts[1] || "", lead = parts[parts.length - 1] === "lead";
        const first = list => list.find(h => allowed(h.split("/")[0])) || "";
        if (family === "leave") return MINE.leave.indexOf(code) >= 0 && !lead ? first(["leave/mine", "leave"]) : first(["validation/leave", "leave"]);
        if (family === "week") return ["validated", "returned", "locked"].indexOf(code) >= 0 ? first(["clock/sheet", "validation"]) : first(["validation", "dashboard"]);
        if (family === "timesheet") return first(["clock/sheet", "team"]);
        if (family === "clock") return first(["team", "dashboard"]);
        if (family === "access" || family === "permission") return first(["settings/access"]);
        if (family === "rules") return first(["settings/reference"]);
        if (family === "account") return first(["team"]);
        return "";
    }

    function openNotifications() {
        const list = Store.notifications();
        UI.openSheet('<div class="title-row"><h2>' + Utils.escape(t("notif.title")) + '</h2><div class="actions">' +
            (list.some(n => !n.read) ? '<button type="button" class="button mini" id="ntRead">' + UI.icon("check") + Utils.escape(t("notif.markRead")) + "</button>" : "") +
            "</div></div>" +
            (list.length ? '<ul class="feed">' + list.slice(0, 100).map(n => {
                const go = notificationTarget(n);
                const body = Utils.escape(notificationText(n)) + '<br><small class="muted">' + Utils.escape(Utils.dateTime(new Date(n.at).getTime())) + "</small>";
                /* the whole message is clickable: it opens the page concerned and marks it read */
                return '<li class="' + (n.read ? "" : "unread") + '">' + UI.icon("bell") +
                    (go ? '<button type="button" class="notif-item" data-go="' + Utils.escape(go) + '" data-id="' + Utils.escape(n.id) + '">' + body + "</button>" : "<div>" + body + "</div>") +
                    (go ? '<span class="muted" aria-hidden="true">' + UI.icon("right") + "</span>" : "") + "</li>";
            }).join("") + "</ul>"
                : '<p class="empty">' + Utils.escape(t("notif.none")) + "</p>") +
            '<div class="actions"><span class="spacer"></span><button type="button" class="button" data-close>' + Utils.escape(t("common.close")) + "</button></div>",
        dlg => {
            const b = dlg.querySelector("#ntRead");
            if (b) b.addEventListener("click", () => { Store.markNotificationsRead(); UI.closeSheet(); });
            dlg.querySelectorAll("[data-go]").forEach(x => x.addEventListener("click", () => {
                Store.markNotificationsRead([x.dataset.id]);
                UI.closeSheet();
                const [page, sub] = parse("#" + x.dataset.go);
                if (location.hash !== "#" + x.dataset.go) history.replaceState(null, "", "#" + x.dataset.go);
                show(page, sub);
            }));
        });
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
        const moved = MOVED[name + (sub ? "/" + sub : "")] || MOVED[name];
        if (moved) { name = moved[0]; sub = moved[1]; }
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
        if (!signedIn || !Permissions.can("timeclock.self")) return;   /* reminders only for accounts that clock */
        Reminders.check();
        showAlerts();
    }

    /* 4.7: state of the app (local today, "connected" once the company server answers) and of the
       network (online / offline, Wi-Fi or mobile network when the browser tells it) — every profile */
    function connectionState() {
        const net = navigator.connection && navigator.connection.type;
        const kind = net === "wifi" ? "app.net.wifi" : net === "cellular" ? "app.net.mobile" : "";
        const online = navigator.onLine !== false;
        const server = StorageAdapter.mode === "server";
        const html = '<span class="st-item ' + (server ? "on" : "local") + '" title="' + Utils.escape(t(server ? "app.st.serverInfo" : "app.st.localInfo")) + '"><i></i>' +
            Utils.escape(t(server ? "app.st.connected" : "app.st.local")) + "</span>" +
            '<span class="st-item ' + (online ? "on" : "off") + '"><i></i>' + Utils.escape(t(online ? "app.net.online" : "app.offline") + (online && kind ? " · " + t(kind) : "")) + "</span>";
        $("appStatus").innerHTML = html;
        $("connectionState").innerHTML = html;
    }

    function refreshShell() {
        I18n.apply();
        const opts = I18n.optionsHtml(I18n.language());
        $("languageSelect").innerHTML = opts;
        $("languageSelectMobile").innerHTML = opts;
        connectionState();
    }

    /* Home-screen shortcuts (manifest.json): ?start=work | ?action=pause | ?action=stop */
    function shortcut() {
        const params = new URLSearchParams(location.search);
        const key = params.get("start");
        const action = params.get("action");
        if (key && key !== "home" && Segments.CATEGORIES.some(c => c.key === key)) { show("clock"); ClockPage.start(key, ClockPage.context()); }
        if (action === "pause") { show("clock"); ClockPage.start("break", {}); }
        if (action === "stop") { show("clock"); ClockPage.stop(); }
        if (key || action) history.replaceState(null, "", location.pathname + location.hash);
    }

    function startTimers() {
        if (timersStarted) return;
        timersStarted = true;
        setInterval(() => {
            if (!signedIn) return;
            /* 3.0: automatic sign-out after X minutes without any action (team rule, 15 min) */
            const idle = Number(Store.org().idleLogoutMinutes) || 0;
            if (idle > 0 && Date.now() - lastActivity > idle * 60000) { signOut(); return; }
            if (activePage === "clock" && initialised.clock) ClockPage.tick();
            if (Permissions.can("timeclock.self")) ClockPage.nightTick();   /* 21:00 countdown, whatever the page */
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
        applyDisplay();
        $("login").hidden = true;
        $("shell").hidden = false;
        refreshShell();
        buildNav();
        refreshBell();
        checkReminders();
        const [page, sub] = parse(location.hash);
        /* 3.0: start page chosen in "My preferences" (when allowed), else the first page */
        const start = Store.settings().startPage;
        show(page || (start && allowed(start) ? start : pagesOfUser()[0]), sub);
        if (Permissions.can("timeclock.self")) shortcut();
        startTimers();
        Welcome.maybeOpen();   /* 3.3: presentation at the first sign-in of the account */
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
        wireUserMenu();

        ["pointerdown", "keydown", "touchstart", "wheel"].forEach(k => document.addEventListener(k, () => { lastActivity = Date.now(); }, { passive: true, capture: true }));
        document.addEventListener("click", ev => {
            const b = ev.target.closest("[data-edit]");
            if (b) { ev.stopPropagation(); Editor.open({ id: b.dataset.edit, userId: b.dataset.owner || "" }); }
        }, true);

        window.addEventListener("hashchange", () => { if (signedIn) { const [page, sub] = parse(location.hash); show(page, sub); } });
        window.addEventListener("online", connectionState);
        window.addEventListener("offline", connectionState);
        if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener("change", connectionState);
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

    return { pagesOfUser, allowedPages, PINNED, applyDisplay, labelOf, show, setSub, signOut, refreshShell, buildNav };
})();
