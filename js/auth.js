/* =============================================================
   auth.js — sign-in with several accounts (same model as CONGER PAYER)
   ---------------------------------------------------------------
   - the sign-in screen lists the accounts of the device; the person
     picks their name, then types their password;
   - an account without a password (just created by an admin, seeded,
     or reset) asks to choose one: at least 6 characters + confirmation;
   - password stored as a SHA-256 hash (hex), exactly like CONGER PAYER
     (Storage.js → sha256): the same hash can be carried over later;
   - session in sessionStorage (key acp_session), like CONGER PAYER:
     closing the app or the tab signs out;
   - what an account may see and do comes from its rights
     (permissions.js), not from this file;
   - a deactivated account (admin action) cannot sign in.

   ⚠️ Demo limit (data on the device): accounts exist only on this
   device, a password organises access but does not truly protect the
   data, and whoever holds the device can activate an account that has
   no password yet. Real protection comes with the server.

   CONNECTING LATER (internal server / CONGER PAYER): only this file
   and store.js change; the screens do not.
   ============================================================= */

const Auth = (() => {
    "use strict";

    const MIN_LENGTH = 6;            /* same rule as CONGER PAYER */
    const SESSION_KEY = "acp_session";

    function cryptoAvailable() {
        return typeof crypto !== "undefined" && !!crypto.subtle && typeof TextEncoder !== "undefined";
    }

    async function sha256(text) {
        const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    const hasPassword = id => !!(Store.user(id) || {}).pinHash;

    /* First password of an account (or after a reset) */
    const isActive = id => (Store.user(id) || {}).accountStatus !== "disabled";

    async function setPassword(id, password) {
        if (!Store.user(id) || !isActive(id) || hasPassword(id)) return false;
        Store.updateUser(id, { pinHash: await sha256(password) });
        openSession(id);
        return true;
    }

    async function signIn(id, password) {
        const x = Store.user(id);
        if (!x || !x.pinHash || x.accountStatus === "disabled") return false;
        if ((await sha256(password)) !== x.pinHash) return false;
        openSession(id);
        return true;
    }

    /* "ok" | "wrongCurrent" — for the signed-in account */
    async function changePassword(current, next) {
        const p = Store.profile();
        if ((await sha256(current)) !== p.pinHash) return "wrongCurrent";
        Store.updateProfile({ pinHash: await sha256(next) });
        return "ok";
    }

    /* Manager (or team lead of the person, 4.3) action: the person will choose a new password at
       next sign-in; the person and the other managers are told (Store.resetPassword).
       (With the server: code by e-mail / SMS, as in CONGER PAYER.) */
    function resetPassword(id) {
        if (!Store.resetPassword(id)) return false;
        if (typeof QuickUnlock !== "undefined") QuickUnlock.clear(id);   /* 3.3: no PIN nor fingerprint after a reset */
        return true;
    }

    function openSession(id) {
        Store.setCurrentUser(id);
        Store.clearPasswordUnlock();   /* 4.3: signed in after all: the "forgotten password" request is closed */
        Store.log("session.signIn", id);
        Store.persist();
        StorageAdapter.set(SESSION_KEY, JSON.stringify({ userId: id, openedAt: new Date().toISOString() }), "session");
    }

    /* Restores the session at start-up; returns the account or null */
    function session() {
        try {
            const s = JSON.parse(StorageAdapter.get(SESSION_KEY, "session") || "null");
            if (!s || !hasPassword(s.userId) || !isActive(s.userId)) return null;
            Store.setCurrentUser(s.userId);
            return Store.user(s.userId);
        } catch (e) { return null; }
    }

    function signOut() {
        if (Store.currentUserId()) { Store.log("session.signOut", Store.currentUserId()); Store.persist(); }
        Store.setCurrentUser("");
        StorageAdapter.remove(SESSION_KEY, "session");
    }

    /* Validation shared by the screens: null if valid, else a message key */
    function checkNewPassword(password, confirmation) {
        if (String(password || "").length < MIN_LENGTH) return "auth.tooShort";
        if (password !== confirmation) return "auth.mismatch";
        return null;
    }

    return {
        MIN_LENGTH, cryptoAvailable, sha256, hasPassword,
        setPassword, signIn, changePassword, resetPassword,
        session, signOut, checkNewPassword,
        /* 3.3: session opened by quick-unlock.js once the PIN or the fingerprint is checked */
        openVerifiedSession: id => { const x = Store.user(id); if (x && x.pinHash && isActive(id)) openSession(id); }
    };
})();
