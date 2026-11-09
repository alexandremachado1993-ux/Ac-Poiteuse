/* =============================================================
   explanations.js — "How my hours are counted"
   The REFERENCE DOCUMENT (2.4): shown in Settings (technicians) and
   Configuration (admins), downloadable (HTML) and printable (PDF).
   No longer included in the timesheet exports (request of 03/11).
   Every figure of the examples is computed with Hours and Countdown
   (the real constants and functions): the sheet cannot contradict
   the calculation.
   Plain texts (no HTML): the HTML renderer escapes them.
   ============================================================= */

const Explanations = (() => {
    "use strict";

    const h = Utils.hours;
    const t = I18n.t;

    function content() {
        const C = Hours;
        const o = Store.org();
        const B = o.weeklyBase, D = o.dayHours;
        const reg = t("expl.src.register");
        const pct = r => "+" + Math.round(r * 100) + " %";
        const cd = v => Countdown.text(v);
        const rank = n => String(Math.round(n) + 1);
        const ot45 = C.overtime(45, B);
        const recov = 24 + 2 * D;
        return {
            title: t("expl.title"),
            intro: t("expl.intro"),
            rules: [
                [t("expl.r.week"), t("expl.v.goal", { goal: h(B) }), t("expl.v.contract")],
                [t("expl.r.countdown"), t("expl.v.countdown", { goal: h(-B) }), reg],
                [t("expl.r.credit"), t("expl.v.credit", { day: h(D) }), reg],
                [t(o.weekendHolidays ? "expl.r.holiday" : "expl.r.holidayWeekdays"), t("expl.v.credit", { day: h(D) }), reg],
                [t("expl.r.lunch"), t("expl.v.deducted"), reg],
                [t("expl.r.ot25", { from: rank(o.overtime25From), to: String(o.overtime50From) }), t("expl.v.counter25"), t("expl.src.code", { art: "L3121-36" })],
                [t("expl.r.ot50", { from: rank(o.overtime50From) }), t("expl.v.counter50"), t("expl.src.code", { art: "L3121-36" })],
                [t("expl.r.night", { from: Utils.pad(o.nightStart) + ":00", to: Utils.pad(o.nightEnd) + ":00" }), t("expl.v.inTotal", { rate: pct(o.nightRate) }), t("expl.src.agreement", { art: "146" })],
                [t("expl.r.holidayWorked"), t("expl.v.inTotal", { rate: pct(o.holidayRate) }), t("expl.src.agreement", { art: "146" })],
                [t("expl.r.sunday"), t("expl.v.inWeek"), reg],
                [t("expl.r.nightWorker"), t("expl.v.nightWorker", { hours: C.NIGHT_HABITUAL_H, times: C.NIGHT_HABITUAL_TIMES, yearly: C.NIGHT_YEARLY_H }),
                    t("expl.src.agreement", { art: "108" })]
            ],
            points: [t("expl.p.total"), t("expl.p.noCumul"), t("expl.p.completed"), t("expl.p.approved"), t("expl.p.timeOff", { day: h(D) })],
            examples: [
                [t("expl.ex1.title"), t("expl.ex1.detail", { start: h(-B) }), cd(10 - B)],
                [t("expl.ex2.title"), t("expl.ex2.detail", { start: h(-B) }), cd(45 - B) + " — " + t("expl.result.overtime", { h25: h(ot45.h25), h50: h(ot45.h50) })],
                [t("expl.ex3.title"), t("expl.ex3.detail", { day: h(D), done: h(39 + D) }), cd(39 + D - B) + " — " + t("expl.result.noOvertime")],
                [t("expl.ex4.title"), t("expl.ex4.detail", { start: h(-B) }), cd(35 - B)],
                [t("expl.ex5.title"), t("expl.ex5.detail"), t("expl.ex5.result")],
                [t("expl.ex6.title"), t("expl.ex6.detail", { day: h(D), credit: h(2 * D), done: h(recov) }),
                    cd(recov - B) + " — " + t("expl.ex6.result", { credit: h(2 * D) })],
                [t("expl.ex7.title"), t("expl.ex7.detail"), t("expl.result.total", { value: "+" + h(4 * o.nightRate) })],
                [t("expl.ex8.title"), t("expl.ex8.detail"), t("expl.result.total", { value: "+" + h(3 * o.holidayRate) })],
                [t("expl.ex9.title"), t("expl.ex9.detail"), t("expl.ex9.result")],
                [t("expl.ex10.title"), t("expl.ex10.detail", { day: h(D) }), t("expl.ex10.result")]
            ],
            sources: t("expl.sources")
        };
    }

    /* Standalone reference document (Settings / Configuration): download or print */
    function documentHtml() {
        const E = Utils.escape;
        const css = "body{font:13px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111;margin:24px;max-width:1000px}" +
            "h1{font-size:20px;margin:0 0 4px}h3{font-size:14px;margin:16px 0 6px}table{width:100%;border-collapse:collapse;margin:6px 0 12px}" +
            "th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f2f2f2}.num{text-align:right}" +
            ".info{color:#555}.example{border-left:4px solid #C8102E;padding:4px 10px;margin:8px 0;break-inside:avoid}.example p{margin:2px 0}" +
            ".example-result{font-weight:700}@page{margin:14mm}@media print{body{margin:0}}";
        return '<!DOCTYPE html><html lang="' + I18n.language() + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            "<title>" + E(t("ref.title")) + "</title><style>" + css + "</style></head><body>" +
            "<h1>" + E(t("ref.title")) + '</h1><p class="info">' + E(t("export.printedOn")) + " " + E(Utils.dateTime(Date.now())) + "</p>" +
            bodyHtml() + "</body></html>";
    }

    function download() {
        Utils.download(documentHtml(), t("ref.fileName") + ".html", "text/html;charset=utf-8");
    }

    /* Prints (or saves as PDF) the reference document in an invisible frame */
    function print() {
        const old = document.getElementById("refFrame");
        if (old) old.remove();
        const frame = document.createElement("iframe");
        frame.id = "refFrame";
        frame.setAttribute("aria-hidden", "true");
        frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
        document.body.appendChild(frame);
        const doc = frame.contentWindow.document;
        doc.open(); doc.write(documentHtml()); doc.close();
        setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { alert(t("export.printFailed")); } }, 250);
    }

    /* Card used in Settings (technicians) and Configuration (admins):
       buttons + content folded */
    function cardHtml() {
        const E = Utils.escape;
        return '<div class="card"><div class="title-row"><h2>' + E(t("ref.title")) + '</h2><div class="actions">' +
            '<button type="button" class="button secondary" data-ref="download">' + E(t("ref.download")) + "</button>" +
            '<button type="button" class="button secondary" data-ref="print">' + E(t("ref.print")) + "</button></div></div>" +
            '<p class="info">' + E(t("ref.info")) + "</p>" +
            '<details class="explanations"><summary>' + E(t("ref.show")) + "</summary>" + bodyHtml() + "</details></div>";
    }

    function wire(root) {
        root.querySelectorAll("[data-ref]").forEach(b => b.addEventListener("click", () => {
            if (b.dataset.ref === "download") download(); else print();
        }));
    }

    /* HTML body (no title, no container) */
    function bodyHtml() {
        const E = Utils.escape;
        const c = content();
        return '<p class="info">' + E(c.intro) + "</p>" +
            "<h3>" + E(t("expl.section.rules")) + "</h3>" +
            '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("expl.col.reason")) + '</th><th class="num">' +
            E(t("expl.col.rate")) + "</th><th>" + E(t("expl.col.text")) + "</th></tr></thead><tbody>" +
            c.rules.map(r => "<tr><td>" + E(r[0]) + '</td><td class="num">' + E(r[1]) + "</td><td>" + E(r[2]) + "</td></tr>").join("") +
            "</tbody></table></div>" +
            "<ul>" + c.points.map(p => "<li>" + E(p) + "</li>").join("") + "</ul>" +
            "<h3>" + E(t("expl.section.examples")) + "</h3>" +
            c.examples.map(x => '<div class="example"><p><strong>' + E(x[0]) + "</strong></p><p>" + E(x[1]) + "</p>" +
                '<p class="example-result">' + E(x[2]) + "</p></div>").join("") +
            '<p class="info">' + E(c.sources) + "</p>";
    }

    return { content, bodyHtml, documentHtml, download, print, cardHtml, wire };
})();
