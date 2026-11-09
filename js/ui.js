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

    /* Icon paths (stroke 1.8, round joins) */
    const PATHS = {
        dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
        team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16.5 14.2c2.6.2 4.4 2.3 5 5.3"/>',
        reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
        logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
        x: '<path d="M6 6l12 12M18 6L6 18"/>',
        left: '<path d="M15 6l-6 6 6 6"/>',
        right: '<path d="M9 6l6 6-6 6"/>',
        play: '<path d="M8 5.5v13l11-6.5z"/>',
        pause: '<path d="M8 5v14M16 5v14"/>',
        stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
        download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
        print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-7 8-7s7.2 3 8 7"/>',
        upload: '<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
        hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
        activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
        briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
        file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
        coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v3M12 3v3"/>',
        trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
        home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
        bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'
    };

    function icon(name, extraClass) {
        return '<svg class="icon' + (extraClass ? " " + extraClass : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (PATHS[name] || "") + "</svg>";
    }

    /* Initials and a stable colour per person (from the name) */
    const AVATAR_COLORS = ["#C8102E", "#15803D", "#B45309", "#7C3AED", "#2563EB", "#DB2777", "#0D9488", "#6B6B6B"];
    function initials(name) {
        const parts = String(name || "?").trim().split(/\s+/);
        return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
    }
    function avatar(name, size) {
        let h = 0;
        String(name || "").split("").forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
        return '<span class="avatar' + (size ? " " + size : "") + '" style="background:' + AVATAR_COLORS[h % AVATAR_COLORS.length] + '" aria-hidden="true">' +
            E(initials(name)) + "</span>";
    }

    /* Badge: kind = success | warning | danger | info | neutral */
    function badge(text, kind) {
        return '<span class="badge ' + (kind || "neutral") + '">' + E(text) + "</span>";
    }

    const STATUS_KIND = { pending: "warning", approved: "success", rejected: "danger" };

    /* ---------- Tabs (2.7): sliding indicator, keyboard, no flicker ----------
       tabs(items, active, name) returns the HTML (render it ONCE);
       onTabs(root, name, fn) wires it: on click the indicator slides and
       fn(key) only redraws the content under the tabs (pages keep the
       tabs in place). Keyboard: ←/→ (wrap), Home, End; roving tabindex. */
    function tabs(items, active, name) {
        return '<div class="segmented" role="tablist" data-tabs="' + name + '"><span class="seg-indicator" aria-hidden="true"></span>' +
            items.map(([k, label]) => '<button type="button" role="tab" data-tab="' + k + '" aria-selected="' + (k === active) + '"' +
                ' tabindex="' + (k === active ? 0 : -1) + '" class="' + (k === active ? "active" : "") + '">' + E(label) + "</button>").join("") + "</div>";
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

    /* KPI tile */
    function kpi(label, value, iconName, kind, sub) {
        return '<div class="kpi ' + (kind || "") + '"><div class="kpi-icon">' + icon(iconName) + "</div><div><span>" + E(label) + "</span><strong>" +
            E(value) + "</strong>" + (sub ? "<small>" + E(sub) + "</small>" : "") + "</div></div>";
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

    return { icon, avatar, initials, badge, STATUS_KIND, tabs, onTabs, placeIndicator, fadeIn, pageHeader, kpi, openSheet, closeSheet };
})();
