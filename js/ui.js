/* =============================================================
   ui.js — shared interface components (version 2.6 redesign)
   - icons: simple stroke icons drawn here (24×24, currentColor),
     no external library → offline mode preserved;
   - avatar with initials and a stable colour per person;
   - status badges, sub-tabs (segmented control), modal sheet.
   No business logic here.
   ============================================================= */

const UI = (() => {
    "use strict";

    const E = Utils.escape;

    /* Icons: Lucide (lucide.dev, ISC License — see LICENSE-lucide.txt), copied as SVG paths:
       no library loaded, works offline. 4.0: same names as before, Lucide drawing. */
    const PATHS = {
        backspace: '<path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/>',
        training: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
        mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
        phone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
        globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        calendar: '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
        team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
        reports: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
        settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
        logout: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
        plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
        minus: '<path d="M5 12h14"/>',
        grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
        eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
        eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        left: '<path d="m15 18-6-6 6-6"/>',
        right: '<path d="m9 18 6-6-6-6"/>',
        play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
        pause: '<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
        stop: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
        download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
        print: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
        user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
        hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
        activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
        briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
        file: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
        coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
        trash: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
        bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
        wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
        car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
        utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
        star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
        alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
        send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
        flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
        shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
        lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
        pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
        arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
        search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>'
    };

    /* Icon of each activity (2.9) */
    const ACTIVITY_ICONS = { work: "wrench", travel: "car", meeting: "users", training: "training", lunch: "utensils", break: "coffee", home: "home", other: "activity" };

    /* Coloured square with the icon of an activity */
    function activityIcon(category, solid) {
        const c = Segments.category(category);
        return '<span class="act-icon' + (solid ? " solid" : "") + '" style="--c:' + c.color + '">' + icon(ACTIVITY_ICONS[c.key] || "activity") + "</span>";
    }

    /* Progress ring (SVG). pct 0..1; inner = HTML shown in the middle */
    function ring(pct, size, stroke, color, track, inner) {
        const s = size || 120, w = stroke || 11, r = (s - w) / 2, c = 2 * Math.PI * r;
        const dash = c * Math.max(0, Math.min(1, pct || 0));
        return '<span class="ring" style="width:' + s + "px;height:" + s + 'px"><svg width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + " " + s + '" aria-hidden="true">' +
            '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + (track || "rgba(255,255,255,.12)") + '" stroke-width="' + w + '"/>' +
            '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + (color || "#801F35") + '" stroke-width="' + w + '" stroke-linecap="round" ' +
            'stroke-dasharray="' + dash.toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 ' + s / 2 + " " + s / 2 + ')"/></svg>' +
            '<span class="ring-in">' + (inner || "") + "</span></span>";
    }

    /* Sparkline of a series of numbers (last point marked) */
    function spark(values, color, width, height) {
        const v = (values || []).filter(x => Number.isFinite(x));
        const w = width || 96, h = height || 34;
        if (v.length < 2) return "";
        const lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), span = (hi - lo) || 1;
        const pts = v.map((x, i) => [i * w / (v.length - 1), h - 3 - (x - lo) / span * (h - 6)]);
        const line = pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
        const last = pts[pts.length - 1];
        return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">' +
            '<polygon points="0,' + h + " " + line + " " + w + "," + h + '" fill="' + color + '" opacity=".1"/>' +
            '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
            '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3" fill="' + color + '"/></svg>';
    }

    /* Avatar with a live status dot: state = on | break | leave | off */
    function avatarStatus(name, state, size) {
        return '<span class="avatar-wrap">' + avatar(name, size) + '<span class="dot-status ' + E(state || "off") + '"></span></span>';
    }

    /* State of an account right now: "on" | "break" | "leave" | "off" (dashboard, team) */
    const PERSON_STATES = { on: ["dash.state.on", "success"], break: ["dash.state.break", "warning"], leave: ["dash.state.leave", "info"], off: ["dash.state.off", "neutral"] };
    function personState(id) {
        return Store.withUser(id, () => {
            const running = Store.runningEntry();
            if (running) return running.category === "break" || running.category === "lunch" ? "break" : "on";
            return Store.absencesOn(Utils.isoLocal(Date.now())).length ? "leave" : "off";
        });
    }

    /* Password field (sign-in, profile). Letters allowed: no numeric keyboard on phones.
       4.3.1: eye button to show / hide what is typed (one listener for every field, below). */
    function passwordField(id, labelKey, autocomplete, attrs) {
        return "<label>" + E(I18n.t(labelKey)) + '<span class="pw-field"><input type="password" class="pw-input" id="' + id + '" autocomplete="' + autocomplete + '"' + (attrs || "") + ">" +
            '<button type="button" class="pw-eye" data-pw-eye aria-pressed="false" aria-label="' + E(I18n.t("login.showPassword")) + '">' + icon("eyeOff") + "</button></span></label>";
    }
    document.addEventListener("mousedown", e => { if (e.target.closest && e.target.closest("[data-pw-eye]")) e.preventDefault(); });   /* the field keeps the focus */
    document.addEventListener("click", e => {
        const b = e.target.closest && e.target.closest("[data-pw-eye]");
        if (!b) return;
        const field = b.parentNode.querySelector("input"), show = field.type === "password";
        field.type = show ? "text" : "password";
        b.setAttribute("aria-pressed", String(show));
        b.setAttribute("aria-label", I18n.t(show ? "login.hidePassword" : "login.showPassword"));
        b.innerHTML = icon(show ? "eye" : "eyeOff");
    });

    /* 4.4 (A): time of the last clocking of today (start or end of an entry), or null */
    function lastPunch() {
        const now = Date.now(), today = Utils.isoLocal(now);
        let last = 0;
        Store.entries().forEach(e => [e.start, e.end].forEach(x => { if (x && x <= now && x > last && Utils.isoLocal(x) === today) last = x; }));
        return last || null;
    }
    const punchLine = () => { const at = lastPunch(); return at ? '<p class="punch-ok">' + icon("check") + "<span>" + E(I18n.t("clock.lastPunch", { time: Utils.clock(at) })) + "</span></p>" : ""; };

    /* Name of an account, or `fallback` when unknown */
    const nameOf = (id, fallback) => (Store.user(id) || {}).name || fallback || "";

    /* Status pill (dot + text): state = on | break | leave | off */
    function pill(text, state) {
        return '<span class="pill ' + E(state || "") + '"><i></i>' + E(text) + "</span>";
    }

    /* Week bars of a sheet (Segments.weekSheet): one column per day, stacked by
       activity; credited days (holiday, leave, time off) hatched at dayHours. */
    function weekBars(sheet, opts) {
        const o = opts || {};
        const today = Utils.isoLocal(Date.now());
        const dayHours = Store.org().dayHours;
        const cols = Hours.DAYS.map((key, i) => {
            const j = sheet.days[key];
            const iso = Hours.isoDayOf(sheet.year, sheet.week, i);
            const by = (j && j.summary && j.summary.byCategory) || {};
            const holiday = Holidays.isHoliday(Utils.utcDate(iso));
            const absences = Store.absencesOn(iso).filter(a => a.type === "paid_leave" || a.type === "time_off");
            const credited = holiday || absences.length ? dayHours : 0;
            const max = o.max || 11;
            const segs = Segments.CATEGORIES.filter(c => c.key !== "lunch" && c.key !== "break" && by[c.key] > 0)
                .map(c => '<span style="height:' + Math.min(100, by[c.key] / 3600000 / max * 100).toFixed(1) + "%;background:" + c.color + '"></span>').join("") +
                (credited ? '<span class="hatch" style="height:' + (credited / max * 100).toFixed(1) + '%"></span>' : "");
            const total = (j ? j.hours : 0) + credited;
            const note = holiday ? (Holidays.name ? Holidays.name(Utils.utcDate(iso)) : "") || I18n.t("tag.holiday")
                : absences.length ? I18n.t(absences.some(a => a.type === "paid_leave") ? "tag.paidLeave" : "tag.timeOff") : "";
            return '<div class="wk-bar"><span class="wk-val">' + (total > 0 ? Utils.hours(total) : "—") + '</span><div class="wk-col">' + segs + "</div>" +
                '<span class="wk-day' + (iso === today ? " today" : "") + '">' + E(Utils.dayName(iso).slice(0, 3)) + " " + iso.slice(8) + "</span>" +
                '<span class="wk-note">' + E(note) + "</span></div>";
        });
        return '<div class="wk-bars">' + cols.join("") + "</div>";
    }

    /* Legend of the week bars */
    function weekLegend() {
        return '<div class="legend">' + ["work", "travel", "meeting", "training", "home"].map(k => '<span><i style="background:' + Segments.category(k).color + '"></i>' + E(Segments.label(k)) + "</span>").join("") +
            '<span><i style="background:repeating-linear-gradient(135deg,#8A8383 0 2px,transparent 2px 4px);border:1px solid #8A8383"></i>' + E(I18n.t("ui.credited")) + "</span></div>";
    }

    /* Short-lived message with an action (undo). seconds: countdown; onAction: click. */
    let toastTimer = null;
    /* 3.1: the toast is built ONCE; each second only the figure and the bar change
       (rebuilding it replayed the entrance animation: it blinked every second) */
    function toast(html, actionLabel, seconds, onAction) {
        const zone = document.getElementById("toast");
        if (!zone) return;
        clearInterval(toastTimer);
        let left = seconds || 0;
        zone.innerHTML = '<div class="toast" role="status"><div class="toast-row"><div class="toast-text">' + html + "</div>" +
            (actionLabel ? '<button type="button" class="button" id="toastAction">' + icon("undo") + E(actionLabel) + '<span id="toastLeft"></span></button>' : "") + "</div>" +
            (seconds ? '<div class="toast-bar"><div id="toastBar" style="width:100%"></div></div>' : "") + "</div>";
        const figure = zone.querySelector("#toastLeft"), bar = zone.querySelector("#toastBar");
        const update = () => {
            if (figure) figure.textContent = left ? " · " + left + " s" : "";
            if (bar) bar.style.width = (left / seconds * 100).toFixed(0) + "%";
        };
        const b = zone.querySelector("#toastAction");
        if (b) b.addEventListener("click", () => { clearInterval(toastTimer); zone.innerHTML = ""; if (onAction) onAction(); });
        update();
        toastTimer = setInterval(() => {
            left -= 1;
            if (left <= 0) { clearInterval(toastTimer); zone.innerHTML = ""; return; }
            update();
        }, 1000);
    }

    function icon(name, extraClass) {
        return '<svg class="icon' + (extraClass ? " " + extraClass : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (PATHS[name] || "") + "</svg>";
    }

    /* Initials and a stable colour per person (from the name) */
    const AVATAR_COLORS = ["#801F35", "#15803D", "#B45309", "#7C3AED", "#2563EB", "#DB2777", "#0D9488", "#6B6B6B"];
    function initials(name) {
        const parts = String(name || "?").trim().split(/\s+/);
        return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
    }
    /* ONE colour per person, the same on every screen (avatars, calendar, lists) */
    function personColor(name) {
        let h = 0;
        String(name || "").split("").forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
        return AVATAR_COLORS[h % AVATAR_COLORS.length];
    }
    function avatar(name, size) {
        return '<span class="avatar' + (size ? " " + size : "") + '" style="background:' + personColor(name) + '" aria-hidden="true">' +
            E(initials(name)) + "</span>";
    }
    /* 3.1: small round badge of a person (initials on his colour) inside an absence label */
    function who(name) {
        return '<span class="who" style="background:' + personColor(name) + '" aria-hidden="true">' + E(initials(name)) + "</span>";
    }

    /* 3.1: theme chosen by the person. "auto" follows the device; "light" / "dark" force it.
       4.2: the dark rules of style.css are scoped to <html data-theme="dark"> (no stylesheet
       rewriting: that was refused by the browser when index.html is opened by double-click). */
    let themeMode = "auto";
    const deviceDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    function applyTheme(mode) {
        themeMode = mode === "light" || mode === "dark" ? mode : "auto";
        const dark = themeMode === "dark" || (themeMode === "auto" && !!deviceDark && deviceDark.matches);
        document.documentElement.dataset.theme = dark ? "dark" : "light";
    }
    if (deviceDark && deviceDark.addEventListener) deviceDark.addEventListener("change", () => { if (themeMode === "auto") applyTheme("auto"); });
    applyTheme("auto");   /* before the first paint: the device theme until the person's choice is known */

    /* 3.1: side menu on the left or on the right (computer); the bottom bar is unchanged */
    function applyMenuSide(side) { document.body.classList.toggle("menu-right", side === "right"); }

    /* Badge: kind = success | warning | danger | info | neutral */
    function badge(text, kind) {
        return '<span class="badge ' + (kind || "neutral") + '">' + E(text) + "</span>";
    }

    /* badge colour of every request status (leave circuit 06/11/2026; "pending" kept for older data) */
    /* 3.0: leave / absence types → label keys (one place for every screen) */
    const LEAVE_TYPE_KEYS = { paid_leave: "leave.type.paid", time_off: "leave.type.timeOff", justified: "leave.type.justified",
        family_event: "leave.type.family", training: "leave.type.training", other: "leave.type.other" };
    const STATUS_KIND = { pending: "warning", draft: "neutral", pending_lead: "warning", lead_favorable: "info", lead_unfavorable: "danger",
        pending_final: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };

    /* ---------- Tabs (2.7): sliding indicator, keyboard, no flicker ----------
       tabs(items, active, name) returns the HTML (render it ONCE);
       onTabs(root, name, fn) wires it: on click the indicator slides and
       fn(key) only redraws the content under the tabs (pages keep the
       tabs in place). Keyboard: ←/→ (wrap), Home, End; roving tabindex. */
    /* 4.7: items [key, label, count?]; level "sub" = second-level tabs (smaller, outlined) */
    function tabs(items, active, name, level) {
        return '<div class="segmented' + (level === "sub" ? " sub" : "") + '" role="tablist" data-tabs="' + name + '"><span class="seg-indicator" aria-hidden="true"></span>' +
            items.map(([k, label, count]) => '<button type="button" role="tab" data-tab="' + k + '" aria-selected="' + (k === active) + '"' +
                ' tabindex="' + (k === active ? 0 : -1) + '" class="' + (k === active ? "active" : "") + '">' + E(label) +
                (count ? '<span class="tab-count">' + count + "</span>" : "") + "</button>").join("") + "</div>";
    }

    /* Moves the indicator under the active tab (animated unless `instant`) */
    function placeIndicator(seg, instant) {
        const active = seg.querySelector("[data-tab].active");
        const ind = seg.querySelector(".seg-indicator");
        if (!active || !ind || !active.offsetWidth) { seg.classList.remove("ready"); return; }   /* not laid out yet: plain active style */
        if (instant) ind.style.transition = "none";
        ind.style.width = active.offsetWidth + "px";
        ind.style.height = active.offsetHeight + "px";
        ind.style.transform = "translate(" + active.offsetLeft + "px," + active.offsetTop + "px)";
        if (instant) { void ind.offsetWidth; ind.style.transition = ""; }
        seg.classList.add("ready");
    }

    function select(seg, key) {
        seg.querySelectorAll("[data-tab]").forEach(b => {
            const on = b.dataset.tab === key;
            b.classList.toggle("active", on);
            b.setAttribute("aria-selected", String(on));
            b.tabIndex = on ? 0 : -1;
        });
        placeIndicator(seg, false);
    }

    function onTabs(root, name, fn) {
        const seg = root.querySelector('[data-tabs="' + name + '"]');
        if (!seg) return;
        placeIndicator(seg, true);
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => placeIndicator(seg, true));
        const buttons = () => Array.from(seg.querySelectorAll("[data-tab]"));
        seg.addEventListener("click", ev => {
            const b = ev.target.closest("[data-tab]");
            if (!b || b.classList.contains("active")) return;
            select(seg, b.dataset.tab);
            fn(b.dataset.tab);
        });
        seg.addEventListener("keydown", ev => {
            const list = buttons();
            const i = list.indexOf(document.activeElement);
            if (i < 0) return;
            let j = null;
            if (ev.key === "ArrowRight") j = (i + 1) % list.length;
            else if (ev.key === "ArrowLeft") j = (i - 1 + list.length) % list.length;
            else if (ev.key === "Home") j = 0;
            else if (ev.key === "End") j = list.length - 1;
            if (j === null) return;
            ev.preventDefault();
            list[j].focus();
            list[j].click();
        });
    }

    /* One listener for the whole app: indicators follow size changes */
    if (typeof window !== "undefined") {
        let timer = null;
        window.addEventListener("resize", () => {
            clearTimeout(timer);
            timer = setTimeout(() => document.querySelectorAll(".segmented").forEach(seg => placeIndicator(seg, true)), 80);
        });
    }

    /* Short fade of a zone whose content just changed (tab switch) */
    function fadeIn(el) {
        if (!el) return;
        el.classList.remove("fade-in");
        void el.offsetWidth;
        el.classList.add("fade-in");
    }

    /* Page header: title + optional subtitle + actions HTML */
    function pageHeader(title, subtitle, actions) {
        return '<div class="page-header"><div><h1>' + E(title) + "</h1>" + (subtitle ? '<p class="muted">' + E(subtitle) + "</p>" : "") + "</div>" +
            (actions ? '<div class="actions">' + actions + "</div>" : "") + "</div>";
    }

    /* KPI tile (2.9: optional chart HTML on the right — ring or sparkline) */
    function kpi(label, value, iconName, kind, sub, chart) {
        return '<div class="kpi ' + (kind || "") + '"><div class="kpi-icon">' + icon(iconName) + '</div><div style="min-width:0"><span>' + E(label) + "</span><strong>" +
            E(value) + "</strong>" + (sub ? "<small>" + E(sub) + "</small>" : "") + "</div>" + (chart || "") + "</div>";
    }

    /* Modal sheet (uses the existing <dialog id="sheet">) */
    function openSheet(html, wire) {
        const dlg = document.getElementById("sheet");
        dlg.innerHTML = '<div class="sheet-body">' + html + "</div>";
        dlg.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeSheet));
        if (wire) wire(dlg);
        if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    }
    function closeSheet() {
        const dlg = document.getElementById("sheet");
        if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
    }

    return { icon, avatar, who, applyTheme, applyMenuSide, badge, STATUS_KIND, LEAVE_TYPE_KEYS, tabs, onTabs, fadeIn, pageHeader, kpi, openSheet, closeSheet,
        activityIcon, ring, spark, avatarStatus, pill, weekBars, weekLegend, toast, PERSON_STATES, personState, nameOf, passwordField, lastPunch, punchLine };
})();
