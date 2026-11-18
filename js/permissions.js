/* =============================================================
   permissions.js — CENTRAL rights module (version 2.8, matrix of 06/11/2026)
   Every rights question in the app goes through here:
     Permissions.can("leave.approve")            → current account
     Permissions.has(userId, "team.view")        → any account
     Permissions.canSeeUser(viewerId, targetId)  → data perimeter
   Effective rights = defaults of the ROLE + individual GRANTS
   (permanent, or temporary with an end date). A temporary grant is
   checked against TODAY at every call: it expires by itself, even if
   the app stayed closed for days. Revoked grants never count.
   A disabled account has no right at all.

   ROLE ≠ SECTION: the role gives the permissions; the sections
   (user.sectionIds / user.allSections) give the perimeter of the
   data visible. No person's name appears in any rule.

   ⚠️ LIMIT (documented in ARCHITECTURE.md): the app is local; these
   checks run in the browser, in the business logic (store.js) as well
   as in the screens. They organise access but are NOT equivalent to
   server-side checks: someone with access to the device and the
   browser tools could bypass them. Real security comes with a server.
   ============================================================= */

const Permissions = (() => {
    "use strict";

    /* Permission matrix (mission of 06/11/2026, part 4). The payroll.* rights of
       the mission are NOT created: no payroll module (decision of 06/11/2026), the
       hours recap for accounting relies on reports.export. Extras kept from 2.8:
       permissions.request, leave.balance.manage, absence.sensitive.view. */
    const ALL = [
        "timeclock.self", "timeclock.team.view", "timeclock.global.view", "timeclock.report_issue",
        "timeclock.correction.request", "timeclock.correction.approve", "timeclock.correction.audit",
        "leave.self.request", "leave.self.view", "leave.team.view", "leave.team.review",
        "leave.global.view", "leave.global.approve", "leave.global.audit", "leave.balance.manage",
        "employees.team.view", "employees.global.view", "employees.manage",
        "reports.self.view", "reports.team.view", "reports.global.view", "reports.export",
        "settings.view", "settings.manage", "permissions.request", "permissions.manage",
        "backups.manage", "audit.view", "absence.sensitive.view",
        "timesheet.week.review", "timesheet.week.lock",   /* week validation (10/11/2026): team lead first, then quality OR director */
        "leave.team.approve",   /* 3.0: decision on the leave of the technicians of one's perimeter (rule leaveSingleDecision) */
        "password.team.reset"   /* 4.3: forgotten password — the team lead resets it for the people of his perimeter */
    ];

    /* Names used up to 2.8.0-beta.4 → names of the matrix (grants, access
       requests and saved data are converted by the migration to v5). */
    const RENAMED = {
        "clock.own": "timeclock.self", "timesheet.own": "reports.self.view", "timesheet.team.view": "timeclock.team.view",
        "timesheet.correct.request": "timeclock.correction.request", "timesheet.correct.approve": "timeclock.correction.approve",
        "leave.request": "leave.self.request", "leave.review": "leave.team.review", "leave.approve": "leave.global.approve",
        "leave.balance.view": "leave.self.view", "team.view": "employees.team.view", "team.manage": "employees.manage",
        "reports.view": "reports.team.view", "users.manage": "employees.manage"
    };

    /* Default rights per ROLE (hierarchy). Quality manager = control, compliance,
       corrections, operational administration; director (CEO / sales manager France)
       = steering, global view, decisions. Both keep account and rights management
       (each can grant the other a missing right; nobody grants themselves).
       Clocking (timeclock.self) is a default of technicians only. */
    const TECH = ["timeclock.self", "timeclock.report_issue", "leave.self.request", "leave.self.view", "reports.self.view"];
    /* 3.0 (hierarchy of 10/11/2026): the team lead does not request leave for
       himself; he sees, validates and follows the balances of his technicians.
       Quality manager and director do not manage their own leave in the app. */
    const LEAD = ["timeclock.team.view", "timeclock.report_issue", "timeclock.correction.request",
        "leave.team.view", "leave.team.review", "leave.team.approve", "employees.team.view", "reports.self.view", "reports.team.view", "permissions.request",
        "timesheet.week.review", "password.team.reset"];
    /* 4.1.6 (13/11/2026): both managers (quality + director) have ALL the rights — same list for both */
    const MANAGER = ["timeclock.team.view", "timeclock.global.view", "timeclock.correction.audit", "timeclock.correction.request", "timeclock.correction.approve",
        "leave.team.view", "leave.global.view", "leave.global.approve", "leave.global.audit", "leave.balance.manage", "employees.team.view", "employees.global.view",
        "employees.manage", "reports.self.view", "reports.team.view", "reports.global.view", "reports.export", "settings.view", "settings.manage",
        "permissions.manage", "permissions.request", "audit.view", "timesheet.week.lock", "backups.manage", "absence.sensitive.view"];   /* request: to obtain a right from the other manager */
    const ROLE_DEFAULTS = {
        technician: TECH,
        team_lead: LEAD,
        quality: MANAGER,
        director: MANAGER.slice(),
        /* 3.0: IT department — accounts, rights and backups; no access to hours or leave */
        it_admin: ["employees.manage", "permissions.manage", "backups.manage", "settings.view"]
    };

    /* 3.0: hierarchical LEVEL. A person only sees the personal data of people BELOW
       them (quality manager and director, same level, also see each other). The IT
       account sees nobody's data and nobody sees it. */
    const LEVEL = { technician: 0, team_lead: 1, quality: 2, director: 2, it_admin: -1 };
    const levelOf = u => (u && u.role in LEVEL ? LEVEL[u.role] : 0);

    /* An account "administers" when it can manage accounts AND rights: the app
       never lets the last such active account go (store.js). */
    const ADMIN_RIGHTS = ["employees.manage", "permissions.manage"];

    const today = () => Utils.isoLocal(Date.now());

    /* Is a grant in force on `day` ("YYYY-MM-DD")? */
    function inForce(g, day) {
        if (g.revokedAt) return false;
        if (g.start && g.start > day) return false;
        if (g.kind === "temporary" && (!g.end || g.end < day)) return false;
        return true;
    }

    function grantsOf(userId, day) {
        const d = day || today();
        return Store.grants().filter(g => g.userId === userId && inForce(g, d));
    }

    function has(userId, permission, day) {
        const u = Store.user(userId);
        if (!u || u.accountStatus === "disabled") return false;
        if ((ROLE_DEFAULTS[u.role] || []).indexOf(permission) >= 0) return true;
        return grantsOf(userId, day).some(g => g.permission === permission);
    }

    function can(permission) {
        const id = Store.currentUserId();
        return !!id && has(id, permission);
    }

    function canAny(list) { return list.some(can); }

    /* Effective rights of an account, with their origin: [{ permission, source, grant }] */
    function effective(userId) {
        const u = Store.user(userId);
        if (!u) return [];
        const out = (ROLE_DEFAULTS[u.role] || []).map(p => ({ permission: p, source: "role" }));
        grantsOf(userId).forEach(g => {
            if (!out.some(x => x.permission === g.permission)) out.push({ permission: g.permission, source: g.kind, grant: g });
        });
        return out;
    }

    /* ---------- Data perimeter (sections) ---------- */

    const sectionsOf = u => (u.allSections ? Store.sections().map(s => s.id) : u.sectionIds || []);

    /* Can `viewerId` see the personal data (hours, requests) of `targetId`?
       Yourself: always. Others: a TEAM right and a shared section, or a GLOBAL
       right AND all sections. A general right never widens the perimeter. */
    const TEAM_RIGHTS = ["employees.team.view", "timeclock.team.view", "leave.team.view", "leave.team.review", "reports.team.view"];
    const GLOBAL_RIGHTS = ["employees.global.view", "timeclock.global.view", "leave.global.view", "leave.global.approve", "reports.global.view", "employees.manage"];

    function canSeeUser(viewerId, targetId) {
        if (viewerId === targetId) return true;
        const v = Store.user(viewerId), x = Store.user(targetId);
        if (!v || !x || v.accountStatus === "disabled") return false;
        const lv = levelOf(v), lx = levelOf(x);
        if (lv < 0 || lx < 0) return false;                  /* IT account: no personal data either way */
        if (lx > lv || (lx === lv && lv < 2)) return false;  /* never upwards; same level only for the managers */
        if (v.allSections && GLOBAL_RIGHTS.some(p => has(viewerId, p))) return true;
        if (!TEAM_RIGHTS.concat(GLOBAL_RIGHTS).some(p => has(viewerId, p))) return false;
        const mine = sectionsOf(v);
        return sectionsOf(x).some(sid => mine.indexOf(sid) >= 0);
    }

    /* 4.3: may `actorId` reset the password of `targetId` (forgotten password)? A manager of the
       accounts (employees.manage), or a team lead for the people BELOW him in his sections
       (password.team.reset + canSeeUser). Never one's own password. */
    function canResetPassword(actorId, targetId) {
        if (!actorId || actorId === targetId || !Store.user(targetId)) return false;
        return has(actorId, "employees.manage") || (has(actorId, "password.team.reset") && canSeeUser(actorId, targetId));
    }

    const isAdministrator = userId => ADMIN_RIGHTS.every(p => has(userId, p));

    function visibleUsers(viewerId) {
        const id = viewerId || Store.currentUserId();
        return Store.users().filter(x => canSeeUser(id, x.id));
    }

    return { ALL, RENAMED, ROLE_DEFAULTS, levelOf, has, can, canAny, effective, canSeeUser, canResetPassword, visibleUsers, isAdministrator };
})();
