/* =============================================================
   page-clock.js — main screen (clocking)
   - one activity at a time: starting one closes the previous one
     at the same instant (no gap);
   - the timer = now − start (nothing "ticks" in memory: correct
     after closing the app, sleep mode or loss of network);
   - an entry shorter than 5 s (double tap) is deleted instead of
     being kept;
   - Break: opens a break; "Resume" restarts the activity, client
     and line used before the break;
   - "Resume like last time": last activity with a client of the
     previous worked day;
   - the client/line/note form is NEVER rebuilt while typing (only
     when the client list changes);
   - no "add entry" button here (removed on request): manual
     entries are added from the Timesheet;
   - the client / line / note choice is inside the Activity card
     (2.4), right above the activity buttons.
   ============================================================= */

const ClockPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    const MIN_ENTRY_MS = 5000;
    let root = null;
    let context = { clientId: "", line: "", note: "" };
    let clientsSignature = "";

    /* ---------------- Actions ---------------- */

    function close(running, at) {
        if (at - running.start < MIN_ENTRY_MS) Store.deleteEntry(running.id);
        else Store.updateEntry(running.id, { end: at }, false);
    }

    function start(key, ctx) {
        const c = Segments.category(key);
        const now = Date.now();
        const clientId = c.client ? (ctx.clientId || "") : "";
        const line = c.client ? (ctx.line || "") : "";
        const running = Store.runningEntry();
        if (running) {
            if (running.category === key && running.clientId === clientId && running.line === line) return;
            close(running, now);
        }
        Store.addEntry({ category: key, clientId, line, note: ctx.note || "", start: now });
        context.note = "";
        const noteField = document.getElementById("ckNote");
        if (noteField) noteField.value = "";
        Utils.vibrate();
    }

    function stop() {
        const running = Store.runningEntry();
        if (!running) return;
        close(running, Date.now());
        Utils.vibrate();
    }

    /* Activity that ended exactly when the current break started */
    function beforeBreak(running) {
        return Store.entries().filter(e => e.end === running.start && e.category !== "break" && e.category !== "lunch")[0] || null;
    }

    function lastTime() {
        const today = Utils.isoLocal(Date.now());
        const previous = Store.entries().filter(e => e.clientId && Utils.isoLocal(e.start) < today).sort((a, b) => b.start - a.start);
        if (!previous.length) return null;
        const day = Utils.isoLocal(previous[0].start);
        return previous.filter(e => Utils.isoLocal(e.start) === day && e.category !== "travel")[0] || previous[0];
    }

    /* ---------------- Rendering ---------------- */

    /* Hero (2.6): real-time clock, date, status, Arrival / Break / Departure.
       Arrival = start "work" with the chosen client/line; Break = start a break
       (Resume = back to the activity before it); Departure = stop everything. */
    function renderTimer() {
        const running = Store.runningEntry();
        const zone = root.querySelector("#ckTimer");
        const now = Date.now();
        const isBreak = running && (running.category === "break" || running.category === "lunch");
        const back = isBreak ? beforeBreak(running) : null;
        const c = running ? Segments.category(running.category) : null;
        let status, dot;
        if (!running) { status = t("clock.statusOff"); dot = ""; }
        else if (isBreak) { status = t("clock.statusBreak", { time: Utils.clock(running.start) }); dot = "break"; }
        else { status = t("clock.statusOn", { activity: Segments.label(running.category), time: Utils.clock(running.start) }); dot = "on"; }
        zone.innerHTML =
            '<div class="big-clock" id="ckNow">' + Utils.clock(now) + '<span class="muted" style="font-size:.45em">:' + Utils.pad(new Date(now).getSeconds()) + "</span></div>" +
            '<div class="muted" style="text-transform:capitalize">' + E(Utils.longDate(Utils.isoLocal(now))) + "</div>" +
            '<div class="status-line"><span class="status-dot ' + dot + '"></span><span>' + E(status) + "</span>" +
            (running ? '<span class="spacer"></span><span class="timer" id="ckTimerText" style="font-size:1.1rem">' + Utils.stopwatch(now - running.start) + "</span>" : "") + "</div>" +
            (running && (running.clientName || running.line || running.note)
                ? '<p class="info" style="margin-top:-.5rem">' + [running.clientName, running.line, running.note].filter(Boolean).map(E).join(" · ") + "</p>" : "") +
            '<div class="punch">' +
            (!running || isBreak && !back
                ? '<button type="button" class="button primary full" id="ckArrive">' + UI.icon("play") + E(t("clock.arrive")) + "</button>" : "") +

            (running && !isBreak ? '<button type="button" class="button" id="ckBreak">' + UI.icon("pause") + E(t("clock.break")) + "</button>" : "") +
            (back ? '<button type="button" class="button primary" id="ckResume">' + UI.icon("play") + E(t("clock.resume")) + "</button>" : "") +
            (running ? '<button type="button" class="button danger solid" id="ckStop">' + UI.icon("stop") + E(t("clock.depart")) + "</button>" : "") +
            "</div>";

        const on = (id, fn) => { const el = zone.querySelector(id); if (el) el.addEventListener("click", fn); };
        on("#ckArrive", () => start("work", context));

        on("#ckBreak", () => start("break", {}));
        on("#ckStop", stop);
        on("#ckResume", () => start(back.category, { clientId: Store.client(back.clientId) ? back.clientId : "", line: back.line }));
        if (c) zone.style.setProperty("--c", c.color);
    }

    function renderForm() {
        const clients = Store.clients();
        clientsSignature = JSON.stringify(clients);
        if (context.clientId && !clients.some(c => c.id === context.clientId)) context = { clientId: "", line: "", note: context.note };

        const recent = [];
        Store.entries().filter(e => e.clientId).sort((a, b) => b.start - a.start).forEach(e => {
            if (recent.length < 4 && recent.indexOf(e.clientId) < 0 && clients.some(c => c.id === e.clientId)) recent.push(e.clientId);
        });

        const zone = root.querySelector("#ckContext");
        zone.innerHTML =
            (recent.length ? '<div class="chips">' + recent.map(id => {
                const c = clients.find(x => x.id === id);
                return '<button type="button" class="chip' + (id === context.clientId ? " active" : "") + '" data-recent="' + E(id) + '">' + E(c.name) + "</button>";
            }).join("") + "</div>" : "") +
            /* no "Line" field on the Clock screen (request of 05/11/2026): it stays in
               Clients, corrections and exports */
            "<label>" + E(t("common.client")) + '<select id="ckClient">' + Editor.clientOptions(context.clientId) + "</select></label>" +
            "<label>" + E(t("clock.noteOptional")) + '<input type="text" id="ckNote" maxlength="200" value="' + E(context.note) + '"></label>' +
            (clients.length ? "" : '<p class="info">' + E(t("clock.noClients")) + "</p>");

        const clientSel = zone.querySelector("#ckClient");
        clientSel.addEventListener("change", () => {
            context.clientId = clientSel.value; context.line = "";
            renderSwitch();
        });
        zone.querySelector("#ckNote").addEventListener("input", e => { context.note = e.target.value; });
        zone.querySelectorAll("[data-recent]").forEach(b => b.addEventListener("click", () => {
            context.clientId = b.dataset.recent; context.line = "";
            renderForm(); renderSwitch();
        }));
    }

    /* "Move the running timer to this client" when the chosen context
       differs from the running activity (category with a client). */
    function renderSwitch() {
        const zone = root.querySelector("#ckSwitch");
        const running = Store.runningEntry();
        /* client only: the line is no longer chosen on this screen */
        const differs = running && Segments.category(running.category).client && running.clientId !== context.clientId;
        zone.innerHTML = differs
            ? '<button type="button" class="button secondary wide" id="ckMove">' + E(t("clock.moveTo", {
                target: context.clientId ? (Store.client(context.clientId) || {}).name || "" : t("common.noClient") })) + "</button>"
            : "";
        const b = zone.querySelector("#ckMove");
        if (b) b.addEventListener("click", () => start(running.category, context));
    }

    const CLOCK_BUTTONS = ["work", "home", "meeting", "travel", "lunch"];

    function declareHome() {
        const res = Store.declareHomeDay(Utils.isoLocal(Date.now()));
        if (typeof res === "string") alert(t("home.err." + res));
        else Utils.vibrate();
    }

    function renderActivities() {
        const running = Store.runningEntry();
        const last = lastTime();
        const zone = root.querySelector("#ckActivities");
        /* The clocking categories (request of 05/11/2026), in this order. "Domicile"
           is the fixed home work day (one tap, 7 h + lunch): never a timer.
           Break stays as Break / Resume in the top card; "Other" is no longer
           offered (existing "Other" entries stay visible and can be corrected). */
        zone.innerHTML =
            '<div class="activities">' + CLOCK_BUTTONS.map(key => {
                const c = Segments.category(key);
                return '<button type="button" class="activity' + (running && running.category === key ? " active" : "") +
                    '" style="--c:' + c.color + '" data-activity="' + key + '">' + E(Segments.label(key)) + "</button>";
            }).join("") + "</div>" +
            (last && !running ? '<button type="button" class="button secondary wide" id="ckLast">' + E(t("clock.likeLastTime", {
                what: Segments.label(last.category) + (last.clientName ? " · " + last.clientName : "") })) + "</button>" : "");
        zone.querySelectorAll("[data-activity]").forEach(b => b.addEventListener("click", () => {
            if (b.dataset.activity === "home") declareHome(); else start(b.dataset.activity, context);
        }));
        const bl = zone.querySelector("#ckLast");
        if (bl) bl.addEventListener("click", () => {
            const id = Store.client(last.clientId) ? last.clientId : "";
            context.clientId = id; context.line = "";
            renderForm();
            start(last.category, context);
        });
    }

    function renderSummary() {
        const now = Date.now();
        const today = Utils.isoLocal(now);
        const settings = Store.settings();
        const entries = Store.entries();
        const summary = Segments.day(today, entries, settings, now);
        const w = Hours.isoWeek(Utils.utcDate(today));
        const s = Hours.weekSummary(Segments.weekSheet(w.year, w.week, entries, settings, now));
        const pct = s.goal > 0 ? Math.min(100, s.done / s.goal * 100) : 100;

        root.querySelector("#ckSummary").innerHTML =
            '<div class="figures">' +
            "<div><span>" + E(t("clock.today")) + "</span><strong>" + Utils.hm(summary.totalMs) + "</strong></div>" +
            "<div><span>" + E(t("clock.ofWhichNight")) + "</span><strong>" + Utils.hm(summary.nightMs) + "</strong></div>" +
            "<div><span>" + E(t("clock.weekDone", { n: w.week })) + "</span><strong>" + Utils.hours(s.done) + "</strong></div>" +
            Countdown.figureHtml(s, t("clock.countdown", { n: w.week })) +
            '</div><div class="bar"><div style="width:' + pct.toFixed(1) + '%"></div></div>' +
            Countdown.detailHtml(s);

        const dayStart = Utils.localDate(today).getTime();
        const dayLength = Utils.localDate(Utils.addDays(today, 1)).getTime() - dayStart;
        root.querySelector("#ckTimeline").innerHTML =
            '<div class="timeline">' + summary.pieces.map(p => {
                const c = Segments.category(p.entry.category);
                return '<span title="' + E(Segments.label(c.key)) + " " + Utils.clock(p.start) + "-" + Utils.clock(p.end) +
                    '" style="left:' + ((p.start - dayStart) / dayLength * 100).toFixed(3) + "%;width:" +
                    Math.max(0.3, (p.end - p.start) / dayLength * 100).toFixed(3) + "%;background:" + c.color + '"></span>';
            }).join("") + "</div>" +
            '<div class="timeline-scale"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span></div>' +
            '<div class="legend">' + Segments.CATEGORIES.filter(c => summary.byCategory[c.key] > 0).map(c =>
                '<span><i style="background:' + c.color + '"></i>' + E(Segments.label(c.key)) + " " + Utils.hm(summary.byCategory[c.key]) + "</span>").join("") + "</div>";

        /* no correction button without the right (managers only, 06/11/2026) */
        root.querySelector("#ckJournal").innerHTML = Editor.listHtml(Editor.entriesOfDay(today, now), now,
            !Permissions.can("timesheet.correct.approve"), Store.currentUserId());
    }

    function render() {
        if (!root) return;
        if (tab !== "today") { sheet.render(); return; }
        if (JSON.stringify(Store.clients()) !== clientsSignature) renderForm();
        renderTimer();
        renderSwitch();
        renderActivities();
        renderSummary();
    }

    /* Called every second: only the timer text */
    function tick() {
        if (!root || tab !== "today") return;
        const now = Date.now();
        const el = root.querySelector("#ckTimerText");
        const running = Store.runningEntry();
        if (el && running) el.textContent = Utils.stopwatch(now - running.start);
        const clockEl = root.querySelector("#ckNow");
        if (clockEl) clockEl.innerHTML = Utils.clock(now) + '<span class="muted" style="font-size:.45em">:' + Utils.pad(new Date(now).getSeconds()) + "</span>";
    }

    /* Two tabs: Today (clocking) and Timesheet (week / month, corrections,
       imports, exports). The tabs are drawn ONCE; a click only redraws the
       body (#ckBody) — no flicker, the indicator slides (ui.js). */
    let tab = "today";
    const TABS = ["today", "sheet"];
    const sheet = makeTimesheet({ rootId: "ckSheet" });

    function body() {
        const zone = root.querySelector("#ckBody");
        zone.innerHTML = tab === "today"
            ? '<div class="clock-hero"><div class="card timer-card" id="ckTimer"></div>' +
              '<div class="card"><h2>' + E(t("clock.myWeek")) + '</h2><div id="ckSummary"></div><div id="ckTimeline"></div></div></div>' +
              '<div class="card"><h2>' + E(t("clock.activity")) + '</h2><div id="ckContext"></div><div id="ckSwitch"></div><div id="ckActivities"></div></div>' +
              '<div class="card"><h2>' + E(t("clock.journal")) + '</h2><div id="ckJournal"></div></div>'
            : '<div id="ckSheet"></div>';
        if (tab === "today") { clientsSignature = ""; render(); } else sheet.init();
    }

    function layout() {
        root.innerHTML = UI.pageHeader(t("nav.clock"), t("clock.subtitle")) +
            UI.tabs([["today", t("clock.tabToday")], ["sheet", t("clock.tabSheet")]], tab, "clock") + '<div id="ckBody"></div>';
        UI.onTabs(root, "clock", k => { tab = k; App.setSub("clock", k); body(); UI.fadeIn(root.querySelector("#ckBody")); });
        body();
    }

    function init() {
        root = document.getElementById("page-clock");
        layout();
    }

    /* Deep link (#clock/sheet) and URL sync */
    function setTab(k) {
        if (TABS.indexOf(k) < 0 || k === tab) return;
        tab = k;
        if (root) layout();
    }

    return { init, render, tick, start, stop, setTab, getTab: () => tab, context: () => context };
})();
