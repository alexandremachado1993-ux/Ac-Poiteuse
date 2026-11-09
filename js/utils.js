/* =============================================================
   utils.js — shared helpers (no business logic)
   - dates: clocking works in the DEVICE'S LOCAL TIME (a day runs
     from local midnight to midnight); ISO-week calculations taken
     from CONGER PAYER work in UTC on "YYYY-MM-DD" strings (no
     time part, so no offset problem);
   - display formats, HTML escaping, CSV reading, file download.
   Day and month names come from Intl in the current language.
   ============================================================= */

const Utils = (() => {
    "use strict";

    const pad = n => String(n).padStart(2, "0");

    /* Date (or timestamp) → "YYYY-MM-DD" in local time */
    function isoLocal(d) {
        const x = d instanceof Date ? d : new Date(d);
        return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate());
    }

    /* "YYYY-MM-DD" → local Date at midnight */
    function localDate(iso) {
        const p = iso.split("-").map(Number);
        return new Date(p[0], p[1] - 1, p[2]);
    }

    /* "YYYY-MM-DD" → UTC Date at midnight (ISO weeks, public holidays) */
    function utcDate(iso) {
        return new Date(iso + "T00:00:00Z");
    }

    function addDays(iso, days) {
        const d = localDate(iso);
        d.setDate(d.getDate() + days);
        return isoLocal(d);
    }

    /* "YYYY-MM-DD" + "HH:MM" → local timestamp (ms) */
    function timestamp(iso, hhmm) {
        const p = iso.split("-").map(Number);
        const h = (hhmm || "00:00").split(":").map(Number);
        return new Date(p[0], p[1] - 1, p[2], h[0] || 0, h[1] || 0).getTime();
    }

    /* Duration in ms → "7 h 48" (rounded to the minute, sign kept) */
    function hm(ms) {
        const minutes = Math.round(Math.abs(ms) / 60000);
        return (ms < 0 && minutes > 0 ? "−" : "") + Math.floor(minutes / 60) + " h " + pad(minutes % 60);
    }

    /* Decimal hours → "7 h 48" */
    function hours(h) {
        return hm(h * 3600000);
    }

    /* Duration in ms → "03:42:17" */
    function stopwatch(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60);
    }

    /* Timestamp → "08:05" */
    function clock(ms) {
        const d = new Date(ms);
        return pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    /* "YYYY-MM-DD" → "DD/MM/YYYY" (format used in every language and in CSV files) */
    function dateDmy(iso) {
        const p = iso.split("-");
        return p[2] + "/" + p[1] + "/" + p[0];
    }

    function dayName(iso) {
        return localDate(iso).toLocaleDateString(I18n.locale(), { weekday: "long" });
    }

    function longDate(iso) {
        return localDate(iso).toLocaleDateString(I18n.locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }

    function monthName(index) {
        return new Date(2000, index, 1).toLocaleDateString(I18n.locale(), { month: "long" });
    }

    function dateTime(ms) {
        return new Date(ms).toLocaleString(I18n.locale());
    }

    function escape(text) {
        return String(text == null ? "" : text)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    /* Lower case, no accents: to compare texts typed in any language */
    function simplify(text) {
        return String(text || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function uid(prefix) {
        return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    }

    function download(content, fileName, type) {
        const blob = new Blob([content], { type: type || "text/plain;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    /* Reads a text file. A CSV saved by a French/Spanish Excel is ANSI:
       if it contains characters invalid in UTF-8, read it again as
       windows-1252 (same rule as CONGER PAYER). */
    function readText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error);
            reader.onload = () => {
                const text = String(reader.result);
                if (!text.includes("\uFFFD")) { resolve(text); return; }
                const ansi = new FileReader();
                ansi.onerror = () => reject(ansi.error);
                ansi.onload = () => resolve(String(ansi.result));
                ansi.readAsText(file, "windows-1252");
            };
            reader.readAsText(file, "utf-8");
        });
    }

    /* CSV → array of rows (arrays of fields).
       Separator ";" or "," detected on the first line; quotes handled. */
    function parseCsv(text) {
        const content = String(text).replace(/^\uFEFF/, "");
        const first = content.split(/\r?\n/)[0] || "";
        const sep = first.split(";").length >= first.split(",").length ? ";" : ",";
        const rows = [];
        let row = [], field = "", quoted = false;
        for (let i = 0; i < content.length; i++) {
            const c = content[i];
            if (quoted) {
                if (c === '"' && content[i + 1] === '"') { field += '"'; i++; }
                else if (c === '"') quoted = false;
                else field += c;
            } else if (c === '"') {
                quoted = true;
            } else if (c === sep) {
                row.push(field); field = "";
            } else if (c === "\n" || c === "\r") {
                if (c === "\r" && content[i + 1] === "\n") i++;
                row.push(field); field = "";
                if (row.some(x => x.trim() !== "")) rows.push(row);
                row = [];
            } else {
                field += c;
            }
        }
        row.push(field);
        if (row.some(x => x.trim() !== "")) rows.push(row);
        return rows;
    }

    /* One CSV field, quoted when needed */
    function csvField(value) {
        const t = String(value == null ? "" : value);
        return /[;"\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }

    /* Rows → CSV text (";" separator, BOM so that Excel reads UTF-8) */
    function toCsv(rows) {
        return "\uFEFF" + rows.map(r => r.map(csvField).join(";")).join("\r\n") + "\r\n";
    }

    /* "31/12/2025" or "2025-12-31" → "2025-12-31"; impossible date → null */
    function parseDate(raw) {
        const t = String(raw || "").trim();
        let y, m, d;
        let r = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (r) { d = +r[1]; m = +r[2]; y = +r[3]; }
        else {
            r = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!r) return null;
            y = +r[1]; m = +r[2]; d = +r[3];
        }
        const iso = y + "-" + pad(m) + "-" + pad(d);
        const x = utcDate(iso);
        return (x.getUTCFullYear() === y && x.getUTCMonth() + 1 === m && x.getUTCDate() === d) ? iso : null;
    }

    /* "8:05", "08h05" → "08:05"; invalid → null */
    function parseTime(raw) {
        const m = String(raw || "").trim().match(/^(\d{1,2})[:hH](\d{2})$/);
        if (!m || +m[1] > 23 || +m[2] > 59) return null;
        return pad(+m[1]) + ":" + m[2];
    }

    function vibrate() {
        try {
            if (typeof Store !== "undefined" && Store.settings().vibration && navigator.vibrate) navigator.vibrate(35);
        } catch (e) { /* not supported */ }
    }

    return {
        pad, isoLocal, localDate, utcDate, addDays, timestamp,
        hm, hours, stopwatch, clock, dateDmy, dayName, longDate, monthName, dateTime,
        escape, simplify, uid, download, readText, parseCsv, csvField, toCsv, parseDate, parseTime, vibrate
    };
})();
