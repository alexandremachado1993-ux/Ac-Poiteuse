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

    const KEY = "acp_data_v4";
    const KEY_V3 = "acp_data_v3";
    const KEY_V2 = "acp_data_v2";
    const KEY_V1 = "acp_donnees_v1";
    const KEY_UNREADABLE = "acp_data_unreadable";
    const FORMAT_VERSION = 4;
    const BACKUP_PREFIX = "acp_backup_before_v4_";   /* copy of the older data, verified before migrating */

    /* PERSONAL settings (each account) */
    const DEFAULT_SETTINGS = {
        forgotReminderTime: "",       /* "HH:MM": reminder if nothing clocked by then ("" = off) */
        reminderDays: [1, 2, 3, 4, 5],
        vibration: true,
        notifications: false
    };

    /* TEAM rules (2.4): set by administrators, the same for every account
       of the device. Read by hours.js, segments.js and reminders.js. */
    const DEFAULT_ORG = {
        weeklyBase: 39,               /* contract: 35 h + 4 h paid at +25 % */
        dayHours: 39 / 7,             /* value of a day of leave, time off or holiday: 39 h ÷ 7 = 5 h 34 (2.5) */
        overtime25From: 39,           /* overtime counter 25 % from the 40th hour… */
        overtime50From: 43,           /* …counter 50 % from the 44th hour */
        nightStart: 21,               /* night period 21:00 → 06:00 */
        nightEnd: 6,
        nightRate: 0.25,              /* premiums added to the total, like the register */
        holidayRate: 0.5,
        weekendHolidays: true,        /* holidays falling on a Saturday or Sunday are credited too */
        countShortBreaks: false,      /* short breaks counted as working time? */
        autoStopTime: "",             /* "HH:MM": automatic stop ("" = off) */
        longTimerAlertH: 10,          /* alert if a timer runs longer than X h (0 = off) */
        breakReminderH: 6,            /* break reminder after X h of continuous work (0 = off) */
        /* ---- Contract & monthly reference (2.8): FIXED, never recalculated per month ---- */
        normalWeeklyHours: 35,        /* normal hours in the 39 h */
        habitualOvertimeHours: 4,     /* habitual overtime INCLUDED in the 39 h */
        habitualOvertimeRate: 0.25,   /* rate of the habitual overtime */
        /* monthly reference = weeklyBase × 52 / 12 = 169 h (computed, see hours.js) */
        /* ---- Paid leave (2.8): working days "ouvrables" (Monday → Saturday) ---- */
        leaveDaysPerMonth: 2.5,       /* 2.5 days a month = 30 days a year */
        leaveAcquisitionStart: "",    /* "MM-DD" start of the acquisition period ("" = since the hire date, no reset) */
        leaveCarryOverRule: "",       /* TO CONFIRM (HR): carry-over is not invented; "" = none applied automatically */
        leaveRounding: "none",        /* "none" | "half-up" (round up to the half day): TO CONFIRM */
        leaveHolidaysCounted: false,  /* a public holiday inside a leave period is NOT counted as a leave day */
        rttEnabled: false,            /* no RTT (decision of 04/11/2026); kept as an option */
        /* ---- Home work day (information of 05/11/2026) ---- */
        homeWorkHours: 7,             /* a home work day counts 7 h, at most (35 h basis) */
        homeDayStart: "08:00",        /* start of the declared day */
        homeLunchMinutes: 60,         /* lunch recorded with the day (not paid) */
        homeReducesHabitual: true,    /* home day on the 35 h basis: the week goal loses (39 − 35) ÷ 5 = 0 h 48 */
        rulesVersion: 28              /* version of the rule defaults (migration of older values) */
    };
    const TEAM_KEYS_IN_SETTINGS = ["countShortBreaks", "autoStopTime", "longTimerAlertH", "breakReminderH"];

    /* Same fields as a CONGER PAYER user, in English (mapping in README). */
    /* role = permissions; sectionIds / allSections = data perimeter;
       accountStatus and clockRequired are separate (mission part 3.5) */
    const ROLES = ["technician", "team_lead", "admin"];
    const DEFAULT_USER = { id: "", name: "", jobTitle: "", hireDate: "", entity: "france", role: "technician", language: "", pinHash: "",
        accountStatus: "active", sectionIds: [], allSections: false, clockRequired: false };

    /* Initial sections (editable by administrators) */
    const SEED_SECTIONS = [{ id: "sec-nord", name: "Nord" }, { id: "sec-sud", name: "Sud" }];

    /* Reference accounts (mission 2.8), created if missing, no password.
       Names are NOT used by any authorisation rule (permissions.js). */
    const SEED_USERS = [
        { name: "Alexandre Machado", jobTitle: "Technicien", role: "technician", hireDate: "2026-05-04", sectionIds: ["sec-sud"], clockRequired: true },
        { name: "Damien Morvan", jobTitle: "Technicien", role: "technician", hireDate: "", sectionIds: ["sec-nord"], clockRequired: true },
        { name: "Enrique Soler", jobTitle: "Chef d'équipe", role: "team_lead", hireDate: "", sectionIds: ["sec-nord", "sec-sud"] },
        { name: "Yann Lefloc'h", jobTitle: "Responsable Qualité", role: "admin", hireDate: "", allSections: true },
        { name: "Jérémie Augé", jobTitle: "Responsable Commercial France & PDG", role: "admin", hireDate: "", allSections: true }
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
        return { settings: Object.assign({}, DEFAULT_SETTINGS), entries: [], requests: [], lastBackupAt: null };
    }

    function empty() {
        return { version: FORMAT_VERSION, deviceId: Utils.uid("dev"), org: Object.assign({}, DEFAULT_ORG),
            sections: SEED_SECTIONS.map(x => Object.assign({}, x)), users: [], clients: [], perUser: {},
            grants: [], accessRequests: [], correctionRequests: [], leaveMovements: [], audit: [], notifications: [] };
    }

    const COLLECTIONS = ["grants", "accessRequests", "correctionRequests", "leaveMovements", "audit", "notifications"];

    /* User from any version: "active" (≤ 2.7) becomes accountStatus; old roles kept */
    function normaliseUser(x) {
        const u = Object.assign({}, DEFAULT_USER, x);
        if ("active" in u) { if (!x.accountStatus) u.accountStatus = u.active === false ? "disabled" : "active"; delete u.active; }
        if (ROLES.indexOf(u.role) < 0) u.role = "technician";
        u.sectionIds = Array.isArray(u.sectionIds) ? u.sectionIds : [];
        u.allSections = !!u.allSections;
        u.clockRequired = !!u.clockRequired;
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
            requests: raw && Array.isArray(raw.requests) ? raw.requests : [],
            lastBackupAt: (raw && raw.lastBackupAt) || null
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
            out.org.rulesVersion = DEFAULT_ORG.rulesVersion;
        }
        delete out.org.saturdayHolidayReduces;
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
       the leave rule to "ouvrables", and records everything in the audit. */
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
                if (u.role === "admin") u.allSections = true;
                if (u.role !== "admin" && !u.sectionIds.length) anomalies.push("no section: " + u.name);
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

    /* Integrity check: returns a list of anomaly codes (empty = sound) */
    function verify(d) {
        const x = d || data;
        const out = [];
        const ids = new Set();
        const sections = new Set((x.sections || []).map(sec => sec.id));
        (x.users || []).forEach(u => {
            if (!u.id || !u.name) out.push("user.incomplete");
            if (ids.has(u.id)) out.push("user.duplicateId:" + u.id);
            ids.add(u.id);
            if (!x.perUser || !x.perUser[u.id]) out.push("user.noData:" + u.name);
            if (ROLES.indexOf(u.role) < 0) out.push("user.badRole:" + u.name);
            (u.sectionIds || []).forEach(sid => { if (!sections.has(sid)) out.push("user.unknownSection:" + u.name); });
        });
        Object.keys(x.perUser || {}).forEach(id => {
            if (!ids.has(id)) out.push("data.orphan:" + id);
            const pu = x.perUser[id];
            (pu.entries || []).forEach(e => {
                if (!e.id || typeof e.start !== "number") out.push("entry.invalid:" + (e.id || "?"));
                else if (e.end != null && e.end < e.start) out.push("entry.endBeforeStart:" + e.id);
            });
            (pu.requests || []).forEach(r => { if (!r.startDate || !r.endDate || r.endDate < r.startDate) out.push("request.invalidDates:" + (r.id || "?")); });
        });
        if (!(x.users || []).some(u => u.role === "admin" && u.accountStatus !== "disabled")) out.push("users.noActiveAdmin");
        return out;
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
                const v3 = StorageAdapter.get(KEY_V3);
                const v2 = StorageAdapter.get(KEY_V2);
                const v1 = StorageAdapter.get(KEY_V1);
                const rawOld = v3 || v2 || v1;
                if (rawOld) {
                    const from = v3 ? 3 : v2 ? 2 : 1;
                    const backupKey = backupBeforeMigration(rawOld);                      /* 1-2. backup + check */
                    const parsed = JSON.parse(rawOld);
                    const v3shape = v3 ? parsed : v2 ? migrateV2(parsed) : migrateV2(migrateV1(parsed));
                    data = migrateTo4(v3shape, from);                                    /* 3. migrate */
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

    const ROLE_ORDER = { technician: 0, team_lead: 1, admin: 2 };

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
        if (!allowed("users.manage")) return null;
        const name = String(fields.name || "").trim();
        if (!name || d().users.some(x => nameKey(x.name) === nameKey(name))) return null;
        const role = ROLES.indexOf(fields.role) >= 0 ? fields.role : "technician";
        const created = normaliseUser({
            id: Utils.uid("us"), name, role, hireDate: fields.hireDate || "", jobTitle: String(fields.jobTitle || "").trim(),
            sectionIds: Array.isArray(fields.sectionIds) ? fields.sectionIds : [], allSections: role === "admin" || !!fields.allSections,
            clockRequired: "clockRequired" in fields ? !!fields.clockRequired : role === "technician"
        });
        d().users.push(created);
        d().perUser[created.id] = emptyUserData();
        log("user.created", created.id, null, { name, role, sectionIds: created.sectionIds });
        save(); notify();
        return copy(created);
    }

    const activeAdmins = () => d().users.filter(x => x.role === "admin" && x.accountStatus !== "disabled");

    /* Returns true, or false when refused: empty / duplicate name, or the change
       would leave no active administrator (never lock everybody out). */
    function updateUser(id, fields) {
        if (!allowed("users.manage")) return false;
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
        ["jobTitle", "hireDate", "entity", "language", "pinHash"].forEach(k => { if (k in fields) x[k] = String(fields[k] == null ? "" : fields[k]); });
        if ("role" in fields && ROLES.indexOf(fields.role) >= 0) x.role = fields.role;
        if ("active" in fields) x.accountStatus = fields.active === false ? "disabled" : "active";   /* 2.7 screens */
        if ("accountStatus" in fields) x.accountStatus = fields.accountStatus === "disabled" ? "disabled" : "active";
        if ("sectionIds" in fields) x.sectionIds = (fields.sectionIds || []).filter(sid => d().sections.some(sec => sec.id === sid));
        if ("allSections" in fields) x.allSections = !!fields.allSections;
        if ("clockRequired" in fields) x.clockRequired = !!fields.clockRequired;
        if (!activeAdmins().length) { Object.assign(x, before); return false; }
        const trace = ["name", "jobTitle", "hireDate", "role", "accountStatus", "sectionIds", "allSections", "clockRequired"]
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
        if (!allowed("users.manage")) return null;
        const n = String(name || "").trim();
        if (!n || d().sections.some(x => nameKey(x.name) === nameKey(n))) return null;
        const created = { id: Utils.uid("sec"), name: n };
        d().sections.push(created);
        log("section.created", created.id, null, { name: n });
        save(); notify();
        return copy(created);
    }

    function renameSection(id, name) {
        if (!allowed("users.manage")) return false;
        const sec = d().sections.find(x => x.id === id);
        const n = String(name || "").trim();
        if (!sec || !n || d().sections.some(x => x.id !== id && nameKey(x.name) === nameKey(n))) return false;
        log("section.renamed", id, { name: sec.name }, { name: n });
        sec.name = n;
        save(); notify();
        return true;
    }

    /* ---------------- Profile (current account) & settings ---------------- */

    function profile() {
        const x = d().users.find(y => y.id === owner());
        return copy(x || DEFAULT_USER);
    }

    /* Own profile: name, language and password for everybody; hire date and
       job title only with "users.manage" (they drive the leave balance). */
    function updateProfile(fields) {
        if (!current) return false;
        const own = {};
        Object.keys(fields).forEach(k => {
            if (["name", "language", "pinHash"].indexOf(k) >= 0 || (["hireDate", "jobTitle"].indexOf(k) >= 0 && allowed("users.manage"))) own[k] = fields[k];
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
        Object.keys(fields).forEach(k => {
            if (!(k in DEFAULT_ORG) || JSON.stringify(d().org[k]) === JSON.stringify(fields[k])) return;
            log("setting.changed", k, d().org[k], fields[k]);
            d().org[k] = fields[k];
        });
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
        if (!allowed("settings.manage") && !allowed("timesheet.correct.approve")) return null;   /* shared clients: managers only */
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
        if (!allowed("settings.manage") && !allowed("timesheet.correct.approve")) return false;   /* shared clients: managers only */
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
        if (!allowed("settings.manage") && !allowed("timesheet.correct.approve")) return false;   /* shared clients: managers only */
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
       correction: "timesheet.correct.approve" only (request of 06/11/2026). */
    function addEntry(fields) {
        if ((fields.manual || fields.imported) && !allowed("timesheet.correct.approve")) return null;
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
           "timesheet.correct.approve"; live clocking only closes its running entry */
        if ((trace || e.end != null) && !allowed("timesheet.correct.approve")) return null;
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
       finished entry is a correction: "timesheet.correct.approve" + reason (traced). */
    function deleteEntry(id, reason) {
        const e = u().entries.find(x => x.id === id);
        if (!e) return false;
        const ownRunning = e.end == null && owner() === current;
        if (!ownRunning && !allowed("timesheet.correct.approve")) return false;
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
       only ("timesheet.correct.approve"), reason mandatory, original values kept
       in the entries' history, one audit event, owner notified, the open error
       reports of that day answered. Returns true or an error code. */
    function correctDay(o) {
        if (!allowed("timesheet.correct.approve")) return "forbidden";
        if (!String(o.reason || "").trim()) return "reasonRequired";
        const uid = o.userId || current;
        if (current && uid !== current && !Permissions.canSeeUser(current, uid)) return "forbidden";
        const f = o.fields;
        if (!(f.start < f.end)) return "badTimes";
        if (o.lunch && !(o.lunch.start < o.lunch.end)) return "badLunch";
        if (o.lunch && !(o.lunch.start > f.start && o.lunch.end < f.end)) return "lunchOutside";
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
       "timesheet.correct.request": the technician (or a team lead, for an account
       of their perimeter) describes the error; the managers correct the day. */
    function requestCorrection(fields) {
        if (!current || !allowed("timesheet.correct.request")) return "forbidden";
        const uid = fields.userId || current;
        if (uid !== current && !Permissions.canSeeUser(current, uid)) return "forbidden";
        const text = String(fields.text || "").trim();
        if (!text) return "textRequired";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date || "")) return "badDate";
        const r = { id: Utils.uid("cr"), userId: uid, date: fields.date, text, requestedBy: current, requestedAt: new Date().toISOString(),
            status: "open", closedBy: "", closedAt: null, comment: "" };
        d().correctionRequests.push(r);
        log("timesheet.correctionRequested", uid, null, { date: r.date }, text);
        notifyUsers(usersWith("timesheet.correct.approve").concat(uid !== current ? [uid] : []), "timesheet.correctionRequested",
            { name: (user(uid) || {}).name, date: Utils.dateDmy(r.date) });
        save(); notify();
        return copy(r);
    }

    /* Reports visible to the actor: their own, those they made, and those of
       their perimeter for managers and team leads. Optional filter by account. */
    function correctionRequests(userId) {
        const me = current;
        /* managers (they correct) and team leads (they follow their technicians) see their perimeter */
        const follows = allowed("timesheet.correct.approve") || allowed("timesheet.team.view");
        return copy(d().correctionRequests).filter(r => (!userId || r.userId === userId) &&
            (r.userId === me || r.requestedBy === me || (follows && (!me || Permissions.canSeeUser(me, r.userId)))))
            .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    }

    /* status "done" | "rejected" (rejected needs a comment) */
    function closeCorrection(id, status, comment) {
        const r = d().correctionRequests.find(x => x.id === id);
        if (!r || r.status !== "open") return "notOpen";
        if (!allowed("timesheet.correct.approve")) return "forbidden";
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

    /* The requester never chooses the status: a new request is "pending".
       "approved" is only used for imported history (addApprovedRequest). */
    function addRequest(fields) {
        const r = {
            id: Utils.uid("rq"),
            type: fields.type,
            startDate: fields.startDate,
            endDate: fields.endDate,
            comment: fields.comment || "",
            /* a new request is ALWAYS pending: approved history only comes from
               addApprovedRequest (managers' register import) — never from the caller */
            status: fields.__approvedHistory === true ? "approved" : "pending",
            imported: !!fields.imported,
            createdAt: new Date().toISOString(),
            decidedBy: "", decidedAt: null
        };
        u().requests.push(r);
        save(); notify();
        return copy(r);
    }

    /* Approved history (managers' register import): managers only */
    function addApprovedRequest(fields) {
        if (!allowed("timesheet.correct.approve")) return null;
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

    /* ⚠️ Decision by an ADMIN on another account's request. Refused when
       the decider is not an admin, decides on their own request, or the
       request is no longer pending. */
    function decideRequest(ownerId, requestId, status, deciderId) {
        const decider = d().users.find(x => x.id === deciderId);
        if (!decider || !Permissions.has(deciderId, "leave.approve") || ownerId === deciderId) return false;
        if (status !== "approved" && status !== "rejected") return false;
        const r = ((d().perUser[ownerId] || {}).requests || []).find(x => x.id === requestId);
        if (!r || r.status !== "pending") return false;
        r.status = status;
        r.decidedBy = decider.name;
        r.decidedAt = new Date().toISOString();
        save(); notify();
        return true;
    }

    function deleteRequest(id) {
        u().requests = u().requests.filter(x => x.id !== id);
        save(); notify();
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

    /* Replaces the CURRENT account's hours, requests and settings with the
       file's; clients are merged (ids remapped when the same client already
       exists). Accepts version 3 account backups and version 1/2 backups.
       Returns an error code or null. */
    function importJson(text) {
        let read;
        try { read = JSON.parse(text); } catch (e) { return "notJson"; }
        let src;
        if (isV1(read)) src = migrateV1(read);
        else if (read && Array.isArray(read.entries) && Array.isArray(read.requests) && Array.isArray(read.clients)) src = read;
        else return "notBackup";
        if (!current) return "notBackup";
        const remap = {};
        src.clients.forEach(c => {
            const same = d().clients.find(x => x.id === c.id) ||
                d().clients.find(x => clientKey(x.name, x.city) === clientKey(c.name, c.city));
            if (same) remap[c.id] = same.id;
            else { d().clients.push(copy(c)); remap[c.id] = c.id; }
        });
        const entries = copy(src.entries).map(e => Object.assign(e, { clientId: e.clientId ? (remap[e.clientId] || "") : "" }));
        d().perUser[current] = normaliseUserData({ settings: src.settings, entries, requests: src.requests, lastBackupAt: src.lastBackupAt });
        save(); notify();
        return null;
    }

    /* ---------------- Home work day (05/11/2026) ----------------
       One tap: home work (homeWorkHours, 7 h) + lunch (homeLunchMinutes), from
       homeDayStart. Recorded directly by the technician (traced). Refused when
       the day already has other entries (a home day stands alone with its lunch).
       Returns the created entries, or an error code. */
    function declareHomeDay(iso) {
        if (!current || !allowed("clock.own")) return "forbidden";
        const o = d().org;
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

    /* Grants a permission. Refused: no "permissions.manage", granting to
       yourself, unknown permission, temporary without a valid end date. */
    function grant(fields) {
        if (!allowed("permissions.manage") || fields.userId === current) return null;
        if (!Store.user(fields.userId) || Permissions.ALL.indexOf(fields.permission) < 0) return null;
        const kind = fields.kind === "temporary" ? "temporary" : "permanent";
        const start = fields.start || Utils.isoLocal(Date.now());
        if (kind === "temporary" && (!fields.end || fields.end < start)) return null;
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
        const kind = fields.kind === "temporary" ? "temporary" : "permanent";
        const start = fields.start || Utils.isoLocal(Date.now());
        if (kind === "temporary" && (!fields.end || fields.end < start)) return "badDates";
        const r = { id: Utils.uid("ar"), userId: current, permission: fields.permission, kind, reason: String(fields.reason).trim(),
            requestedAt: new Date().toISOString(), start, end: kind === "temporary" ? fields.end : "", status: "pending",
            decidedBy: "", decidedAt: null, decisionComment: "", grantId: "", exchanges: [] };
        d().accessRequests.push(r);
        log("access.requested", current, null, { permission: r.permission, kind, start, end: r.end }, r.reason);
        notifyUsers(usersWith("permissions.manage"), "access.requested", { permission: r.permission, name: (Store.user(current) || {}).name });
        save(); notify();
        return copy(r);
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
        notifyUsers(usersWith("permissions.manage"), "access.requested", { permission: r.permission, name: (Store.user(current) || {}).name });
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
        if (!allowed("users.manage")) return null;
        const at = new Date().toISOString();
        log("backup.exported", "full");
        save();
        const content = copy(d());
        const body = JSON.stringify(content);
        return JSON.stringify({ application: "AC Conger Payer + clocking", kind: "full", version: FORMAT_VERSION, exportedAt: at,
            manifest: { counts: countsOf(content), fingerprint: fingerprint(body) }, data: content }, null, 2);
    }

    /* Imports and exports are traced (mission part 12): what = "timesheet",
       "report", "audit", "leave", "clients", "register"…, detail = format/period */
    function recordExport(what, detail) { log("export.done", what, null, { detail: detail || "" }); save(); }
    function recordImport(what, count, detail) { log("import.done", what, null, { count: count || 0, detail: detail || "" }); save(); }

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
            if (k.indexOf("acp_backup_") === 0 || k === KEY_V3 || k === KEY_V2 || k === KEY_V1) backups += size;
        });
        return { bytes: total, backupBytes: backups, quotaEstimate: QUOTA_ESTIMATE, ratio: total / QUOTA_ESTIMATE };
    }

    /* Safety copies kept on the device (before migration / restore, old versions) */
    function localBackups() {
        return StorageAdapter.keys().filter(k => k.indexOf("acp_backup_") === 0 || k === KEY_V3 || k === KEY_V2 || k === KEY_V1)
            .map(k => ({ key: k, bytes: (StorageAdapter.get(k) || "").length * 2 })).sort((a, b) => b.key.localeCompare(a.key));
    }

    /* Removes ONE safety copy on explicit request of an administrator (traced) */
    function removeLocalBackup(key) {
        if (!allowed("users.manage") || !localBackups().some(b => b.key === key)) return false;
        StorageAdapter.remove(key);
        log("backup.copyRemoved", key);
        save();
        return true;
    }

    /* Restore TEST on a copy (precision 3): the file is read, migrated and
       checked IN MEMORY; nothing is written, the data of the device is not
       touched. Counts are compared with what the file declares. */
    function testRestore(text) {
        const r = inspectFull(text);
        if (!r.ok) return r;
        const read = JSON.parse(text);
        const inFile = read.manifest && read.manifest.counts ? read.manifest.counts : countsOf(read.data);
        const restored = countsOf(r.candidate);
        const lost = Object.keys(inFile).filter(k => restored[k] < inFile[k]);
        const blocking = r.anomalies.filter(a => a !== "backup.noManifest");
        return { ok: true, version: r.version, inFile, restored, lost, anomalies: r.anomalies, sound: !lost.length && !blocking.length };
    }

    /* Checks a full backup WITHOUT applying it: { ok, error, version, users, anomalies } */
    function inspectFull(text) {
        let read;
        try { read = JSON.parse(text); } catch (e) { return { ok: false, error: "notJson" }; }
        if (!read || read.kind !== "full" || !read.data || !Array.isArray(read.data.users)) return { ok: false, error: "notFull" };
        if (Number(read.version) > FORMAT_VERSION) return { ok: false, error: "tooNew" };
        const candidate = Number(read.version) >= 4 ? normalise(read.data) : migrateTo4(read.data, Number(read.version) || 3);
        const anomalies = verify(candidate);
        if (read.manifest) {   /* declared at export time (2.8): any difference = damaged or modified file */
            if (read.manifest.fingerprint !== fingerprint(JSON.stringify(read.data))) anomalies.unshift("backup.fingerprintMismatch");
            const now = countsOf(read.data);
            Object.keys(read.manifest.counts || {}).forEach(k => { if (now[k] !== read.manifest.counts[k]) anomalies.unshift("backup.countMismatch:" + k); });
        } else anomalies.push("backup.noManifest");   /* backup made before 2.8: cannot be fully checked */
        return { ok: true, version: Number(read.version), users: candidate.users.length, anomalies, candidate };
    }

    /* Replaces ALL the data of the device by a full backup. The current data
       is first copied to a backup key (verified); returns that key or an error. */
    function importAll(text) {
        if (!allowed("users.manage")) return { ok: false, error: "forbidden" };
        const r = inspectFull(text);
        if (!r.ok) return { ok: false, error: r.error };
        const previous = JSON.stringify(d());
        const key = "acp_backup_before_restore_" + new Date().toISOString().replace(/[:.]/g, "-");
        if (!StorageAdapter.set(key, previous) || StorageAdapter.get(key) !== previous) return { ok: false, error: "backupFailed" };
        const by = current;
        data = r.candidate;
        if (!data.users.some(u => u.id === current)) current = "";
        data.audit.push({ id: Utils.uid("au"), at: new Date().toISOString(), by, action: "backup.restored", target: "full",
            before: { backupKey: key }, after: { users: r.users }, reason: r.anomalies.join(" | ") });
        save(); notify();
        return { ok: true, backupKey: key, anomalies: r.anomalies };
    }

    /* ---------------- Synchronisation (connection point) ---------------- */

    function pendingSync() {
        return u().entries.filter(e => e.end != null && !e.synced).length;
    }

    /* ⚠️ No server yet. */
    function sync() {
        return Promise.resolve({ ok: false, reason: "noServer" });
    }

    return {
        load, onChange, batch, readFailed: () => readFailed, migrateV1, migrateV2, SEED_USERS,
        users, user, addUser, updateUser, setCurrentUser, currentUserId, withUser, ROLES,
        grants, grant, revokeGrant, accessRequests, requestAccess, decideAccess, answerAccess,
        notifications, markNotificationsRead,
        sections, addSection, renameSection, verify: () => verify(), migrationReport: () => migrationReport,
        log, persist: () => save(), recordExport, recordImport, auditTrail, auditQuery, exportAll, inspectFull, importAll, testRestore, storageUsage, localBackups, removeLocalBackup,
        profile, updateProfile, settings, updateSettings, DEFAULT_SETTINGS, org, updateOrg, DEFAULT_ORG,
        clients, client, addClient, updateClient, deleteClient,
        entries, entry, runningEntry, addEntry, updateEntry, deleteEntry, declareHomeDay,
        dayBlock, correctDay, requestCorrection, correctionRequests, closeCorrection,
        requests, addRequest, addApprovedRequest, allRequests, decideRequest, deleteRequest, absencesOn,
        exportJson, importJson, pendingSync, sync,
        lastBackupAt: () => u().lastBackupAt
    };
})();
