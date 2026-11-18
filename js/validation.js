/* =============================================================
   validation.js — strict validation of imported data (Lot 1, 2.8)
   Pure functions: they read nothing from the device and write nothing.
     Validation.data(d)      → { errors: [code], warnings: [code] }
         checks a whole data file (full backup, raw or migrated): structure,
         types, unique identifiers, references, statuses, dates, consistency
         of decisions, rights, team rules. ERRORS make the file refused;
         WARNINGS (orphan data, unknown settings key, no manifest…) are shown
         in the preview but do not block a restore by a manager.
     Validation.settings(s)  → { errors, unknown, ignored, values }
         checks the personal settings of a personal backup: a closed list of
         keys with their type; the only thing a personal backup may restore.
   The lists of allowed values (roles, statuses, categories, permissions,
   default settings and rules) come from Store, Permissions and Segments at
   call time: nothing is copied here.
   ⚠️ This protects against mistakes and forged files handed to the
   application; it does not protect against someone who controls the browser
   (ARCHITECTURE.md, "Security limits").
   ============================================================= */

const Validation = (() => {
    "use strict";

    const DATE = /^\d{4}-\d{2}-\d{2}$/;
    const MAX_TS = 4102444800000;   /* 2100-01-01: no entry beyond */
    const isStr = v => typeof v === "string";
    const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
    const filled = v => isStr(v) && v.trim() !== "";
    const validDate = v => DATE.test(v) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;

    /* 3.2: arrangement of one dashboard view (display only) */
    const blockIds = v => Array.isArray(v) && v.length <= 40 && v.every(x => isStr(x) && /^[a-zA-Z0-9]{1,30}$/.test(x));
    const validLayout = p => isObj(p) && Object.keys(p).every(k => ["order", "hidden", "sizes"].indexOf(k) >= 0) &&
        (p.order === undefined || blockIds(p.order)) && (p.hidden === undefined || blockIds(p.hidden)) &&
        (p.sizes === undefined || (isObj(p.sizes) && Object.keys(p.sizes).length <= 40 &&
            Object.keys(p.sizes).every(k => /^[a-zA-Z0-9]{1,30}$/.test(k) && [3, 4, 6, 8, 12].indexOf(p.sizes[k]) >= 0)));

    /* Personal settings: ONE rule per key of Store.DEFAULT_SETTINGS (a test checks that none is missing) */
    const SETTINGS_RULES = {
        forgotReminderTime: v => v === "" || (isStr(v) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)),
        reminderDays: v => Array.isArray(v) && v.length <= 7 && v.every(n => Number.isInteger(n) && n >= 0 && n <= 6),
        vibration: v => typeof v === "boolean",
        notifications: v => typeof v === "boolean",
        favoriteClients: v => Array.isArray(v) && v.length <= 500 && v.every(x => isStr(x) && x.length <= 80),
        startPage: v => v === "" || (isStr(v) && /^[a-z]{1,20}$/.test(v)),   /* 3.0: page opened after sign-in */
        navOrder: v => Array.isArray(v) && v.length <= 20 && v.every(x => isStr(x) && /^[a-z]{1,20}$/.test(x)),   /* 3.1 */
        navHidden: v => Array.isArray(v) && v.length <= 20 && v.every(x => isStr(x) && /^[a-z]{1,20}$/.test(x)),
        menuSide: v => v === "left" || v === "right",
        theme: v => v === "auto" || v === "light" || v === "dark",
        introDone: v => typeof v === "boolean",   /* 3.3 */
        dashLayout: v => isObj(v) && Object.keys(v).length <= 8 && Object.keys(v).every(view => /^[a-z]{1,20}$/.test(view) && validLayout(v[view])),   /* 3.2 */
        reportExport: v => isObj(v) && (v.format === undefined || v.format === "pdf" || v.format === "xlsx") &&   /* 4.4 */
            (v.team === undefined || v.team === "each" || v.team === "table") && (v.lang === undefined || (isStr(v.lang) && /^[a-z]{2}$/.test(v.lang))) &&
            (v.parts === undefined || (isObj(v.parts) && Object.keys(v.parts).length <= 10 && Object.keys(v.parts).every(k => /^[a-z]{1,20}$/.test(k) && typeof v.parts[k] === "boolean")))
    };

    function settings(raw) {
        const out = { errors: [], unknown: [], ignored: [], values: {} };
        if (raw === undefined || raw === null) return out;
        if (!isObj(raw)) { out.errors.push("settings.notObject"); return out; }
        Object.keys(raw).forEach(k => {
            if (Object.prototype.hasOwnProperty.call(SETTINGS_RULES, k)) {
                if (SETTINGS_RULES[k](raw[k])) out.values[k] = raw[k];
                else out.errors.push("settings.badValue:" + k);
            } else if (Store.LEGACY_SETTINGS_KEYS.indexOf(k) >= 0) out.ignored.push(k);   /* removed in 2.2 / 2.4: harmless */
            else out.unknown.push("settings.unknownKey:" + k);
        });
        return out;
    }

    function data(d) {
        const errors = [], warnings = [];
        const err = c => { if (errors.indexOf(c) < 0) errors.push(c); };
        const warn = c => { if (warnings.indexOf(c) < 0) warnings.push(c); };
        if (!isObj(d)) { err("root.notObject"); return { errors, warnings }; }

        /* ---- sections and users ---- */
        const sectionIds = new Set();
        if (!Array.isArray(d.sections)) err("sections.notArray");
        else d.sections.forEach((s, i) => {
            if (!isObj(s) || !filled(s.id) || !filled(s.name)) return err("section.bad:" + i);
            if (sectionIds.has(s.id)) err("section.duplicateId:" + s.id);
            sectionIds.add(s.id);
        });
        const users = Array.isArray(d.users) ? d.users : (err("users.notArray"), []);
        const userIds = new Set();
        users.forEach((u, i) => {
            if (!isObj(u)) return err("user.notObject:" + i);
            const who = filled(u.name) ? u.name : String(u.id || i);
            if (!filled(u.id) || u.id.length > 80) err("user.badId:" + i);
            else if (userIds.has(u.id)) err("user.duplicateId:" + u.id);
            else userIds.add(u.id);
            if (!filled(u.name) || u.name.length > 120) err("user.badName:" + who);
            if (Store.ROLES.indexOf(u.role) < 0) err("user.badRole:" + who);
            if ("accountStatus" in u && ["active", "disabled"].indexOf(u.accountStatus) < 0) err("user.badAccountStatus:" + who);
            if ("sectionIds" in u && (!Array.isArray(u.sectionIds) || u.sectionIds.some(s => !isStr(s) || !sectionIds.has(s)))) err("user.badSections:" + who);
            ["allSections", "clockRequired"].forEach(k => { if (k in u && typeof u[k] !== "boolean") err("user.badFlag:" + k + ":" + who); });
            if ("pinHash" in u && !isStr(u.pinHash)) err("user.badPassword:" + who);
            if ("hireDate" in u && u.hireDate !== "" && !(isStr(u.hireDate) && validDate(u.hireDate))) err("user.badHireDate:" + who);
            ["awayFrom", "awayTo"].forEach(k => { if (k in u && u[k] !== "" && !(isStr(u[k]) && validDate(u[k]))) err("user.badAway:" + who); });   /* 3.0 */
            if ("leaveDate" in u && u.leaveDate !== "" && !(isStr(u.leaveDate) && validDate(u.leaveDate))) err("user.badLeaveDate:" + who);   /* 4.5 */
            if ("contracts" in u && !(Array.isArray(u.contracts) && u.contracts.length <= 30 && u.contracts.every(c => isObj(c) && isStr(c.from) && validDate(c.from) &&
                typeof c.weeklyHours === "number" && c.weeklyHours > 0 && c.weeklyHours <= 60 && typeof c.normalHours === "number" && c.normalHours >= 0 && c.normalHours <= c.weeklyHours &&
                (c.workDays === 5 || c.workDays === 6)))) err("user.badContracts:" + who);
            ["email", "phone", "unlockAskedAt"].forEach(k => { if (k in u && !isStr(u[k])) err("user.badContact:" + who); });   /* 4.3 */
        });
        if (!users.some(u => isObj(u) && (u.role === "quality" || u.role === "director") && u.accountStatus !== "disabled")) err("users.noActiveAdmin");

        /* ---- data of each account ---- */
        const categories = Segments.CATEGORIES.map(c => c.key);
        const entryIds = new Set(), requestIds = new Set();
        const pu = isObj(d.perUser) ? d.perUser : (err("perUser.notObject"), {});
        Object.keys(pu).forEach(id => {
            if (!userIds.has(id)) warn("data.orphan:" + id);
            const x = pu[id];
            if (!isObj(x)) return err("perUser.bad:" + id);
            if ("settings" in x) {
                const s = settings(x.settings);
                s.errors.forEach(c => err(c + ":" + id));
                s.unknown.forEach(c => warn(c + ":" + id));   /* unknown key: harmless in a full backup, refused in a personal one */
            }
            (Array.isArray(x.entries) ? x.entries : (x.entries === undefined ? [] : (err("entries.notArray:" + id), []))).forEach(e => {
                if (!isObj(e) || !filled(e.id)) return err("entry.badId:" + id);
                if (entryIds.has(e.id)) err("entry.duplicateId:" + e.id);
                entryIds.add(e.id);
                if (categories.indexOf(e.category) < 0) err("entry.badCategory:" + e.id);
                if (!Number.isFinite(e.start) || e.start < 0 || e.start > MAX_TS) err("entry.badStart:" + e.id);
                else if (e.end != null && (!Number.isFinite(e.end) || e.end < e.start || e.end > MAX_TS)) err("entry.badEnd:" + e.id);
            });
            (Array.isArray(x.requests) ? x.requests : (x.requests === undefined ? [] : (err("requests.notArray:" + id), []))).forEach(r => {
                if (!isObj(r) || !filled(r.id)) return err("request.badId:" + id);
                if (requestIds.has(r.id)) err("request.duplicateId:" + r.id);
                requestIds.add(r.id);
                if (Store.REQUEST_TYPES.indexOf(r.type) < 0) err("request.badType:" + r.id);
                if (Store.REQUEST_STATUSES.indexOf(r.status) < 0) err("request.badStatus:" + r.id);
                if (!isStr(r.startDate) || !isStr(r.endDate) || !validDate(r.startDate) || !validDate(r.endDate) || r.endDate < r.startDate) err("request.invalidDates:" + r.id);
                /* a decision needs its author and its date — except history imported from the managers' register */
                if ((r.status === "approved" || r.status === "rejected") && r.imported !== true && !(filled(r.decidedBy) && filled(r.decidedAt))) err("request.undecided:" + r.id);
                if ("history" in r && (!Array.isArray(r.history) || r.history.some(h => !isObj(h) || Store.REQUEST_STATUSES.indexOf(h.to) < 0 || !isStr(h.at)))) err("request.badHistory:" + r.id);
            });
        });
        users.forEach(u => { if (isObj(u) && filled(u.id) && !(u.id in pu)) warn("user.noData:" + (u.name || u.id)); });

        /* ---- shared collections ---- */
        const list = (key, fn) => {
            if (d[key] === undefined) return;
            if (!Array.isArray(d[key])) return err(key + ".notArray");
            const seen = new Set();
            d[key].forEach((x, i) => {
                if (!isObj(x) || !filled(x.id)) return err(key + ".badItem:" + i);
                if (seen.has(x.id)) err(key + ".duplicateId:" + x.id);
                seen.add(x.id);
                fn(x);
            });
        };
        list("clients", c => { if (!filled(c.name) || ("lines" in c && (!Array.isArray(c.lines) || c.lines.some(l => !isStr(l))))) err("clients.badItem:" + c.id); });
        list("grants", g => {
            if (!userIds.has(g.userId)) err("grant.unknownUser:" + g.id);
            if (Permissions.ALL.indexOf(g.permission) < 0) err("grant.badPermission:" + g.id);
            if (["permanent", "temporary"].indexOf(g.kind) < 0) err("grant.badKind:" + g.id);
            if (!isStr(g.start) || !validDate(g.start)) err("grant.badStart:" + g.id);
            else if (g.kind === "temporary" && (!isStr(g.end) || !validDate(g.end) || g.end < g.start)) err("grant.badEnd:" + g.id);
            if (g.revokedAt !== null && g.revokedAt !== undefined && !isStr(g.revokedAt)) err("grant.badRevocation:" + g.id);
        });
        list("accessRequests", r => {
            if (!userIds.has(r.userId)) err("accessRequest.unknownUser:" + r.id);
            if (Permissions.ALL.indexOf(r.permission) < 0) err("accessRequest.badPermission:" + r.id);
            if (["pending", "info_requested", "approved", "rejected"].indexOf(r.status) < 0) err("accessRequest.badStatus:" + r.id);
        });
        list("correctionRequests", r => {
            if (!userIds.has(r.userId)) err("correctionRequest.unknownUser:" + r.id);
            if (["open", "done", "rejected"].indexOf(r.status) < 0) err("correctionRequest.badStatus:" + r.id);
            if (!isStr(r.date) || !validDate(r.date)) err("correctionRequest.badDate:" + r.id);
        });
        list("leaveMovements", () => {});
        list("weekValidations", r => {
            if (!userIds.has(r.userId)) err("weekValidation.unknownUser:" + r.id);
            if (Store.WEEK_STATUSES.indexOf(r.status) < 0) err("weekValidation.badStatus:" + r.id);
            if (!Number.isInteger(r.year) || !Number.isInteger(r.week) || r.week < 1 || r.week > 53) err("weekValidation.badWeek:" + r.id);
            if (r.status === "locked" && !(filled(r.lockedBy) && isStr(r.lockedAt))) err("weekValidation.unlocked:" + r.id);
        });
        list("audit", a => { if (!isStr(a.at) || !filled(a.action) || (a.by !== undefined && !isStr(a.by))) err("audit.badItem:" + a.id); });
        list("notifications", n => { if (!filled(n.userId) || !isStr(n.at) || !filled(n.type)) err("notification.badItem:" + n.id); });

        /* ---- team rules: same type as the default of each rule ---- */
        if (d.org !== undefined) {
            if (!isObj(d.org)) err("org.notObject");
            else Object.keys(Store.DEFAULT_ORG).forEach(k => {
                if (!(k in d.org)) return;
                const def = Store.DEFAULT_ORG[k], v = d.org[k];
                if (typeof v !== typeof def || (typeof v === "number" && !Number.isFinite(v))) err("org.badValue:" + k);
            });
        }
        return { errors, warnings };
    }

    return { data, settings };
})();
