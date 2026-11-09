/* =============================================================
   page-settings.js — Settings (version 2.6)
   Tabs from the PERMISSIONS (2.8): Profile · Preferences (clock.own) ·
   Team rules and Clients (settings.manage) · Sections (users.manage) ·
   Rights & access (permissions.request / permissions.manage) · Audit
   trail (audit.view) · Backup (own account; full backup with
   users.manage) · Reference document. Panels: page-admin-panels.js.
   Fields are saved as soon as they change; the page is not rebuilt on
   every data change (typing is never lost): only refresh().
   ============================================================= */

const SettingsPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    const APP_VERSION = "2.8.0-beta.4";
    let root = null;
    let tab = "profile";

    /* Tabs from the PERMISSIONS (2.8): [key, label key, rights (null = everyone)] */
    const TABS = [
        ["profile", "set.tabProfile", null],
        ["preferences", "set.tabPreferences", ["clock.own"]],
        ["rules", "set.tabRules", ["settings.manage"]],
        ["clients", "set.tabClients", ["settings.manage"]],
        ["sections", "set.tabSections", ["users.manage"]],
        ["access", "set.tabAccess", ["permissions.request", "permissions.manage"]],
        ["audit", "set.tabAudit", ["audit.view"]],
        ["backup", "set.tabBackup", null],
        ["reference", "set.tabReference", null]
    ];

    function tabsOf() {
        return TABS.filter(x => !x[2] || Permissions.canAny(x[2])).map(x => [x[0], t(x[1])]);
    }

    function refresh() {
        if (!root) return;
        const state = root.querySelector("#stNotifState");
        if (state) state.textContent = typeof Notification === "undefined" ? t("settings.notif.unsupported")
            : Notification.permission === "granted" ? t(Store.settings().notifications ? "settings.notif.on" : "settings.notif.allowedOff")
            : Notification.permission === "denied" ? t("settings.notif.denied") : t("settings.notif.notYet");
    }

    function preferences(zone) {
        const s = Store.settings();
        const dayName = d => new Date(2024, 0, 7 + d).toLocaleDateString(I18n.locale(), { weekday: "short" });
        zone.innerHTML = '<div class="card"><h2>' + E(t("settings.reminders")) + "</h2>" +
            "<label>" + E(t("settings.forgotReminder")) + '<input type="time" id="stForgot" value="' + E(s.forgotReminderTime) + '"></label>' +
            '<div class="choices" id="stDays">' + [1, 2, 3, 4, 5, 6, 0].map(d =>
                '<label><input type="checkbox" value="' + d + '"' + (s.reminderDays.indexOf(d) >= 0 ? " checked" : "") + "> " + E(dayName(d)) + "</label>").join("") + "</div>" +
            '<p class="info">' + E(t("settings.remindersInfo")) + "</p>" +
            '<label class="check"><input type="checkbox" id="stVibration"' + (s.vibration ? " checked" : "") + "> " + E(t("settings.vibration")) + "</label>" +
            '<div class="actions"><button type="button" class="button" id="stNotif">' + E(t("settings.enableNotifications")) + "</button>" +
            '<span id="stNotifState" class="info"></span></div></div>';
        zone.querySelector("#stVibration").addEventListener("change", e => Store.updateSettings({ vibration: e.target.checked }));
        zone.querySelector("#stForgot").addEventListener("change", e => Store.updateSettings({ forgotReminderTime: e.target.value }));
        zone.querySelector("#stDays").addEventListener("change", () => {
            Store.updateSettings({ reminderDays: [].slice.call(zone.querySelectorAll("#stDays input:checked")).map(i => +i.value) });
        });
        zone.querySelector("#stNotif").addEventListener("click", () => {
            if (typeof Notification === "undefined") return;
            Notification.requestPermission().then(perm => { Store.updateSettings({ notifications: perm === "granted" }); refresh(); });
        });
    }

    /* Fills the zone under the tabs */
    function zone() {
        const z = root.querySelector("#stZone");
        if (tab === "profile") ProfilePage.init(z);
        else if (tab === "preferences") preferences(z);
        else if (tab === "backup") AdminPanels.BackupPanel.init(z);
        else if (tab === "sections") AdminPanels.SectionsPanel.init(z);
        else if (tab === "access") AdminPanels.AccessPanel.init(z);
        else if (tab === "audit") AdminPanels.AuditPanel.init(z);
        else if (tab === "rules") RulesPanel.init(z);
        else if (tab === "clients") ClientsPage.init(z);
        else { z.innerHTML = Explanations.cardHtml(); Explanations.wire(z); }
        refresh();
    }

    /* Tabs drawn ONCE; a click only redraws the zone (no flicker, sliding indicator) */
    function layout() {
        const tabs = tabsOf();
        if (!tabs.some(x => x[0] === tab)) tab = "profile";
        root.innerHTML = UI.pageHeader(t("nav.settings"), t("set.subtitle")) + UI.tabs(tabs, tab, "settings") + '<div id="stZone"></div>' +
            '<p class="info center">' + E(t("app.title")) + " — " + E(t("settings.version", { v: APP_VERSION })) + "</p>";
        UI.onTabs(root, "settings", k => { tab = k; App.setSub("settings", k); zone(); UI.fadeIn(root.querySelector("#stZone")); });
        zone();
    }

    /* Deep link (#settings/rules) and URL sync */
    function setTab(k) {
        if (!tabsOf().some(x => x[0] === k) || k === tab) return;
        tab = k;
        if (root) layout();
    }

    function init() {
        root = document.getElementById("page-settings");
        layout();
    }

    /* The clients list follows the data (imports); other tabs keep what is typed */
    function lightRefresh() {
        if (tab === "clients") ClientsPage.render(); else refresh();
    }

    return { init, refresh: lightRefresh, setTab, getTab: () => tab, APP_VERSION };
})();

/* Team rules (admins): moved here from page-admin.js (2.4), unchanged behaviour */
const RulesPanel = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let root = null;

    /* [key, type, label key, extra] — numbers in hours unless said otherwise */
    const SECTIONS = [
        ["config.s.week", [["weeklyBase", "number", "config.weeklyBase", { step: 0.5, min: 0, max: 60 }],
            ["dayHours", "number", "config.dayHours", { step: 0.01, min: 0, max: 12 }],
            ["weekendHolidays", "check", "config.weekendHolidays"]]],
        ["config.s.overtime", [["overtime25From", "number", "config.overtime25From", { step: 1, min: 0, max: 60 }],
            ["overtime50From", "number", "config.overtime50From", { step: 1, min: 0, max: 80 }]]],
        ["config.s.premiums", [["nightStart", "number", "config.nightStart", { step: 1, min: 0, max: 23 }],
            ["nightEnd", "number", "config.nightEnd", { step: 1, min: 0, max: 12 }],
            ["nightRate", "percent", "config.nightRate"], ["holidayRate", "percent", "config.holidayRate"]]],
        ["config.s.clocking", [["countShortBreaks", "check", "config.countShortBreaks"],
            ["autoStopTime", "time", "config.autoStopTime"],
            ["longTimerAlertH", "number", "config.longTimerAlertH", { step: 0.5, min: 0, max: 48 }],
            ["breakReminderH", "number", "config.breakReminderH", { step: 0.5, min: 0, max: 24 }]]],
        ["config.s.home", [["homeWorkHours", "number", "config.homeWorkHours", { step: 0.25, min: 0, max: 12 }],
            ["homeDayStart", "time", "config.homeDayStart"],
            ["homeLunchMinutes", "number", "config.homeLunchMinutes", { step: 5, min: 0, max: 180 }],
            ["homeReducesHabitual", "check", "config.homeReducesHabitual"]]],
        ["config.s.leave", [["leaveDaysPerMonth", "number", "config.leaveDaysPerMonth", { step: 0.25, min: 0, max: 5 }]]]
    ];

    function fieldHtml(o, f) {
        const [key, type, label, extra] = f;
        const id = "cf_" + key;
        if (type === "check") return '<label class="check"><input type="checkbox" id="' + id + '" data-key="' + key + '" data-type="check"' + (o[key] ? " checked" : "") + "> " + E(t(label)) + "</label>";
        if (type === "time") return "<label>" + E(t(label)) + '<input type="time" id="' + id + '" data-key="' + key + '" data-type="time" value="' + E(o[key]) + '"></label>';
        if (type === "percent") return "<label>" + E(t(label)) + '<input type="number" id="' + id + '" data-key="' + key + '" data-type="percent" min="0" max="300" step="5" value="' + Math.round(o[key] * 100) + '"></label>';
        const value = Math.round(o[key] * 100) / 100;   /* 39 ÷ 7 shown as 5.57 */
        return "<label>" + E(t(label)) + '<input type="number" id="' + id + '" data-key="' + key + '" data-type="number" min="' + extra.min + '" max="' + extra.max + '" step="' + extra.step + '" value="' + value + '"></label>';
    }

    function init(container) {
        root = container;
        const o = Store.org();
        root.innerHTML = '<p class="banner warn">' + E(t("admin.demoWarning")) + "</p>" +
            '<p class="info">' + E(t("config.intro")) + "</p>" +
            SECTIONS.map(([title, fields]) => '<div class="card"><h2>' + E(t(title)) + '</h2><div class="config-grid">' +
                fields.map(f => fieldHtml(o, f)).join("") + "</div></div>").join("") +
            '<div class="card"><p id="cfMessage" class="info"></p><div class="actions">' +
            '<button type="button" class="button secondary" id="cfDefaults">' + E(t("config.defaults")) + "</button></div></div>" +
            "";

        root.querySelectorAll("[data-key]").forEach(f => f.addEventListener("change", () => {
            let v;
            if (f.dataset.type === "check") v = f.checked;
            else if (f.dataset.type === "time") v = f.value;
            else {
                v = Math.max(0, parseFloat(f.value) || 0);
                if (f.max) v = Math.min(v, parseFloat(f.max));
                f.value = v;
                if (f.dataset.type === "percent") v = v / 100;
                /* 5.57 typed or kept as shown = exactly base ÷ 7 (no rounding drift: 7 × 5.57 ≠ 39) */
                if (f.dataset.key === "dayHours" && Math.abs(v - Store.org().weeklyBase / 7) < 0.006) v = Store.org().weeklyBase / 7;
            }
            const o2 = {}; o2[f.dataset.key] = v;
            const m = root.querySelector("#cfMessage");
            if (Store.updateOrg(o2)) { m.className = "success"; m.textContent = t("config.saved"); }
            else { m.className = "error"; m.textContent = t("config.refused"); }
        }));
        root.querySelector("#cfDefaults").addEventListener("click", () => {
            if (!confirm(t("config.confirmDefaults"))) return;
            Store.updateOrg(Object.assign({}, Store.DEFAULT_ORG));
            init(root);
            root.querySelector("#cfMessage").textContent = t("config.saved");
        });
    }

    return { init };
})();
