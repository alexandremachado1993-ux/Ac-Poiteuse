/* =============================================================
   editor.js — correction of a DAY (request of 06/11/2026)
   - managers only ("timesheet.correct.approve"): technicians report an
     error instead (page-timesheet.js → Store.requestCorrection);
   - ONE form for the whole day: arrival, departure, MEAL (start / end),
     activity, client, line, note, mandatory REASON; live summary
     "pointed − meal = day";
   - saved by Store.correctDay as clean consecutive entries
     (activity · meal · activity); original values kept in the history,
     one audit event, the employee is notified;
   - works on the data of any account of the manager's perimeter
     (options.userId); the running entry is not corrected here.
   Also exposes `listHtml()`: list of entries reused by the Clock and
   Timesheet pages (edit buttons delegated via data-edit / data-owner,
   wired once in app.js; no edit button without the right).
   ============================================================= */

const Editor = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;

    const dialog = () => document.getElementById("editor");

    function clientOptions(selected) {
        return '<option value="">' + E(t("common.noClientOption")) + "</option>" +
            Store.clients().map(c => '<option value="' + E(c.id) + '"' + (c.id === selected ? " selected" : "") + ">" +
                E(c.name) + (c.city ? " (" + E(c.city) + ")" : "") + "</option>").join("");
    }

    function lineOptions(clientId, selected) {
        const c = clientId ? Store.client(clientId) : null;
        const lines = c ? c.lines.slice() : [];
        if (selected && lines.indexOf(selected) < 0) lines.push(selected);
        return '<option value="">' + E(t("common.lineOption")) + "</option>" +
            lines.map(l => "<option" + (l === selected ? " selected" : "") + ">" + E(l) + "</option>").join("");
    }

    const canCorrect = () => Permissions.can("timesheet.correct.approve");

    /* open({ id, userId }) to correct the day of an entry; open({ date, userId }) to add a day */
    function open(options) {
        if (!canCorrect()) return;
        const uid = options.userId || Store.currentUserId();
        const block = options.id ? Store.withUser(uid, () => Store.dayBlock(options.id)) : null;
        if (options.id && !block) return;
        if (block && block.main.end == null) { alert(t("editor.runningNoEdit")); return; }
        const main = block ? block.main : null;
        const day = block ? Utils.isoLocal(block.start) : options.date;
        const endDay = block ? Utils.isoLocal(block.end) : day;
        const meal = block ? block.lunch : null;
        const who = (Store.user(uid) || {}).name || "";
        const edited = block ? [block.main, block.lunch, block.rest].filter(Boolean).reduce((all, x) => all.concat(x.history || []), [])
            .sort((x, y) => x.at.localeCompare(y.at)) : [];
        const last = edited[edited.length - 1];
        const field = (id, label, type, value, extra) => "<label>" + E(label) + '<input type="' + type + '" id="' + id + '" value="' + E(value) + '"' + (extra || "") + "></label>";

        const dlg = dialog();
        dlg.innerHTML =
            '<form method="dialog" class="editor-form" id="editorForm">' +
            '<div class="ed-head"><h2>' + E(t(block ? "editor.titleDay" : "editor.titleAddDay", { date: Utils.dateDmy(day) })) + "</h2>" +
            (who ? '<span class="person">' + UI.avatar(who, "small") + E(who) + "</span>" : "") + "</div>" +
            (last ? '<p class="banner info">' + E(t("editor.alreadyCorrected", { n: edited.length, name: (Store.user(last.by) || {}).name || "—", reason: last.reason || "—" })) + "</p>" : "") +
            /* 1. the day */
            '<div class="ed-section"><h3>' + UI.icon("clock") + E(t("editor.sDay")) + "</h3>" +
            '<div class="ed-grid">' +
            '<span class="ed-row-label">' + E(t("editor.arrival")) + "</span>" +
            field("edStartDate", t("editor.date"), "date", day, " required") +
            field("edStartTime", t("editor.time"), "time", main ? Utils.clock(block.start) : "08:00", " required") +
            '<span class="ed-row-label">' + E(t("editor.departure")) + "</span>" +
            field("edEndDate", t("editor.date"), "date", endDay, " required") +
            field("edEndTime", t("editor.time"), "time", main ? Utils.clock(block.end) : "17:00", " required") +
            "</div></div>" +
            /* 2. the meal */
            '<div class="ed-section"><h3>' + UI.icon("coffee") + E(t("editor.sMeal")) + "</h3>" +
            '<label class="check"><input type="checkbox" id="edHasMeal"' + (meal || !block ? " checked" : "") + "> " + E(t("editor.hasMeal")) + "</label>" +
            '<div class="grid-2" id="edMealTimes">' +
            field("edMealStart", t("editor.mealStart"), "time", meal ? Utils.clock(meal.start) : "12:00") +
            field("edMealEnd", t("editor.mealEnd"), "time", meal ? Utils.clock(meal.end) : "13:00") +
            '</div><p class="info">' + E(t("editor.mealHint")) + "</p></div>" +
            /* 3. the activity */
            '<div class="ed-section"><h3>' + UI.icon("briefcase") + E(t("editor.sActivity")) + "</h3>" +
            '<div class="grid-2"><label>' + E(t("editor.activity")) + '<select id="edCategory">' + Segments.CATEGORIES
                .filter(c => c.key !== "lunch" && c.key !== "break" && (c.key !== "other" || (main && main.category === "other")))
                .map(c => '<option value="' + c.key + '"' + (c.key === (main ? main.category : "work") ? " selected" : "") + ">" + E(Segments.label(c.key)) + "</option>").join("") +
            "</select></label>" +
            "<label>" + E(t("common.client")) + '<select id="edClient">' + clientOptions(main ? main.clientId : "") + "</select></label>" +
            "<label>" + E(t("common.line")) + '<select id="edLine">' + lineOptions(main ? main.clientId : "", main ? main.line : "") + "</select></label>" +
            field("edNote", t("common.note"), "text", main ? main.note : "", ' maxlength="200"') + "</div>" +
            (main && main.clientName && !Store.client(main.clientId) ? '<p class="info">' + E(t("editor.deletedClient", { name: main.clientName })) + "</p>" : "") +
            "</div>" +
            /* live summary */
            '<div class="ed-summary" id="edSummary"></div>' +
            /* reason */
            '<label class="ed-reason">' + E(t("editor.reason")) + '<textarea id="edReason" rows="2" maxlength="300" required></textarea></label>' +
            '<p class="error" id="edError"></p>' +
            '<div class="actions">' +
            (block ? '<button type="button" class="button danger" id="edDelete">' + UI.icon("trash") + E(t("editor.deleteDay")) + "</button>" : "") +
            '<span class="spacer"></span>' +
            '<button type="button" class="button" id="edCancel">' + E(t("common.cancel")) + "</button>" +
            '<button type="submit" class="button primary">' + UI.icon("check") + E(t("common.save")) + "</button>" +
            "</div></form>";

        const q = sel => dlg.querySelector(sel);
        const mealToggle = () => { q("#edMealTimes").hidden = !q("#edHasMeal").checked; summary(); };
        q("#edHasMeal").addEventListener("change", mealToggle);
        ["#edStartDate", "#edStartTime", "#edEndDate", "#edEndTime", "#edMealStart", "#edMealEnd", "#edCategory"].forEach(id => q(id).addEventListener("input", summary));
        q("#edClient").addEventListener("change", () => { q("#edLine").innerHTML = lineOptions(q("#edClient").value, ""); });
        q("#edCancel").addEventListener("click", close);
        const del = q("#edDelete");
        if (del) del.addEventListener("click", () => {
            const reason = q("#edReason").value.trim();
            if (!reason) { q("#edError").textContent = t("correct.err.reasonRequired"); q("#edReason").focus(); return; }
            if (!confirm(t("editor.confirmDeleteDay"))) return;
            Store.withUser(uid, () => [block.main, block.lunch, block.rest].filter(Boolean).forEach(x => Store.deleteEntry(x.id, reason)));
            close();
        });
        q("#editorForm").addEventListener("submit", ev => { ev.preventDefault(); save(uid, block); });
        mealToggle();

        if (typeof dlg.showModal === "function") dlg.showModal();
        else dlg.setAttribute("open", "");
    }

    /* Values read from the form: { start, end, lunch | null } (timestamps) */
    function read() {
        const q = sel => (dialog().querySelector(sel) || {}).value || "";
        const start = Utils.timestamp(q("#edStartDate"), q("#edStartTime"));
        const end = Utils.timestamp(q("#edEndDate"), q("#edEndTime"));
        let lunch = null;
        if (dialog().querySelector("#edHasMeal").checked) {
            /* the meal is on the arrival day, or on the departure day when its time is before the arrival */
            const mealDay = q("#edMealStart") < q("#edStartTime") && q("#edEndDate") > q("#edStartDate") ? q("#edEndDate") : q("#edStartDate");
            lunch = { start: Utils.timestamp(mealDay, q("#edMealStart")), end: Utils.timestamp(mealDay, q("#edMealEnd")) };
        }
        return { start, end, lunch };
    }

    function summary() {
        const z = dialog().querySelector("#edSummary");
        if (!z) return;
        const v = read();
        const ok = !isNaN(v.start) && !isNaN(v.end) && v.end > v.start;
        const pointed = ok ? v.end - v.start : 0;
        const meal = v.lunch && v.lunch.end > v.lunch.start ? v.lunch.end - v.lunch.start : 0;
        z.innerHTML = '<div><span>' + E(t("editor.sumPointed")) + "</span><strong>" + (ok ? Utils.hm(pointed) : "—") + "</strong></div>" +
            '<div class="minus"><span>' + E(t("editor.sumMeal")) + "</span><strong>" + (meal ? "− " + Utils.hm(meal) : "—") + "</strong></div>" +
            '<div class="total"><span>' + E(t("editor.sumDay")) + "</span><strong>" + (ok ? Utils.hm(Math.max(0, pointed - meal)) : "—") + "</strong></div>";
    }

    function close() {
        const dlg = dialog();
        if (typeof dlg.close === "function") dlg.close();
        else dlg.removeAttribute("open");
    }

    function save(uid, block) {
        const dlg = dialog();
        const error = dlg.querySelector("#edError");
        const val = id => (dlg.querySelector(id) || {}).value || "";
        const v = read();
        if (!val("#edStartDate") || isNaN(v.start)) { error.textContent = t("editor.errStart"); return; }
        if (isNaN(v.end) || v.end <= v.start) { error.textContent = t("editor.errOrder"); return; }
        if (v.end > Date.now()) { error.textContent = t("editor.errFutureEnd"); return; }
        if (v.lunch && (isNaN(v.lunch.start) || isNaN(v.lunch.end))) { error.textContent = t("correct.err.badLunch"); return; }

        const withClient = Segments.category(val("#edCategory")).client;
        const fields = { category: val("#edCategory"), clientId: withClient ? val("#edClient") : "", line: withClient ? val("#edLine") : "",
            note: val("#edNote").trim(), start: v.start, end: v.end };
        /* other entries of that person overlapping the corrected day: confirmation */
        const mine = block ? [block.main, block.lunch, block.rest].filter(Boolean).map(x => x.id) : [];
        const overlapping = Store.withUser(uid, () => Store.entries()).filter(x => mine.indexOf(x.id) < 0 &&
            x.start < v.end && (x.end == null ? Date.now() : x.end) > v.start && x.category !== "lunch");
        if (overlapping.length && !confirm(t("editor.confirmOverlap", { n: overlapping.length }))) return;

        const res = Store.correctDay({ userId: uid, entryId: block ? block.main.id : null, fields, lunch: v.lunch, reason: val("#edReason").trim() });
        if (res !== true) { error.textContent = t("correct.err." + res); return; }
        close();
    }

    /* HTML list of entries (whole entries) */
    function listHtml(list, now, readOnly, ownerId) {
        if (!list.length) return '<p class="empty">' + E(t("common.noEntries")) + "</p>";
        return '<ul class="journal">' + list.slice().sort((a, b) => a.start - b.start).map(e => {
            const c = Segments.category(e.category);
            const end = e.end == null ? now : e.end;
            const flags =
                (e.end == null ? '<span class="tag running">' + E(t("flag.running")) + "</span>" : "") +
                (e.manual ? '<span class="tag">' + E(t("flag.manual")) + "</span>" : "") +
                (e.imported ? '<span class="tag">' + E(t("flag.imported")) + "</span>" : "") +
                (e.edited ? '<span class="tag edited">' + E(t("flag.edited")) + "</span>" : "") +
                (e.toCheck ? '<span class="tag warn">' + E(t("flag.toCheck")) + "</span>" : "");
            const sub = [e.clientName, e.line, e.note].filter(Boolean).map(E).join(" · ");
            return '<li style="--c:' + c.color + '">' +
                '<span class="journal-times">' + Utils.clock(e.start) + " → " + (e.end == null ? "…" : Utils.clock(e.end)) +
                (e.end != null && Utils.isoLocal(e.end) !== Utils.isoLocal(e.start) ? " (+1)" : "") + "</span>" +
                '<span class="journal-text"><strong>' + E(Segments.label(e.category)) + "</strong> " + flags +
                (sub ? "<br><small>" + sub + "</small>" : "") + "</span>" +
                '<span class="journal-duration">' + Utils.hm(end - e.start) + "</span>" +
                (readOnly ? "" : '<button type="button" class="button mini" data-edit="' + E(e.id) + '" data-owner="' + E(ownerId || "") + '" aria-label="' + E(t("common.edit")) + '">✎</button>') +
                "</li>";
        }).join("") + "</ul>";
    }

    /* Whole entries touching a given day */
    function entriesOfDay(iso, now) {
        const dayStart = Utils.localDate(iso).getTime();
        const dayEnd = Utils.localDate(Utils.addDays(iso, 1)).getTime();
        return Store.entries().filter(e => e.start < dayEnd && (e.end == null ? now : e.end) > dayStart);
    }

    return { open, close, listHtml, entriesOfDay, clientOptions, lineOptions };
})();
