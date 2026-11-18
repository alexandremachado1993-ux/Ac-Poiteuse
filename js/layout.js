/* =============================================================
   layout.js — personal arrangement of the workspace (3.2)
   DISPLAY ONLY: order, visibility and width of the dashboard blocks
   and widgets of the signed-in person, kept in HIS settings
   (Store.settings().dashLayout, one entry per dashboard view).
   Never touches business data nor rights: a page builds the blocks it
   is allowed to show, this module only decides where they go.

   A block: { id, label, kind: "block" | "widget", size, sizes, html }
     size  = default width in twelfths (3, 4, 6, 8 or 12)
     sizes = widths compatible with its content
   A new block added in the code appears by itself, at its default place.

   sortable(): drag and drop with the pointer events (mouse, pen,
   touch) + keyboard (arrows on the handle). Shared by the tab list
   and the dashboard.
   ============================================================= */

const Layout = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let dragging = false;

    /* Saved arrangement of a view, cleaned (a hand-edited or old file never breaks the page) */
    function prefs(view) {
        const all = Store.settings().dashLayout;
        const p = all && typeof all === "object" && all[view] && typeof all[view] === "object" ? all[view] : {};
        const list = v => (Array.isArray(v) ? v.filter(x => typeof x === "string") : []);
        const sizes = p.sizes && typeof p.sizes === "object" ? p.sizes : {};
        return { order: list(p.order), hidden: list(p.hidden), sizes };
    }

    function save(view, p) {
        const all = Object.assign({}, Store.settings().dashLayout || {});
        if (p) all[view] = { order: p.order, hidden: p.hidden, sizes: p.sizes }; else delete all[view];
        Store.updateSettings({ dashLayout: all });
    }

    /* Blocks in the person's order, with his widths; hidden ones flagged.
       Blocks missing from the saved order keep their default neighbour. */
    function arrange(view, blocks) {
        const p = prefs(view);
        const ids = blocks.map(b => b.id);
        const order = p.order.filter(id => ids.indexOf(id) >= 0);
        ids.forEach((id, i) => {
            if (order.indexOf(id) >= 0) return;
            const prev = ids.slice(0, i).reverse().find(x => order.indexOf(x) >= 0);
            order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, id);
        });
        return order.map(id => {
            const b = blocks.find(x => x.id === id);
            const size = b.sizes.indexOf(p.sizes[id]) >= 0 ? p.sizes[id] : b.size;
            return Object.assign({}, b, { size, hidden: p.hidden.indexOf(id) >= 0 });
        });
    }

    /* Saves what is on screen: order of [data-block] items, hidden flags and widths */
    function saveFrom(view, items) {
        save(view, { order: items.map(x => x.id), hidden: items.filter(x => x.hidden).map(x => x.id),
            sizes: items.reduce((o, x) => { if (x.size !== x.defaultSize) o[x.id] = x.size; return o; }, {}) });
    }

    const nextSize = (b, step) => {
        const i = b.sizes.indexOf(b.size) + step;
        return i >= 0 && i < b.sizes.length ? b.sizes[i] : b.size;
    };

    /* HTML of the grid. editing = tools on each block (drag, width, show / hide) */
    function grid(view, blocks, editing) {
        const list = arrange(view, blocks).filter(b => editing || !b.hidden);
        if (!list.length) return '<div class="card"><p class="empty">' + UI.icon("dashboard") + E(t("lay.allHidden")) + "</p></div>";
        return '<div class="dash-grid' + (editing ? " editing" : "") + '" data-view="' + E(view) + '">' + list.map(b =>
            '<div class="dash-item w' + b.size + (b.hidden ? " is-hidden" : "") + '" data-block="' + E(b.id) + '" data-size="' + b.size + '" data-default-size="' +
            blocks.find(x => x.id === b.id).size + '">' +
            (editing ? '<div class="dash-tools"><button type="button" class="icon-button drag-handle" data-drag data-drag-id="' + E(b.id) + '" aria-label="' + E(t("lay.move", { name: b.label })) + '" title="' + E(t("lay.moveHint")) + '">' + UI.icon("grip") + "</button>" +
                "<strong>" + E(b.label) + "</strong>" + '<span class="spacer"></span>' +
                (b.sizes.length > 1 ? '<button type="button" class="icon-button" data-size-step="-1"' + (nextSize(b, -1) === b.size ? " disabled" : "") + ' aria-label="' + E(t("lay.narrower", { name: b.label })) + '">' + UI.icon("minus") + "</button>" +
                    '<button type="button" class="icon-button" data-size-step="1"' + (nextSize(b, 1) === b.size ? " disabled" : "") + ' aria-label="' + E(t("lay.wider", { name: b.label })) + '">' + UI.icon("plus") + "</button>" : "") +
                '<button type="button" class="icon-button" data-toggle aria-pressed="' + (b.hidden ? "false" : "true") + '" aria-label="' + E(t(b.hidden ? "lay.show" : "lay.hide", { name: b.label })) + '">' +
                UI.icon(b.hidden ? "eyeOff" : "eye") + "</button></div>" : "") +
            '<div class="dash-body"' + (editing ? ' inert aria-hidden="true"' : "") + ">" + b.html + "</div></div>").join("") + "</div>";
    }

    /* 4.7.1: "masonry" packing — each block takes the 8 px rows its content needs, so a short
       block no longer stretches into an empty card next to a tall one; the grid fills the
       hole under a short block with the next one that fits. Recomputed when a block changes
       size (ResizeObserver) and while dragging. Without measures (old browser), plain grid. */
    const ROW = 4;   /* px: rows without gap — the space between blocks is their bottom margin (CSS) */
    let observer = null;
    function pack(gridEl) {
        if (!gridEl || !gridEl.isConnected) return;
        const gap = parseFloat(getComputedStyle(gridEl).columnGap) || 0;
        const items = [].slice.call(gridEl.children);
        gridEl.classList.add("masonry");
        /* blocks are aligned to the top of their area (CSS): their height is their content */
        items.forEach(it => { it.style.gridRowEnd = "span " + Math.max(1, Math.ceil((it.getBoundingClientRect().height + gap) / ROW)); });
    }
    function wirePack(container) {
        const gridEl = container.querySelector(".dash-grid");
        if (!gridEl || typeof ResizeObserver === "undefined") return;
        if (observer) observer.disconnect();
        let queued = false;
        observer = new ResizeObserver(() => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => { queued = false; pack(gridEl); });
        });
        [].slice.call(gridEl.children).forEach(it => observer.observe(it));
        pack(gridEl);
    }

    /* Wires the tools of a grid drawn with editing = true */
    function wireGrid(container, view, blocks) {
        wirePack(container);
        const gridEl = container.querySelector(".dash-grid.editing");
        if (!gridEl) return;
        const read = () => [].slice.call(gridEl.children).map(el => {
            const b = blocks.find(x => x.id === el.dataset.block);
            return { id: el.dataset.block, size: +el.dataset.size, defaultSize: b.size, hidden: el.classList.contains("is-hidden") };
        });
        sortable(gridEl, { item: ".dash-item", onEnd: () => saveFrom(view, read()) });
        gridEl.querySelectorAll("[data-size-step]").forEach(btn => btn.addEventListener("click", () => {
            const el = btn.closest(".dash-item");
            const b = Object.assign({}, blocks.find(x => x.id === el.dataset.block), { size: +el.dataset.size });
            el.dataset.size = nextSize(b, +btn.dataset.sizeStep);
            saveFrom(view, read());
        }));
        gridEl.querySelectorAll("[data-toggle]").forEach(btn => btn.addEventListener("click", () => {
            btn.closest(".dash-item").classList.toggle("is-hidden");
            saveFrom(view, read());
        }));
    }

    /* Drag and drop of the children of `list` (selector opts.item) by their [data-drag]
       handle. Pointer events: mouse, pen and touch alike. Keyboard: arrows on the handle.
       opts.onEnd() is called once the order changed. */
    function sortable(list, opts) {
        const itemOf = el => { const it = el && el.closest(opts.item); return it && it.parentNode === list ? it : null; };
        const moveBy = (item, step) => {
            const sib = step < 0 ? item.previousElementSibling : item.nextElementSibling;
            if (!sib) return false;
            list.insertBefore(item, step < 0 ? sib : sib.nextElementSibling);
            return true;
        };
        list.addEventListener("keydown", e => {
            const h = e.target.closest("[data-drag]"), item = h && itemOf(h);
            if (!item) return;
            const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
            if (!step) return;
            e.preventDefault();
            /* the page is redrawn after saving: the focus goes back to the same handle */
            if (!moveBy(item, step)) return;
            const id = h.dataset.dragId, page = list.closest("[id^='page-']") || document;
            opts.onEnd();
            const again = page.querySelector('[data-drag-id="' + id + '"]');
            if (again) again.focus();
        });
        list.addEventListener("pointerdown", e => {
            const h = e.target.closest("[data-drag]"), item = h && itemOf(h);
            if (!item || e.button > 0) return;
            e.preventDefault();
            const start = [].slice.call(list.children).indexOf(item);
            dragging = true;
            item.classList.add("dragging"); list.classList.add("sorting");
            /* 4.7.1: a block swaps once the pointer passes the middle of its neighbour, and never
               with the block it has just passed (the page reflows under the pointer: no ping-pong) */
            let last = null, frame = 0;
            const step = ev => {
                frame = 0;
                if (ev.clientY < 60) window.scrollBy(0, -14); else if (ev.clientY > window.innerHeight - 60) window.scrollBy(0, 14);
                const over = itemOf(document.elementFromPoint(ev.clientX, ev.clientY));
                if (!over || over === item) { if (over !== last) last = null; return; }
                if (over === last) return;
                const kids = [].slice.call(list.children), after = kids.indexOf(over) > kids.indexOf(item);
                const r = over.getBoundingClientRect();
                const depth = (ev.clientX - r.left) / r.width + (ev.clientY - r.top) / r.height;   /* 0 top-left → 2 bottom-right */
                if (r.width && r.height && (after ? depth < 1 : depth > 1)) return;
                list.insertBefore(item, after ? over.nextElementSibling : over);
                last = over;
                if (list.classList.contains("masonry")) pack(list);
            };
            let pending = null;   /* last pointer position, handled once per frame */
            const move = ev => { pending = ev; if (!frame) frame = requestAnimationFrame(() => step(pending)); };
            /* listened on the document: moving the item in the page would lose a pointer capture */
            const end = () => {
                if (frame) { cancelAnimationFrame(frame); step(pending); }
                document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", end); document.removeEventListener("pointercancel", end);
                item.classList.remove("dragging"); list.classList.remove("sorting");
                dragging = false;
                if ([].slice.call(list.children).indexOf(item) !== start) opts.onEnd();
            };
            document.addEventListener("pointermove", move);
            document.addEventListener("pointerup", end);
            document.addEventListener("pointercancel", end);
        });
    }

    return { prefs, save, arrange, saveFrom, grid, wireGrid, sortable, pack, isDragging: () => dragging };
})();
