/* =============================================================
   xlsx.js — writes a real Excel file (.xlsx) with no external
   library (≈ 150 lines instead of about 1 MB).
   An .xlsx file is a ZIP archive of XML files: the archive is
   written "stored" (no compression), which every spreadsheet
   application accepts. Texts as inline strings, numbers as numbers.

   Usage:
     Xlsx.create([
       { name: "Sheet", widths: [12, 30],
         rows: [[{ v: "Title", bold: true }], ["text", 7.5], []] }
     ])  → Uint8Array
   Cell: string, number, null, or { v, bold, wrap }.
   ============================================================= */

const Xlsx = (() => {
    "use strict";

    /* ---------- CRC32 (required by the ZIP format) ---------- */
    const TABLE_CRC = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(octets) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    /* ---------- ZIP archive (method 0: stored) ---------- */
    function zip(files) {
        const enc = new TextEncoder();
        const d = new Date();
        const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
        const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        const chunks = [], central = [];
        let offset = 0;

        files.forEach(f => {
            const name = enc.encode(f.name);
            const data = enc.encode(f.content);
            const crc = crc32(data);
            const header = new DataView(new ArrayBuffer(30));
            header.setUint32(0, 0x04034b50, true);
            header.setUint16(4, 20, true);
            header.setUint16(6, 0x0800, true);      /* UTF-8 names */
            header.setUint16(8, 0, true);           /* stored */
            header.setUint16(10, dosTime, true);
            header.setUint16(12, dosDate, true);
            header.setUint32(14, crc, true);
            header.setUint32(18, data.length, true);
            header.setUint32(22, data.length, true);
            header.setUint16(26, name.length, true);
            header.setUint16(28, 0, true);
            chunks.push(new Uint8Array(header.buffer), name, data);

            const c = new DataView(new ArrayBuffer(46));
            c.setUint32(0, 0x02014b50, true);
            c.setUint16(4, 20, true);
            c.setUint16(6, 20, true);
            c.setUint16(8, 0x0800, true);
            c.setUint16(10, 0, true);
            c.setUint16(12, dosTime, true);
            c.setUint16(14, dosDate, true);
            c.setUint32(16, crc, true);
            c.setUint32(20, data.length, true);
            c.setUint32(24, data.length, true);
            c.setUint16(28, name.length, true);
            c.setUint32(42, offset, true);
            central.push(new Uint8Array(c.buffer), name);
            offset += 30 + name.length + data.length;
        });

        const centralSize = central.reduce((s, m) => s + m.length, 0);
        const tail = new DataView(new ArrayBuffer(22));
        tail.setUint32(0, 0x06054b50, true);
        tail.setUint16(8, files.length, true);
        tail.setUint16(10, files.length, true);
        tail.setUint32(12, centralSize, true);
        tail.setUint32(16, offset, true);

        const all = chunks.concat(central, [new Uint8Array(tail.buffer)]);
        const out = new Uint8Array(all.reduce((s, m) => s + m.length, 0));
        let p = 0;
        all.forEach(m => { out.set(m, p); p += m.length; });
        return out;
    }

    /* ---------- XML SpreadsheetML ---------- */
    function xml(text) {
        return String(text)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function column(i) {
        let s = "";
        for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
        return s;
    }

    /* Styles: 0 normal, 1 bold, 2 wrap, 3 bold + wrap */
    function styleOf(cell) {
        if (!cell || typeof cell !== "object") return 0;
        return (cell.bold ? 1 : 0) + (cell.wrap ? 2 : 0);
    }

    function sheetXml(f) {
        const cols = (f.widths || []).map((l, i) =>
            '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + l + '" customWidth="1"/>').join("");
        const rows = (f.rows || []).map((row, r) => {
            const cells = (row || []).map((raw, c) => {
                const v = raw && typeof raw === "object" ? raw.v : raw;
                if (v == null || v === "") return "";
                const ref = column(c) + (r + 1);
                const s = styleOf(raw);
                const styleAttr = s ? ' s="' + s + '"' : "";
                if (typeof v === "number" && isFinite(v)) return '<c r="' + ref + '"' + styleAttr + "><v>" + v + "</v></c>";
                return '<c r="' + ref + '"' + styleAttr + ' t="inlineStr"><is><t xml:space="preserve">' + xml(v) + "</t></is></c>";
            }).join("");
            return '<row r="' + (r + 1) + '">' + cells + "</row>";
        }).join("");
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
            (cols ? "<cols>" + cols + "</cols>" : "") + "<sheetData>" + rows + "</sheetData></worksheet>";
    }

    const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="4">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
        "</cellXfs>" +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        "</styleSheet>";

    function create(sheets) {
        const cleanNames = sheets.map((f, i) =>
            (String(f.name || "Sheet" + (i + 1)).replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31)) || "Sheet" + (i + 1));
        const parts = [
            { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
                '<Default Extension="xml" ContentType="application/xml"/>' +
                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
                '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
                sheets.map((f, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
                    '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") +
                "</Types>" },
            { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
                "</Relationships>" },
            { name: "xl/workbook.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
                cleanNames.map((n, i) => '<sheet name="' + xml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") +
                "</sheets></workbook>" },
            { name: "xl/_rels/workbook.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                sheets.map((f, i) => '<Relationship Id="rId' + (i + 1) +
                    '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("") +
                '<Relationship Id="rId' + (sheets.length + 1) +
                '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
                "</Relationships>" },
            { name: "xl/styles.xml", content: STYLES }
        ].concat(sheets.map((f, i) => ({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", content: sheetXml(f) })));
        return zip(parts);
    }

    return { create, crc32, column };
})();
