/* =============================================================
   quick-unlock.js — quick sign-in ON THIS DEVICE (3.3)
   - 4-digit PIN code, chosen by the person (current password asked);
     5 wrong codes → the PIN is removed, the password is asked again;
   - fingerprint / face (Windows Hello, Touch ID, Face ID, Android) with
     the browser's WebAuthn: the device checks the person, the app checks
     the signature with the public key saved at activation. Needs an
     https address (or localhost): not available when index.html is
     opened by double-click.
   The password stays the reference: an account without password, a
   disabled account or a password reset by a manager (Auth.resetPassword)
   never opens with a PIN or a fingerprint.
   Stored apart from the business data, key "acp_quick_unlock" (one entry
   per account, never in the backups: it belongs to the device).
   ⚠️ Same limit as the password (auth.js): a lock of the device screen,
   not a protection of the data — real protection comes with the server.
   ============================================================= */

const QuickUnlock = (() => {
    "use strict";

    const KEY = "acp_quick_unlock";
    const PIN_LENGTH = 4;
    const MAX_FAILS = 5;

    function readAll() {
        try { const v = JSON.parse(StorageAdapter.get(KEY) || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch (e) { return {}; }
    }
    function writeAll(all) { StorageAdapter.set(KEY, JSON.stringify(all)); }
    const entry = id => readAll()[id] || {};
    function update(id, fields) {
        const all = readAll();
        const e = Object.assign({}, all[id], fields);
        Object.keys(e).forEach(k => { if (e[k] === undefined) delete e[k]; });
        if (Object.keys(e).length) all[id] = e; else delete all[id];
        writeAll(all);
    }

    /* The account may be opened at all (same conditions as the password) */
    const usable = id => { const x = Store.user(id); return !!x && !!x.pinHash && x.accountStatus !== "disabled"; };
    const state = id => ({ pin: usable(id) && !!entry(id).pin, bio: usable(id) && !!entry(id).bio });
    const pinHash = (id, pin) => Auth.sha256("mtk-pin:" + id + ":" + pin);

    /* 4 digits; not 4 identical digits nor a straight sequence (1234, 9876…) */
    function checkPin(pin, confirmation) {
        const p = String(pin || "");
        if (!new RegExp("^\\d{" + PIN_LENGTH + "}$").test(p)) return "quick.err.format";
        const d = p.split("").map(Number), step = d[1] - d[0];
        if ((step === 0 || Math.abs(step) === 1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return "quick.err.simple";
        if (p !== String(confirmation || "")) return "quick.err.mismatch";
        return null;
    }

    /* Signed-in person only, after the current password */
    async function setPin(password, pin, confirmation) {
        const me = Store.profile();
        if ((await Auth.sha256(password)) !== me.pinHash) return "quick.err.password";
        const err = checkPin(pin, confirmation);
        if (err) return err;
        update(me.id, { pin: await pinHash(me.id, pin), fails: 0 });
        Store.log("session.quickChanged", me.id, "", "pin"); Store.persist();
        return null;
    }

    /* "ok" | "wrong" | "locked" (PIN removed) | "unavailable" */
    async function signInWithPin(id, pin) {
        const e = entry(id);
        if (!usable(id) || !e.pin) return "unavailable";
        if ((await pinHash(id, String(pin || ""))) === e.pin) {
            update(id, { fails: 0 });
            Auth.openVerifiedSession(id);
            return "ok";
        }
        const fails = (e.fails || 0) + 1;
        if (fails >= MAX_FAILS) { update(id, { pin: undefined, fails: undefined }); return "locked"; }
        update(id, { fails });
        return "wrong";
    }

    function remove(kind) {
        const id = Store.currentUserId();
        if (!id) return;
        update(id, kind === "pin" ? { pin: undefined, fails: undefined } : { bio: undefined });
        Store.log("session.quickChanged", id, kind, ""); Store.persist();
    }

    /* Admin reset of the password / account removed: nothing quick stays */
    function clear(id) { update(id, { pin: undefined, fails: undefined, bio: undefined }); }

    /* ---------------- Fingerprint / face (WebAuthn) ---------------- */
    const b64 = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
    const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const random = n => crypto.getRandomValues(new Uint8Array(n));

    /* true if this browser and this address allow a fingerprint / face on this device */
    async function bioAvailable() {
        try {
            return location.protocol !== "file:" && !!window.isSecureContext && typeof PublicKeyCredential !== "undefined" &&
                await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        } catch (e) { return false; }
    }

    /* Activation for the signed-in person (current password asked): "ok" or an error key */
    async function enrolBio(password) {
        const me = Store.profile();
        if ((await Auth.sha256(password)) !== me.pinHash) return "quick.err.password";
        if (!(await bioAvailable())) return "quick.err.bioUnavailable";
        try {
            const cred = await navigator.credentials.create({ publicKey: {
                rp: { name: I18n.t("app.title") },
                user: { id: random(16), name: me.name, displayName: me.name },
                challenge: random(32),
                pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
                timeout: 60000, attestation: "none" } });
            const r = cred && cred.response;
            if (!r || typeof r.getPublicKey !== "function" || !r.getPublicKey()) return "quick.err.bioFailed";
            update(me.id, { bio: { id: b64(cred.rawId), key: b64(r.getPublicKey()), alg: r.getPublicKeyAlgorithm() } });
            Store.log("session.quickChanged", me.id, "", "bio"); Store.persist();
            return "ok";
        } catch (e) { return "quick.err.bioFailed"; }
    }

    /* ECDSA signatures of WebAuthn are DER; WebCrypto wants r ‖ s (32 + 32 bytes) */
    function derToRaw(der) {
        const out = new Uint8Array(64);
        let i = 2;
        if (der[1] & 0x80) i += der[1] & 0x7f;   /* long length form (never for P-256, kept for safety) */
        for (let part = 0; part < 2; part++) {
            if (der[i] !== 0x02) throw new Error("der");
            let len = der[i + 1], start = i + 2;
            while (len > 32 && der[start] === 0) { start++; len--; }
            if (len > 32) throw new Error("der");
            out.set(der.subarray(start, start + len), part * 32 + 32 - len);
            i = i + 2 + der[i + 1];
        }
        return out;
    }

    /* Checks an assertion with the saved public key: challenge, origin, type, user verified, signature */
    async function verify(saved, challenge, assertion, origin) {
        const r = assertion.response;
        const client = JSON.parse(new TextDecoder().decode(r.clientDataJSON));
        const expected = b64(challenge).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        if (client.type !== "webauthn" + ".get" ||   /* written in two parts: not a translation key (tests/i18n-check.js) */
             client.challenge !== expected || client.origin !== origin) return false;
        const auth = new Uint8Array(r.authenticatorData);
        if (!(auth[32] & 0x01) || !(auth[32] & 0x04)) return false;   /* user present + user verified */
        const data = new Uint8Array(auth.length + 32);
        data.set(auth, 0);
        data.set(new Uint8Array(await crypto.subtle.digest("SHA-256", r.clientDataJSON)), auth.length);
        const ec = saved.alg === -7;
        const key = await crypto.subtle.importKey("spki", unb64(saved.key), ec ? { name: "ECDSA", namedCurve: "P-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
        const sig = new Uint8Array(r.signature);
        return crypto.subtle.verify(ec ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" }, key, ec ? derToRaw(sig) : sig, data);
    }

    /* "ok" | "failed" | "unavailable" */
    async function signInWithBio(id) {
        const saved = entry(id).bio;
        if (!usable(id) || !saved || !(await bioAvailable())) return "unavailable";
        try {
            const challenge = random(32);
            const assertion = await navigator.credentials.get({ publicKey: { challenge, timeout: 60000, userVerification: "required",
                allowCredentials: [{ type: "public-key", id: unb64(saved.id) }] } });
            if (!assertion || !(await verify(saved, challenge, assertion, location.origin))) return "failed";
            Auth.openVerifiedSession(id);
            return "ok";
        } catch (e) { return "failed"; }
    }

    return { PIN_LENGTH, MAX_FAILS, state, checkPin, setPin, signInWithPin, remove, clear, bioAvailable, enrolBio, signInWithBio, verify, derToRaw };
})();
