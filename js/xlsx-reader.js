/* =============================================================
   xlsx-reader.js — reads an Excel file (.xlsx) with no library
   An .xlsx file is a ZIP archive of XML files. Entries are usually
   compressed ("deflate"): they are inflated with the browser's
   built-in DecompressionStream (Chrome/Edge 103+, Safari 16.4+,
   Firefox 113+). Older browsers get a clear error message.

   XlsxReader.read(arrayBuffer) → Promise<[{ name, rows }]>
   rows[r][c] = value (r, c from 0): number, string, boolean or null.
   Dates and times stay Excel serial numbers (days since 1899-12-30;
   a time is a fraction of a day): see toIsoDate / toMinutes.
   Only cached values are read (formulas are not evaluated).
   ============================================================= */

const XlsxReader = (() => {
    "use strict";

    function supported() {
        return typeof DecompressionStream !== "undefined" && typeof DOMParser !== "undefined";
    }

    /* ---------- ZIP ---------- */
    function entries(buffer) {
        const view = new DataView(buffer);
        let eocd = -1;
        for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
            if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error("notZip");
        const count = view.getUint16(eocd + 10, true);
        let p = view.getUint32(eocd + 16, true);
        const list = {};
        const dec = new TextDecoder();
        for (let i = 0; i < count; i++) {
            if (view.getUint32(p, true) !== 0x02014b50) throw new Error("notZip");
            const method = view.getUint16(p + 10, true);
            const size = view.getUint32(p + 20, true);
            const nameLen = view.getUint16(p + 28, true);
            const extraLen = view.getUint16(p + 30, true);
            const commentLen = view.getUint16(p + 32, true);
            const offset = view.getUint32(p + 42, true);
            const name = dec.decode(new Uint8Array(buffer, p + 46, nameLen));
            list[name] = { method, size, offset };
            p += 46 + nameLen + extraLen + commentLen;
        }
        return list;
    }

    async function fileText(buffer, entry) {
        const view = new DataView(buffer);
        const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
        const raw = new Uint8Array(buffer, start, entry.size);
        if (entry.method === 0) return new TextDecoder().decode(raw);
        if (entry.method !== 8) throw new Error("unsupportedCompression");
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }

    /* ---------- XML helpers ---------- */
    const parse = text => new DOMParser().parseFromString(text, "application/xml");
    const byTag = (node, tag) => Array.from(node.getElementsByTagName(tag));

    function columnIndex(ref) {
        const letters = ref.replace(/[0-9]/g, "");
        let n = 0;
        for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
        return n - 1;
    }

    async function read(buffer) {
        if (!supported()) throw new Error("unsupportedBrowser");
        const zip = entries(buffer);
        const text = async name => zip[name] ? fileText(buffer, zip[name]) : null;

        const shared = [];
        const ss = await text("xl/sharedStrings.xml");
        if (ss) byTag(parse(ss), "si").forEach(si => shared.push(byTag(si, "t").map(t => t.textContent).join("")));

        const rels = {};
        byTag(parse(await text("xl/_rels/workbook.xml.rels")), "Relationship").forEach(r => {
            const target = r.getAttribute("Target");
            rels[r.getAttribute("Id")] = target.startsWith("/") ? target.slice(1) : "xl/" + target;
        });

        const sheets = [];
        for (const s of byTag(parse(await text("xl/workbook.xml")), "sheet")) {
            const id = s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
            const xml = await text(rels[id]);
            if (!xml) continue;
            const rows = [];
            byTag(parse(xml), "row").forEach(row => {
                const r = Number(row.getAttribute("r")) - 1;
                const cells = rows[r] = rows[r] || [];
                byTag(row, "c").forEach(c => {
                    const type = c.getAttribute("t");
                    const v = byTag(c, "v")[0];
                    let value = null;
                    if (type === "s" && v) value = shared[Number(v.textContent)];
                    else if (type === "inlineStr") value = byTag(c, "t").map(t => t.textContent).join("");
                    else if (type === "str" && v) value = v.textContent;
                    else if (type === "b" && v) value = v.textContent === "1";
                    else if (type === "e") value = null;            /* #REF!, #N/A… */
                    else if (v) value = Number(v.textContent);
                    cells[columnIndex(c.getAttribute("r"))] = value;
                });
            });
            sheets.push({ name: s.getAttribute("name"), rows });
        }
        return sheets;
    }

    /* Excel serial → "YYYY-MM-DD" (null if not a plausible date) */
    function toIsoDate(serial) {
        if (typeof serial !== "number" || serial < 1 || serial > 2958465) return null;
        const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
        return d.toISOString().slice(0, 10);
    }

    /* Excel time (fraction of a day; 1 = 24:00) → minutes, or null */
    function toMinutes(value) {
        if (typeof value !== "number" || value < 0) return null;
        return Math.round((value - Math.floor(value === 1 ? 0 : value)) * 1440);
    }

    return { supported, read, toIsoDate, toMinutes, columnIndex };
})();
