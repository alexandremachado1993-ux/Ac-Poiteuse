/* =============================================================
   store.js — the ONLY storage layer of the application
   ---------------------------------------------------------------
   Today: everything stays on the device (localStorage, one key),
   with SEVERAL ACCOUNTS (demo mode, like CONGER PAYER's user list).
   Later: internal server (IIS) / CONGER PAYER. This file is the
   ONLY one to replace; the rest of the app only calls its API.

   Data (key acp_data_v3):
     users[]   : id, name, jobTitle, hireDate, entity, role ("technician" |
                 "admin"), language, pinHash, active
     requests  : type "paid_leave" | "time_off" | "other" (2.6: other
                 absence, shown in the calendar, NO effect on any calculation)
     clients[] : shared by every account on the device
     perUser   : { [userId]: { settings, entries, requests, lastBackupAt } }
     org       : team rules set by administrators (2.4)

   "Current user" = the signed-in account. profile(), entries(),
   requests(), settings()… always work on the current user. Admin
   screens read another account with withUser(id, fn).

   Rules:
   - every action is written immediately;
   - unreadable content is NEVER overwritten: it is copied to a
     backup key before starting from an empty state;
   - entries carry `synced:false` until a server has received them;
   - two open tabs stay consistent ("storage" event);
   - older data is converted on first start: version 1 (French,
     acp_donnees_v1) and version 2 (single profile, acp_data_v2);
     old keys are left untouched as safety copies;
   - the accounts requested for the team are created automatically
     (SEED_USERS) without a password: each person chooses it at the
     first sign-in, as in CONGER PAYER.
   ============================================================= */

const Store = (() => {
    "use strict";

    const KEY = "acp_data_v5";
    const KEY_V4 = "acp_data_v4";
    const KEY_V3 = "acp_data_v3";
    const KEY_V2 = "acp_data_v2";
    const KEY_V1 = "acp_donnees_v1";
    const KEY_UNREADABLE = "acp_data_unreadable";
    const FORMAT_VERSION = 5;
    const BACKUP_PREFIX = "acp_backup_before_v5_";   /* copy of the older data, verified before migrating */

    /* PERSONAL settings (each account) */
    const DEFAULT_SETTINGS = {
        forgotReminderTime: "",       /* "HH:MM": reminder if nothing clocked by then ("" = off) */
        reminderDays: [1, 2, 3, 4, 5],
        vibration: true,
        notifications: false,
        favoriteClients: [],          /* ids of the clients starred by the person (clock screen, 10/11/2026) */
        startPage: "",                /* 3.0: page opened after sign-in ("" = the first page of the menu) */
        /* 3.1: display chosen by each person */
        navOrder: [],                 /* order of the menu tabs (page keys; missing ones keep the default order) */
        navHidden: [],                /* tabs hidden from the menu (never the dashboard nor the settings) */
        menuSide: "left",             /* side menu on the "left" or on the "right" (computer); bottom bar on small screens */
        theme: "auto",                /* "auto" (device) | "light" | "dark" */
        /* 3.2: arrangement of the dashboard per view ("me", "lead", "quality", "director"):
           { order: [block ids], hidden: [block ids], sizes: { id: width in twelfths } } — display only (layout.js) */
        dashLayout: {},
        introDone: false,             /* 3.3: first sign-in presentation seen (welcome.js) */
        reportExport: {}              /* 4.4: last choices of the report export window (page-reports.js) */
    };

    /* TEAM rules (2.4): set by administrators, the same for every account
       of the device. Read by hours.js, segments.js and reminders.js. */
    const DEFAULT_ORG = {
        weeklyBase: 39,               /* contract: 35 h + 4 h paid at +25 % */
        /* 3.0: value of a credited day like the managers' register "OK": 39 h ÷ 5 = 7.8 h,
           Monday → Friday only (2.5 → 2.9.1: 39 ÷ 7 every day — option creditWeekdaysOnly = false) */
        dayHours: 7.8,
        creditWeekdaysOnly: true,
        overtime25From: 39,           /* overtime counter 25 % from the 40th hour… */
        overtime50From: 43,           /* …counter 50 % from the 44th hour */
        nightStart: 21,               /* night period 21:00 → 06:00 */
        nightEnd: 6,
        nightRate: 0.25,              /* premiums added to the total, like the register */
        holidayRate: 0.5,
        absenceWorkedRate: 0.5,       /* hours worked on a day of approved leave / time off (urgent call-out, 10/11/2026): the day stays credited and taken */
        weekendHolidays: false,       /* holidays falling on a Saturday or Sunday credited too? (register "OK": no) */
        countShortBreaks: false,      /* short breaks counted as working time? */
        autoStopTime: "",             /* "HH:MM": automatic stop ("" = off) */
        longTimerAlertH: 10,          /* alert if a timer runs longer than X h (0 = off) */
        breakReminderH: 6,            /* break reminder after X h of continuous work (0 = off) */
        /* ---- Contract & monthly reference (2.8): FIXED, never recalculated per month ---- */
        normalWeeklyHours: 35,        /* normal hours in the 39 h */
        habitualOvertimeHours: 4,     /* habitual overtime INCLUDED in the 39 h */
        habitualOvertimeRate: 0.25,   /* rate of the habitual overtime */
        /* monthly reference = weeklyBase × 52 / 12 = 169 h (computed, see hours.js) */
        /* ---- Paid leave ---- */
        /* 3.1 (12/11/2026): leave counted Monday → Friday ("monFri"; French law: "jours ouvres"),
           a week = 5 days, 25 days a year (25 ÷ 12 a month) — the legal equivalent of 30 days
           counted Monday → Saturday. Option "monSat" (jours ouvrables): 2.5 days a month. */
        leaveDayMode: "monFri",
        leaveDaysPerMonth: 25 / 12,
        leaveAcquisitionStart: "05-01", /* "MM-DD" start of the acquisition period, May → May (10/11/2026); "" = since the hire date, no reset */
        leaveCarryOverRule: "",       /* TO CONFIRM (HR): carry-over is not invented; "" = none applied automatically */
        leaveRounding: "none",        /* "none" | "half-up" (round up to the half day): TO CONFIRM */
        leaveHolidaysCounted: false,  /* a public holiday inside a leave period is NOT counted as a leave day */
        rttEnabled: false,            /* no RTT (decision of 04/11/2026); kept as an option */
        /* ---- Home work day (information of 05/11/2026) ---- */
        homeDayPreset: false,         /* 3.1: false = "Home" is clocked like any activity; true = fixed day declared in one tap */
        homeWorkHours: 7,             /* a home work day counts 7 h, at most (35 h basis) */
        homeDayStart: "08:00",        /* start of the declared day */
        homeLunchMinutes: 60,         /* lunch recorded with the day (not paid) */
        homeReducesHabitual: true,    /* home day on the 35 h basis: the week goal loses (39 − 35) ÷ 5 = 0 h 48 */
        /* ---- Clocking safety (10/11/2026) ---- */
        undoSeconds: 10,              /* "Undo" offered for X s after a clocking action (0 = off) */
        nightCountdown: true,         /* 10 s countdown before the night period; no answer = departure at nightStart */
        weekClosureRequired: true,    /* the previous week must be reviewed and SENT before clocking in a new one */
        /* ---- 3.0: hours computed like the managers' register "OK" (rules 11.1 → 11.8, defaults = register) ---- */
        hoursMethod: "register",      /* "register" (sheet "OK") | "countdown" (2.9.1: weekly balance carried, credit at 1 h) */
        overtimeRecoveryRate: 0.25,   /* every hour above the week goal is valued × 1.25 */
        overtime50InRecovery: false,  /* 11.2: hours above the 43rd valued × 1.5 instead of × 1.25 */
        negativeWeeks: "zero",        /* 11.3: a week under the goal counts 0 ("zero") or its shortfall is deducted ("carry") */
        timeOffReducesGoal: false,    /* 11.4: a day of time off lowers the week goal by dayHours */
        leaveReducesGoal: false,      /* 11.5: a day of paid leave lowers the week goal by dayHours */
        premiumsBeforeOvertime: true, /* 11.6: night / holiday premiums added to the hours before the × 1.25 */
        paidOvertimeFromWeek: 22,     /* 11.7: weeks whose overtime is PAID, not banked (0 = none) */
        paidOvertimeToWeek: 39,
        sundayRate: 1,                /* 10.7: Sunday hours worked exceptionally, + 100 % (agreement art. 146), separate counter */
        /* ---- 3.0: leave (decisions of 10/11/2026, open points = proposals) ---- */
        leaveSingleDecision: true,    /* 10.1: the first decision of the team lead, the quality manager or the director is final */
        calendarForTechnicians: "none", /* 10.2: "none" | "noReason" | "withReason" */
        leaveNoticeShort: 2,          /* 1 day of leave → asked 2 days ahead */
        leaveNoticeMid: 7,            /* 10.4: 2 to 5 days → 1 week ahead */
        leaveNoticeLong: 14,          /* more than 5 days → 2 weeks ahead */
        leaveNoticeBlocks: false,     /* 10.5: a late request is only flagged (true = refused) */
        idleLogoutMinutes: 15,        /* 3.0: automatic sign-out after 15 min without any action (0 = off) */
        rulesVersion: 31              /* version of the rule defaults (migration of older values) */
    };
    const TEAM_KEYS_IN_SETTINGS = ["countShortBreaks", "autoStopTime", "longTimerAlertH", "breakReminderH"];
    /* personal-settings keys removed in 2.2 / 2.4: an old personal backup may still hold them; harmless, ignored */
    const LEGACY_SETTINGS_KEYS = ["premiumInRecovery"].concat(TEAM_KEYS_IN_SETTINGS);
    /* 3.0: justified absence (sickness…), family event, training; "other" needs a comment.
       Only paid_leave and time_off move a balance or credit hours. */
    const REQUEST_TYPES = ["paid_leave", "time_off", "justified", "family_event", "training", "other"];

    /* Same fields as a CONGER PAYER user, in English (mapping in README). */
    /* role = permissions; sectionIds / allSections = data perimeter;
       accountStatus and clockRequired are separate (mission part 3.5) */
    /* 4 hierarchical roles (06/11/2026); the old "admin" is converted by migrateTo5 */
    const ROLES = ["technician", "team_lead", "quality", "director", "it_admin"];
    const DEFAULT_USER = { id: "", name: "", jobTitle: "", hireDate: "", entity: "france", role: "technician", language: "", pinHash: "",
        accountStatus: "active", sectionIds: [], allSections: false, clockRequired: false, awayFrom: "", awayTo: "",
        email: "", phone: "", unlockAskedAt: "",
        leaveDate: "", contracts: [] };   /* 4.5: leaving date; contracts [{ from, weeklyHours, normalHours, workDays }] (hours.js: annual target) */   /* 4.3: contact for the future e-mail / SMS codes; pending unlock request */

    /* Initial sections (editable by administrators) */
    const SEED_SECTIONS = [{ id: "sec-nord", name: "Nord" }, { id: "sec-sud", name: "Sud" }];

    /* Reference accounts (mission 2.8), created if missing, no password.
       Names are NOT used by any authorisation rule (permissions.js). */
    const SEED_USERS = [
        { name: "Alexandre Machado", jobTitle: "Technicien", role: "technician", hireDate: "2026-05-04", sectionIds: ["sec-sud"], clockRequired: true },
        { name: "Damien Morvan", jobTitle: "Technicien", role: "technician", hireDate: "", sectionIds: ["sec-nord"], clockRequired: true },
        { name: "Enrique Soler", jobTitle: "Chef d'équipe", role: "team_lead", hireDate: "", sectionIds: ["sec-nord", "sec-sud"] },
        { name: "Yann Lefloc'h", jobTitle: "Responsable Qualité", role: "quality", hireDate: "", allSections: true },
        { name: "Jérémie Augé", jobTitle: "Responsable Commercial France & PDG", role: "director", hireDate: "", allSections: true }
    ];

    let data = null;
    let current = "";           /* id of the signed-in account */
    let listeners = [];
    let readFailed = false;
    let batchDepth = 0;
    let batchChanged = false;

    const copy = o => JSON.parse(JSON.stringify(o));
    /* Name comparison ignoring case, accents, spaces and apostrophes */
    const nameKey = n => Utils.simplify(n).replace(/[^a-z]/g, "");

    function emptyUserData() {
        return { settings: Object.assign({}, DEFAULT_SETTINGS), entries: [], requests: [], lastBackupAt: null, lastImport: null };
    }

    function empty() {
        return { version: FORMAT_VERSION, deviceId: Utils.uid("dev"), org: Object.assign({}, DEFAULT_ORG),
            sections: SEED_SECTIONS.map(x => Object.assign({}, x)), users: [], clients: [], perUser: {},
            grants: [], accessRequests: [], correctionRequests: [], leaveMovements: [], audit: [], notifications: [], weekValidations: [] };
    }

    const COLLECTIONS = ["grants", "accessRequests", "correctionRequests", "leaveMovements", "audit", "notifications", "weekValidations"];

    /* User from any version: "active" (≤ 2.7) becomes accountStatus; old roles kept */
    function normaliseUser(x) {
        const u = Object.assign({}, DEFAULT_USER, x);
        if ("active" in u) { if (!x.accountStatus) u.accountStatus = u.active === false ? "disabled" : "active"; delete u.active; }
        if (ROLES.indexOf(u.role) < 0 && u.role !== "admin") u.role = "technician";   /* "admin": converted by migrateTo5 */
        u.sectionIds = Array.isArray(u.sectionIds) ? u.sectionIds : [];
        u.allSections = !!u.allSections;
        u.clockRequired = !!u.clockRequired;
        u.contracts = Array.isArray(x.contracts) ? x.contracts : [];   /* 4.5: never the shared default array */
        return u;
    }

    function normaliseUserData(raw) {
        const base = emptyUserData();
        const settings = Object.assign(base.settings, (raw && raw.settings) || {});
        delete settings.premiumInRecovery;   /* removed in 2.2 */
        TEAM_KEYS_IN_SETTINGS.forEach(k => { delete settings[k]; });   /* team rules since 2.4 (data.org) */
        return {
            settings,
            entries: raw && Array.isArray(raw.entries) ? raw.entries : [],
            /* leave circuit (06/11/2026): the former "pending" becomes "waiting for the team lead" */
            requests: raw && Array.isArray(raw.requests) ? raw.requests.map(r => Object.assign({ history: [] }, r,
                r.status === "pending" ? { status: "pending_lead" } : {})) : [],
            lastBackupAt: (raw && raw.lastBackupAt) || null,
            lastImport: raw && raw.lastImport && typeof raw.lastImport === "object" ? raw.lastImport : null   /* 4.5.1: last Excel register import */
        };
    }

    function normalise(raw) {
        const out = empty();
        if (!raw || typeof raw !== "object") return out;
        out.users = Array.isArray(raw.users) ? raw.users.map(normaliseUser) : [];
        out.clients = Array.isArray(raw.clients) ? raw.clients : [];
        out.deviceId = raw.deviceId || out.deviceId;
        out.sections = Array.isArray(raw.sections) && raw.sections.length ? raw.sections : out.sections;
        COLLECTIONS.forEach(k => { out[k] = Array.isArray(raw[k]) ? raw[k] : []; });
        const pu = raw.perUser && typeof raw.perUser === "object" ? raw.perUser : {};
        /* Team rules: kept when present; before 2.4 some lived in the personal
           settings: take them from the first account that had them. */
        out.org = Object.assign({}, DEFAULT_ORG, raw.org || {});
        /* 2.5: rule "saturdayHolidayReduces" renamed (weekend holidays), and the
           value of a day goes from 7.8 h (39 ÷ 5) to 39 ÷ 7 when it was the old default */
        if (raw.org && !raw.org.rulesVersion) {
            if ("saturdayHolidayReduces" in raw.org) out.org.weekendHolidays = raw.org.saturdayHolidayReduces !== false;
            if (Math.abs((raw.org.dayHours || 0) - 7.8) < 1e-9) out.org.dayHours = 39 / 7;
            out.org.rulesVersion = 28;
        }
        /* 3.0: the managers' register "OK" becomes the reference — the old DEFAULTS move
           (a value changed by a manager is kept); every new rule takes its default */
        if (raw.org && (Number(out.org.rulesVersion) || 0) < 30) {
            if (Math.abs(out.org.dayHours - 39 / 7) < 1e-9) out.org.dayHours = 7.8;
            if (raw.org.weekendHolidays === true || !("weekendHolidays" in raw.org)) out.org.weekendHolidays = false;
            if (!raw.org.leaveAcquisitionStart) out.org.leaveAcquisitionStart = "05-01";
            out.org.rulesVersion = 30;
        }
        /* 3.1: leave counted Monday → Friday — the old default 2.5 becomes 25 ÷ 12 (same 5 weeks a year) */
        if (raw.org && (Number(out.org.rulesVersion) || 0) < 31) {
            if (!("leaveDayMode" in raw.org) && Math.abs((Number(raw.org.leaveDaysPerMonth) || 2.5) - 2.5) < 1e-9) out.org.leaveDaysPerMonth = 25 / 12;
            else if (!("leaveDayMode" in raw.org)) out.org.leaveDayMode = "monSat";   /* a custom rate keeps the old counting */
            out.org.rulesVersion = 31;
        }
        delete out.org.saturdayHolidayReduces;
        /* 3.2: English values of the leave counting (3.1 stored the French words) */
        if (out.org.leaveDayMode === "ouvres") out.org.leaveDayMode = "monFri";
        if (out.org.leaveDayMode === "ouvrables") out.org.leaveDayMode = "monSat";
        if (!raw.org) {
            const withRules = out.users.map(x => (pu[x.id] || {}).settings).find(st => st && TEAM_KEYS_IN_SETTINGS.some(k => k in st));
            if (withRules) TEAM_KEYS_IN_SETTINGS.forEach(k => { if (k in withRules) out.org[k] = withRules[k]; });
        }
        out.users.forEach(x => { out.perUser[x.id] = normaliseUserData(pu[x.id]); });
        return out;
    }

    /* ---------------- Conversion of older versions ---------------- */

    const V1_CATEGORIES = { travail: "work", trajet: "travel", reunion: "meeting", pause: "break", pause_dejeuner: "lunch", autre: "other" };
    const V1_TYPES = { conge_paye: "paid_leave", heure_recuperer: "time_off" };
    const V1_STATUSES = { en_attente: "pending", acceptee: "approved", refusee: "rejected" };

    function isV1(raw) {
        return !!raw && typeof raw === "object" && (Array.isArray(raw.pointages) || Array.isArray(raw.demandes) || !!raw.profil);
    }

    /* Version 1 (French) → version 2 shape (single profile) */
    function migrateV1(old) {
        const p = old.profil || {};
        const r = old.reglages || {};
        const settings = {};
        const map = { pauseComptee: "countShortBreaks", alerteChronoH: "longTimerAlertH",
            rappelPauseH: "breakReminderH", heureArretAuto: "autoStopTime", heureRappel: "forgotReminderTime",
            joursRappel: "reminderDays", vibration: "vibration", notifications: "notifications" };
        Object.keys(map).forEach(k => { if (k in r) settings[map[k]] = r[k]; });
        const oldEntry = x => x ? { category: V1_CATEGORIES[x.categorie] || "other", clientName: x.clientNom || "",
            line: x.ligne || "", note: x.note || "", start: x.debut, end: x.fin == null ? null : x.fin } : null;
        return {
            profile: { name: p.nom || "", hireDate: p.dateEmbauche || "", entity: p.entite || "france" },
            settings,
            clients: (old.clients || []).map(c => ({ id: c.id, name: c.nom || "", city: c.ville || "",
                lines: Array.isArray(c.lignes) ? c.lignes : [], createdAt: c.creeLe || null })),
            entries: (old.pointages || []).map(x => Object.assign(oldEntry(x), {
                id: x.id, clientId: x.clientId || "",
                manual: !!x.manuel, imported: !!x.importe, edited: !!x.modifie, toCheck: !!x.aVerifier,
                history: (x.historique || []).map(h => ({ at: h.le, before: oldEntry(h.avant) })),
                synced: !!x.synchronise
            })),
            requests: (old.demandes || []).map(d => ({ id: d.id, type: V1_TYPES[d.type] || "paid_leave",
                startDate: d.dateDebut, endDate: d.dateFin, comment: d.commentaire || "",
                status: V1_STATUSES[d.statut] || "pending", imported: !!d.importee, createdAt: d.creeLe || null })),
            lastBackupAt: old.derniereSauvegarde || null
        };
    }

    /* Version 2 (single profile) → version 3 (accounts) */
    function migrateV2(v2) {
        const out = empty();
        out.clients = Array.isArray(v2.clients) ? v2.clients : [];
        const p = v2.profile || {};
        const hasData = (v2.entries || []).length || (v2.requests || []).length;
        if (p.name || hasData) {
            const id = p.id || Utils.uid("us");
            out.users.push(Object.assign({}, DEFAULT_USER, {
                id, name: p.name || SEED_USERS[0].name, hireDate: p.hireDate || "", entity: p.entity || "france",
                role: "technician", language: p.language || "", pinHash: p.pinHash || ""
            }));
            const st = v2.settings || {};
            TEAM_KEYS_IN_SETTINGS.forEach(k => { if (k in st) out.org[k] = st[k]; });
            out.perUser[id] = normaliseUserData(v2);
        }
        return out;
    }

    /* Same person whatever the spelling ("Yann Le Floc'h" = "Yann Lefloc'h") */
    const isSeed = (u, seedIndex) => {
        const k = nameKey(u.name);
        return k === nameKey(SEED_USERS[seedIndex].name) || (seedIndex === 0 && k.startsWith("alexandre"));
    };

    function seedUsers() {
        let changed = false;
        SEED_USERS.forEach((seed, i) => {
            if (data.users.some(x => isSeed(x, i))) return;
            const id = Utils.uid("us");
            data.users.push(normaliseUser(Object.assign({}, seed, { id })));
            data.perUser[id] = emptyUserData();
            changed = true;
        });
        return changed;
    }

    /* ---------------- Migration to version 4 (2.8) ----------------
       Applies the reference organisation of the mission to the existing
       accounts (roles, sections, clocking obligation, job titles), converts
       the leave rule to Monday → Saturday counting, and records everything in the audit. */
    function migrateTo4(v3, from) {
        const out = normalise(v3);
        const anomalies = [];
        const changes = [];
        const o = out.org;
        if (v3.org && "leaveDaysPerYear" in v3.org) {
            if (Number(v3.org.leaveDaysPerYear) !== 25) anomalies.push("leaveDaysPerYear=" + v3.org.leaveDaysPerYear + " replaced by 2.5 days/month (mission 2.8)");
            delete o.leaveDaysPerYear;
        }
        o.leaveDaysPerMonth = 2.5;
        o.rulesVersion = DEFAULT_ORG.rulesVersion;
        out.users.forEach(u => {
            const i = SEED_USERS.findIndex((seed, j) => isSeed(u, j));
            const before = { name: u.name, role: u.role, sectionIds: u.sectionIds, allSections: u.allSections, clockRequired: u.clockRequired, jobTitle: u.jobTitle };
            if (i >= 0) {
                const seed = SEED_USERS[i];
                u.name = seed.name;
                u.role = seed.role;
                u.sectionIds = (seed.sectionIds || []).slice();
                u.allSections = !!seed.allSections;
                u.clockRequired = !!seed.clockRequired;
                if (!u.jobTitle) u.jobTitle = seed.jobTitle;
            } else {
                if (u.role === "technician") u.clockRequired = true;
                if (u.role === "admin" || u.role === "quality" || u.role === "director") u.allSections = true;
                if (!u.allSections && !u.sectionIds.length) anomalies.push("no section: " + u.name);
            }
            const after = { name: u.name, role: u.role, sectionIds: u.sectionIds, allSections: u.allSections, clockRequired: u.clockRequired, jobTitle: u.jobTitle };
            if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ userId: u.id, before, after });
        });
        out.version = FORMAT_VERSION;
        const at = new Date().toISOString();
        changes.forEach(c => out.audit.push({ id: Utils.uid("au"), at, by: "", action: "user.migrated", target: c.userId, before: c.before, after: c.after, reason: "migration v" + from + " → v4" }));
        out.audit.push({ id: Utils.uid("au"), at, by: "", action: "data.migrated", target: "v" + from, before: null, after: { version: 4 },
            reason: anomalies.length ? anomalies.join(" | ") : "" });
        return out;
    }

    /* ---------------- Migration to version 5 (06/11/2026) ----------------
       Splits the old "admin" role into "quality" (quality manager: control,
       corrections, operational administration) and "director" (CEO / sales manager
       France: steering). Converts permission names in grants and access requests to
       the new matrix. Every change is traced in the audit trail. */
    function migrateTo5(v4, from) {
        const out = normalise(v4);
        const changes = [];
        const directorIndex = SEED_USERS.findIndex(x => x.role === "director");
        out.users.forEach(u => {
            if (u.role !== "admin") return;
            const before = u.role;
            u.role = isSeed(u, directorIndex) ? "director" : "quality";
            u.allSections = true;
            changes.push({ userId: u.id, before, after: u.role });
        });
        const rename = p => (typeof Permissions !== "undefined" && Permissions.RENAMED[p]) || p;
        let renamed = 0;
        out.grants.forEach(g => { const n = rename(g.permission); if (n !== g.permission) { g.permission = n; renamed += 1; } });
        out.accessRequests.forEach(r => { const n = rename(r.permission); if (n !== r.permission) { r.permission = n; renamed += 1; } });
        out.version = FORMAT_VERSION;
        const at = new Date().toISOString();
        changes.forEach(c => out.audit.push({ id: Utils.uid("au"), at, by: "", action: "user.roleChanged", target: c.userId,
            before: { role: c.before }, after: { role: c.after }, reason: "migration v" + from + " → v5" }));
        out.audit.push({ id: Utils.uid("au"), at, by: "", action: "data.migrated", target: "v" + from, before: null, after: { version: 5 },
            reason: "roles: " + changes.length + " · permissions renamed: " + renamed });
        return out;
    }

    /* Integrity check: list of anomaly codes (errors then warnings; empty = sound).
       The rules live in validation.js, shared with the restore of a backup. */
    function verify(dd) {
        const r = Validation.data(dd || data);
        return r.errors.concat(r.warnings);
    }

    /* ---------------- Reading / writing ---------------- */

    let migrationReport = null;   /* { from, backupKey, backupVerified, anomalies } of the last migration */

    /* Copy of the older data under a backup key, READ BACK and compared.
       Returns the key, or "" when the copy could not be verified (the old
       key is kept intact anyway: a migration never writes over it). */
    function backupBeforeMigration(rawOld) {
        const key = BACKUP_PREFIX + new Date().toISOString().replace(/[:.]/g, "-");
        if (!StorageAdapter.set(key, rawOld)) return "";
        return StorageAdapter.get(key) === rawOld ? key : "";
    }

    function load() {
        let raw = null;
        try {
            raw = StorageAdapter.get(KEY);
            let migrated = false;
            if (raw) {
                data = normalise(JSON.parse(raw));
            } else {
                const v4 = StorageAdapter.get(KEY_V4);
                const v3 = StorageAdapter.get(KEY_V3);
                const v2 = StorageAdapter.get(KEY_V2);
                const v1 = StorageAdapter.get(KEY_V1);
                const rawOld = v4 || v3 || v2 || v1;
                if (rawOld) {
                    const from = v4 ? 4 : v3 ? 3 : v2 ? 2 : 1;
                    const backupKey = backupBeforeMigration(rawOld);                      /* 1-2. backup + check */
                    const parsed = JSON.parse(rawOld);
                    const v3shape = v4 || v3 ? parsed : v2 ? migrateV2(parsed) : migrateV2(migrateV1(parsed));
                    data = migrateTo5(v4 ? parsed : migrateTo4(v3shape, from), from);   /* 3. migrate */
                    seedUsers();
                    const anomalies = verify(data);                                      /* 4. check */
                    if (!backupKey) anomalies.unshift("backup.notVerified");
                    migrationReport = { from, backupKey, backupVerified: !!backupKey, anomalies };
                    data.audit.push({ id: Utils.uid("au"), at: new Date().toISOString(), by: "", action: "data.verified",   /* 5. report */
                        target: "v4", before: null, after: { anomalies: anomalies.length }, reason: anomalies.join(" | ") });
                    migrated = true;
                } else {
                    data = empty();
                }
            }
            if (seedUsers() || migrated) save();
            readFailed = false;
        } catch (e) {
            if (raw) StorageAdapter.set(KEY_UNREADABLE, raw);
            data = empty();
            seedUsers();
            readFailed = true;
        }
        if (current && !data.users.some(x => x.id === current)) current = "";
        return data;
    }

    function save() {
        if (batchDepth) { batchChanged = true; return true; }
        if (StorageAdapter.set(KEY, JSON.stringify(data))) return true;
        alert(I18n.t("store.saveFailed") + " " + I18n.t("store.quotaHint"));
        return false;
    }

    /* ---------------- Audit trail (2.8) ----------------
       Stored on the device with the data, included in the full backup. */
    function log(action, target, before, after, reason) {
        data.audit.push({ id: Utils.uid("au"), at: new Date().toISOString(), by: current, action, target: target || "",
            before: before === undefined ? null : before, after: after === undefined ? null : after, reason: reason || "" });
    }

    function auditTrail() { return copy(d().audit).sort((a, b) => b.at.localeCompare(a.at)); }

    /* Filtered audit (precision 4): { userId, from, to ("YYYY-MM-DD"), action
       (exact code or prefix ending with "."), text (searched in target,
       values and reason) } — newest first. Needs "audit.view". */
    function auditQuery(f) {
        if (!allowed("audit.view")) return [];
        const q = f || {};
        const text = q.text ? Utils.simplify(q.text) : "";
        return auditTrail().filter(a => {
            if (q.userId && a.by !== q.userId && a.target !== q.userId) return false;
            const day = a.at.slice(0, 10);
            if (q.from && day < q.from) return false;
            if (q.to && day > q.to) return false;
            if (q.action && !(a.action === q.action || (q.action.endsWith(".") && a.action.startsWith(q.action)))) return false;
            if (text && Utils.simplify(JSON.stringify([a.target, a.before, a.after, a.reason])).indexOf(text) < 0) return false;
            return true;
        });
    }

    function notify() {
        if (batchDepth) { batchChanged = true; return; }
        listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });
    }

    function onChange(fn) { listeners.push(fn); }

    /* Groups all writes of `fn`: one save and one refresh at the end. */
    function batch(fn) {
        batchDepth += 1;
        try { return fn(); }
        finally {
            batchDepth -= 1;
            if (!batchDepth && batchChanged) { batchChanged = false; save(); notify(); }
        }
    }

    if (typeof window !== "undefined") {
        window.addEventListener("storage", e => { if (e.key === KEY) { load(); notify(); } });
    }

    function d() {
        if (!data) load();
        return data;
    }

    /* Data of the current account (empty and never saved when nobody is signed in) */
    /* ACTOR vs SUBJECT (2.8): `current` is the signed-in person who ACTS (rights
       checks, author in the audit trail); `subject` is the person whose DATA is
       read or corrected (withUser). They differ when a manager corrects or
       consults a technician's hours. */
    let subject = "";
    const owner = () => subject || current;

    function u() {
        const db = d();
        const id = owner();
        if (!id) return emptyUserData();
        if (!db.perUser[id]) db.perUser[id] = emptyUserData();
        return db.perUser[id];
    }

    /* ---------------- Accounts ---------------- */

    const ROLE_ORDER = { technician: 0, team_lead: 1, quality: 2, director: 3, it_admin: 4 };

    function users() {
        return copy(d().users).sort((a, b) => (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]) || a.name.localeCompare(b.name, I18n.locale()));
    }

    function user(id) {
        const x = d().users.find(y => y.id === id);
        return x ? copy(x) : null;
    }

    function setCurrentUser(id) { current = d().users.some(x => x.id === id) ? id : ""; }
    function currentUserId() { return current; }

    /* Runs fn() with another account as current (admin screens, read only) */
    /* Runs fn on the DATA of another account; the actor (rights, audit) is unchanged */
    function withUser(id, fn) {
        const saved = subject;
        subject = id;
        try { return fn(); } finally { subject = saved; }
    }

    /* Returns the new account, or null when the name is empty or already used */
    function addUser(fields) {
        if (!allowed("employees.manage")) return null;
        const name = String(fields.name || "").trim();
        if (!name || d().users.some(x => nameKey(x.name) === nameKey(name))) return null;
        const role = ROLES.indexOf(fields.role) >= 0 ? fields.role : "technician";
        const created = normaliseUser({
            id: Utils.uid("us"), name, role, hireDate: fields.hireDate || "", jobTitle: String(fields.jobTitle || "").trim(),
            sectionIds: Array.isArray(fields.sectionIds) ? fields.sectionIds : [], allSections: role === "quality" || role === "director" || !!fields.allSections,
            clockRequired: "clockRequired" in fields ? !!fields.clockRequired : role === "technician"
        });
        d().users.push(created);
        d().perUser[created.id] = emptyUserData();
        log("user.created", created.id, null, { name, role, sectionIds: created.sectionIds });
        save(); notify();
        return copy(created);
    }

    /* administrators = accounts holding the account AND rights management (permissions.js) */
    const activeAdmins = () => d().users.filter(x => x.accountStatus !== "disabled" &&
        (typeof Permissions === "undefined" ? x.role === "quality" || x.role === "director" : Permissions.isAdministrator(x.id)));

    /* Returns true, or false when refused: empty / duplicate name, or the change
       would leave no active administrator (never lock everybody out). */
    function updateUser(id, fields) {
        if (!allowed("employees.manage")) return false;
        /* nobody changes their own role, status or perimeter (no self-escalation, no self-lockout) */
        if (current && id === current && ["role", "accountStatus", "active", "sectionIds", "allSections"].some(k => k in fields)) return false;
        return applyUserUpdate(id, fields);
    }

    function applyUserUpdate(id, fields) {
        const x = d().users.find(y => y.id === id);
        if (!x) return false;
        const before = copy(x);
        if ("name" in fields) {
            const name = String(fields.name || "").trim();
            if (!name || d().users.some(y => y.id !== id && nameKey(y.name) === nameKey(name))) return false;
            x.name = name;
        }
        if (("email" in fields && !validEmail(fields.email)) || ("phone" in fields && !validPhone(fields.phone))) return false;
        if ("leaveDate" in fields && fields.leaveDate && !/^\d{4}-\d{2}-\d{2}$/.test(fields.leaveDate)) return false;
        if ("contracts" in fields && !validContracts(fields.contracts)) return false;
        if ("contracts" in fields) x.contracts = fields.contracts.map(c => ({ from: c.from, weeklyHours: +c.weeklyHours, normalHours: +c.normalHours, workDays: +c.workDays }))
            .sort((a, b) => (a.from < b.from ? -1 : 1));
        ["jobTitle", "hireDate", "entity", "language", "pinHash", "email", "phone", "leaveDate"].forEach(k => { if (k in fields) x[k] = String(fields[k] == null ? "" : fields[k]).trim(); });
        /* the former "admin" (older screens or backups) becomes "quality" instead of being ignored */
        const role = fields.role === "admin" ? "quality" : fields.role;
        if ("role" in fields && ROLES.indexOf(role) >= 0) x.role = role;
        if ("active" in fields) x.accountStatus = fields.active === false ? "disabled" : "active";   /* 2.7 screens */
        if ("accountStatus" in fields) x.accountStatus = fields.accountStatus === "disabled" ? "disabled" : "active";
        if ("sectionIds" in fields) x.sectionIds = (fields.sectionIds || []).filter(sid => d().sections.some(sec => sec.id === sid));
        if ("allSections" in fields) x.allSections = !!fields.allSections;
        if ("clockRequired" in fields) x.clockRequired = !!fields.clockRequired;
        if (!activeAdmins().length) { Object.assign(x, before); return false; }
        const trace = ["name", "jobTitle", "hireDate", "role", "accountStatus", "sectionIds", "allSections", "clockRequired", "email", "phone", "leaveDate", "contracts"]
            .filter(k => JSON.stringify(before[k]) !== JSON.stringify(x[k]));
        if (trace.length) {
            const b = {}, a2 = {};
            trace.forEach(k => { b[k] = before[k]; a2[k] = x[k]; });
            log(trace.indexOf("role") >= 0 ? "user.roleChanged" : trace.indexOf("accountStatus") >= 0 ? "user.statusChanged" : "user.updated", id, b, a2, fields.reason);
        }
        if ("pinHash" in fields && before.pinHash && !fields.pinHash) log("user.passwordReset", id);
        save(); notify();
        return true;
    }

    /* ---------------- Sections (2.8): data perimeter, separate from roles ---------------- */
    function sections() { return copy(d().sections); }

    function addSection(name) {
        if (!allowed("employees.manage")) return null;
        const n = String(name || "").trim();
        if (!n || d().sections.some(x => nameKey(x.name) === nameKey(n))) return null;
        const created = { id: Utils.uid("sec"), name: n };
        d().sections.push(created);
        log("section.created", created.id, null, { name: n });
        save(); notify();
        return copy(created);
    }

    function renameSection(id, name) {
        if (!allowed("employees.manage")) return false;
        const sec = d().sections.find(x => x.id === id);
        const n = String(name || "").trim();
        if (!sec || !n || d().sections.some(x => x.id !== id && nameKey(x.name) === nameKey(n))) return false;
        log("section.renamed", id, { name: sec.name }, { name: n });
        sec.name = n;
        save(); notify();
        return true;
    }

    /* 4.1.7: a section is deleted only when nobody is attached to it any more (no orphan perimeter) */
    function removeSection(id) {
        if (!allowed("employees.manage")) return false;
        const sec = d().sections.find(x => x.id === id);
        if (!sec || d().users.some(u => (u.sectionIds || []).indexOf(id) >= 0)) return false;
        d().sections = d().sections.filter(x => x.id !== id);
        log("section.removed", id, { name: sec.name }, null);
        save(); notify();
        return true;
    }

    /* ---------------- Profile (current account) & settings ---------------- */

    function profile() {
        const x = d().users.find(y => y.id === owner());
        return copy(x || DEFAULT_USER);
    }

    /* Own profile: name, language and password for everybody; hire date and
       job title only with "employees.manage" (they drive the leave balance). */
    function updateProfile(fields) {
        if (!current) return false;
        const own = {};
        Object.keys(fields).forEach(k => {
            if (["name", "language", "pinHash", "email", "phone"].indexOf(k) >= 0 || (["hireDate", "jobTitle"].indexOf(k) >= 0 && allowed("employees.manage"))) own[k] = fields[k];
        });
        return Object.keys(own).length ? applyUserUpdate(current, own) : false;
    }

    /* Personal settings + the team rules used by the calculations */
    function settings() {
        const o = d().org;
        const team = {};
        TEAM_KEYS_IN_SETTINGS.forEach(k => { team[k] = o[k]; });
        return Object.assign(copy(u().settings), team);
    }

    function org() { return copy(d().org); }

    /* Team rules: "settings.manage" only; every change is traced. */
    function updateOrg(fields) {
        if (!current || !allowed("settings.manage")) return false;
        const changes = [];
        Object.keys(fields).forEach(k => {
            if (!(k in DEFAULT_ORG) || k === "rulesVersion" || JSON.stringify(d().org[k]) === JSON.stringify(fields[k])) return;
            log("setting.changed", k, d().org[k], fields[k]);
            changes.push({ k, b: d().org[k], a: fields[k] });
            d().org[k] = fields[k];
        });
        /* 3.0: every rule changed by a manager is announced to the technicians automatically */
        if (changes.length) notifyUsers(d().users.filter(x => x.accountStatus !== "disabled" && x.role === "technician").map(x => x.id),
            "rules.changed", { name: (user(current) || {}).name, rules: changes });
        save(); notify();
        return true;
    }

    function updateSettings(fields) {
        TEAM_KEYS_IN_SETTINGS.forEach(k => { delete fields[k]; });   /* team rules: updateOrg */
        Object.assign(u().settings, fields);
        save(); notify();
    }

    /* ---------------- Clients (shared) ---------------- */

    const clientKey = (name, city) => (String(name).trim() + "|" + String(city || "").trim()).toLowerCase();

    function cleanLines(lines) {
        const seen = new Set();
        return (lines || []).map(l => String(l).trim()).filter(l => {
            const k = l.toLowerCase();
            if (!l || seen.has(k)) return false;
            seen.add(k); return true;
        });
    }

    function clients() {
        return copy(d().clients).sort((a, b) => a.name.localeCompare(b.name, I18n.locale()));
    }

    function client(id) {
        const c = d().clients.find(x => x.id === id);
        return c ? copy(c) : null;
    }

    /* { client, status: "created" | "merged" | "unchanged" } or null if the name is empty */
    function addClient(fields) {
        if (!allowed("settings.manage") && !allowed("timeclock.correction.approve")) return null;   /* shared clients: managers only */
        const name = String(fields.name || "").trim();
        if (!name) return null;
        const city = String(fields.city || "").trim();
        const lines = cleanLines(fields.lines);
        const existing = d().clients.find(c => clientKey(c.name, c.city) === clientKey(name, city));
        if (existing) {
            const before = existing.lines.length;
            existing.lines = cleanLines(existing.lines.concat(lines));
            save(); notify();
            return { client: copy(existing), status: existing.lines.length > before ? "merged" : "unchanged" };
        }
        const created = { id: Utils.uid("cl"), name, city, lines, createdAt: new Date().toISOString() };
        d().clients.push(created);
        save(); notify();
        return { client: copy(created), status: "created" };
    }

    function updateClient(id, fields) {
        if (!allowed("settings.manage") && !allowed("timeclock.correction.approve")) return false;   /* shared clients: managers only */
        const c = d().clients.find(x => x.id === id);
        if (!c) return false;
        const name = String(fields.name || "").trim();
        if (!name) return false;
        const city = String(fields.city || "").trim();
        if (d().clients.some(x => x.id !== id && clientKey(x.name, x.city) === clientKey(name, city))) return false;
        c.name = name; c.city = city; c.lines = cleanLines(fields.lines);
        save(); notify();
        return true;
    }

    /* Entries keep a copy of the client name: deleting a client never erases hours. */
    function deleteClient(id) {
        if (!allowed("settings.manage") && !allowed("timeclock.correction.approve")) return false;   /* shared clients: managers only */
        d().clients = d().clients.filter(c => c.id !== id);
        save(); notify();
    }

    /* ---------------- Clock entries (current account) ---------------- */

    function entries() { return copy(u().entries); }

    function runningEntry() {
        const e = u().entries.find(x => x.end == null);
        return e ? copy(e) : null;
    }

    function entry(id) {
        const e = u().entries.find(x => x.id === id);
        return e ? copy(e) : null;
    }

    function clientName(clientId) {
        const c = clientId ? d().clients.find(x => x.id === clientId) : null;
        return c ? c.name : "";
    }

    /* Live clocking creates entries freely; a MANUAL entry or an IMPORT is a
       correction: "timeclock.correction.approve" only (request of 06/11/2026). */
    function addEntry(fields) {
        if ((fields.manual || fields.imported) && !allowed("timeclock.correction.approve")) return null;
        const e = {
            id: Utils.uid("en"),
            category: fields.category,
            clientId: fields.clientId || "",
            clientName: fields.clientId ? clientName(fields.clientId) : "",
            line: fields.line || "",
            note: fields.note || "",
            start: fields.start,
            end: fields.end == null ? null : fields.end,
            manual: !!fields.manual,
            imported: !!fields.imported,
            edited: false,
            toCheck: !!fields.toCheck,
            history: [],
            synced: false
        };
        u().entries.push(e);
        save(); notify();
        return copy(e);
    }

    /* With `trace` (correction by the user) the previous version is kept and the entry flagged "edited". */
    function updateEntry(id, fields, trace, reason) {
        const e = u().entries.find(x => x.id === id);
        if (!e) return null;
        /* a traced change (correction), or any change of a finished entry, needs
           "timeclock.correction.approve"; live clocking only closes its running entry */
        if ((trace || e.end != null) && !allowed("timeclock.correction.approve")) return null;
        if (trace) {
            e.history.push({ at: new Date().toISOString(), by: current, reason: reason || "",
                before: { category: e.category, clientName: e.clientName, line: e.line, note: e.note, start: e.start, end: e.end } });
            e.edited = true;
            e.toCheck = false;
        }
        ["category", "line", "note", "start", "end", "toCheck"].forEach(k => { if (k in fields) e[k] = fields[k]; });
        if ("clientId" in fields) {
            e.clientId = fields.clientId || "";
            e.clientName = fields.clientId ? clientName(fields.clientId) : "";
        }
        e.synced = false;
        save(); notify();
        return copy(e);
    }

    /* Live clocking may cancel its own RUNNING entry (a few seconds); deleting a
       finished entry is a correction: "timeclock.correction.approve" + reason (traced). */
    function deleteEntry(id, reason) {
        const e = u().entries.find(x => x.id === id);
        if (!e) return false;
        const ownRunning = e.end == null && owner() === current;
        if (!ownRunning && !allowed("timeclock.correction.approve")) return false;
        if (!ownRunning && isLockedDay(owner(), e.start)) return false;   /* locked week: reopen it first (10/11/2026) */
        u().entries = u().entries.filter(x => x.id !== id);
        if (!ownRunning) log("timesheet.entryDeleted", owner(), { category: e.category, start: e.start, end: e.end }, null, reason);
        save(); notify();
        return true;
    }

    /* ---------------- Correction of a day (06/11/2026) ----------------
       A day "block" = one activity interrupted by the meal:
           [main] arrival → meal start · [lunch] · [rest] meal end → departure
       Older data may hold the meal INSIDE the activity (overlap, meal not
       deducted): it is read the same way and rebuilt cleanly on save.
       dayBlock(entryId) → { main, lunch, rest, start, end } (for the editor). */
    function dayBlock(entryId) {
        const all = u().entries;
        let main = all.find(x => x.id === entryId);
        if (!main) return null;
        const iso = Utils.isoLocal(main.start);
        const sameDay = all.filter(x => Utils.isoLocal(x.start) === iso && x.end != null);
        const meals = sameDay.filter(x => x.category === "lunch");
        if (main.category === "lunch") {   /* opened on the meal: use the activity around it */
            const around = sameDay.find(x => x.category !== "lunch" && x.category !== "break" &&
                (x.end === main.start || (x.start <= main.start && x.end >= main.end)));
            if (!around) return { main: copy(main), lunch: null, rest: null, start: main.start, end: main.end };
            main = around;
        }
        const twin = x => x.category === main.category && x.clientId === main.clientId;
        let lunch = meals.find(m => m.start >= main.start && m.end <= main.end)            /* meal inside (older data) */
            || meals.find(m => m.start === main.end) || meals.find(m => m.end === main.start);
        let rest = null;
        if (lunch && lunch.start === main.end) rest = sameDay.find(x => x !== main && twin(x) && x.start === lunch.end) || null;
        if (lunch && lunch.end === main.start) {   /* opened on the afternoon part: the morning part is the main one */
            const first = sameDay.find(x => x !== main && twin(x) && x.end === lunch.start);
            if (first) { rest = main; main = first; }
        }
        const end = rest ? rest.end : main.end;
        return { main: copy(main), lunch: lunch ? copy(lunch) : null, rest: rest ? copy(rest) : null, start: main.start, end };
    }

    /* ONE operation for the activity AND the meal of that day:
       o = { userId, entryId (null = add), fields: { category, clientId, line, note,
             start (arrival), end (departure) }, lunch: { start, end } | null, reason }.
       Saved as clean consecutive entries (activity · meal · activity). Managers
       only ("timeclock.correction.approve"), reason mandatory, original values kept
       in the entries' history, one audit event, owner notified, the open error
       reports of that day answered. Returns true or an error code. */
    function correctDay(o) {
        if (!allowed("timeclock.correction.approve")) return "forbidden";
        if (!String(o.reason || "").trim()) return "reasonRequired";
        const uid = o.userId || current;
        if (current && uid !== current && !Permissions.canSeeUser(current, uid)) return "forbidden";
        const f = o.fields;
        if (!(f.start < f.end)) return "badTimes";
        if (o.lunch && !(o.lunch.start < o.lunch.end)) return "badLunch";
        if (o.lunch && !(o.lunch.start > f.start && o.lunch.end < f.end)) return "lunchOutside";
        if (isLockedDay(uid, f.start) || (o.entryId && withUser(uid, () => { const e = entry(o.entryId); return e && isLockedDay(uid, e.start); }))) return "weekLocked";
        return withUser(uid, () => batch(() => {
            const iso = Utils.isoLocal(f.start);
            const hm = t2 => Utils.clock(t2);
            const block = o.entryId ? dayBlock(o.entryId) : null;
            if (o.entryId && !block) return "notFound";
            const before = block ? { category: block.main.category, start: hm(block.start), end: hm(block.end),
                lunch: block.lunch ? { start: hm(block.lunch.start), end: hm(block.lunch.end) } : null } : null;
            const activity = { category: f.category, clientId: f.clientId || "", line: f.line || "", note: f.note || "" };
            const put = (existing, fields) => existing ? updateEntry(existing.id, fields, true, o.reason)
                : addEntry(Object.assign({}, activity, fields, { manual: true }));
            const drop = x => { u().entries = u().entries.filter(y => y.id !== x.id); };
            const meals = u().entries.filter(x => x.category === "lunch" && Utils.isoLocal(x.start) === iso);
            const meal = (block && block.lunch) || meals[0] || null;
            if (o.lunch) {
                put(block && block.main, Object.assign({}, activity, { start: f.start, end: o.lunch.start }));
                if (meal) updateEntry(meal.id, { start: o.lunch.start, end: o.lunch.end }, true, o.reason);
                else addEntry({ category: "lunch", start: o.lunch.start, end: o.lunch.end, manual: true });
                meals.filter(m => !meal || m.id !== meal.id).forEach(drop);   /* one meal per day */
                put(block && block.rest, Object.assign({}, activity, { start: o.lunch.end, end: f.end }));
            } else {
                put(block && block.main, Object.assign({}, activity, { start: f.start, end: f.end }));
                if (block && block.rest) drop(block.rest);
                meals.forEach(drop);
            }
            const after = { date: iso, category: f.category, start: hm(f.start), end: hm(f.end),
                lunch: o.lunch ? { start: hm(o.lunch.start), end: hm(o.lunch.end) } : null };
            log("timesheet.corrected", uid, before, after, o.reason);
            notifyUsers([uid], "timesheet.corrected", { date: Utils.dateDmy(iso) });
            d().correctionRequests.filter(r => r.userId === uid && r.date === iso && r.status === "open").forEach(r => {
                r.status = "done"; r.closedBy = current; r.closedAt = new Date().toISOString(); r.comment = o.reason;
            });
            save();
            return true;
        }));
    }

    /* ---------------- Error reports (technician → managers) ----------------
       "timeclock.correction.request": the technician (or a team lead, for an account
       of their perimeter) describes the error; the managers correct the day. */
    function requestCorrection(fields) {
        const uid = fields.userId || current;
        if (!current || !allowed(uid === current ? "timeclock.report_issue" : "timeclock.correction.request")) return "forbidden";
        if (uid !== current && !Permissions.canSeeUser(current, uid)) return "forbidden";
        const text = String(fields.text || "").trim();
        if (!text) return "textRequired";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date || "")) return "badDate";
        const r = { id: Utils.uid("cr"), userId: uid, date: fields.date, text, requestedBy: current, requestedAt: new Date().toISOString(),
            status: "open", closedBy: "", closedAt: null, comment: "" };
        d().correctionRequests.push(r);
        log("timesheet.correctionRequested", uid, null, { date: r.date }, text);
        notifyUsers(usersWith("timeclock.correction.approve").concat(uid !== current ? [uid] : []), "timesheet.correctionRequested",
            { name: (user(uid) || {}).name, date: Utils.dateDmy(r.date) });
        save(); notify();
        return copy(r);
    }

    /* Reports visible to the actor: their own, those they made, and those of
       their perimeter for managers and team leads. Optional filter by account. */
    function correctionRequests(userId) {
        const me = current;
        /* managers (they correct) and team leads (they follow their technicians) see their perimeter */
        const follows = allowed("timeclock.correction.approve") || allowed("timeclock.team.view");
        return copy(d().correctionRequests).filter(r => (!userId || r.userId === userId) &&
            (r.userId === me || r.requestedBy === me || (follows && (!me || Permissions.canSeeUser(me, r.userId)))))
            .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    }

    /* status "done" | "rejected" (rejected needs a comment) */
    function closeCorrection(id, status, comment) {
        const r = d().correctionRequests.find(x => x.id === id);
        if (!r || r.status !== "open") return "notOpen";
        if (!allowed("timeclock.correction.approve")) return "forbidden";
        if (["done", "rejected"].indexOf(status) < 0) return "badStatus";
        if (status === "rejected" && !String(comment || "").trim()) return "commentRequired";
        r.status = status; r.closedBy = current; r.closedAt = new Date().toISOString(); r.comment = String(comment || "");
        log("timesheet.correctionClosed", r.userId, { status: "open" }, { status, date: r.date }, r.comment);
        notifyUsers([r.userId, r.requestedBy], "timesheet.correction." + status, { date: Utils.dateDmy(r.date) });
        save(); notify();
        return true;
    }

    /* ---------------- Requests (paid leave / time off) ---------------- */

    function requests() {
        return copy(u().requests).sort((a, b) => b.startDate.localeCompare(a.startDate));
    }

    /* ---------------- Leave circuit (06/11/2026) ----------------
       draft → pending_lead (team lead's opinion) → lead_favorable | lead_unfavorable
       → approved | rejected (quality manager OR director); pending_final when no
       team lead covers the person; cancelled by the requester before the decision.
       Every step is in r.history and in the audit trail; the balance only moves
       with "approved" (leave.js). Rights are checked HERE, not only in screens. */
    const OPEN_STATUSES = ["pending_lead", "lead_favorable", "lead_unfavorable", "pending_final"];
    const REQUEST_STATUSES = ["draft"].concat(OPEN_STATUSES, ["approved", "rejected", "cancelled"]);
    const isOpenRequest = r => OPEN_STATUSES.indexOf(r.status) >= 0;

    /* Team leads who review this person's requests (perimeter, active, not
       approvers). Only for employees who neither review nor decide themselves:
       the requests of team leads and managers go straight to the final decision. */
    function leadsOf(ownerId) {
        if (typeof Permissions === "undefined") return [];
        if (d().org.leaveSingleDecision) return [];   /* 3.0 (10.1): no separate opinion step, the first decision is final */
        if (Permissions.has(ownerId, "leave.team.review") || Permissions.has(ownerId, "leave.global.approve")) return [];
        return d().users.filter(x => x.id !== ownerId && x.accountStatus !== "disabled" && Permissions.has(x.id, "leave.team.review") &&
            !Permissions.has(x.id, "leave.global.approve") && Permissions.canSeeUser(x.id, ownerId)).map(x => x.id);
    }
    const approversOf = ownerId => usersWith("leave.global.approve").filter(id => id !== ownerId);

    /* 3.0: may `deciderId` take the final decision on `ownerId`'s leave? The quality
       manager and the director (leave.global.approve) always; the team lead
       (leave.team.approve) for the people of his perimeter when rule 10.1 applies. */
    function canDecideLeave(deciderId, ownerId) {
        if (typeof Permissions === "undefined" || !deciderId || deciderId === ownerId) return false;
        if (Permissions.has(deciderId, "leave.global.approve")) return Permissions.canSeeUser(deciderId, ownerId);
        return !!d().org.leaveSingleDecision && Permissions.has(deciderId, "leave.team.approve") && Permissions.canSeeUser(deciderId, ownerId);
    }

    /* Everybody who may decide (notifications) — absent people excluded when someone else is present */
    function decidersOf(ownerId) {
        const all = d().users.filter(x => x.accountStatus !== "disabled" && canDecideLeave(x.id, ownerId)).map(x => x.id);
        const present = all.filter(id => !isAway(id));
        return present.length ? present : all;
    }

    /* 3.0: notice period (15 + 10.4): 1 day → leaveNoticeShort days ahead, 2 to 5 days →
       leaveNoticeMid, more than 5 → leaveNoticeLong. Counted in calendar days from today. */
    function noticeOf(r, ownerId) {
        const o = d().org;
        const n = typeof Leave !== "undefined" ? withUser(ownerId, () => Leave.workingDaysOf(r, profile())) : 1;
        const required = n <= 1 ? Number(o.leaveNoticeShort) || 0 : n <= 5 ? Number(o.leaveNoticeMid) || 0 : Number(o.leaveNoticeLong) || 0;
        const given = Math.round((Utils.utcDate(r.startDate) - Utils.utcDate(Utils.isoLocal(Date.now()))) / 86400000);
        return { days: n, required, given, late: given < required };
    }

    /* Other people's leave overlapping these dates (approved or waiting) */
    function overlapsOf(r, ownerId) {
        const out = [];
        d().users.forEach(x => {
            if (x.id === ownerId || x.accountStatus === "disabled") return;
            ((d().perUser[x.id] || {}).requests || []).forEach(y => {
                if ((y.status === "approved" || isOpenRequest(y)) && y.startDate <= r.endDate && r.startDate <= y.endDate) out.push({ userId: x.id, id: y.id });
            });
        });
        return out;
    }
    function step(r, ownerId, to, comment, extra) {
        const from = r.status;
        r.status = to;
        r.history = (r.history || []).concat([{ at: new Date().toISOString(), by: current || ownerId, from, to, comment: comment || "" }]);
        if (extra) Object.assign(r, extra);
        log("leave." + to, ownerId, { status: from }, { status: to, type: r.type, start: r.startDate, end: r.endDate }, comment);
    }

    /* Sends a draft into the circuit: to the team lead, or straight to the final decision */
    function route(r, ownerId) {
        const leads = leadsOf(ownerId);
        /* 3.0: flags shown to the deciders — late notice, overlap with someone else, balance exceeded */
        const notice = noticeOf(r, ownerId);
        r.lateNotice = notice.late;
        r.overlap = overlapsOf(r, ownerId).length > 0;
        r.overBalance = false;
        if (r.type === "paid_leave" && typeof Leave !== "undefined") {
            const b = withUser(ownerId, () => Leave.balance());
            r.overBalance = !!b && b.available - b.pending - Leave.workingDaysOf(r, withUser(ownerId, profile)) < -1e-9;
        }
        step(r, ownerId, leads.length ? "pending_lead" : "pending_final", "");
        const name = (user(ownerId) || {}).name;
        const to = leads.length ? leads : decidersOf(ownerId);
        const params = { name, type: r.type, from: Utils.dateDmy(r.startDate), to: Utils.dateDmy(r.endDate) };
        notifyUsers(to, leads.length ? "leave.toReview" : "leave.toDecide", params);
        if (r.lateNotice) notifyUsers(to, "leave.lateNotice", Object.assign({ days: notice.required }, params));
        if (r.overlap) notifyUsers(decidersOf(ownerId), "leave.overlap", params);
        if (r.overBalance) notifyUsers(decidersOf(ownerId), "leave.overBalance", params);
    }

    /* New request of the signed-in person (fields.draft = keep as draft). The
       requester never chooses the status; approved history only comes from
       addApprovedRequest (managers' register import). */
    function addRequest(fields) {
        if (fields.__approvedHistory !== true && current) {
            /* own request: the right to request; on behalf (3.0): a manager who decides for that person */
            const ownerId = owner();
            if (ownerId === current ? !allowed("leave.self.request")
                : !(allowed("leave.global.approve") && Permissions.canSeeUser(current, ownerId) && Permissions.has(ownerId, "leave.self.request"))) return null;
        }
        if (REQUEST_TYPES.indexOf(fields.type) < 0) return null;
        if (fields.type === "other" && !String(fields.comment || "").trim()) return null;   /* "other": comment required */
        if (fields.__approvedHistory !== true && fields.draft !== true && d().org.leaveNoticeBlocks && current === owner() &&
            noticeOf(fields, owner()).late) return null;   /* 10.5: late requests refused when the rule says so */
        const r = {
            id: Utils.uid("rq"),
            type: fields.type,
            startDate: fields.startDate,
            endDate: fields.endDate,
            /* 3.0: half day — only on a one-day request: "am" (morning) | "pm" (afternoon) */
            half: fields.startDate === fields.endDate && (fields.half === "am" || fields.half === "pm") ? fields.half : "",
            comment: fields.comment || "",
            status: fields.__approvedHistory === true ? "approved" : "draft",
            imported: !!fields.imported,
            createdAt: new Date().toISOString(),
            decidedBy: "", decidedAt: null, history: [], review: null, decisionComment: "", bypassReason: ""
        };
        u().requests.push(r);
        if (r.status === "draft") {
            log("leave.created", owner(), null, { type: r.type, start: r.startDate, end: r.endDate });
            if (!fields.draft) route(r, owner());
        }
        save(); notify();
        return copy(r);
    }

    function ownRequest(id) { return u().requests.find(x => x.id === id); }

    /* A draft (or one sent back for changes) can be edited and sent */
    function updateDraft(id, fields) {
        const r = ownRequest(id);
        if (!r || r.status !== "draft") return false;
        ["type", "startDate", "endDate", "comment", "half"].forEach(k => { if (k in fields) r[k] = fields[k]; });
        if (r.startDate !== r.endDate || (r.half !== "am" && r.half !== "pm")) r.half = "";
        save(); notify();
        return true;
    }

    function submitRequest(id) {
        const r = ownRequest(id);
        if (!r || r.status !== "draft") return false;
        route(r, owner());
        save(); notify();
        return true;
    }

    /* Team lead's opinion: "favorable" | "unfavorable" (comment required) | "changes"
       (back to the requester as a draft, comment required). Never on one's own request. */
    function reviewRequest(ownerId, requestId, opinion, comment) {
        if (!current || ownerId === current) return "ownRequest";
        if (d().org.leaveSingleDecision) return "notWaiting";   /* 10.1: no opinion step */
        if (!allowed("leave.team.review") || !Permissions.canSeeUser(current, ownerId)) return "forbidden";
        const r = ((d().perUser[ownerId] || {}).requests || []).find(x => x.id === requestId);
        if (!r) return "notFound";
        if (r.status !== "pending_lead") return "notWaiting";
        const c = String(comment || "").trim();
        if ((opinion === "unfavorable" || opinion === "changes") && !c) return "commentRequired";
        const to = { favorable: "lead_favorable", unfavorable: "lead_unfavorable", changes: "draft" }[opinion];
        if (!to) return "badOpinion";
        const review = { by: current, at: new Date().toISOString(), opinion, comment: c };
        step(r, ownerId, to, c, { review });
        const params = { name: (user(current) || {}).name, from: Utils.dateDmy(r.startDate), to: Utils.dateDmy(r.endDate) };
        if (to === "draft") notifyUsers([ownerId], "leave.changesAsked", params);
        else { notifyUsers([ownerId], "leave.reviewed." + opinion, params); notifyUsers(approversOf(ownerId), "leave.toDecide", Object.assign({ type: r.type }, params, { name: (user(ownerId) || {}).name })); }
        save(); notify();
        return true;
    }

    /* Final decision (quality manager OR director: "leave.global.approve", or a
       delegated temporary right). Refusal needs a comment. Deciding while the
       team lead has not given an opinion needs a justification (team lead
       unavailable), unless no team lead covers the person. Returns true or false
       (kept for the older screens); opts.result receives the error code. */
    function decideRequest(ownerId, requestId, status, deciderId, opts) {
        const o = opts || {};
        const fail = code => { o.result = code; return false; };
        const decider = d().users.find(x => x.id === deciderId);
        if (!decider || !canDecideLeave(deciderId, ownerId)) return fail("forbidden");
        if (current && deciderId !== current) return fail("forbidden");
        if (status !== "approved" && status !== "rejected") return fail("badStatus");
        const r = ((d().perUser[ownerId] || {}).requests || []).find(x => x.id === requestId);
        if (!r || !isOpenRequest(r)) return fail("notWaiting");
        const comment = String(o.comment || "").trim();
        if (status === "rejected" && !comment) return fail("commentRequired");
        let bypass = "";
        if (r.status === "pending_lead" && leadsOf(ownerId).length) {
            bypass = String(o.bypass || "").trim();
            if (!bypass) return fail("bypassRequired");
        }
        const saved = current; current = deciderId;
        step(r, ownerId, status, [bypass && "⚠ " + bypass, comment].filter(Boolean).join(" — "),
            { decidedBy: decider.name, decidedAt: new Date().toISOString(), decisionComment: comment, bypassReason: bypass });
        notifyUsers([ownerId], "leave.decided." + status, { from: Utils.dateDmy(r.startDate), to: Utils.dateDmy(r.endDate), name: decider.name });
        if (r.review && r.review.by) notifyUsers([r.review.by], "leave.decided." + status + ".lead", { name: (user(ownerId) || {}).name, from: Utils.dateDmy(r.startDate) });
        current = saved;
        save(); notify();
        return true;
    }

    /* 3.0 (16): the requester asks to cancel an APPROVED leave; a decider accepts or refuses */
    function requestCancellation(id, comment) {
        const r = ownRequest(id);
        if (!r || r.status !== "approved" || r.cancelRequest || r.imported) return false;
        r.cancelRequest = { at: new Date().toISOString(), by: current || owner(), comment: String(comment || "").trim() };
        log("leave.cancelAsked", owner(), null, { start: r.startDate, end: r.endDate }, r.cancelRequest.comment);
        notifyUsers(decidersOf(owner()), "leave.cancelAsked", { name: (user(owner()) || {}).name, from: Utils.dateDmy(r.startDate), to: Utils.dateDmy(r.endDate) });
        save(); notify();
        return true;
    }

    function decideCancellation(ownerId, requestId, accept, comment) {
        if (!current || !canDecideLeave(current, ownerId)) return "forbidden";
        const r = ((d().perUser[ownerId] || {}).requests || []).find(x => x.id === requestId);
        if (!r || r.status !== "approved" || !r.cancelRequest) return "notWaiting";
        const c = String(comment || "").trim();
        if (!accept && !c) return "commentRequired";
        const params = { name: (user(current) || {}).name, from: Utils.dateDmy(r.startDate), to: Utils.dateDmy(r.endDate) };
        if (accept) step(r, ownerId, "cancelled", c, { cancelRequest: null });
        else { r.cancelRequest = null; log("leave.cancelRefused", ownerId, null, { start: r.startDate, end: r.endDate }, c); }
        notifyUsers([ownerId], accept ? "leave.cancelAccepted" : "leave.cancelRefused", params);
        save(); notify();
        return true;
    }

    /* 3.0 (13): carry-over of leave days on request and validation. The person asks
       (notification to the deciders); a decider records the days carried. */
    function requestCarryOver(days, comment) {
        const n = Math.round(Number(days) * 2) / 2;
        if (!current || !(n > 0) || !allowed("leave.self.request")) return false;
        log("leave.carryAsked", owner(), null, { days: n }, String(comment || "").trim());
        notifyUsers(decidersOf(owner()), "leave.carryAsked", { name: (user(owner()) || {}).name, days: n });
        save(); notify();
        return true;
    }

    function carryOver(ownerId, days, comment) {
        const n = Math.round(Number(days) * 2) / 2;
        if (!current || !canDecideLeave(current, ownerId)) return "forbidden";
        if (!(n !== 0) || !isFinite(n)) return "badDays";
        const m = { id: Utils.uid("lm"), userId: ownerId, kind: "carry", days: n, at: new Date().toISOString(), by: current,
            period: typeof Leave !== "undefined" ? Leave.periodStart(Utils.isoLocal(Date.now())) : "", comment: String(comment || "").trim() };
        d().leaveMovements.push(m);
        log("leave.carried", ownerId, null, { days: n, period: m.period }, m.comment);
        notifyUsers([ownerId], "leave.carried", { days: n, name: (user(current) || {}).name });
        save(); notify();
        return true;
    }

    const leaveMovements = userId => copy(d().leaveMovements.filter(m => !userId || m.userId === userId));

    /* ---------- 3.0: absence of a manager (replacement rules 8 and 9) ---------- */
    /* A manager declares "away from … to …" (profile); while away, the others decide
       in his place: team lead away → quality / director validate the weeks directly;
       quality AND director away → the team lead's validation locks the week. */
    function isAway(uid, day) {
        const x = d().users.find(y => y.id === uid);
        const iso = day || Utils.isoLocal(Date.now());
        return !!(x && x.awayFrom && x.awayTo && x.awayFrom <= iso && iso <= x.awayTo);
    }

    function setAway(from, to) {
        const x = d().users.find(y => y.id === current);
        if (!x) return false;
        if ((from || to) && !(from && to && from <= to)) return false;
        const before = { awayFrom: x.awayFrom || "", awayTo: x.awayTo || "" };
        x.awayFrom = from || ""; x.awayTo = to || "";
        log("user.away", current, before, { awayFrom: x.awayFrom, awayTo: x.awayTo });
        save(); notify();
        return true;
    }

    /* 3.0: a person asks the managers to delete his account (the account is never
       deleted here: a manager disables it — history kept — and handles the request) */
    /* ---------------- Forgotten password (4.3) ----------------
       Contact of an account: empty, or a plausible e-mail / phone number. */
    const validEmail = v => v == null || v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
    const validPhone = v => v == null || v === "" || /^\+?[0-9 .()-]{6,20}$/.test(String(v).trim());

    /* 4.5: contracts of a person — dated, hours within sensible bounds, one per date */
    function validContracts(list) {
        return Array.isArray(list) && list.length <= 30 && list.every(c => c && /^\d{4}-\d{2}-\d{2}$/.test(c.from) &&
            +c.weeklyHours > 0 && +c.weeklyHours <= 60 && +c.normalHours >= 0 && +c.normalHours <= +c.weeklyHours && [5, 6].indexOf(+c.workDays) >= 0) &&
            new Set(list.map(c => c.from)).size === list.length;
    }

    /* Active accounts that may reset the password of `id` (hierarchy: permissions.js) */
    function passwordResetters(id) {
        return d().users.filter(x => x.accountStatus !== "disabled" && Permissions.canResetPassword(x.id, id)).map(x => x.id);
    }
    const resetNotified = id => passwordResetters(id).filter(x => (user(x) || {}).role !== "it_admin");

    /* From the sign-in screen (nobody signed in): "I forgot my password" → the managers of the
       person are told. One pending request at a time. Returns "ok" | "already" | an error code. */
    function askPasswordUnlock(id) {
        const x = d().users.find(y => y.id === id);
        if (current && current !== id) return "forbidden";
        if (!x || x.accountStatus === "disabled" || !x.pinHash) return "notFound";
        if (x.unlockAskedAt) return "already";
        const to = resetNotified(id);
        if (!to.length) return "nobody";
        x.unlockAskedAt = new Date().toISOString();
        log("user.unlockAsked", id);
        notifyUsers(to, "account.unlockAsked", { name: x.name }, "team/" + id);
        save(); notify();
        return "ok";
    }

    /* The person signed in after all (password remembered, PIN, fingerprint): request closed */
    function clearPasswordUnlock() {
        const x = d().users.find(y => y.id === current);
        if (x && x.unlockAskedAt) x.unlockAskedAt = "";
    }

    /* A manager (or the team lead of the person) resets the password: the person chooses a new one
       at the next sign-in. The person and the other managers are told. */
    function resetPassword(id) {
        if (!current || !Permissions.canResetPassword(current, id)) return false;
        const x = d().users.find(y => y.id === id);
        if (!x || !x.pinHash) return false;
        const by = (user(current) || {}).name;
        if (!applyUserUpdate(id, { pinHash: "" })) return false;   /* audit: user.passwordReset */
        x.unlockAskedAt = "";
        notifyUsers([id], "account.passwordResetMine", { by });
        notifyUsers(resetNotified(id), "account.passwordReset", { name: x.name, by }, "team/" + id);
        save(); notify();
        return true;
    }

    function requestDeletion(comment) {
        if (!current) return false;
        log("user.deletionAsked", current, null, null, String(comment || "").trim());
        notifyUsers(usersWith("employees.manage").filter(id => (user(id) || {}).role !== "it_admin"), "account.deletionAsked",
            { name: (user(current) || {}).name });
        save(); notify();
        return true;
    }

    /* The requester cancels a request not decided yet (history kept) */
    function cancelRequest(id, comment) {
        const r = ownRequest(id);
        if (!r || !(r.status === "draft" || isOpenRequest(r))) return false;
        step(r, owner(), "cancelled", comment || "");
        if (r.review && r.review.by) notifyUsers([r.review.by], "leave.cancelled", { name: (user(owner()) || {}).name, from: Utils.dateDmy(r.startDate) });
        save(); notify();
        return true;
    }

    /* Approved history (managers' register import): managers only */
    function addApprovedRequest(fields) {
        if (!allowed("timeclock.correction.approve")) return null;
        const duplicate = u().requests.some(x => x.type === fields.type && x.startDate === fields.startDate &&
            x.endDate === fields.endDate && x.status === "approved");
        if (duplicate) return null;
        return addRequest(Object.assign({}, fields, { __approvedHistory: true, imported: true }));
    }

    /* Every request of every account (admin screen), with the owner's name */
    function allRequests() {
        const out = [];
        d().users.forEach(x => {
            ((d().perUser[x.id] || {}).requests || []).forEach(r => out.push(Object.assign(copy(r), { userId: x.id, userName: x.name })));
        });
        return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
    }

    /* Only a draft that was never sent can be deleted (no history to keep) */
    function deleteRequest(id) {
        const r = ownRequest(id);
        if (!r || r.status !== "draft" || (r.history || []).length) return false;
        u().requests = u().requests.filter(x => x.id !== id);
        save(); notify();
        return true;
    }


    /* APPROVED requests of the current account covering "YYYY-MM-DD" */
    function absencesOn(iso) {
        return u().requests.filter(x => x.status === "approved" && x.startDate <= iso && iso <= x.endDate);
    }

    /* ---------------- Backup / restore (current account) ---------------- */

    function exportJson() {
        u().lastBackupAt = new Date().toISOString();
        save();
        const p = profile();
        return JSON.stringify({
            application: "AC Conger Payer + clocking", version: FORMAT_VERSION, kind: "account",
            account: { name: p.name, hireDate: p.hireDate, entity: p.entity },   /* never the password hash */
            clients: copy(d().clients),
            settings: copy(u().settings), entries: copy(u().entries), requests: copy(u().requests),
            lastBackupAt: u().lastBackupAt
        }, null, 2);
    }

    /* PERSONAL restore (Lot 1, anomaly C1). A personal backup holds the account's own copy of its
       data, but restoring it may only bring back the PERSONAL SETTINGS (reminder, vibration…):
       hours, leave, clients and balances are business data shared with the team and are never
       written from this file (a technician could otherwise forge approved leave or hours).
       Strict check of the settings (closed list, types), verified safety copy of the current
       settings, audit event with what was applied and what was ignored.
       Only the signed-in account is concerned, whatever withUser() is doing.
       Returns an error code or null; lastPersonalRestore() gives the report. */
    let personalReport = null;

    function personalRefused(reason, codes) {
        restoreRefused("personal", reason, codes);
        return reason;
    }

    function importJson(text) {
        if (!current) return "notBackup";
        let read;
        try { read = JSON.parse(text); } catch (e) { return personalRefused("notJson"); }
        let src;
        if (isV1(read)) src = migrateV1(read);
        else if (read && read.kind !== "full" && Array.isArray(read.entries) && Array.isArray(read.requests) && Array.isArray(read.clients)) src = read;
        else return personalRefused("notBackup");
        const checked = Validation.settings(src.settings);
        if (checked.errors.length || checked.unknown.length) return personalRefused("invalidSettings", checked.errors.concat(checked.unknown));
        const mine = d().perUser[current] || (d().perUser[current] = emptyUserData());
        const applied = Object.keys(checked.values).filter(k => JSON.stringify(checked.values[k]) !== JSON.stringify(mine.settings[k]));
        const key = "acp_backup_before_personal_" + new Date().toISOString().replace(/[:.]/g, "-");
        const snapshot = JSON.stringify({ userId: current, at: new Date().toISOString(), settings: copy(mine.settings) });
        if (!StorageAdapter.set(key, snapshot) || StorageAdapter.get(key) !== snapshot) return personalRefused("backupFailed");
        StorageAdapter.keys().filter(k => k.indexOf("acp_backup_before_personal_") === 0).sort().slice(0, -5).forEach(k => StorageAdapter.remove(k));   /* keep the 5 latest */
        const before = {};
        applied.forEach(k => { before[k] = mine.settings[k]; mine.settings[k] = copy(checked.values[k]); });
        const ignored = { entries: src.entries.length, requests: src.requests.length, clients: src.clients.length };
        personalReport = { applied, ignored, safetyCopy: key };
        log("backup.personalRestored", current, before, { applied, ignoredEntries: ignored.entries, ignoredRequests: ignored.requests,
            ignoredClients: ignored.clients, safetyCopy: key });
        save(); notify();
        return null;
    }

    const lastPersonalRestore = () => (personalReport ? copy(personalReport) : null);

    /* ---------------- Home work day (05/11/2026) ----------------
       One tap: home work (homeWorkHours, 7 h) + lunch (homeLunchMinutes), from
       homeDayStart. Recorded directly by the technician (traced). Refused when
       the day already has other entries (a home day stands alone with its lunch).
       Returns the created entries, or an error code. */
    function declareHomeDay(iso) {
        if (!current || !allowed("timeclock.self")) return "forbidden";
        const o = d().org;
        if (!o.homeDayPreset) return "notPreset";   /* 3.1: fixed home day only when the employer turned it on */
        const dayStart = Utils.localDate(iso).getTime();
        const dayEnd = Utils.localDate(Utils.addDays(iso, 1)).getTime();
        const sameDay = u().entries.filter(e => e.start < dayEnd && (e.end == null ? Date.now() : e.end) > dayStart);
        if (sameDay.some(e => e.category === "home")) return "already";
        if (sameDay.length) return "conflict";
        const homeMs = Math.round((Number(o.homeWorkHours) || 0) * 3600000);
        const lunchMs = Math.round((Number(o.homeLunchMinutes) || 0) * 60000);
        const start = Utils.timestamp(iso, o.homeDayStart || "08:00");
        const morning = Math.min(homeMs, Math.max(0, Utils.timestamp(iso, "12:00") - start));
        const parts = [{ category: "home", start, end: start + morning }];
        if (lunchMs) parts.push({ category: "lunch", start: start + morning, end: start + morning + lunchMs });
        if (homeMs - morning > 0) parts.push({ category: "home", start: start + morning + lunchMs, end: start + morning + lunchMs + homeMs - morning });
        const created = batch(() => parts.filter(p => p.end > p.start).map(p => addEntry(p)));
        log("timesheet.homeDeclared", current, null, { date: iso, hours: homeMs / 3600000 });
        save();
        return created;
    }

    /* ---------------- Clocking actions (10/11/2026) ----------------
       ONE place for the live clocking of the signed-in person (screen, home-screen
       shortcuts): rules checked here, not only in the screen.
       startClock({ category, clientId, line, note, urgent }) → entry | error code:
         "forbidden"     no "timeclock.self";
         "weekNotSent"   the previous week has to be reviewed and sent first (rule weekClosureRequired);
         "absenceToday"  approved leave / time off today: allowed only as an URGENT call-out
                         (urgent: true) — traced and signalled to the managers; the day stays
                         credited and the hours get the absenceWorkedRate premium (hours.js).
       Starting an activity closes the running one at the same instant; an entry
       shorter than MIN_ENTRY_MS (double tap) is removed instead of being kept.
       Every action can be undone for undoSeconds (undoClock). */
    const MIN_ENTRY_MS = 5000;
    let lastAction = null;   /* { at, userId, created: [ids], closed: [{ id }], removed: [entries] } — memory only */

    function closeRunning(at, action) {
        const running = u().entries.find(x => x.end == null);
        if (!running) return null;
        if (at - running.start < MIN_ENTRY_MS) {
            u().entries = u().entries.filter(x => x.id !== running.id);
            action.removed.push(copy(running));
        } else {
            running.end = at;
            running.synced = false;
            action.closed.push({ id: running.id });
        }
        return running;
    }

    const absenceToday = () => u().requests.filter(x => x.status === "approved" && (x.type === "paid_leave" || x.type === "time_off") &&
        x.startDate <= Utils.isoLocal(Date.now()) && Utils.isoLocal(Date.now()) <= x.endDate);

    function startClock(fields) {
        if (!current || owner() !== current || !allowed("timeclock.self")) return "forbidden";
        const f = fields || {};
        const now = Date.now();
        const running = u().entries.find(x => x.end == null);
        const clientId = f.clientId || "";
        const line = f.line || "";
        if (running && running.category === f.category && running.clientId === clientId && running.line === line) return copy(running);
        if (!running && weekToSend()) return "weekNotSent";
        /* 3.1: never on top of hours already recorded (a declared home day, an imported day) */
        if (u().entries.some(x => x.end != null && x.end > now)) return "dayRecorded";
        const absences = absenceToday();
        if (!running && absences.length && !f.urgent) return "absenceToday";
        const action = { at: now, userId: current, created: [], closed: [], removed: [] };
        closeRunning(now, action);
        const e = { id: Utils.uid("en"), category: f.category, clientId, clientName: clientId ? clientName(clientId) : "", line, note: f.note || "",
            start: now, end: null, manual: false, imported: false, edited: false, toCheck: false, history: [], synced: false };
        if (absences.length) e.urgent = true;
        u().entries.push(e);
        action.created.push(e.id);
        lastAction = action;
        if (absences.length && f.urgent && !running) {
            log("clock.urgent", current, null, { date: Utils.isoLocal(now), type: absences[0].type, time: Utils.clock(now) });
            notifyUsers(watchersOf(current), "clock.urgent", { name: (user(current) || {}).name, time: Utils.clock(now) });
        }
        save(); notify();
        return copy(e);
    }

    /* Departure (or the end of the running activity). `at` (optional) ≤ now. */
    function stopClock(at) {
        if (!current || owner() !== current) return false;
        const action = { at: Date.now(), userId: current, created: [], closed: [], removed: [] };
        const done = closeRunning(Math.min(at || Date.now(), Date.now()), action);
        if (!done) return false;
        lastAction = action;
        save(); notify();
        return true;
    }

    /* Seconds left to undo the last clocking action of the signed-in person (0 = none) */
    function undoLeft() {
        const limit = (Number(d().org.undoSeconds) || 0) * 1000;
        if (!lastAction || lastAction.userId !== current || !limit) return 0;
        return Math.max(0, Math.ceil((lastAction.at + limit - Date.now()) / 1000));
    }

    function undoClock() {
        if (!undoLeft()) return "expired";
        const a = lastAction;
        lastAction = null;
        const mine = d().perUser[a.userId];
        mine.entries = mine.entries.filter(x => a.created.indexOf(x.id) < 0);
        a.closed.forEach(c => { const x = mine.entries.find(y => y.id === c.id); if (x) { x.end = null; x.synced = false; } });
        a.removed.forEach(x => mine.entries.push(x));
        log("clock.undone", a.userId, null, { created: a.created.length, reopened: a.closed.length });
        save(); notify();
        return true;
    }

    /* ---------------- Night period (10/11/2026) ----------------
       An activity started BEFORE the night period (nightStart, 21:00) that is still
       running when it begins: a 10 s countdown asks "still working?". Without an
       answer the departure is clocked at nightStart exactly and the managers are
       informed. An activity started during the night period is never questioned. */
    function nightLimit(e) {
        const o = d().org;
        if (!o.nightCountdown || !e || e.end != null || e.nightConfirmed) return 0;
        if (e.category === "break" || e.category === "lunch") return 0;
        const s = new Date(e.start);
        const limit = new Date(s.getFullYear(), s.getMonth(), s.getDate(), Number(o.nightStart) || 0).getTime();
        return e.start < limit ? limit : 0;
    }

    /* { limit, left (ms) } while the countdown applies, else null */
    function nightPending(now) {
        const e = u().entries.find(x => x.end == null);
        const limit = nightLimit(e);
        return limit ? { limit, left: limit - (now || Date.now()) } : null;
    }

    function confirmNight() {
        const e = u().entries.find(x => x.end == null);
        if (!current || owner() !== current || !e) return false;
        e.nightConfirmed = true;
        log("clock.nightConfirmed", current, null, { date: Utils.isoLocal(Date.now()), time: Utils.clock(Date.now()) });
        save(); notify();
        return true;
    }

    /* Applies the "no answer" rule; returns true when the departure was clocked */
    function nightCheck(now) {
        const t = now || Date.now();
        const p = current && owner() === current ? nightPending(t) : null;
        if (!p || t < p.limit) return false;
        const e = u().entries.find(x => x.end == null);
        e.end = p.limit;
        e.toCheck = true;
        e.synced = false;
        log("clock.nightAutoStop", current, null, { date: Utils.isoLocal(p.limit), time: Utils.clock(p.limit) });
        notifyUsers(watchersOf(current), "clock.nightAutoStop", { name: (user(current) || {}).name, time: Utils.clock(p.limit) });
        save(); notify();
        return true;
    }

    /* Managers and team leads who follow this person (notifications) */
    function watchersOf(uid) {
        return d().users.filter(x => x.id !== uid && x.accountStatus !== "disabled" && typeof Permissions !== "undefined" &&
            (Permissions.has(x.id, "timeclock.team.view") || Permissions.has(x.id, "timeclock.correction.approve")) &&
            Permissions.canSeeUser(x.id, uid)).map(x => x.id);
    }

    /* Favourite clients of the signed-in person */
    function toggleFavoriteClient(id) {
        if (!current || !d().clients.some(c => c.id === id)) return false;
        const list = (u().settings.favoriteClients || []).slice();
        const i = list.indexOf(id);
        if (i >= 0) list.splice(i, 1); else list.push(id);
        u().settings.favoriteClients = list;
        save(); notify();
        return i < 0;
    }

    /* ---------------- Week validation (10/11/2026) ----------------
       The technician reviews and SENDS a completed week → the team lead validates
       FIRST (or returns it) → the quality manager OR the director locks it (or
       returns it): the first of the two decides. Without a team lead covering the
       person, the week goes straight to the lock. Every step keeps who, when and
       the comment (history + audit trail); the screens show who took the final
       decision. A locked week can no longer be corrected (reopen = return it).
       Statuses: sent → pending_lock → locked; returned (back to the technician). */
    const WEEK_STATUSES = ["sent", "pending_lock", "locked", "returned"];
    const weekKey = (y, w) => y * 100 + w;

    function weekRecord(uid, year, week) {
        return d().weekValidations.find(x => x.userId === uid && x.year === year && x.week === week) || null;
    }

    function weekValidation(uid, year, week) {
        const r = weekRecord(uid || owner(), year, week);
        return r ? copy(r) : null;
    }

    /* Records visible to the actor: own, then the perimeter of a reviewer / locker */
    function weekValidations(userId) {
        const me = current;
        const follows = allowed("timesheet.week.review") || allowed("timesheet.week.lock");
        return copy(d().weekValidations).filter(r => (!userId || r.userId === userId) &&
            (r.userId === me || (follows && (!me || Permissions.canSeeUser(me, r.userId)))))
            .sort((a, b) => weekKey(b.year, b.week) - weekKey(a.year, a.week));
    }

    function weekLeadsOf(uid) {
        if (typeof Permissions === "undefined" || Permissions.has(uid, "timesheet.week.review") || Permissions.has(uid, "timesheet.week.lock")) return [];
        return d().users.filter(x => x.id !== uid && x.accountStatus !== "disabled" && Permissions.has(x.id, "timesheet.week.review") &&
            !Permissions.has(x.id, "timesheet.week.lock") && Permissions.canSeeUser(x.id, uid)).map(x => x.id);
    }
    const weekLockersOf = uid => usersWith("timesheet.week.lock").filter(id => id !== uid);

    function isLockedDay(uid, ms) {
        if (typeof Hours === "undefined") return false;
        const w = Hours.isoWeek(Utils.utcDate(Utils.isoLocal(ms)));
        const r = weekRecord(uid, w.year, w.week);
        return !!r && r.status === "locked";
    }

    /* Previous ISO week of the person (relative to today) */
    function previousWeek() {
        const prev = Utils.addDays(Utils.isoLocal(Date.now()), -7);
        return Hours.isoWeek(Utils.utcDate(prev));
    }

    /* The week that must be sent before clocking again, or null */
    function weekToSend() {
        if (!d().org.weekClosureRequired || typeof Hours === "undefined") return null;
        const w = previousWeek();
        const monday = Utils.localDate(Hours.isoDayOf(w.year, w.week, 0)).getTime();
        const nextMonday = Utils.localDate(Hours.isoDayOf(w.year, w.week, 6)).getTime() + 86400000;
        const worked = u().entries.some(e => e.start < nextMonday && (e.end == null ? Date.now() : e.end) > monday);
        if (!worked) return null;
        const r = weekRecord(owner(), w.year, w.week);
        return !r || r.status === "returned" ? w : null;
    }

    function weekStep(r, to, comment, extra) {
        const from = r.status;
        r.status = to;
        r.history = (r.history || []).concat([{ at: new Date().toISOString(), by: current, from, to, comment: comment || "" }]);
        if (extra) Object.assign(r, extra);
        log("week." + to, r.userId, { status: from }, { status: to, year: r.year, week: r.week }, comment);
    }

    /* The technician sends a COMPLETED week (own data). Returns the record or an error code. */
    function sendWeek(year, week) {
        if (!current || owner() !== current || !allowed("timeclock.self")) return "forbidden";
        if (typeof Hours === "undefined") return "forbidden";
        if (Hours.isoDayOf(year, week, 6) >= Utils.isoLocal(Date.now())) return "notComplete";
        const existing = weekRecord(current, year, week);
        if (existing && existing.status !== "returned") return "alreadySent";
        const s = Hours.weekSummary(Segments.weekSheet(year, week, u().entries, settings(), Date.now()));
        const r = existing || { id: Utils.uid("wk"), userId: current, year, week, status: "", history: [] };
        if (!existing) d().weekValidations.push(r);
        const leads = weekLeadsOf(current);
        const at = new Date().toISOString();
        weekStep(r, leads.length ? "sent" : "pending_lock", "", { sentAt: at, sentBy: current, done: s.done, worked: s.worked, goal: s.goal,
            leadBy: "", leadAt: null, lockedBy: "", lockedAt: null, returnedBy: "", returnedAt: null, comment: "" });
        const params = { name: (user(current) || {}).name, week: String(week) };
        notifyUsers(leads.length ? leads : weekLockersOf(current), leads.length ? "week.toReview" : "week.toLock", params);
        /* 3.0 (8): team lead away → the quality manager / director may validate it directly */
        if (leads.length && leads.every(id => isAway(id))) notifyUsers(weekLockersOf(current), "week.toLock", params);
        save(); notify();
        return copy(r);
    }

    /* Team lead: "validate" (→ waiting for the lock) or "return" (comment required) */
    function reviewWeek(id, decision, comment) {
        const r = d().weekValidations.find(x => x.id === id);
        if (!r) return "notFound";
        if (!current || r.userId === current) return "ownWeek";
        if (!allowed("timesheet.week.review") || !Permissions.canSeeUser(current, r.userId)) return "forbidden";
        if (r.status !== "sent") return "notWaiting";
        const c = String(comment || "").trim();
        if (decision === "return" && !c) return "commentRequired";
        const params = { name: (user(current) || {}).name, week: String(r.week), owner: (user(r.userId) || {}).name };
        const lockers = weekLockersOf(r.userId);
        if (decision === "validate" && lockers.length && lockers.every(id => isAway(id))) {
            /* 3.0 (9): quality manager AND director away → the team lead's validation is final */
            const at = new Date().toISOString();
            weekStep(r, "locked", c, { leadBy: current, leadAt: at, lockedBy: current, lockedAt: at, replacement: true });
            notifyUsers([r.userId], "week.locked", params);
            notifyUsers(lockers, "week.lockedInAbsence", { name: params.name, week: params.week, owner: params.owner });
        } else if (decision === "validate") {
            weekStep(r, "pending_lock", c, { leadBy: current, leadAt: new Date().toISOString() });
            notifyUsers([r.userId], "week.validated", params);
            notifyUsers(lockers, "week.toLock", { name: params.owner, week: params.week });
        } else if (decision === "return") {
            weekStep(r, "returned", c, { returnedBy: current, returnedAt: new Date().toISOString(), comment: c });
            notifyUsers([r.userId], "week.returned", params);
        } else return "badDecision";
        save(); notify();
        return true;
    }

    /* Quality manager OR director: "lock" (final decision) or "return" (comment required).
       A locked week can also be returned (reopened) by them, with a comment. */
    function lockWeek(id, decision, comment) {
        const r = d().weekValidations.find(x => x.id === id);
        if (!r) return "notFound";
        if (!current || r.userId === current) return "ownWeek";
        if (!allowed("timesheet.week.lock") || !Permissions.canSeeUser(current, r.userId)) return "forbidden";
        const c = String(comment || "").trim();
        const params = { name: (user(current) || {}).name, week: String(r.week) };
        if (decision === "lock") {
            /* 3.0 (8): a week still waiting for an ABSENT team lead can be locked directly */
            const leadAway = r.status === "sent" && weekLeadsOf(r.userId).every(id => isAway(id));
            if (r.status !== "pending_lock" && !leadAway) return "notWaiting";
            weekStep(r, "locked", c, { lockedBy: current, lockedAt: new Date().toISOString(), unlockRequest: null, replacement: leadAway || undefined });
            notifyUsers([r.userId, r.leadBy], "week.locked", params);
        } else if (decision === "return") {
            if (["sent", "pending_lock", "locked"].indexOf(r.status) < 0) return "notWaiting";
            if (!c) return "commentRequired";
            weekStep(r, "returned", c, { returnedBy: current, returnedAt: new Date().toISOString(), comment: c, lockedBy: "", lockedAt: null, unlockRequest: null });
            notifyUsers([r.userId, r.leadBy], "week.returned", params);
        } else return "badDecision";
        save(); notify();
        return true;
    }

    /* 3.0 (7): the team lead asks the quality manager / director to unlock a locked week */
    function requestUnlock(id, comment) {
        const r = d().weekValidations.find(x => x.id === id);
        if (!r) return "notFound";
        if (!current || !allowed("timesheet.week.review") || allowed("timesheet.week.lock") || !Permissions.canSeeUser(current, r.userId)) return "forbidden";
        if (r.status !== "locked" || r.unlockRequest) return "notWaiting";
        const c = String(comment || "").trim();
        if (!c) return "commentRequired";
        r.unlockRequest = { by: current, at: new Date().toISOString(), comment: c };
        log("week.unlockAsked", r.userId, null, { year: r.year, week: r.week }, c);
        notifyUsers(weekLockersOf(r.userId), "week.unlockAsked", { name: (user(current) || {}).name, week: String(r.week), owner: (user(r.userId) || {}).name });
        save(); notify();
        return true;
    }

    /* ---------------- Rights checks in the business logic (2.8) ----------------
       With a signed-in account, every sensitive write is checked here (not only
       hidden buttons). Without a session (sign-in, migration) the system acts. */
    function allowed(permission) {
        return !current || (typeof Permissions !== "undefined" && Permissions.has(current, permission));
    }

    /* ---------------- Internal notifications (2.8) ---------------- */
    function notifyUsers(userIds, type, params, link) {
        const at = new Date().toISOString();
        userIds.filter((id, i) => id && userIds.indexOf(id) === i && id !== current).forEach(userId =>
            data.notifications.push({ id: Utils.uid("nt"), userId, at, type, params: params || {}, link: link || "", read: false }));
    }

    function usersWith(permission) {
        return d().users.filter(u => typeof Permissions !== "undefined" && Permissions.has(u.id, permission)).map(u => u.id);
    }

    function notifications(userId) {
        const id = userId || current;
        return copy(d().notifications.filter(n => n.userId === id)).sort((a, b) => b.at.localeCompare(a.at));
    }

    function markNotificationsRead(ids) {
        d().notifications.forEach(n => { if (n.userId === current && (!ids || ids.indexOf(n.id) >= 0)) n.read = true; });
        save(); notify();
    }

    /* ---------------- Individual rights (grants) ---------------- */
    function grants() { return copy(d().grants); }

    /* Period of a grant or an access request: permanent, or temporary with a valid end date */
    function periodOf(fields) {
        const kind = fields.kind === "temporary" ? "temporary" : "permanent";
        const start = fields.start || Utils.isoLocal(Date.now());
        return { kind, start, valid: kind !== "temporary" || (!!fields.end && fields.end >= start) };
    }

    /* Grants a permission. Refused: no "permissions.manage", granting to
       yourself, unknown permission, temporary without a valid end date. */
    function grant(fields) {
        if (!allowed("permissions.manage") || fields.userId === current) return null;
        if (!Store.user(fields.userId) || Permissions.ALL.indexOf(fields.permission) < 0) return null;
        const { kind, start, valid } = periodOf(fields);
        if (!valid) return null;
        const g = { id: Utils.uid("gr"), userId: fields.userId, permission: fields.permission, kind, start, end: kind === "temporary" ? fields.end : "",
            grantedBy: current, grantedAt: new Date().toISOString(), reason: String(fields.reason || ""), requestId: fields.requestId || "",
            revokedAt: null, revokedBy: "", revokeReason: "" };
        d().grants.push(g);
        log("permission.granted", g.userId, null, { permission: g.permission, kind, start, end: g.end }, g.reason);
        notifyUsers([g.userId], "permission.granted", { permission: g.permission, end: g.end });
        save(); notify();
        return copy(g);
    }

    function revokeGrant(id, reason) {
        const g = d().grants.find(x => x.id === id);
        if (!g || g.revokedAt || !allowed("permissions.manage")) return false;
        g.revokedAt = new Date().toISOString(); g.revokedBy = current; g.revokeReason = String(reason || "");
        log("permission.revoked", g.userId, { permission: g.permission }, null, g.revokeReason);
        notifyUsers([g.userId], "permission.revoked", { permission: g.permission });
        save(); notify();
        return true;
    }

    /* ---------------- Access requests (2.8) ----------------
       Stored statuses: pending | info_requested | approved | rejected.
       "expired" and "revoked" are DERIVED when read (from the grant), so a
       temporary access expires even if the app stayed closed. */
    function accessRequests() {
        const day = Utils.isoLocal(Date.now());
        return copy(d().accessRequests).map(r => {
            if (r.status === "approved") {
                const g = d().grants.find(x => x.id === r.grantId);
                if (g && g.revokedAt) r.status = "revoked";
                else if (g && g.kind === "temporary" && g.end < day) r.status = "expired";
            }
            return r;
        }).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    }

    /* Returns the request or an error code */
    function requestAccess(fields) {
        if (!current || !allowed("permissions.request")) return "forbidden";
        if (Permissions.ALL.indexOf(fields.permission) < 0) return "unknownPermission";
        if (!String(fields.reason || "").trim()) return "reasonRequired";
        if (Permissions.has(current, fields.permission)) return "alreadyGranted";
        const { kind, start, valid } = periodOf(fields);
        if (!valid) return "badDates";
        const r = { id: Utils.uid("ar"), userId: current, permission: fields.permission, kind, reason: String(fields.reason).trim(),
            requestedAt: new Date().toISOString(), start, end: kind === "temporary" ? fields.end : "", status: "pending",
            decidedBy: "", decidedAt: null, decisionComment: "", grantId: "", exchanges: [] };
        d().accessRequests.push(r);
        log("access.requested", current, null, { permission: r.permission, kind, start, end: r.end }, r.reason);
        notifyAccessManagers(r);
        save(); notify();
        return copy(r);
    }

    /* The people who decide access requests are told about a new (or answered) request */
    function notifyAccessManagers(r) {
        notifyUsers(usersWith("permissions.manage"), "access.requested", { permission: r.permission, name: (user(current) || {}).name });
    }

    /* decision: "approved" | "rejected" | "info_requested". A different period
       may be granted (opts.start / opts.end) — the comment then explains it.
       Never on your own request. Returns true or an error code. */
    function decideAccess(id, decision, opts) {
        const r = d().accessRequests.find(x => x.id === id);
        const o = opts || {};
        if (!r) return "notFound";
        if (!allowed("permissions.manage")) return "forbidden";
        if (r.userId === current) return "ownRequest";
        if (r.status !== "pending") return "notPending";
        if (["approved", "rejected", "info_requested"].indexOf(decision) < 0) return "badDecision";
        const start = o.start || r.start, end = r.kind === "temporary" ? (o.end || r.end) : "";
        const changed = start !== r.start || end !== r.end;
        if ((decision !== "approved" || changed) && !String(o.comment || "").trim()) return "commentRequired";
        const before = { status: r.status };
        if (decision === "approved") {
            const g = grant({ userId: r.userId, permission: r.permission, kind: r.kind, start, end, reason: r.reason, requestId: r.id });
            if (!g) return "grantFailed";
            r.grantId = g.id; r.start = start; r.end = end;
        }
        r.status = decision;
        r.decidedBy = current; r.decidedAt = new Date().toISOString(); r.decisionComment = String(o.comment || "");
        r.exchanges.push({ at: r.decidedAt, by: current, text: r.decisionComment, status: decision });
        log("access.decided", r.userId, before, { status: decision, start, end }, r.decisionComment);
        notifyUsers([r.userId], "access." + decision, { permission: r.permission });
        save(); notify();
        return true;
    }

    /* The requester answers a request for details: back to "pending" */
    function answerAccess(id, text) {
        const r = d().accessRequests.find(x => x.id === id);
        if (!r || r.userId !== current || r.status !== "info_requested" || !String(text || "").trim()) return false;
        r.exchanges.push({ at: new Date().toISOString(), by: current, text: String(text).trim(), status: "pending" });
        r.status = "pending";
        log("access.answered", current, { status: "info_requested" }, { status: "pending" }, text);
        notifyAccessManagers(r);
        save(); notify();
        return true;
    }

    /* ---------------- Full backup (2.8, administrators) ----------------
       Everything on the device: accounts (with the password hashes, same
       algorithm as CONGER PAYER, for a future migration), data of every
       account, team rules, sections, permissions, requests, audit trail. */
    /* Fingerprint of a backup (FNV-1a 32 bits, synchronous): detects a file
       that was truncated or modified after the export. Not a cryptographic
       signature (someone could recompute it): it guards against accidents. */
    function fingerprint(text) {
        let h = 0x811c9dc5;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
        return ("00000000" + h.toString(16)).slice(-8);
    }

    function countsOf(x) {
        const pu = Object.values(x.perUser || {});
        return { users: (x.users || []).length, entries: pu.reduce((n, v) => n + (v.entries || []).length, 0),
            requests: pu.reduce((n, v) => n + (v.requests || []).length, 0), clients: (x.clients || []).length,
            audit: (x.audit || []).length, grants: (x.grants || []).length };
    }

    function exportAll() {
        if (!allowed("backups.manage")) return null;
        const at = new Date().toISOString();
        log("backup.exported", "full");
        save();
        const content = copy(d());
        const body = JSON.stringify(content);
        return JSON.stringify({ application: "AC Conger Payer + clocking", kind: "full", version: FORMAT_VERSION, exportedAt: at,
            manifest: { counts: countsOf(content), fingerprint: fingerprint(body) }, data: content }, null, 2);
    }

    /* Date of the last FULL backup (audit trail), or null — shown on the quality dashboard */
    function lastFullBackup() {
        const a = d().audit.filter(x => x.action === "backup.exported").sort((x, y) => y.at.localeCompare(x.at))[0];
        return a ? a.at : null;
    }

    /* Imports and exports are traced (mission part 12): what = "timesheet",
       "report", "audit", "leave", "clients", "register"…, detail = format/period */
    function recordExport(what, detail) { log("export.done", what, null, { detail: detail || "" }); save(); }
    function recordImport(what, count, detail) { log("import.done", what, null, { count: count || 0, detail: detail || "" }); save(); }
    /* 4.5.1: summary of the last Excel register import, kept in the data of the account shown (withUser) */
    function setLastImport(summary) { u().lastImport = Object.assign({ at: new Date().toISOString(), by: current }, summary); save(); }

    /* ---------------- Local storage use (precision 3) ----------------
       Browsers give each site about 5 MB of localStorage (not guaranteed,
       varies by browser): measured here, documented in ARCHITECTURE.md. */
    const QUOTA_ESTIMATE = 5 * 1024 * 1024;
    function storageUsage() {
        const keys = StorageAdapter.keys();
        let total = 0, backups = 0;
        keys.forEach(k => {
            const size = (k.length + (StorageAdapter.get(k) || "").length) * 2;   /* UTF-16: 2 bytes per character */
            total += size;
            if (k.indexOf("acp_backup_") === 0 || k === KEY_V4 || k === KEY_V3 || k === KEY_V2 || k === KEY_V1) backups += size;
        });
        return { bytes: total, backupBytes: backups, quotaEstimate: QUOTA_ESTIMATE, ratio: total / QUOTA_ESTIMATE };
    }

    /* Safety copies kept on the device (before migration / restore, old versions) */
    function localBackups() {
        return StorageAdapter.keys().filter(k => k.indexOf("acp_backup_") === 0 || k === KEY_V4 || k === KEY_V3 || k === KEY_V2 || k === KEY_V1)
            .map(k => ({ key: k, bytes: (StorageAdapter.get(k) || "").length * 2 })).sort((a, b) => b.key.localeCompare(a.key));
    }

    /* Removes ONE safety copy on explicit request of an administrator (traced) */
    function removeLocalBackup(key) {
        if (!allowed("backups.manage") || !localBackups().some(b => b.key === key)) return false;
        StorageAdapter.remove(key);
        log("backup.copyRemoved", key);
        save();
        return true;
    }

    /* Checks a full backup WITHOUT applying it:
       { ok, error, version, users, errors, warnings, anomalies, candidate }.
       ERRORS (forged or inconsistent data, modified file) forbid the restore;
       WARNINGS are shown in the preview. A file of the current schema is checked
       as it IS (raw: an unknown role is not silently turned into "technician");
       an older file is checked after its conversion. */
    function inspectFull(text) {
        let read;
        try { read = JSON.parse(text); } catch (e) { return { ok: false, error: "notJson" }; }
        if (!read || read.kind !== "full" || !read.data || !Array.isArray(read.data.users)) return { ok: false, error: "notFull" };
        if (Number(read.version) > FORMAT_VERSION) return { ok: false, error: "tooNew" };
        const ver = Number(read.version) || 3;
        const candidate = ver >= 5 ? normalise(read.data) : migrateTo5(ver >= 4 ? read.data : migrateTo4(read.data, ver), ver);
        const checked = Validation.data(ver >= 5 ? read.data : candidate);
        const errors = checked.errors.slice(), warnings = checked.warnings.slice();
        if (read.manifest) {   /* declared at export time (2.8): any difference = damaged or modified file */
            if (read.manifest.fingerprint !== fingerprint(JSON.stringify(read.data))) errors.unshift("backup.fingerprintMismatch");
            const now = countsOf(read.data);
            Object.keys(read.manifest.counts || {}).forEach(k => { if (now[k] !== read.manifest.counts[k]) errors.unshift("backup.countMismatch:" + k); });
        } else warnings.push("backup.noManifest");   /* backup made before 2.8: cannot be fully checked */
        return { ok: true, version: Number(read.version), users: candidate.users.length, errors, warnings, anomalies: errors.concat(warnings), candidate };
    }

    /* Refused restore: kept in the audit trail (who, when, why) */
    function restoreRefused(scope, reason, codes) {
        log("backup.restoreRefused", current, null, { scope, reason, errors: codes ? codes.slice(0, 20) : undefined });
        save();
    }

    /* PREVIEW of a full restore (managers with "backups.manage"): writes NOTHING.
       Compares the file with the data of the device: counts, accounts that would
       appear or disappear, role changes, team rules changed, approved leave. */
    function previewRestore(text) {
        if (!allowed("backups.manage")) return { ok: false, error: "forbidden" };
        const r = inspectFull(text);
        if (!r.ok) return r;
        const read = JSON.parse(text);
        const inFile = read.manifest && read.manifest.counts ? read.manifest.counts : countsOf(read.data);
        const restored = countsOf(r.candidate);
        const lost = Object.keys(inFile).filter(k => restored[k] < inFile[k]);
        const now = countsOf(d());
        const mapOf = list => new Map(list.map(x => [x.id, x]));
        const cur = mapOf(d().users), nxt = mapOf(r.candidate.users);
        const approved = x => Object.values(x.perUser || {}).reduce((n, v) => n + (v.requests || []).filter(q => q.status === "approved").length, 0);
        const diff = {
            counts: {}, approved: { now: approved(d()), file: approved(r.candidate) },
            users: {
                added: r.candidate.users.filter(x => !cur.has(x.id)).map(x => x.name),
                removed: d().users.filter(x => !nxt.has(x.id)).map(x => x.name),
                roleChanged: r.candidate.users.filter(x => cur.has(x.id) && cur.get(x.id).role !== x.role).map(x => ({ name: x.name, from: cur.get(x.id).role, to: x.role }))
            },
            org: { changed: Object.keys(Object.assign({}, d().org, r.candidate.org)).filter(k => JSON.stringify(d().org[k]) !== JSON.stringify(r.candidate.org[k])) }
        };
        Object.keys(restored).forEach(k => { diff.counts[k] = { now: now[k], file: restored[k] }; });
        return { ok: true, version: r.version, inFile, restored, lost, errors: r.errors, warnings: r.warnings, anomalies: r.anomalies,
            sound: !r.errors.length && !lost.length, diff };
    }

    /* Replaces ALL the data of the device by a full backup. Order: right ("backups.manage",
       checked here, not only in the screen) → strict validation → verified safety copy of the
       current data → replacement → audit event. Any refusal is journalised and changes nothing.
       Returns { ok, backupKey, anomalies } or { ok: false, error }. */
    function importAll(text) {
        if (!allowed("backups.manage")) { restoreRefused("full", "forbidden"); return { ok: false, error: "forbidden" }; }
        const r = inspectFull(text);
        if (!r.ok) { restoreRefused("full", r.error); return { ok: false, error: r.error }; }
        if (r.errors.length) { restoreRefused("full", "invalidData", r.errors); return { ok: false, error: "invalidData", errors: r.errors }; }
        const previous = JSON.stringify(d());
        const key = "acp_backup_before_restore_" + new Date().toISOString().replace(/[:.]/g, "-");
        if (!StorageAdapter.set(key, previous) || StorageAdapter.get(key) !== previous) { restoreRefused("full", "backupFailed"); return { ok: false, error: "backupFailed" }; }
        const by = current;
        data = r.candidate;
        if (!data.users.some(u => u.id === current)) current = "";
        data.audit.push({ id: Utils.uid("au"), at: new Date().toISOString(), by, action: "backup.restored", target: "full",
            before: { backupKey: key }, after: { users: r.users, result: "ok", warnings: r.warnings.length }, reason: r.warnings.join(" | ") });
        save(); notify();
        return { ok: true, backupKey: key, anomalies: r.anomalies };
    }

    return {
        load, onChange, batch, readFailed: () => readFailed, users, user, addUser, updateUser, setCurrentUser, currentUserId, withUser, ROLES,
        grants, grant, revokeGrant, accessRequests, requestAccess, decideAccess, answerAccess,
        notifications, markNotificationsRead,
        sections, addSection, renameSection, removeSection, verify: () => verify(), migrationReport: () => migrationReport,
        log, persist: () => save(), recordExport, recordImport, setLastImport, lastImport: () => copy(u().lastImport || null), auditTrail, auditQuery, exportAll, inspectFull, importAll, previewRestore, testRestore: previewRestore, storageUsage, localBackups, removeLocalBackup,
        profile, updateProfile, settings, updateSettings, DEFAULT_SETTINGS, org, updateOrg, DEFAULT_ORG,
        clients, client, addClient, updateClient, deleteClient,
        entries, entry, runningEntry, addEntry, updateEntry, deleteEntry, declareHomeDay,
        startClock, stopClock, undoClock, undoLeft, nightPending, confirmNight, nightCheck, toggleFavoriteClient, absenceToday: () => copy(absenceToday()),
        WEEK_STATUSES, weekValidation, weekValidations, weekToSend, previousWeek, sendWeek, reviewWeek, lockWeek, weekLeadsOf,
        dayBlock, correctDay, requestCorrection, correctionRequests, closeCorrection,
        REQUEST_STATUSES, isOpenRequest, leadsOf, updateDraft, submitRequest, reviewRequest, cancelRequest,
        canDecideLeave, noticeOf, requestCancellation, decideCancellation, requestCarryOver, carryOver, leaveMovements,
        isAway, setAway, requestUnlock, requestDeletion, askPasswordUnlock, clearPasswordUnlock, resetPassword, passwordResetters, requests, addRequest, addApprovedRequest, allRequests, decideRequest, deleteRequest, absencesOn,
        exportJson, importJson, lastPersonalRestore, REQUEST_TYPES, LEGACY_SETTINGS_KEYS,
        lastFullBackup
    };
})();
