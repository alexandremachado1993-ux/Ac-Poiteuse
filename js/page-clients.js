/* =============================================================
   page-clients.js — client list used by clocking
   Two ways in: typed by hand, CSV import (Name;City;Lines).
   - lines separated by commas or "|";
   - an existing client (same name + city, case ignored) is not
     duplicated: its new lines are added;
   - deleting a client does not touch any hours: every entry keeps
     the client name.
   ============================================================= */

const ClientsPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let root = null;
    let search = "";
    let editing = null;

    const splitLines = text => String(text || "").split(/[,|]/).map(s => s.trim()).filter(Boolean);

    function timeByClient() {
        const s = Store.settings();
        const total = {};
        const now = Date.now();
        Store.entries().forEach(e => {
            if (!e.clientId || !Segments.isCounted(e.category, s)) return;
            total[e.clientId] = (total[e.clientId] || 0) + ((e.end == null ? now : e.end) - e.start);
        });
        return total;
    }

    function render() {
        if (!root) return;
        const time = timeByClient();
        const q = search.trim().toLowerCase();
        const all = Store.clients();
        const list = all.filter(c => !q || (c.name + " " + c.city + " " + c.lines.join(" ")).toLowerCase().includes(q));
        root.querySelector("#clCount").textContent = t("clients.count", { n: all.length });
        root.querySelector("#clList").innerHTML = list.length
            ? '<ul class="client-list">' + list.map(c => editing === c.id
                ? '<li class="editing"><div class="grid-2"><label>' + E(t("clients.name")) + '<input type="text" id="clEdName" value="' + E(c.name) + '"></label>' +
                  "<label>" + E(t("clients.city")) + '<input type="text" id="clEdCity" value="' + E(c.city) + '"></label></div>' +
                  "<label>" + E(t("clients.lines")) + '<input type="text" id="clEdLines" value="' + E(c.lines.join(", ")) + '"></label>' +
                  '<p class="error" id="clEdError"></p>' +
                  '<div class="actions"><button type="button" class="button secondary" data-cancel>' + E(t("common.cancel")) + "</button>" +
                  '<button type="button" class="button primary" data-confirm="' + E(c.id) + '">' + E(t("common.save")) + "</button></div></li>"
                : "<li><div><strong>" + E(c.name) + "</strong>" + (c.city ? " · " + E(c.city) : "") +
                  "<br><small>" + (c.lines.length ? c.lines.map(E).join(", ") : E(t("clients.noLine"))) +
                  (time[c.id] ? " · " + E(t("clients.clocked", { time: Utils.hm(time[c.id]) })) : "") + "</small></div>" +
                  '<div class="actions"><button type="button" class="button mini" data-modify="' + E(c.id) + '" aria-label="' + E(t("common.edit")) + '">✎</button>' +
                  '<button type="button" class="button mini danger" data-delete="' + E(c.id) + '" aria-label="' + E(t("common.delete")) + '">✕</button></div></li>'
              ).join("") + "</ul>"
            : '<p class="empty">' + E(t(q ? "clients.noMatch" : "clients.none")) + "</p>";

        root.querySelectorAll("[data-modify]").forEach(b => b.addEventListener("click", () => { editing = b.dataset.modify; render(); }));
        root.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", () => { editing = null; render(); }));
        root.querySelectorAll("[data-confirm]").forEach(b => b.addEventListener("click", () => {
            const ok = Store.updateClient(b.dataset.confirm, {
                name: root.querySelector("#clEdName").value,
                city: root.querySelector("#clEdCity").value,
                lines: splitLines(root.querySelector("#clEdLines").value)
            });
            if (!ok) { root.querySelector("#clEdError").textContent = t("clients.errUpdate"); return; }
            editing = null; render();
        }));
        root.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => {
            const c = Store.client(b.dataset.delete);
            if (c && confirm(t("clients.confirmDelete", { name: c.name }))) Store.deleteClient(c.id);
        }));
    }

    function add() {
        const msg = root.querySelector("#clMessage");
        const r = Store.addClient({
            name: root.querySelector("#clName").value,
            city: root.querySelector("#clCity").value,
            lines: splitLines(root.querySelector("#clLines").value)
        });
        if (!r) { msg.className = "error"; msg.textContent = t("clients.errName"); return; }
        msg.className = "success";
        msg.textContent = t(r.status === "created" ? "clients.added" : r.status === "merged" ? "clients.merged" : "clients.unchanged");
        ["#clName", "#clCity", "#clLines"].forEach(id => { root.querySelector(id).value = ""; });
    }

    function importCsv(text) {
        return Store.batch(() => {
            const result = { created: 0, merged: 0, ignored: 0 };
            Utils.parseCsv(text).forEach((r, i) => {
                const name = (r[0] || "").trim();
                if (i === 0 && I18n.allTranslations("clients.csv.name").concat(["nom", "name"]).some(h => Utils.simplify(h) === Utils.simplify(name))) return;
                const res = Store.addClient({ name, city: r[1] || "", lines: splitLines(r[2]) });
                if (!res) result.ignored += 1;
                else if (res.status === "created") result.created += 1;
                else if (res.status === "merged") result.merged += 1;
                else result.ignored += 1;
            });
            return result;
        });
    }

    function template() {
        const rows = [[t("clients.csv.name"), t("clients.csv.city"), t("clients.csv.lines")],
            [t("csv.sampleClient"), "Douarnenez", t("csv.sampleLine") + " 1, " + t("csv.sampleLine") + " 2"],
            [t("clients.csv.otherClient"), "Concarneau", "L3"]];
        Utils.download(Utils.toCsv(rows), t("clients.templateFile") + ".csv", "text/csv;charset=utf-8");
    }

    /* container: the zone given by the Settings page (2.6, admins only) */
    function init(container) {
        root = container;
        root.innerHTML =
            '<div class="card"><h2>' + E(t("clients.addTitle")) + "</h2>" +
            '<div class="grid-2"><label>' + E(t("clients.name")) + '<input type="text" id="clName" maxlength="120"></label>' +
            "<label>" + E(t("clients.city")) + '<input type="text" id="clCity" maxlength="80"></label></div>' +
            "<label>" + E(t("clients.lines")) + '<input type="text" id="clLines" placeholder="' + E(t("clients.linesPlaceholder")) + '"></label>' +
            '<div class="actions"><button type="button" class="button primary" id="clAdd">' + E(t("common.add")) + "</button></div>" +
            '<p id="clMessage"></p></div>' +
            '<div class="card"><div class="title-row"><h2>' + E(t("clients.title")) + ' <small id="clCount"></small></h2><div class="actions">' +
            '<button type="button" class="button secondary" id="clTemplate">' + E(t("common.importTemplate")) + "</button>" +
            '<button type="button" class="button secondary" id="clImport">' + E(t("common.import")) + "</button>" +
            '<input type="file" id="clFile" accept=".csv,text/csv" hidden></div></div>' +
            '<p id="clImportMessage"></p>' +
            '<input type="search" id="clSearch" placeholder="' + E(t("clients.search")) + '">' +
            '<div id="clList"></div></div>';

        root.querySelector("#clAdd").addEventListener("click", add);
        root.querySelector("#clTemplate").addEventListener("click", template);
        root.querySelector("#clSearch").addEventListener("input", e => { search = e.target.value; render(); });
        const file = root.querySelector("#clFile");
        root.querySelector("#clImport").addEventListener("click", () => { file.value = ""; file.click(); });
        file.addEventListener("change", () => {
            if (!file.files[0]) return;
            Utils.readText(file.files[0]).then(text => {
                const r = importCsv(text);
                const m = root.querySelector("#clImportMessage");
                const total = r.created + r.merged;
                m.className = total ? "success" : "error";
                m.textContent = total ? t("clients.importResult", { created: r.created, merged: r.merged, ignored: r.ignored }) : t("clients.importNone");
            });
        });
        render();
    }

    return { init, render, importCsv };
})();
