/* =============================================================
   storage-adapter.js — the ONLY file that touches the browser storage
   (version 2.8). Everything else goes through it (store.js for the
   data, auth.js for the session, i18n.js for the language,
   reminders.js for "already shown" flags).

   Today: LOCAL implementation (localStorage / sessionStorage) — the
   app works on the computer, offline, with no server.
   Later (platform not chosen yet): replace this file by an adapter
   to an API or a remote store, with the same functions. The pages and
   the business logic do not change. Points to adapt: ARCHITECTURE.md.

   API (synchronous, like localStorage):
     get(key, area)        → string | null      area: "local" | "session"
     set(key, value, area) → true | false (quota exceeded, blocked…)
     remove(key, area)
     keys(area)            → [string]
   ============================================================= */

const StorageAdapter = (() => {
    "use strict";

    const NAME = "local-browser";

    function area(kind) {
        try { return kind === "session" ? window.sessionStorage : window.localStorage; }
        catch (e) { return null; }   /* storage blocked by the browser */
    }

    function get(key, kind) {
        const s = area(kind);
        if (!s) return null;
        try { return s.getItem(key); } catch (e) { return null; }
    }

    function set(key, value, kind) {
        const s = area(kind);
        if (!s) return false;
        try { s.setItem(key, value); return true; } catch (e) { return false; }
    }

    function remove(key, kind) {
        const s = area(kind);
        if (!s) return;
        try { s.removeItem(key); } catch (e) { /* nothing */ }
    }

    function keys(kind) {
        const s = area(kind);
        if (!s) return [];
        const out = [];
        try { for (let i = 0; i < s.length; i++) out.push(s.key(i)); } catch (e) { /* nothing */ }
        return out;
    }

    return { NAME, get, set, remove, keys };
})();
