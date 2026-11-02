/* Benchmark Atlas: the explorer (sidebar filters + table / charts / map).
   One implementation serves both the Benchmarks and the Studies pages;
   each page passes a config (see explorers.js). All state lives in the URL,
   so any view can be bookmarked or shared. */
(function () {
  "use strict";
  const A = window.Atlas;
  const h = A.h;

  const VIEW_META = {
    table: { label: "Table", icon: "table" },
    charts: { label: "Charts", icon: "bars" },
    map: { label: "Map", icon: "map" },
  };

  const PAGE = 100; // table rows rendered at a time

  function Explorer(cfg) {
    this.cfg = cfg;
    this.engine = new A.Engine(cfg.items, cfg.facets, cfg.presets, cfg.searchText);
    this.fvOf = new Map(cfg.items.map((it, i) => [it, this.engine.fv[i]]));
    this.facetByKey = new Map(cfg.facets.map((f) => [f.key, f]));
    this.expanded = {};
    this.findText = {};
    this.facetEls = new Map();
    this.lastSig = null;
  }
  A.Explorer = Explorer;

  // ------------------------------------------------------------------
  // State <-> URL
  // ------------------------------------------------------------------
  Explorer.prototype.readState = function (route) {
    const p = route.params;
    const cfg = this.cfg;
    const sel = {};
    for (const f of cfg.facets) if (p[f.key] && p[f.key].length) sel[f.key] = new Set(p[f.key]);
    const v = A.param(p, "view");
    const view = cfg.views.includes(v) ? v : "table";
    let sort = A.param(p, "sort");
    if (!cfg.sorts[sort]) sort = cfg.defaultSort;
    let dir = A.param(p, "dir");
    if (dir !== "asc" && dir !== "desc") dir = cfg.sorts[sort].dir;
    const preset = A.param(p, "preset") || "";
    return {
      sel,
      q: A.param(p, "q") || "",
      preset: cfg.presets.some((x) => x.value === preset) ? preset : "",
      view,
      sort,
      dir,
      cols: new Set(p.cols || []),
      mr: A.param(p, "mr"),
      mc: A.param(p, "mc"),
      show: A.param(p, "show"),
    };
  };

  Explorer.prototype.hashFor = function (overrides) {
    const s = Object.assign({}, this.state, overrides || {});
    const cfg = this.cfg;
    const params = {};
    for (const f of cfg.facets) if (s.sel[f.key] && s.sel[f.key].size) params[f.key] = Array.from(s.sel[f.key]);
    if (s.q) params.q = s.q;
    if (s.preset) params.preset = s.preset;
    if (s.view && s.view !== "table") params.view = s.view;
    if (s.sort && s.sort !== cfg.defaultSort) params.sort = s.sort;
    if (s.dir && cfg.sorts[s.sort] && s.dir !== cfg.sorts[s.sort].dir) params.dir = s.dir;
    if (s.cols && s.cols.size) params.cols = Array.from(s.cols);
    if (s.mr) params.mr = s.mr;
    if (s.mc) params.mc = s.mc;
    if (s.show) params.show = s.show;
    return A.buildHash(cfg.page, params);
  };

  Explorer.prototype.set = function (overrides, opts) {
    const o = opts || {};
    A.go(this.hashFor(overrides), !!o.replace, o.state);
  };

  Explorer.prototype.toggle = function (key, value, on) {
    const sel = cloneSel(this.state.sel);
    const s = sel[key] || new Set();
    const want = on == null ? !s.has(value) : on;
    if (want) s.add(value);
    else s.delete(value);
    if (s.size) sel[key] = s;
    else delete sel[key];
    this.set({ sel });
  };

  Explorer.prototype.only = function (pairs, extra) {
    // Replace the selection for the given facets (used by the map).
    const sel = cloneSel(this.state.sel);
    for (const [k, v] of pairs) sel[k] = new Set([v]);
    this.set(Object.assign({ sel }, extra || {}));
  };

  function cloneSel(sel) {
    const out = {};
    for (const k in sel) out[k] = new Set(sel[k]);
    return out;
  }

  Explorer.prototype.activeCount = function (st) {
    let n = st.q ? 1 : 0;
    if (st.preset) n++;
    for (const k in st.sel) n += st.sel[k].size;
    return n;
  };

  // ------------------------------------------------------------------
  // Mount / update
  // ------------------------------------------------------------------
  Explorer.prototype.mount = function (root, route) {
    const cfg = this.cfg;
    this.root = root;
    A.currentExplorer = this;
    this.state = this.readState(route);
    A.clear(root);
    this.facetEls = new Map();
    this.sidebar = this.buildSidebar();
    this.scrim = h("div", { class: "sb-scrim", hidden: true, onclick: () => this.closeFilters() });
    const results = h("section", { class: "results", "aria-labelledby": cfg.page + "-title" });
    results.appendChild(
      h("header", { class: "ex-head" },
        h("h1", { class: "ex-title", id: cfg.page + "-title" }, cfg.title),
        h("p", { class: "ex-lede" }, cfg.lede)));
    results.appendChild(this.buildToolbar());
    this.chipsEl = h("div", { class: "chips-wrap" });
    results.appendChild(this.chipsEl);
    this.viewEl = h("div", { class: "ex-view" });
    results.appendChild(this.viewEl);
    root.appendChild(h("div", { class: "explorer" }, this.sidebar, this.scrim, results));
    // Open any filter group that already has an active filter.
    for (const det of this.sidebar.querySelectorAll(".fgroup")) {
      const g = det.dataset.g;
      if (this.groupActive(g, this.state)) det.open = true;
    }
    this.currentView = null;
    this.lastSig = null;
    this.update(route);
  };

  Explorer.prototype.groupActive = function (g, st) {
    let n = 0;
    for (const f of this.cfg.facets) if (f.group === g && st.sel[f.key]) n += st.sel[f.key].size;
    if (g === "quality" && st.preset) n++;
    return n;
  };

  Explorer.prototype.update = function (route) {
    const st = (this.state = this.readState(route));
    const p = route.params;
    const sig = JSON.stringify(Object.keys(p).filter((k) => k !== "show").sort().map((k) => [k, p[k]]));
    const onlyDrawer = sig === this.lastSig;
    this.lastSig = sig;
    if (onlyDrawer) {
      this.markOpenRow(st);
      return;
    }
    const focus = this.captureFocus();
    const out = (this.out = this.engine.run(st.sel, st.q, st.preset));
    this.results = A.sortItems(out.results, this.cfg.sorts, st.sort, st.dir);
    this.limit = PAGE;
    this.updateSidebar(out, st);
    this.updateToolbar(st);
    this.updateChips(st);
    this.renderView(st);
    this.restoreFocus(focus);
  };

  // Parts of the page are redrawn after each change; put keyboard focus
  // back on the equivalent control so keyboard users keep their place.
  Explorer.prototype.captureFocus = function () {
    const ae = document.activeElement;
    if (!ae || ae === document.body || !this.root.contains(ae)) return null;
    if (this.sidebar.contains(ae) && !ae.classList.contains("sb-clear")) return null; // the sidebar is not redrawn
    const info = { el: ae };
    if (ae.id) info.sel = "#" + CSS.escape(ae.id);
    else if (ae.dataset && ae.dataset.fk) info.sel = '[data-fk="' + CSS.escape(ae.dataset.fk) + '"]';
    else if (ae.dataset && ae.dataset.sort) info.sel = '.th-sort[data-sort="' + CSS.escape(ae.dataset.sort) + '"]';
    if (ae.classList.contains("chip")) info.chip = Array.from(this.chipsEl.querySelectorAll(".chip")).indexOf(ae);
    if (ae.classList.contains("sb-clear")) info.sbClear = true;
    return info;
  };

  Explorer.prototype.restoreFocus = function (info) {
    if (!info) return;
    if (document.contains(info.el) && document.activeElement === info.el && !info.el.disabled) return;
    let target = info.sel ? this.root.querySelector(info.sel) : null;
    if (!target && info.chip != null) {
      const chips = this.chipsEl.querySelectorAll(".chip");
      target = chips.length ? chips[Math.min(Math.max(info.chip, 0), chips.length - 1)] : null;
    }
    if (!target && info.sbClear) target = this.searchInput;
    if (!target) target = this.countEl;
    target.focus({ preventScroll: true });
  };

  // ------------------------------------------------------------------
  // Sidebar
  // ------------------------------------------------------------------
  Explorer.prototype.buildSidebar = function () {
    const cfg = this.cfg;
    const sid = cfg.page + "-filters";
    const sb = h("aside", { class: "sidebar", id: sid, "aria-label": "Filters" });
    this.clearAllBtn = h("button", { class: "link-btn sb-clear", type: "button", onclick: () => this.clearAll() }, "Clear all");
    sb.appendChild(
      h("div", { class: "sb-head" },
        h("h2", { class: "sb-title" }, "Filters"),
        this.clearAllBtn,
        h("button", { class: "btn btn-primary sb-done only-narrow", type: "button", onclick: () => this.closeFilters() }, "Show results")));
    const qid = cfg.page + "-q";
    this.searchInput = h("input", {
      id: qid,
      type: "search",
      class: "input sb-q",
      placeholder: cfg.searchPlaceholder,
      autocomplete: "off",
      spellcheck: "false",
    });
    const pushQ = A.debounce((v) => this.set({ q: v.trim() }, { replace: true }), 220);
    this.searchInput.addEventListener("input", (e) => pushQ(e.target.value));
    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.set({ q: e.target.value.trim() }, { replace: true });
      }
    });
    sb.appendChild(
      h("div", { class: "sb-search" },
        h("label", { class: "sr-only", for: qid }, "Search " + cfg.noun[1]),
        A.iconEl("search", "sb-q-icon"),
        this.searchInput));

    for (const g of cfg.groups) {
      const facets = cfg.facets.filter((f) => f.group === g.key);
      const badge = h("span", { class: "fgroup-badge", hidden: true });
      const det = h("details", { class: "fgroup", dataset: { g: g.key } },
        h("summary", null, h("span", { class: "fgroup-label" }, g.label), badge, A.iconEl("chevron", "fgroup-chev")));
      if (g.open) det.open = true;
      det._badge = badge;
      const body = h("div", { class: "fgroup-body" });
      if (g.key === "quality" && cfg.presets.length) body.appendChild(this.buildPresets());
      for (const f of facets) body.appendChild(this.buildFacet(f));
      det.appendChild(body);
      sb.appendChild(det);
    }
    if (cfg.sidebarNote) sb.appendChild(h("p", { class: "sb-note" }, cfg.sidebarNote));
    return sb;
  };

  Explorer.prototype.buildPresets = function () {
    const cfg = this.cfg;
    const wrap = h("fieldset", { class: "facet presets" });
    wrap.appendChild(h("legend", { class: "facet-title" }, "Across all three ratings"));
    const all = [{ value: "", label: "Any ratings", help: "" }].concat(cfg.presets);
    this.presetEls = new Map();
    const list = h("div", { class: "opts" });
    for (const p of all) {
      const input = h("input", { type: "radio", name: cfg.page + "-preset", value: p.value, class: "opt-input" });
      const lab = h("label", { class: "opt opt-radio" },
        input,
        h("span", { class: "dot", "aria-hidden": "true" }),
        h("span", { class: "opt-label" }, p.label),
        h("span", { class: "opt-n" }));
      input.addEventListener("change", () => {
        if (input.checked) this.set({ preset: p.value });
      });
      this.presetEls.set(p.value, { lab, input, n: lab.querySelector(".opt-n") });
      list.appendChild(lab);
    }
    wrap.appendChild(list);
    this.presetNote = h("p", { class: "facet-note", "aria-live": "polite" });
    wrap.appendChild(this.presetNote);
    return wrap;
  };

  Explorer.prototype.buildFacet = function (f) {
    const opts = this.engine.optionsFor(f);
    const fs = h("fieldset", { class: "facet", dataset: { key: f.key } });
    fs.appendChild(h("legend", { class: "facet-title" + (f.hideTitle ? " sr-only" : "") }, f.label));
    if (f.search) {
      const find = h("input", { type: "search", class: "input input-sm facet-find", placeholder: f.search, "aria-label": f.search });
      find.addEventListener("input", () => {
        this.findText[f.key] = find.value;
        this.layoutFacet(f);
      });
      fs.appendChild(find);
    }
    const list = h("div", { class: "opts" });
    const items = new Map();
    for (const v of opts) {
      const input = h("input", { type: "checkbox", value: v, class: "opt-input" });
      const label = f.quality ? A.qLabel(v, f.quality) : f.display ? f.display(v) : v;
      const lab = h("label", { class: "opt" },
        input,
        h("span", { class: "box", "aria-hidden": "true", html: A.icon("check") }),
        f.quality ? h("span", { class: "q " + A.qClass(v), "aria-hidden": "true" }) : null,
        h("span", { class: "opt-label" }, label),
        h("span", { class: "opt-n" }));
      input.addEventListener("change", () => this.toggle(f.key, v, input.checked));
      items.set(v, { lab, input, n: lab.querySelector(".opt-n") });
      list.appendChild(lab);
    }
    fs.appendChild(list);
    let more = null;
    if (f.limit && opts.length > f.limit) {
      more = h("button", { class: "link-btn opt-more", type: "button", "aria-expanded": "false" });
      more.addEventListener("click", () => {
        this.expanded[f.key] = !this.expanded[f.key];
        this.layoutFacet(f);
      });
      fs.appendChild(more);
    }
    this.facetEls.set(f.key, { fs, items, more, opts });
    return fs;
  };

  Explorer.prototype.layoutFacet = function (f) {
    const E = this.facetEls.get(f.key);
    if (!E) return;
    const find = A.norm(this.findText[f.key] || "").trim();
    const sel = this.state.sel[f.key] || new Set();
    let anyFound = false;
    E.opts.forEach((v, i) => {
      const it = E.items.get(v);
      let vis;
      if (find) vis = A.norm(v).indexOf(find) >= 0;
      else if (f.limit && !this.expanded[f.key]) vis = i < f.limit || sel.has(v);
      else vis = true;
      if (vis) anyFound = true;
      it.lab.hidden = !vis;
    });
    if (E.more) {
      E.more.hidden = !!find;
      E.more.textContent = this.expanded[f.key] ? "Show fewer" : "Show all " + E.opts.length;
      E.more.setAttribute("aria-expanded", this.expanded[f.key] ? "true" : "false");
    }
    let none = E.fs.querySelector(".facet-none");
    if (find && !anyFound) {
      if (!none) E.fs.appendChild(h("p", { class: "facet-none" }, "No match. Try a shorter word."));
    } else if (none) none.remove();
  };

  Explorer.prototype.updateSidebar = function (out, st) {
    const cfg = this.cfg;
    for (const f of cfg.facets) {
      const E = this.facetEls.get(f.key);
      const c = out.counts[f.key];
      const sel = st.sel[f.key] || new Set();
      for (const [v, it] of E.items) {
        const n = c.get(v) || 0;
        it.n.textContent = A.fmt(n);
        it.input.checked = sel.has(v);
        it.lab.classList.toggle("is-zero", n === 0 && !sel.has(v));
      }
      this.layoutFacet(f);
    }
    if (this.presetEls) {
      for (const [v, it] of this.presetEls) {
        it.input.checked = v === st.preset;
        it.n.textContent = A.fmt(v ? out.presetCounts.get(v) || 0 : out.presetBase);
      }
      const p = cfg.presets.find((x) => x.value === st.preset);
      this.presetNote.textContent = p ? p.help : "Narrow to benchmarks by their pattern of ratings, or pick ratings one dimension at a time below.";
    }
    for (const det of this.sidebar.querySelectorAll(".fgroup")) {
      const n = this.groupActive(det.dataset.g, st);
      det._badge.hidden = !n;
      det._badge.textContent = n ? String(n) : "";
      det._badge.setAttribute("aria-label", n + " active");
    }
    if (document.activeElement !== this.searchInput && this.searchInput.value !== st.q) this.searchInput.value = st.q;
    this.clearAllBtn.disabled = this.activeCount(st) === 0;
  };

  Explorer.prototype.clearAll = function () {
    this.searchInput.value = "";
    this.findText = {};
    for (const el of this.sidebar.querySelectorAll(".facet-find")) el.value = "";
    this.set({ sel: {}, q: "", preset: "" });
  };

  Explorer.prototype.openFilters = function () {
    this.sidebar.classList.add("is-open");
    this.scrim.hidden = false;
    document.body.classList.add("no-scroll");
    this.filtersBtn.setAttribute("aria-expanded", "true");
    this._trap = (e) => {
      if (e.key === "Escape") this.closeFilters();
      else A.trapFocus(this.sidebar, e);
    };
    document.addEventListener("keydown", this._trap);
    setTimeout(() => this.searchInput.focus(), 50);
  };

  Explorer.prototype.closeFilters = function () {
    if (!this.sidebar.classList.contains("is-open")) return;
    this.sidebar.classList.remove("is-open");
    this.scrim.hidden = true;
    document.body.classList.remove("no-scroll");
    this.filtersBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", this._trap);
    this.filtersBtn.focus();
  };

  // ------------------------------------------------------------------
  // Toolbar and chips
  // ------------------------------------------------------------------
  Explorer.prototype.buildToolbar = function () {
    const cfg = this.cfg;
    this.countEl = h("p", { class: "ex-count", "aria-live": "polite", tabindex: "-1" });
    this.filtersBadge = h("span", { class: "btn-badge", hidden: true });
    this.filtersBtn = h("button", {
      class: "btn btn-secondary only-narrow",
      type: "button",
      "aria-controls": cfg.page + "-filters",
      "aria-expanded": "false",
      onclick: () => this.openFilters(),
    }, A.iconEl("filters"), "Filters", this.filtersBadge);

    this.viewBtns = new Map();
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Show results as" });
    for (const v of cfg.views) {
      const b = h("button", { class: "seg-btn", type: "button", "aria-pressed": "false", onclick: () => this.set({ view: v }) }, A.iconEl(VIEW_META[v].icon), VIEW_META[v].label);
      this.viewBtns.set(v, b);
      seg.appendChild(b);
    }

    this.sortSel = h("select", { class: "select", id: cfg.page + "-sort" });
    for (const k of cfg.sortMenu) this.sortSel.appendChild(h("option", { value: k }, cfg.sorts[k].label));
    this.sortSel.addEventListener("change", () => this.set({ sort: this.sortSel.value, dir: cfg.sorts[this.sortSel.value].dir }));
    this.sortWrap = h("div", { class: "tool-sort" }, h("label", { for: cfg.page + "-sort", class: "tool-label" }, "Sort"), this.sortSel);

    // Column picker
    this.colsMenu = null;
    if (cfg.optionalColumns && cfg.optionalColumns.length) {
      const panel = h("div", { class: "menu-panel", role: "group", "aria-label": "Extra columns" });
      panel.appendChild(h("p", { class: "menu-title" }, "Add columns to the table"));
      this.colInputs = new Map();
      for (const c of cfg.optionalColumns) {
        const input = h("input", { type: "checkbox", class: "opt-input", value: c.key });
        input.addEventListener("change", () => {
          const cols = new Set(this.state.cols);
          if (input.checked) cols.add(c.key);
          else cols.delete(c.key);
          this.set({ cols });
        });
        this.colInputs.set(c.key, input);
        panel.appendChild(h("label", { class: "opt" }, input, h("span", { class: "box", "aria-hidden": "true", html: A.icon("check") }), h("span", { class: "opt-label" }, c.label)));
      }
      this.colsMenu = h("details", { class: "menu" }, h("summary", { class: "btn btn-quiet" }, A.iconEl("columnsPick"), "Columns"), panel);
      document.addEventListener("click", (e) => {
        if (this.colsMenu && this.colsMenu.open && !this.colsMenu.contains(e.target)) this.colsMenu.open = false;
      });
      this.colsMenu.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          this.colsMenu.open = false;
          this.colsMenu.querySelector("summary").focus();
        }
      });
    }

    const dl = h("button", { class: "btn btn-quiet", type: "button", "aria-label": "Download CSV", title: "Download the rows that match your filters", onclick: () => this.downloadCSV() }, A.iconEl("download"), h("span", { class: "btn-text" }, "Download CSV"));
    const share = h("button", { class: "btn btn-quiet", type: "button", "aria-label": "Copy link", title: "Copy a link to this view", onclick: () => A.copy(A.absoluteUrl(this.hashFor({ show: null })), "Link to this view copied") }, A.iconEl("link"), h("span", { class: "btn-text" }, "Copy link"));

    return h("div", { class: "ex-bar" },
      h("div", { class: "ex-bar-left" }, this.countEl),
      h("div", { class: "ex-tools" }, this.filtersBtn, seg, this.sortWrap, this.colsMenu, dl, share));
  };

  Explorer.prototype.updateToolbar = function (st) {
    const cfg = this.cfg;
    const n = this.results.length;
    const total = cfg.items.length;
    const filtered = this.activeCount(st) > 0;
    this.countEl.innerHTML = filtered
      ? '<span class="n">' + A.fmt(n) + "</span> of " + A.fmt(total) + " " + A.esc(cfg.noun[1])
      : '<span class="n">' + A.fmt(total) + "</span> " + A.esc(cfg.noun[1]);
    const active = this.activeCount(st);
    this.filtersBadge.hidden = !active;
    this.filtersBadge.textContent = String(active);
    for (const [v, b] of this.viewBtns) b.setAttribute("aria-pressed", v === st.view ? "true" : "false");
    this.sortSel.value = st.sort;
    this.sortWrap.hidden = st.view !== "table";
    if (this.colsMenu) {
      this.colsMenu.hidden = st.view !== "table";
      for (const [k, input] of this.colInputs) input.checked = st.cols.has(k);
    }
  };

  Explorer.prototype.updateChips = function (st) {
    const cfg = this.cfg;
    const chips = [];
    if (st.q) chips.push({ k: "Search", v: "“" + st.q + "”", go: () => { this.searchInput.value = ""; this.set({ q: "" }); } });
    if (st.preset) {
      const p = cfg.presets.find((x) => x.value === st.preset);
      chips.push({ k: "Quality", v: p ? p.label : st.preset, go: () => this.set({ preset: "" }) });
    }
    for (const f of cfg.facets) {
      for (const v of st.sel[f.key] || []) {
        const label = f.quality ? A.qLabel(v, f.quality) : f.display ? f.display(v) : v;
        chips.push({ k: f.chip || f.label, v: label, go: () => this.toggle(f.key, v, false) });
      }
    }
    A.clear(this.chipsEl);
    if (!chips.length) return;
    const ul = h("ul", { class: "chips", "aria-label": "Active filters" });
    for (const c of chips) {
      ul.appendChild(h("li", null,
        h("button", { class: "chip", type: "button", "aria-label": "Remove filter " + c.k + ": " + c.v, dataset: { fk: "chip|" + c.k + "|" + c.v }, onclick: c.go },
          h("span", { class: "chip-k" }, c.k + ":"), " ", h("span", { class: "chip-v" }, c.v), A.iconEl("close", "chip-x"))));
    }
    if (chips.length > 1) ul.appendChild(h("li", null, h("button", { class: "link-btn chip-clear", type: "button", onclick: () => this.clearAll() }, "Clear all")));
    this.chipsEl.appendChild(ul);
  };

  Explorer.prototype.downloadCSV = function () {
    const cfg = this.cfg;
    const { header, rows } = cfg.csv(this.results);
    const stamp = new Date().toISOString().slice(0, 10);
    const filtered = this.activeCount(this.state) > 0;
    A.download(cfg.page + (filtered ? "-filtered" : "") + "-" + stamp + ".csv", A.csv(header, rows));
    A.toast("Downloaded " + A.countLabel(this.results.length, cfg.noun[0], cfg.noun[1]));
  };

  // ------------------------------------------------------------------
  // Views
  // ------------------------------------------------------------------
  Explorer.prototype.renderView = function (st) {
    if (this.currentView !== st.view) {
      A.clear(this.viewEl);
      this.viewEl.className = "ex-view view-" + st.view;
      this.chartEls = null;
      this.currentView = st.view;
    }
    if (!this.results.length) {
      this.renderEmpty();
      return;
    }
    const empty = this.viewEl.querySelector(".empty");
    if (empty) {
      A.clear(this.viewEl);
      this.chartEls = null;
    }
    if (st.view === "charts") this.renderCharts(st);
    else if (st.view === "map") this.renderMap(st);
    else this.renderTable(st);
  };

  Explorer.prototype.renderEmpty = function () {
    A.clear(this.viewEl);
    this.chartEls = null;
    this.viewEl.appendChild(
      h("div", { class: "empty" },
        h("p", { class: "empty-title" }, "No " + this.cfg.noun[1] + " match these filters."),
        h("p", { class: "empty-text" }, "Remove a filter above, or clear them all to start again."),
        h("button", { class: "btn btn-secondary", type: "button", onclick: () => this.clearAll() }, "Clear all filters")));
  };

  Explorer.prototype.visibleColumns = function (st) {
    const cfg = this.cfg;
    const extra = (cfg.optionalColumns || []).filter((c) => st.cols.has(c.key));
    const cols = cfg.columns.slice();
    // Extra columns go before the trailing columns marked "end".
    const endIdx = cols.findIndex((c) => c.end);
    if (endIdx >= 0) cols.splice(endIdx, 0, ...extra);
    else cols.push(...extra);
    return cols;
  };

  Explorer.prototype.renderTable = function (st) {
    const cfg = this.cfg;
    const cols = this.visibleColumns(st);
    let html = '<table class="tbl tbl-' + cfg.page + (cfg.headGroups ? " has-groups" : "") + '"><caption class="sr-only">' + A.esc(cfg.title) + ", " + A.fmt(this.results.length) + " rows. Select a row to see details.</caption><thead>";
    if (cfg.headGroups) {
      html += '<tr class="th-groups">';
      for (const c of cols) html += c.group ? (c.groupStart ? '<th scope="colgroup" colspan="' + c.groupSpan + '" class="th-group">' + A.esc(c.group) + "</th>" : "") : '<th aria-hidden="true"></th>';
      html += "</tr>";
    }
    html += "<tr>";
    for (const c of cols) {
      const active = c.sort && c.sort === st.sort;
      const ariaSort = c.sort ? (active ? (st.dir === "asc" ? "ascending" : "descending") : "none") : null;
      html += '<th scope="col" class="' + (c.cls || "") + '"' + (ariaSort ? ' aria-sort="' + ariaSort + '"' : "") + ">";
      if (c.sort) {
        const ic = active ? (st.dir === "asc" ? "sortAsc" : "sortDesc") : "sortNone";
        html += '<button type="button" class="th-sort' + (active ? " is-active" : "") + '" data-sort="' + c.sort + '">' + A.esc(c.label) + A.icon(ic, "th-ic") + "</button>";
      } else html += A.esc(c.label);
      html += "</th>";
    }
    html += "</tr></thead><tbody>";
    const showId = st.show ? st.show.slice(2) : null;
    const limit = Math.min(this.limit || PAGE, this.results.length);
    for (const it of this.results.slice(0, limit)) {
      const href = this.hashFor({ show: cfg.prefix + ":" + it.id });
      html += '<tr data-id="' + A.esc(it.id) + '"' + (it.id === showId ? ' class="is-open"' : "") + ">";
      for (const c of cols) html += '<td class="' + (c.cls || "") + '" data-label="' + A.esc(c.label) + '">' + c.render(it, href) + "</td>";
      html += "</tr>";
    }
    html += "</tbody></table>";
    let more = "";
    if (this.results.length > limit) {
      const left = this.results.length - limit;
      more = '<div class="tbl-more"><p class="tbl-more-text">Showing ' + A.fmt(limit) + " of " + A.fmt(this.results.length) + " " + A.esc(cfg.noun[1]) + '.</p>' +
        '<button type="button" class="btn btn-secondary" data-more="1" data-fk="more">Show ' + A.fmt(Math.min(PAGE, left)) + " more</button>" +
        (left > PAGE ? '<button type="button" class="link-btn" data-more="all" data-fk="all">Show all ' + A.fmt(this.results.length) + "</button>" : "") + "</div>";
    }
    this.viewEl.innerHTML = '<div class="tbl-wrap">' + html + "</div>" + more;
    const table = this.viewEl.querySelector("table");
    this.fitTable();
    const moreBox = this.viewEl.querySelector(".tbl-more");
    if (moreBox) {
      moreBox.addEventListener("click", (e) => {
        const b = e.target.closest("[data-more]");
        if (!b) return;
        const before = limit;
        this.limit = b.dataset.more === "all" ? this.results.length : limit + PAGE;
        this.renderTable(this.state);
        const firstNew = this.viewEl.querySelectorAll("tbody tr")[before];
        const link = firstNew && firstNew.querySelector("a.row-link");
        if (link) link.focus({ preventScroll: false });
      });
    }
    table.addEventListener("click", (e) => {
      const sortBtn = e.target.closest(".th-sort");
      if (sortBtn) {
        const k = sortBtn.dataset.sort;
        const dir = k === this.state.sort ? (this.state.dir === "asc" ? "desc" : "asc") : cfg.sorts[k].dir;
        this.set({ sort: k, dir });
        return;
      }
      if (e.target.closest("a")) return; // links handle themselves
      const tr = e.target.closest("tbody tr");
      if (tr && !window.getSelection().toString()) {
        const show = cfg.prefix + ":" + tr.dataset.id;
        A.openRecord(show, this.hashFor({ show }));
      }
    });
  };

  // Scroll the table sideways only when extra columns make it too wide.
  Explorer.prototype.fitTable = function () {
    const wrap = this.viewEl && this.viewEl.querySelector(".tbl-wrap");
    if (!wrap) return;
    wrap.classList.remove("is-scroll");
    const t = wrap.firstChild;
    const scroll = t.scrollWidth > wrap.clientWidth + 1;
    wrap.classList.toggle("is-scroll", scroll);
    if (scroll) {
      wrap.setAttribute("tabindex", "0");
      wrap.setAttribute("role", "region");
      wrap.setAttribute("aria-label", this.cfg.title + " table, scrolls sideways");
    } else {
      wrap.removeAttribute("tabindex");
      wrap.removeAttribute("role");
      wrap.removeAttribute("aria-label");
    }
  };

  window.addEventListener("resize", A.debounce(() => {
    if (A.currentExplorer) A.currentExplorer.fitTable();
  }, 150));

  Explorer.prototype.markOpenRow = function (st) {
    if (this.state.view !== "table") return;
    const showId = st.show && st.show.slice(0, 2) === this.cfg.prefix + ":" ? st.show.slice(2) : null;
    for (const tr of this.viewEl.querySelectorAll("tbody tr")) tr.classList.toggle("is-open", tr.dataset.id === showId);
  };

  Explorer.prototype.renderCharts = function (st) {
    const cfg = this.cfg;
    if (!this.chartEls) {
      A.clear(this.viewEl);
      this.chartEls = new Map();
      const grid = h("div", { class: "chart-grid" });
      for (const spec of cfg.charts) {
        const body = h("div", { class: "chart-body" });
        const panel = h("section", { class: "chart" + (spec.wide ? " is-wide" : ""), "aria-labelledby": cfg.page + "-ch-" + spec.key },
          h("h2", { class: "chart-title", id: cfg.page + "-ch-" + spec.key }, spec.title),
          spec.note ? h("p", { class: "chart-note" }, spec.note) : null,
          body);
        this.chartEls.set(spec.key, body);
        grid.appendChild(panel);
      }
      this.viewEl.appendChild(h("p", { class: "view-hint" }, "Charts summarize the " + cfg.noun[1] + " that match your filters. Select a bar to add it as a filter."));
      this.viewEl.appendChild(grid);
    }
    const ctx = this.chartContext(st);
    for (const spec of cfg.charts) {
      ctx.fk = spec.key;
      spec.render(this.chartEls.get(spec.key), this.results, ctx);
    }
  };

  Explorer.prototype.chartContext = function (st) {
    const self = this;
    return {
      sel: st.sel,
      total: this.results.length,
      toggle: (k, v) => self.toggle(k, v),
      // Add several filters at once (keeps any already selected).
      add(pairs) {
        const sel = cloneSel(self.state.sel);
        for (const [k, v] of pairs) {
          const s = sel[k] || new Set();
          s.add(v);
          sel[k] = s;
        }
        self.set({ sel });
      },
      facet: (k) => self.facetByKey.get(k),
      engine: self.engine,
      fv: (it) => self.fvOf.get(it),
      // Standard bar rows for a facet, from the current results.
      facetRows(k, opts) {
        const f = self.facetByKey.get(k);
        const m = new Map();
        for (const it of self.results) for (const v of self.fvOf.get(it)[k]) m.set(v, (m.get(v) || 0) + 1);
        let vals = self.engine.optionsFor(f).filter((v) => m.has(v) || (st.sel[k] && st.sel[k].has(v)));
        if (!Array.isArray(f.order) && f.order !== "alpha") vals.sort((a, b) => (m.get(b) || 0) - (m.get(a) || 0) || a.localeCompare(b));
        const all = vals.length;
        if (opts && opts.top) vals = A.topWithTies(vals, (v) => m.get(v) || 0, opts.top);
        const rows = vals.map((v) => ({
          value: v,
          label: f.quality ? A.qLabel(v, f.quality) : f.display ? f.display(v) : v,
          count: m.get(v) || 0,
          selected: !!(st.sel[k] && st.sel[k].has(v)),
        }));
        rows.all = all;
        return rows;
      },
    };
  };

  Explorer.prototype.renderMap = function (st) {
    const cfg = this.cfg;
    const dims = cfg.mapDims;
    let mr = dims.some((d) => d.key === st.mr) ? st.mr : cfg.mapDefault[0];
    let mc = dims.some((d) => d.key === st.mc) ? st.mc : cfg.mapDefault[1];
    if (mr === mc) mc = dims.find((d) => d.key !== mr).key;
    A.clear(this.viewEl);
    this.chartEls = null;
    const mkSel = (id, val, onchange) => {
      const s = h("select", { class: "select", id });
      for (const d of dims) s.appendChild(h("option", { value: d.key, selected: d.key === val ? true : null }, d.label));
      s.addEventListener("change", () => onchange(s.value));
      return s;
    };
    const rId = cfg.page + "-mr";
    const cId = cfg.page + "-mc";
    const swap = h("button", { class: "btn btn-quiet", type: "button", dataset: { fk: "map-swap" }, onclick: () => this.set({ mr: mc, mc: mr }) }, "Swap rows and columns");
    this.viewEl.appendChild(
      h("div", { class: "map-controls" },
        h("div", { class: "tool-sort" }, h("label", { for: rId, class: "tool-label" }, "Rows"), mkSel(rId, mr, (v) => this.set({ mr: v, mc: v === mc ? mr : mc }))),
        h("div", { class: "tool-sort" }, h("label", { for: cId, class: "tool-label" }, "Columns"), mkSel(cId, mc, (v) => this.set({ mc: v, mr: v === mr ? mc : mr }))),
        swap));
    const fR = this.facetByKey.get(mr);
    const fC = this.facetByKey.get(mc);
    const cnt = (k) => {
      const m = new Map();
      for (const it of this.results) for (const v of this.fvOf.get(it)[k]) m.set(v, (m.get(v) || 0) + 1);
      return m;
    };
    const rc = cnt(mr);
    const cc = cnt(mc);
    const ordered = (f, m, lim) => {
      let vals = this.engine.optionsFor(f).filter((v) => m.has(v));
      if (!Array.isArray(f.order) && f.order !== "alpha") vals.sort((a, b) => m.get(b) - m.get(a) || a.localeCompare(b));
      const kept = A.topWithTies(vals, (v) => m.get(v), lim);
      return { vals: kept, cut: kept.length < vals.length, all: vals.length };
    };
    const R = ordered(fR, rc, 16);
    const Cc = ordered(fC, cc, 12);
    const lab = (f, v) => (f.quality ? A.qLabel(v, f.quality) : f.display ? f.display(v) : v);
    const pair = new Map();
    for (const it of this.results) {
      const fv = this.fvOf.get(it);
      for (const a of fv[mr]) for (const b of fv[mc]) {
        const key = a + "\u0001" + b;
        pair.set(key, (pair.get(key) || 0) + 1);
      }
    }
    const holder = h("div", { class: "map-holder" });
    this.viewEl.appendChild(holder);
    A.charts.gapmap(holder, {
      rows: R.vals.map((v) => ({ key: v, label: lab(fR, v), total: rc.get(v) })),
      cols: Cc.vals.map((v) => ({ key: v, label: lab(fC, v) })),
      cell: (r, c) => pair.get(r + "\u0001" + c) || 0,
      unit: cfg.noun[1],
      label: fR.label + " by " + fC.label,
      corner: fR.label + " by " + fC.label.toLowerCase(),
      onCell: (r, c) => this.only([[mr, r], [mc, c]], { view: "table" }),
      fk: "map",
    });
    const notes = [];
    notes.push("Circle area is proportional to the number of " + cfg.noun[1] + ". Select a circle to list them in the table.");
    if (cfg.multiNote) notes.push(cfg.multiNote);
    if (R.cut) notes.push("Showing the " + R.vals.length + " most common of " + R.all + " " + fR.label.toLowerCase() + " values.");
    if (Cc.cut) notes.push("Showing the " + Cc.vals.length + " most common of " + Cc.all + " " + fC.label.toLowerCase() + " values.");
    this.viewEl.appendChild(h("p", { class: "map-note" }, notes.join(" ")));
  };
})();
