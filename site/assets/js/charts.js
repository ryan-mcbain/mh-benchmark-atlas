/* Benchmark Atlas: charts. Plain DOM; bars are buttons so every chart can
   also act as a filter, by mouse or keyboard. Updates are keyed by value
   so bars glide to new lengths instead of being redrawn. */
(function () {
  "use strict";
  const A = window.Atlas;
  const h = A.h;
  const C = (A.charts = {});

  // Buttons narrower than 24 px fail WCAG 2.2 target size; make such slivers
  // display-only (their filter is always available in the sidebar).
  C.demoteSmall = function (root) {
    for (const b of Array.from(root.querySelectorAll("button.stack-seg"))) {
      if (b.offsetWidth >= 24 || b.offsetParent === null) continue;
      const d = document.createElement("div");
      d.className = b.className;
      d.style.cssText = b.style.cssText;
      d.setAttribute("aria-hidden", "true");
      for (const c of Array.from(b.childNodes)) if (!(c.classList && c.classList.contains("sr-only"))) d.appendChild(c);
      if (b._tipHtml) tipFor(d, b._tipHtml);
      b.replaceWith(d);
    }
  };

  function tipFor(el, html) {
    el._tipHtml = html;
    el.addEventListener("mouseenter", (e) => A.tip.show(typeof html === "function" ? html() : html, e));
    el.addEventListener("mousemove", (e) => A.tip.move(e));
    el.addEventListener("mouseleave", () => A.tip.hide());
    el.addEventListener("focus", () => A.tip.show(typeof html === "function" ? html() : html, el));
    el.addEventListener("blur", () => A.tip.hide());
  }
  C.tipFor = tipFor;

  // ------------------------------------------------------------------
  // Horizontal bar list. rows: [{value, label, count, selected}]
  // ------------------------------------------------------------------
  C.bars = function (el, opts) {
    let ul = el.querySelector(":scope > .bars");
    if (!ul) {
      ul = h("ul", { class: "bars" + (opts.compact ? " compact" : "") + (opts.inline ? " inline" : "") });
      el.appendChild(ul);
    }
    const rows = opts.rows.filter((r) => r.count > 0 || r.selected);
    const total = opts.total || 0;
    const max = opts.max || Math.max(1, ...rows.map((r) => r.count));
    const anySel = rows.some((r) => r.selected);
    const existing = new Map();
    for (const li of Array.from(ul.children)) existing.set(li.dataset.v, li);
    const ordered = [];
    for (const r of rows) {
      let li = existing.get(r.value);
      const fresh = !li;
      if (fresh) {
        const tag = opts.onToggle ? "button" : "div";
        const bar = opts.inline
          ? h(tag, { class: "bar", type: opts.onToggle ? "button" : null },
              h("span", { class: "bar-label" }),
              h("span", { class: "bar-track" }, h("span", { class: "bar-fill", style: { width: "0%" } }), h("span", { class: "bar-n" })))
          : h(tag, { class: "bar", type: opts.onToggle ? "button" : null },
              h("span", { class: "bar-top" },
                h("span", { class: "bar-label" }),
                h("span", { class: "bar-n" })),
              h("span", { class: "bar-track" }, h("span", { class: "bar-fill", style: { width: "0%" } })));
        if (opts.onToggle) bar.addEventListener("click", () => opts.onToggle(li.dataset.v));
        if (opts.fk) bar.dataset.fk = opts.fk + "|" + r.value;
        li = h("li", { dataset: { v: r.value } }, bar);
        tipFor(bar, () => li._tip);
      }
      existing.delete(r.value);
      const bar = li.firstChild;
      bar.querySelector(".bar-label").textContent = r.label || r.value;
      const share = total ? A.pct(r.count, total) : null;
      bar.querySelector(".bar-n").innerHTML = A.fmt(r.count) + (share != null && opts.showPct !== false ? '<span class="bar-pct">' + share + "%</span>" : "");
      const w = (100 * r.count) / max;
      const fill = bar.querySelector(".bar-fill");
      if (fresh && !A.reducedMotion()) requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = w + "%")));
      else fill.style.width = w + "%";
      li.classList.toggle("is-selected", !!r.selected);
      li.classList.toggle("is-muted", anySel && !r.selected);
      const opener = opts.mode === "open";
      if (opts.onToggle && !opener) bar.setAttribute("aria-pressed", r.selected ? "true" : "false");
      let srx = bar.querySelector(".sr-only");
      if (!srx) {
        srx = h("span", { class: "sr-only" });
        bar.appendChild(srx);
      }
      srx.textContent = opts.onToggle ? (opener ? " " + (opts.unit || "") + ". Opens its record." : " " + (opts.unit || "") + ". Filter.") : " " + (opts.unit || "");
      const hint = opener ? "Select to open its record" : r.selected ? "Select to remove this filter" : "Select to filter";
      li._tip = "<strong>" + A.esc(r.label || r.value) + "</strong><br>" + A.fmt(r.count) + " " + A.esc(opts.unit || "") + (share != null && opts.showPct !== false ? " (" + share + "%)" : "") + (opts.onToggle ? '<span class="tip-hint">' + hint + "</span>" : "");
      ordered.push(li);
    }
    for (const li of existing.values()) li.remove();
    for (const li of ordered) ul.appendChild(li);
    let empty = el.querySelector(":scope > .chart-empty");
    if (!rows.length) {
      if (!empty) el.appendChild(h("p", { class: "chart-empty" }, opts.emptyText || "Nothing to show for these filters."));
    } else if (empty) empty.remove();
  };

  // ------------------------------------------------------------------
  // 100% stacked bars. rows: [{key, label, total, segs:[{key,label,count,cls}]}]
  // ------------------------------------------------------------------
  C.stack = function (el, opts) {
    A.clear(el);
    const wrap = h("div", { class: "stack" + (opts.labelWidth ? "" : "") });
    if (opts.labelWidth) wrap.style.setProperty("--stack-label", opts.labelWidth);
    for (const row of opts.rows) {
      const total = row.segs.reduce((s, x) => s + x.count, 0);
      const line = h("div", { class: "stack-row" });
      line.appendChild(h("div", { class: "stack-label" }, row.label, row.n != null ? h("span", { class: "stack-n" }, " (n = " + A.fmt(row.n) + ")") : null));
      const track = h("div", { class: "stack-track", role: "group", "aria-label": row.label });
      for (const sg of row.segs) {
        if (!sg.count) continue;
        const share = total ? (100 * sg.count) / total : 0;
        const pctText = Math.round(share);
        const tag = opts.onSeg ? "button" : "div";
        const showPct = share >= 9;
        // Slivers too thin to click (under ~24 px) are display-only; the
        // same filter is always available in the sidebar.
        const clickable = opts.onSeg && share >= (opts.minShare || 8);
        const seg = h(clickable ? "button" : "div", {
          class: "stack-seg " + (sg.cls || ""),
          type: clickable ? "button" : null,
          style: { flexGrow: String(sg.count), flexBasis: "0" },
          "aria-label": clickable && !showPct ? pctText + "%: " + row.label + ", " + sg.label + ", " + A.fmt(sg.count) : null,
          "aria-hidden": clickable ? null : "true",
          "aria-pressed": clickable ? (sg.selected ? "true" : "false") : null,
        }, showPct ? [h("span", { class: "stack-pct" }, pctText), clickable ? h("span", { class: "sr-only" }, "%: " + row.label + ", " + sg.label + ", " + A.fmt(sg.count)) : null] : null);
        if (sg.selected) seg.classList.add("is-selected");
        if (opts.fk && clickable) seg.dataset.fk = opts.fk + "|" + row.key + "|" + sg.key;
        if (clickable) seg.addEventListener("click", () => opts.onSeg(row.key, sg.key));
        tipFor(seg, "<strong>" + A.esc(row.label) + "</strong><br>" + A.esc(sg.label) + ": " + A.fmt(sg.count) + " of " + A.fmt(total) + " (" + pctText + "%)" + (opts.onSeg ? '<span class="tip-hint">Select to filter</span>' : ""));
        track.appendChild(seg);
      }
      if (!total) track.appendChild(h("div", { class: "stack-none" }, "None"));
      line.appendChild(track);
      line.appendChild(h("span", { class: "sr-only" }, row.label + ": " + row.segs.filter((x) => x.count).map((x) => x.label + " " + A.fmt(x.count) + " (" + Math.round((100 * x.count) / (total || 1)) + "%)").join(", ") + "."));
      wrap.appendChild(line);
    }
    el.appendChild(wrap);
    C.demoteSmall(wrap);
  };

  // Legend for quality colors
  C.qualityLegend = function (opts) {
    const items = [
      ["High", "q-High"],
      ["Adequate", "q-Adequate"],
      ["Poor", "q-Poor"],
    ];
    if (opts && opts.withNR) items.push(["Not reported (reference standard)", "q-NR"]);
    if (opts && opts.withNA) items.push(["No reference standard", "q-NA"]);
    return h("ul", { class: "legend", "aria-label": "Quality rating colors" },
      items.map(([label, cls]) => h("li", null, h("span", { class: "q " + cls, "aria-hidden": "true" }), label)));
  };

  // ------------------------------------------------------------------
  // Vertical columns. cols: [{key,label,count,segs?,note?}]
  // ------------------------------------------------------------------
  C.columns = function (el, opts) {
    A.clear(el);
    const cols = opts.cols;
    const max = opts.max || Math.max(1, ...cols.map((c) => c.value != null ? c.value : c.count));
    const box = h("div", { class: "cols" + (opts.percent ? " is-percent" : "") });
    box.style.setProperty("--cols", cols.length);
    for (const c of cols) {
      const v = c.value != null ? c.value : c.count;
      const hgt = (100 * v) / max;
      const tag = opts.onToggle ? "button" : "div";
      const col = h(tag, {
        class: "col" + (c.selected ? " is-selected" : "") + (c.partial ? " is-partial" : ""),
        type: opts.onToggle ? "button" : null,
        "aria-pressed": opts.onToggle && !opts.opener ? (c.selected ? "true" : "false") : null,
      },
        h("span", { class: "col-label" }, c.label),
        h("span", { class: "sr-only" }, ": "),
        h("span", { class: "col-val" }, opts.percent ? v + "%" : A.fmt(v)),
        c.sr ? h("span", { class: "sr-only" }, " " + c.sr) : null,
        h("span", { class: "col-bar-wrap", "aria-hidden": "true" }, h("span", { class: "col-bar", style: { height: hgt + "%" } })));
      if (opts.onToggle) col.addEventListener("click", () => opts.onToggle(c.key));
      if (opts.fk) col.dataset.fk = opts.fk + "|" + c.key;
      if (c.tip) tipFor(col, c.tip);
      box.appendChild(col);
    }
    el.appendChild(box);
  };

  // ------------------------------------------------------------------
  // Evidence-gap map: rows x cols matrix of circles sized by count.
  // ------------------------------------------------------------------
  C.gapmap = function (el, opts) {
    A.clear(el);
    const { rows, cols, cell } = opts;
    let max = 1;
    const vals = rows.map((r) => cols.map((c) => {
      const v = cell(r.key, c.key);
      if (v > max) max = v;
      return v;
    }));
    const maxD = opts.maxD || 46;
    const grid = h("div", { class: "gap", role: "table", "aria-label": opts.label || "Evidence map" });
    grid.style.setProperty("--gap-cols", cols.length);
    const head = h("div", { class: "gap-row gap-head", role: "row" },
      h("div", { class: "gap-corner", role: "columnheader" }, opts.corner || ""),
      cols.map((c) => h("div", { class: "gap-colhead", role: "columnheader", title: c.label }, h("span", null, c.label))));
    grid.appendChild(head);
    rows.forEach((r, ri) => {
      const line = h("div", { class: "gap-row", role: "row" },
        h("div", { class: "gap-rowhead", role: "rowheader" }, h("span", { class: "gap-rowname" }, r.label), r.total != null ? h("span", { class: "gap-rowtotal" }, A.fmt(r.total)) : null));
      cols.forEach((c, ci) => {
        const v = vals[ri][ci];
        const d = v ? Math.max(9, Math.sqrt(v / max) * maxD) : 0;
        const label = r.label + " and " + c.label + ": " + A.fmt(v) + " " + (opts.unit || "");
        const dot = v ? h("span", { class: "gap-dot", style: { width: d + "px", height: d + "px" }, "aria-hidden": "true" }, d >= 24 ? h("span", { class: "gap-n" }, A.fmt(v)) : null) : h("span", { class: "gap-zero", "aria-hidden": "true" });
        const inner = opts.onCell && v
          ? h("button", { class: "gap-btn", type: "button", "aria-label": A.fmt(v) + " " + (opts.unit || "") + ": " + r.label + " and " + c.label, dataset: { fk: (opts.fk || "gap") + "|" + r.key + "|" + c.key } }, dot)
          : h("span", { class: "gap-static" }, dot, h("span", { class: "sr-only" }, label));
        const cellEl = h("div", { class: "gap-cell" + (v ? "" : " is-empty"), role: "cell" }, inner);
        if (v) {
          tipFor(inner, "<strong>" + A.esc(r.label) + "</strong><br>" + A.esc(c.label) + "<br>" + A.fmt(v) + " " + A.esc(opts.unit || "") + (opts.onCell ? '<span class="tip-hint">Select to see them</span>' : ""));
          if (opts.onCell) inner.addEventListener("click", () => opts.onCell(r.key, c.key));
        }
        line.appendChild(cellEl);
      });
      grid.appendChild(line);
    });
    el.appendChild(h("div", { class: "gap-scroll", tabindex: "0", role: "region", "aria-label": (opts.label || "Evidence map") + " (scrolls sideways on small screens)" }, grid));
  };

  // ------------------------------------------------------------------
  // Signature field: every benchmark as three stacked quality cells.
  // groups: [{key,label,items:[benchmark]}]; lens(b) -> bool | null
  // ------------------------------------------------------------------
  C.field = function (el, opts) {
    A.clear(el);
    const field = h("div", { class: "field", role: "group", "aria-label": opts.label || "All benchmarks" });
    const marks = [];
    let idx = 0;
    for (const g of opts.groups) {
      const grp = h("div", { class: "fgrp" });
      const nEl = h("span", { class: "fgrp-n" }, A.fmt(g.items.length));
      grp.appendChild(h("div", { class: "fgrp-label" }, h("span", { class: "fgrp-name" }, g.label), nEl));
      const box = h("div", { class: "fgrp-marks" });
      for (const b of g.items) {
        const sig = h("span", {
          class: "sig",
          role: "button",
          tabindex: "-1",
          "aria-label": b.name + ". Inputs " + A.qLabel(b.q.input.r, "input") + ", reference standard " + A.qLabel(b.q.ref.r, "ref") + ", scoring " + A.qLabel(b.q.scoring.r, "scoring") + ".",
          style: { "--i": String(idx) },
        },
          h("i", { class: A.qClass(b.q.input.r) }),
          h("i", { class: A.qClass(b.q.ref.r) }),
          h("i", { class: A.qClass(b.q.scoring.r) }));
        sig._b = b;
        marks.push(sig);
        box.appendChild(sig);
        idx++;
      }
      grp._n = nEl;
      grp._items = g.items;
      grp.appendChild(box);
      field.appendChild(grp);
    }
    if (marks.length) marks[0].tabIndex = 0;
    el.appendChild(field);

    const tipHtml = (b) =>
      "<strong>" + A.esc(b.name) + "</strong><br>" + A.esc(b.purpose) +
      '<span class="tip-q">' + A.DIMS.map((d) => '<span><i class="q ' + A.qClass(b.q[d.key].r) + '"></i>' + d.label + ": " + A.qLabel(b.q[d.key].r, d.key) + "</span>").join("") + "</span>" +
      A.countLabel(b.n_studies, "study", "studies") + '<span class="tip-hint">Select to open</span>';

    field.addEventListener("mouseover", (e) => {
      const s = e.target.closest(".sig");
      if (!s) return;
      A.tip.show(tipHtml(s._b), e);
      s.classList.add("is-hover");
    });
    field.addEventListener("mousemove", (e) => A.tip.move(e));
    field.addEventListener("mouseout", (e) => {
      const s = e.target.closest(".sig");
      if (s) s.classList.remove("is-hover");
      if (!e.relatedTarget || !field.contains(e.relatedTarget)) A.tip.hide();
    });
    field.addEventListener("click", (e) => {
      const s = e.target.closest(".sig");
      if (s && opts.onOpen) {
        A.tip.hide();
        opts.onOpen(s._b);
      }
    });
    // Roving focus: one tab stop, arrow keys move between marks.
    field.addEventListener("keydown", (e) => {
      const s = e.target.closest(".sig");
      if (!s) return;
      const visible = marks.filter((m) => !m.classList.contains("is-off") || !field.classList.contains("lensing"));
      const list = visible.length ? visible : marks;
      let i = list.indexOf(s);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") i = Math.min(list.length - 1, i + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") i = Math.max(0, i - 1);
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = list.length - 1;
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        A.tip.hide();
        if (opts.onOpen) opts.onOpen(s._b);
        return;
      } else return;
      e.preventDefault();
      s.tabIndex = -1;
      const next = list[i] || s;
      next.tabIndex = 0;
      next.focus();
      A.tip.show(tipHtml(next._b), next);
    });
    field.addEventListener("focusout", (e) => {
      if (!field.contains(e.relatedTarget)) A.tip.hide();
    });

    const api = {
      setLens(test) {
        const on = typeof test === "function";
        field.classList.toggle("lensing", on);
        for (const m of marks) m.classList.toggle("is-off", on && !test(m._b));
        for (const grp of field.children) {
          if (!grp._items) continue;
          const n = on ? grp._items.filter(test).length : grp._items.length;
          grp._n.textContent = on ? A.fmt(n) + " of " + A.fmt(grp._items.length) : A.fmt(grp._items.length);
        }
      },
    };
    if (!A.reducedMotion() && opts.animate) {
      field.classList.add("is-entering");
      requestAnimationFrame(() => requestAnimationFrame(() => field.classList.add("is-in")));
      setTimeout(() => field.classList.remove("is-entering", "is-in"), 2600);
    }
    return api;
  };
})();
