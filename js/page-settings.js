/* =============================================================
   page-settings.js — Settings (version 2.6)
   Tabs from the PERMISSIONS (2.8): Profile · My workspace (3.2, everybody:
   display only, layout.js) · Preferences (reminders, absence of a manager) ·
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
    const APP_VERSION = "4.7.3";
    let root = null;
    let tab = "profile";

    /* Tabs from the PERMISSIONS (2.8): [key, label key, rights (null = everyone)] */
    const TABS = [
        ["profile", "set.tabProfile", null],
        ["workspace", "set.tabWorkspace", null],       /* 3.2: "My workspace" (display only) for everybody */
        /* 3.0: "My preferences" — 3.3: accesses of the app and presentation (everybody), reminders (who clocks), absence (managers) */
        ["preferences", "set.tabPreferences", null],
        ["rules", "set.tabRules", ["settings.view", "settings.manage"]],       /* read only with settings.view */
        ["clients", "set.tabClients", ["settings.view", "settings.manage"]],
        ["sections", "set.tabSections", ["employees.manage"]],
        ["access", "set.tabAccess", ["permissions.request", "permissions.manage"]],
        ["audit", "set.tabAudit", ["audit.view"]],
        ["backup", "set.tabBackup", null],
        ["reference", "set.tabReference", null],
        ["readReport", "set.tabReadReport", null]       /* 4.7: how to read the time report (was under the reference document) */
    ];
    /* 4.7: ten tabs → four groups, each with its sub-tabs */
    const GROUPS = [["account", "set.g.account", ["profile", "workspace", "preferences"]], ["company", "set.g.company", ["rules", "clients", "sections", "access"]],
        ["data", "set.g.data", ["backup", "audit"]], ["help", "set.g.help", ["reference", "readReport"]]];

    function tabsOf() {
        return TABS.filter(x => !x[2] || Permissions.canAny(x[2])).map(x => [x[0], t(x[1])]);
    }
    const groupOf = k => GROUPS.find(g => g[2].indexOf(k) >= 0);
    const subsOf = g => g[2].map(k => tabsOf().find(x => x[0] === k)).filter(Boolean);   /* in the order of the group */
    const groupsOf = () => GROUPS.filter(g => subsOf(g).length);

    function refresh() {
        if (!root) return;
        const state = root.querySelector("#stNotifState");
        if (state) state.textContent = typeof Notification === "undefined" ? t("settings.notif.unsupported")
            : Notification.permission === "granted" ? t(Store.settings().notifications ? "settings.notif.on" : "settings.notif.allowedOff")
            : Notification.permission === "denied" ? t("settings.notif.denied") : t("settings.notif.notYet");
    }

    /* 3.2: widths offered for a dashboard block (twelfths of the page width) */
    const WIDTH_KEYS = { 3: "lay.w.quarter", 4: "lay.w.third", 6: "lay.w.half", 8: "lay.w.twoThirds", 12: "lay.w.full" };

    /* 3.2: "Customise my workspace" — display only, saved in the person's own settings */
    function workspace(zone) {
        const s = Store.settings();
        const shown = App.pagesOfUser();
        const tabs = shown.concat(App.allowedPages().filter(k => shown.indexOf(k) < 0));
        const dash = DashboardPage.catalog();
        const blocks = Layout.arrange(dash.view, dash.blocks);
        const opt = (v, cur, key) => '<option value="' + v + '"' + (cur === v ? " selected" : "") + ">" + E(t(key)) + "</option>";
        const handle = (id, name) => '<button type="button" class="icon-button drag-handle" data-drag data-drag-id="' + E(id) + '" aria-label="' + E(t("lay.move", { name })) +
            '" title="' + E(t("lay.moveHint")) + '">' + UI.icon("grip") + "</button>";
        zone.innerHTML = '<div class="card"><h2>' + E(t("lay.title")) + '</h2><p class="info">' + E(t("lay.intro")) + "</p>" +
            '<h3>' + E(t("lay.general")) + "</h3>" +
            '<div class="grid-2"><label>' + E(t("pref.theme")) + '<select id="stTheme">' + opt("auto", s.theme, "pref.theme.auto") + opt("light", s.theme, "pref.theme.light") +
                opt("dark", s.theme, "pref.theme.dark") + "</select></label>" +
            "<label>" + E(t("pref.menuSide")) + '<select id="stSide">' + opt("left", s.menuSide, "pref.side.left") + opt("right", s.menuSide, "pref.side.right") + "</select></label></div>" +
            '<p class="info">' + E(t("pref.menuSideInfo")) + "</p>" +
            "<label>" + E(t("pref.startPage")) + '<select id="stStart"><option value="">' + E(t("pref.startDefault")) + "</option>" +
            shown.map(k => '<option value="' + k + '"' + (s.startPage === k ? " selected" : "") + ">" + E(App.labelOf(k)) + "</option>").join("") + "</select></label></div>" +
            '<div class="card"><h2>' + E(t("pref.tabs")) + '</h2><p class="info">' + E(t("pref.tabsInfo")) + '</p><ul class="tab-order" id="stTabs">' +
            tabs.map((k, i) => { const pinned = App.PINNED.indexOf(k) >= 0, on = shown.indexOf(k) >= 0, name = App.labelOf(k);
                return '<li data-tab-key="' + k + '">' + handle(k, name) + '<label class="check"><input type="checkbox" data-tab-show' + (on ? " checked" : "") + (pinned ? " disabled" : "") + "> " + E(name) + "</label>" +
                    '<span class="actions"><button type="button" class="icon-button" data-tab-move="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="' + E(t("pref.tabUp", { tab: name })) + '">' + UI.icon("left") + "</button>" +
                    '<button type="button" class="icon-button" data-tab-move="1"' + (i === tabs.length - 1 ? " disabled" : "") + ' aria-label="' + E(t("pref.tabDown", { tab: name })) + '">' + UI.icon("right") + "</button></span></li>"; }).join("") +
            '</ul><div class="actions"><button type="button" class="button" id="stTabsReset">' + E(t("pref.tabsReset")) + "</button></div></div>" +
            '<div class="card"><h2>' + E(t("lay.dash")) + '</h2><p class="info">' + E(t("lay.dashInfo")) + '</p><ul class="tab-order" id="stBlocks">' +
            blocks.map(b => '<li data-block="' + E(b.id) + '" data-default-size="' + b.size + '">' + handle(b.id, b.label) +
                '<label class="check"><input type="checkbox" data-block-show' + (b.hidden ? "" : " checked") + "> " + E(b.label) + " " +
                UI.badge(t(b.kind === "widget" ? "lay.kind.widget" : "lay.kind.block"), b.kind === "widget" ? "info" : "neutral") + "</label>" +
                '<select data-block-size aria-label="' + E(t("lay.width", { name: b.label })) + '"' + (b.sizes.length < 2 ? " disabled" : "") + ">" +
                b.sizes.map(w => '<option value="' + w + '"' + (w === b.size ? " selected" : "") + ">" + E(t(WIDTH_KEYS[w])) + "</option>").join("") + "</select></li>").join("") +
            '</ul><div class="actions"><a class="button primary" href="#dashboard" id="stDashEdit">' + UI.icon("dashboard") + E(t("lay.editOnDash")) + "</a>" +
            '<button type="button" class="button" id="stDashReset">' + E(t("lay.resetDash")) + "</button></div></div>" +
            '<div class="card"><h2>' + E(t("lay.resetAll")) + '</h2><p class="info">' + E(t("lay.resetAllInfo")) + '</p><div class="actions">' +
            '<button type="button" class="button danger" id="stResetAll">' + UI.icon("undo") + E(t("lay.resetAll")) + "</button></div></div>";
        wireWorkspace(zone, dash.view);
    }

    function wireWorkspace(zone, view) {
        const q = x => zone.querySelector(x);
        q("#stStart").addEventListener("change", e => Store.updateSettings({ startPage: e.target.value }));
        q("#stTheme").addEventListener("change", e => { Store.updateSettings({ theme: e.target.value }); App.applyDisplay(); });
        q("#stSide").addEventListener("change", e => { Store.updateSettings({ menuSide: e.target.value }); App.applyDisplay(); });
        /* tabs: the list on screen IS the order; saved, then the menu and this zone are redrawn */
        const saveTabs = () => {
            const items = [].slice.call(zone.querySelectorAll("#stTabs li"));
            Store.updateSettings({ navOrder: items.map(li => li.dataset.tabKey),
                navHidden: items.filter(li => !li.querySelector("[data-tab-show]").checked).map(li => li.dataset.tabKey) });
            App.buildNav(); workspace(zone);
        };
        Layout.sortable(q("#stTabs"), { item: "li", onEnd: saveTabs });
        zone.querySelectorAll("[data-tab-show]").forEach(c => c.addEventListener("change", saveTabs));
        zone.querySelectorAll("[data-tab-move]").forEach(b => b.addEventListener("click", () => {
            const li = b.closest("li"), list = li.parentNode;
            if (b.dataset.tabMove === "-1") list.insertBefore(li, li.previousElementSibling); else list.insertBefore(li.nextElementSibling, li);
            saveTabs();
        }));
        q("#stTabsReset").addEventListener("click", () => { Store.updateSettings({ navOrder: [], navHidden: [] }); App.buildNav(); workspace(zone); });
        /* dashboard blocks: same list principle, saved by Layout (display only) */
        const saveBlocks = () => Layout.saveFrom(view, [].slice.call(zone.querySelectorAll("#stBlocks li")).map(li => ({ id: li.dataset.block,
            size: +li.querySelector("[data-block-size]").value, defaultSize: +li.dataset.defaultSize, hidden: !li.querySelector("[data-block-show]").checked })));
        Layout.sortable(q("#stBlocks"), { item: "li", onEnd: saveBlocks });
        zone.querySelectorAll("[data-block-show], [data-block-size]").forEach(c => c.addEventListener("change", saveBlocks));
        q("#stDashEdit").addEventListener("click", () => DashboardPage.setEditing(true));
        q("#stDashReset").addEventListener("click", () => { Layout.save(view, null); workspace(zone); });
        q("#stResetAll").addEventListener("click", () => {
            if (!confirm(t("lay.resetAllConfirm"))) return;
            Store.updateSettings({ navOrder: [], navHidden: [], menuSide: "left", theme: "auto", startPage: "", dashLayout: {} });
            App.applyDisplay(); App.buildNav(); workspace(zone);
        });
    }

    function preferences(zone) {
        const s = Store.settings();
        const me = Store.profile();
        const dayName = d => new Date(2024, 0, 7 + d).toLocaleDateString(I18n.locale(), { weekday: "short" });
        /* 3.0: declared absence of a manager (replacement rules 8 and 9) */
        const manager = Permissions.canAny(["leave.team.approve", "leave.global.approve", "timesheet.week.review", "timesheet.week.lock"]);
        const access = '<div class="card"><h2>' + E(t("access.title")) + '</h2><p class="info">' + E(t("access.intro")) + '</p><div id="stAccess"></div>' +
            '<div class="actions"><button type="button" class="button" id="stIntro">' + UI.icon("play") + E(t("access.replay")) + "</button></div></div>";
        const general = access + (manager ? '<div class="card"><h2>' + E(t("pref.away")) + "</h2>" +
                '<p class="info">' + E(t("pref.awayInfo")) + "</p>" +
                '<div class="grid-2"><label>' + E(t("leave.from")) + '<input type="date" id="stAwayFrom" value="' + E(me.awayFrom || "") + '"></label>' +
                "<label>" + E(t("leave.to")) + '<input type="date" id="stAwayTo" value="' + E(me.awayTo || "") + '"></label></div>' +
                '<div class="actions"><button type="button" class="button primary" id="stAwaySave">' + E(t("common.save")) + "</button>" +
                '<button type="button" class="button" id="stAwayClear">' + E(t("pref.awayClear")) + '</button><span id="stAwayMsg"></span></div></div>' : "");
        if (!Permissions.can("timeclock.self")) {
            zone.innerHTML = general;
            wireGeneral(zone);
            return;
        }
        zone.innerHTML = general + '<div class="card"><h2>' + E(t("settings.reminders")) + "</h2>" +
            "<label>" + E(t("settings.forgotReminder")) + '<input type="time" id="stForgot" value="' + E(s.forgotReminderTime) + '"></label>' +
            '<div class="choices" id="stDays">' + [1, 2, 3, 4, 5, 6, 0].map(d =>
                '<label><input type="checkbox" value="' + d + '"' + (s.reminderDays.indexOf(d) >= 0 ? " checked" : "") + "> " + E(dayName(d)) + "</label>").join("") + "</div>" +
            '<p class="info">' + E(t("settings.remindersInfo")) + "</p>" +
            '<label class="check"><input type="checkbox" id="stVibration"' + (s.vibration ? " checked" : "") + "> " + E(t("settings.vibration")) + "</label>" +
            '<p class="info" id="stNotifState"></p></div>';
        wireGeneral(zone);
        zone.querySelector("#stVibration").addEventListener("change", e => Store.updateSettings({ vibration: e.target.checked }));
        zone.querySelector("#stForgot").addEventListener("change", e => Store.updateSettings({ forgotReminderTime: e.target.value }));
        zone.querySelector("#stDays").addEventListener("change", () => {
            Store.updateSettings({ reminderDays: [].slice.call(zone.querySelectorAll("#stDays input:checked")).map(i => +i.value) });
        });
    }

    function wireGeneral(zone) {
        const q = x => zone.querySelector(x);
        Welcome.fillAccesses(q("#stAccess")).then(refresh);
        q("#stIntro").addEventListener("click", () => Welcome.open());
        if (!q("#stAwaySave")) return;
        const done = ok => { q("#stAwayMsg").className = ok ? "success" : "error"; q("#stAwayMsg").textContent = t(ok ? "pref.saved" : "pref.awayErr"); };
        q("#stAwaySave").addEventListener("click", () => done(Store.setAway(q("#stAwayFrom").value, q("#stAwayTo").value)));
        q("#stAwayClear").addEventListener("click", () => { q("#stAwayFrom").value = ""; q("#stAwayTo").value = ""; done(Store.setAway("", "")); });
    }

    /* Fills the zone under the tabs */
    function zone() {
        const z = root.querySelector("#stZone");
        /* 4.1.2: short forms on two columns (computer), wide tables and rule grids on the full width */
        z.className = "st-zone " + (["profile", "workspace", "preferences", "backup"].indexOf(tab) >= 0 ? "st-columns" : "st-full");
        if (tab === "profile") ProfilePage.init(z);
        else if (tab === "workspace") workspace(z);
        else if (tab === "preferences") preferences(z);
        else if (tab === "backup") AdminPanels.BackupPanel.init(z);
        else if (tab === "sections") AdminPanels.SectionsPanel.init(z);
        else if (tab === "access") AdminPanels.AccessPanel.init(z);
        else if (tab === "audit") AdminPanels.AuditPanel.init(z);
        else if (tab === "rules") RulesPanel.init(z);
        else if (tab === "clients") ClientsPage.init(z);
        else if (tab === "readReport") z.innerHTML = Explanations.guideCardHtml();
        else { z.innerHTML = Explanations.cardHtml(); Explanations.wire(z); }
        /* settings.view without settings.manage: consultation only (the store refuses the changes too) */
        const readOnly = (tab === "rules" || tab === "clients") && !Permissions.can("settings.manage");
        z.classList.toggle("read-only", readOnly);
        if (readOnly) {
            z.querySelectorAll("input:not([type=search]), select, textarea").forEach(el => { el.disabled = true; });
            z.insertAdjacentHTML("afterbegin", '<p class="banner info">' + E(t("set.readOnly")) + "</p>");
        }
        refresh();
    }

    /* Group tabs and sub-tabs drawn once per group; a sub-tab click only redraws the zone */
    function subTabs() {
        const subs = subsOf(groupOf(tab));
        const z = root.querySelector("#stSubs");
        z.innerHTML = subs.length > 1 ? UI.tabs(subs, tab, "settingsSub", "sub") : "";
        UI.onTabs(z, "settingsSub", k => { tab = k; App.setSub("settings", k); zone(); UI.fadeIn(root.querySelector("#stZone")); });
    }
    function layout() {
        const tabs = tabsOf();
        if (!tabs.some(x => x[0] === tab)) tab = "profile";
        root.innerHTML = UI.pageHeader(t("nav.settings"), t("set.subtitle")) +
            UI.tabs(groupsOf().map(g => [g[0], t(g[1])]), groupOf(tab)[0], "settings") + '<div id="stSubs"></div><div id="stZone"></div>' +
            '<p class="info center">' + E(t("app.title")) + " — " + E(t("settings.version", { v: APP_VERSION })) + "</p>";
        UI.onTabs(root, "settings", g => {
            tab = subsOf(GROUPS.find(x => x[0] === g))[0][0];
            App.setSub("settings", tab); subTabs(); zone(); UI.fadeIn(root.querySelector("#stZone"));
        });
        subTabs();
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
            ["creditWeekdaysOnly", "check", "config.creditWeekdaysOnly"],
            ["weekendHolidays", "check", "config.weekendHolidays"]]],
        /* 3.0: the managers' register "OK" (decisions 11.1 → 11.8 and 10.7 of the profile list) */
        ["config.s.register", [["hoursMethod", "select", "config.hoursMethod", { options: ["register", "countdown"] }],
            ["overtimeRecoveryRate", "percent", "config.overtimeRecoveryRate"],
            ["overtime50InRecovery", "check", "config.overtime50InRecovery"],
            ["negativeWeeks", "select", "config.negativeWeeks", { options: ["zero", "carry"] }],
            ["timeOffReducesGoal", "check", "config.timeOffReducesGoal"],
            ["leaveReducesGoal", "check", "config.leaveReducesGoal"],
            ["premiumsBeforeOvertime", "check", "config.premiumsBeforeOvertime"],
            ["paidOvertimeFromWeek", "number", "config.paidOvertimeFromWeek", { step: 1, min: 0, max: 53 }],
            ["paidOvertimeToWeek", "number", "config.paidOvertimeToWeek", { step: 1, min: 0, max: 53 }],
            ["sundayRate", "percent", "config.sundayRate"]]],
        ["config.s.overtime", [["overtime25From", "number", "config.overtime25From", { step: 1, min: 0, max: 60 }],
            ["overtime50From", "number", "config.overtime50From", { step: 1, min: 0, max: 80 }]]],
        ["config.s.premiums", [["nightStart", "number", "config.nightStart", { step: 1, min: 0, max: 23 }],
            ["nightEnd", "number", "config.nightEnd", { step: 1, min: 0, max: 12 }],
            ["nightRate", "percent", "config.nightRate"], ["holidayRate", "percent", "config.holidayRate"],
            ["absenceWorkedRate", "percent", "config.absenceWorkedRate"]]],
        ["config.s.clocking", [["countShortBreaks", "check", "config.countShortBreaks"],
            ["autoStopTime", "time", "config.autoStopTime"],
            ["longTimerAlertH", "number", "config.longTimerAlertH", { step: 0.5, min: 0, max: 48 }],
            ["breakReminderH", "number", "config.breakReminderH", { step: 0.5, min: 0, max: 24 }],
            ["undoSeconds", "number", "config.undoSeconds", { step: 1, min: 0, max: 60 }],
            ["nightCountdown", "check", "config.nightCountdown"],
            ["weekClosureRequired", "check", "config.weekClosureRequired"],
            ["idleLogoutMinutes", "number", "config.idleLogoutMinutes", { step: 1, min: 0, max: 240 }]]],
        ["config.s.home", [["homeWorkHours", "number", "config.homeWorkHours", { step: 0.25, min: 0, max: 12 }],
            ["homeDayPreset", "check", "config.homeDayPreset"],
            ["homeDayStart", "time", "config.homeDayStart"],
            ["homeLunchMinutes", "number", "config.homeLunchMinutes", { step: 5, min: 0, max: 180 }],
            ["homeReducesHabitual", "check", "config.homeReducesHabitual"]]],
        ["config.s.leave", [["leaveDayMode", "select", "config.leaveDayMode", { options: ["monFri", "monSat"] }],
            ["leaveDaysPerMonth", "number", "config.leaveDaysPerMonth", { step: 0.01, min: 0, max: 5 }],
            ["leaveAcquisitionStart", "select", "config.leaveAcquisitionStart", { options: ["05-01", "06-01", "01-01", ""] }],
            ["leaveSingleDecision", "check", "config.leaveSingleDecision"],
            ["calendarForTechnicians", "select", "config.calendarForTechnicians", { options: ["none", "noReason", "withReason"] }],
            ["leaveNoticeShort", "number", "config.leaveNoticeShort", { step: 1, min: 0, max: 90 }],
            ["leaveNoticeMid", "number", "config.leaveNoticeMid", { step: 1, min: 0, max: 90 }],
            ["leaveNoticeLong", "number", "config.leaveNoticeLong", { step: 1, min: 0, max: 120 }],
            ["leaveNoticeBlocks", "check", "config.leaveNoticeBlocks"]]]
    ];

    /* labels of the choices of the "select" rules (literal keys: checked by the translation test) */
    const OPTION_KEYS = {
        "hoursMethod:register": "config.opt.register", "hoursMethod:countdown": "config.opt.countdown",
        "leaveDayMode:monFri": "config.opt.monFri", "leaveDayMode:monSat": "config.opt.monSat",
        "negativeWeeks:zero": "config.opt.zero", "negativeWeeks:carry": "config.opt.carry",
        "leaveAcquisitionStart:05-01": "config.opt.may", "leaveAcquisitionStart:06-01": "config.opt.june",
        "leaveAcquisitionStart:01-01": "config.opt.january", "leaveAcquisitionStart:": "config.opt.hireDate",
        "calendarForTechnicians:none": "config.opt.calNone", "calendarForTechnicians:noReason": "config.opt.calNoReason",
        "calendarForTechnicians:withReason": "config.opt.calWithReason"
    };

    function fieldHtml(o, f) {
        const [key, type, label, extra] = f;
        const id = "cf_" + key;
        if (type === "check") return '<label class="check"><input type="checkbox" id="' + id + '" data-key="' + key + '" data-type="check"' + (o[key] ? " checked" : "") + "> " + E(t(label)) + "</label>";
        if (type === "select") return "<label>" + E(t(label)) + '<select id="' + id + '" data-key="' + key + '" data-type="select">' +
            extra.options.map(v => '<option value="' + E(v) + '"' + (o[key] === v ? " selected" : "") + ">" + E(t(OPTION_KEYS[key + ":" + v])) + "</option>").join("") + "</select></label>";
        if (type === "time") return "<label>" + E(t(label)) + '<input type="time" id="' + id + '" data-key="' + key + '" data-type="time" value="' + E(o[key]) + '"></label>';
        if (type === "percent") return "<label>" + E(t(label)) + '<input type="number" id="' + id + '" data-key="' + key + '" data-type="percent" min="0" max="300" step="5" value="' + Math.round(o[key] * 100) + '"></label>';
        const value = Math.round(o[key] * 100) / 100;   /* 39 ÷ 7 shown as 5.57 */
        return "<label>" + E(t(label)) + '<input type="number" id="' + id + '" data-key="' + key + '" data-type="number" min="' + extra.min + '" max="' + extra.max + '" step="' + extra.step + '" value="' + value + '"></label>';
    }

    /* 4.1.7: the rules are shown LOCKED; "Edit" unlocks them, "Validate" saves every change at once
       (one audit line per rule changed, one notice to the technicians), "Cancel" drops the changes. */
    function valueOf(f) {
        if (f.dataset.type === "check") return f.checked;
        if (f.dataset.type === "time" || f.dataset.type === "select") return f.value;
        let v = Math.max(0, parseFloat(f.value) || 0);
        if (f.max) v = Math.min(v, parseFloat(f.max));
        if (f.dataset.type === "percent") v = v / 100;
        /* 5.57 typed or kept as shown = exactly base ÷ 7 (no rounding drift: 7 × 5.57 ≠ 39) */
        if (f.dataset.key === "dayHours" && Math.abs(v - Store.org().weeklyBase / 7) < 0.006) v = Store.org().weeklyBase / 7;
        if (f.dataset.key === "dayHours" && Math.abs(v - Store.org().weeklyBase / 5) < 0.006) v = Store.org().weeklyBase / 5;
        if (f.dataset.key === "leaveDaysPerMonth" && Math.abs(v - 25 / 12) < 0.006) v = 25 / 12;   /* 2.08 shown = exactly 25 days a year */
        return v;
    }

    function init(container, editing) {
        root = container;
        const o = Store.org();
        const canEdit = Permissions.can("settings.manage");
        const bar = '<div class="card rules-bar"><div class="title-row"><p id="cfMessage" class="info">' + E(t(editing ? "config.editing" : canEdit ? "config.locked" : "config.readOnlyInfo")) + "</p>" +
            (canEdit ? '<div class="actions">' + (editing
                ? '<button type="button" class="button" id="cfDefaults">' + E(t("config.defaults")) + "</button>" +
                  '<button type="button" class="button" id="cfCancel">' + E(t("common.cancel")) + "</button>" +
                  '<button type="button" class="button primary" id="cfSave">' + UI.icon("check") + E(t("config.validate")) + "</button>"
                : '<button type="button" class="button primary" id="cfEdit">' + UI.icon("wrench") + E(t("config.edit")) + "</button>") + "</div>" : "") + "</div></div>";
        root.innerHTML = '<p class="banner warn">' + E(t("admin.demoWarning")) + "</p>" + bar +
            SECTIONS.map(([title, fields]) => '<div class="card"><h2>' + E(t(title)) + '</h2><div class="config-grid">' +
                fields.map(f => fieldHtml(o, f)).join("") + "</div></div>").join("");
        root.querySelectorAll("[data-key]").forEach(f => { f.disabled = !editing; });
        const q = x => root.querySelector(x);
        if (q("#cfEdit")) q("#cfEdit").addEventListener("click", () => init(root, true));
        if (q("#cfCancel")) q("#cfCancel").addEventListener("click", () => init(root, false));
        if (q("#cfSave")) q("#cfSave").addEventListener("click", () => {
            const cur = Store.org(), changes = {};
            root.querySelectorAll("[data-key]").forEach(f => {
                const v = valueOf(f), k = f.dataset.key;
                const same = typeof v === "number" ? Math.abs(v - cur[k]) < 1e-9 : v === cur[k];
                if (!same) changes[k] = v;
            });
            const n = Object.keys(changes).length;
            if (!n) { init(root, false); UI.toast(E(t("config.noChange")), null, 4); return; }
            if (!Store.updateOrg(changes)) { q("#cfMessage").className = "error"; q("#cfMessage").textContent = t("config.refused"); return; }
            init(root, false);
            q("#cfMessage").className = "success";
            q("#cfMessage").textContent = t("config.savedN", { n });
            UI.toast("<strong>" + E(t("config.savedN", { n })) + "</strong><br><small>" + E(t("config.savedWhere")) + "</small>", null, 6);
        });
        if (q("#cfDefaults")) q("#cfDefaults").addEventListener("click", () => {
            if (!confirm(t("config.confirmDefaults"))) return;
            const def = Store.DEFAULT_ORG;
            root.querySelectorAll("[data-key]").forEach(f => {
                const v = def[f.dataset.key];
                if (f.dataset.type === "check") f.checked = !!v;
                else if (f.dataset.type === "percent") f.value = Math.round(v * 100);
                else if (f.dataset.type === "number") f.value = Math.round(v * 100) / 100;
                else f.value = v;
            });
            q("#cfMessage").className = "info";
            q("#cfMessage").textContent = t("config.defaultsShown");
        });
    }

    return { init };
})();
