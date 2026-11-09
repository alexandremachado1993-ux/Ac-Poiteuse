/* =============================================================
   permissions.js — CENTRAL rights module (version 2.8)
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

    /* The permissions of the mission (part 4) + absence.sensitive.view
       (medical absences visible only to authorised people, part 8) */
    const ALL = [
        "clock.own", "timesheet.own", "timesheet.team.view", "timesheet.correct.request", "timesheet.correct.approve",
        "leave.request", "leave.review", "leave.approve", "leave.balance.view", "leave.balance.manage",
        "team.view", "team.manage", "reports.view", "reports.export", "settings.manage",
        "users.manage", "permissions.request", "permissions.manage", "audit.view", "absence.sensitive.view"
    ];

    /* Default rights per role (mission part 3). clock.own is NOT a default
       of team leads and administrators: it is granted account by account. */
    const ROLE_DEFAULTS = {
        technician: ["clock.own", "timesheet.own", "timesheet.correct.request", "leave.request", "leave.balance.view"],
        team_lead: ["timesheet.own", "timesheet.team.view", "timesheet.correct.request", "leave.request", "leave.review",
            "leave.balance.view", "team.view", "reports.view", "permissions.request"],
        /* every right EXCEPT clocking: not a default for managers (decision of 05/11/2026),
           granted account by account when needed */
        admin: ALL.filter(p => p !== "clock.own")
    };

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
       Yourself: always. Others: needs a team permission AND a shared section. */
    function canSeeUser(viewerId, targetId) {
        if (viewerId === targetId) return true;
        const v = Store.user(viewerId), x = Store.user(targetId);
        if (!v || !x || v.accountStatus === "disabled") return false;
        const teamRight = ["team.view", "timesheet.team.view", "leave.review", "leave.approve", "users.manage"].some(p => has(viewerId, p));
        if (!teamRight) return false;
        if (v.allSections) return true;
        const mine = sectionsOf(v);
        return sectionsOf(x).some(sid => mine.indexOf(sid) >= 0);
    }

    function visibleUsers(viewerId) {
        const id = viewerId || Store.currentUserId();
        return Store.users().filter(x => canSeeUser(id, x.id));
    }

    return { ALL, ROLE_DEFAULTS, inForce, grantsOf, has, can, canAny, effective, canSeeUser, visibleUsers };
})();
