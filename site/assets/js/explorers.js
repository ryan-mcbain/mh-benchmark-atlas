/* Benchmark Atlas: configuration for the Benchmarks and Studies explorers. */
(function () {
  "use strict";
  const A = window.Atlas;
  const h = A.h;
  const esc = A.esc;

  // ------------------------------------------------------------------
  // Shared cell renderers
  // ------------------------------------------------------------------
  const qShort = (r, dim) => (r === "NA" ? (dim === "ref" ? "None" : "N/A") : r === "NR" ? "Not reported" : r);
  const qCell = (dim) => (b) => {
    const q = b.q[dim];
    const low = q.low ? '<span class="q-low" title="At least one study rated it ' + esc(q.low.toLowerCase()) + '">lowest ' + esc(q.low.toLowerCase()) + "</span>" : "";
    return '<span class="qv"><span class="q ' + A.qClass(q.r) + '" aria-hidden="true"></span>' + esc(qShort(q.r, dim)) + "</span>" + low;
  };
  const sub = (s) => (s ? '<span class="row-sub">' + s + "</span>" : "");
  const list = (arr, max) => esc(A.listText(arr || [], max)) || '<span class="muted">None</span>';
  A.sizeText = function (size) {
    if (!size) return "Not reported";
    if (size.n == null) return size.raw;
    return A.fmt(size.n) + " " + (size.unit || "items") + (size.caveat ? " (" + size.caveat + ")" : "");
  };
  const sizeHtml = (size) => {
    if (!size) return '<span class="muted">Not reported</span>';
    return esc(A.sizeText(size)) + (size.note ? '<sup class="fn" title="' + esc(A.sizeNotes[size.note] || "") + '">' + esc(size.note) + "</sup>" : "");
  };
  A.sizeHtml = sizeHtml;

  function barsChart(k, opts) {
    return (el, items, ctx) => {
      const rows = ctx.facetRows(k, opts);
      A.charts.bars(el, Object.assign({ rows, total: ctx.total, unit: (opts && opts.unit) || "", fk: ctx.fk, onToggle: (v) => ctx.toggle(k, v) }, opts || {}));
      let foot = el.querySelector(":scope > .chart-foot");
      const shown = rows.filter((r) => r.count > 0).length;
      const text = rows.all > shown ? "Showing the " + shown + " most common of " + rows.all + ". Use the filters to see the rest." : "";
      if (text && !foot) {
        foot = h("p", { class: "chart-foot" });
        el.appendChild(foot);
      }
      if (foot) foot.textContent = text;
    };
  }

  function columnsChart(k, labeler, opts) {
    return (el, items, ctx) => {
      const rows = ctx.facetRows(k);
      A.charts.columns(el, {
        cols: rows.map((r) => ({
          key: r.value,
          label: labeler ? labeler(r.value) : r.label,
          count: r.count,
          selected: r.selected,
          partial: opts && opts.partial && opts.partial(r.value),
          sr: (opts && opts.unit) || "",
          tip: "<strong>" + esc(r.label) + "</strong><br>" + A.fmt(r.count) + " " + esc((opts && opts.unit) || "") + " (" + A.pct(r.count, ctx.total) + "%)" + '<span class="tip-hint">Select to filter</span>',
        })),
        onToggle: (v) => ctx.toggle(k, v),
        fk: ctx.fk,
      });
      if (opts && opts.foot) {
        const f = opts.foot(rows, ctx);
        if (f) el.appendChild(h("p", { class: "chart-foot" }, f));
      }
    };
  }

  // Quality: one 100% bar per dimension.
  function qualityStack(el, items, ctx) {
    const keys = { input: "qi", ref: "qr", scoring: "qs" };
    const rows = A.DIMS.map((d) => {
      const m = A.tally(items, (b) => b.q[d.key].r);
      return {
        key: d.key,
        label: d.label,
        segs: A.Q_ORDER.filter((r) => m.get(r)).map((r) => ({
          key: r,
          label: A.qLabel(r, d.key),
          count: m.get(r) || 0,
          cls: A.qClass(r),
          selected: !!(ctx.sel[keys[d.key]] && ctx.sel[keys[d.key]].has(r)),
        })),
      };
    });
    A.charts.stack(el, { rows, labelWidth: "9.5rem", fk: ctx.fk, onSeg: (dim, r) => ctx.toggle(keys[dim], r) });
    el.appendChild(A.charts.qualityLegend({ withNR: items.some((b) => b.q.ref.r === "NR"), withNA: items.some((b) => b.q.ref.r === "NA") }));
  }

  // Quality by purpose: the review's Figure 2, live.
  function qualityByPurpose(el, items, ctx) {
    A.clear(el);
    const keys = { input: "qi", ref: "qr", scoring: "qs" };
    const byP = new Map();
    for (const b of items) {
      if (!byP.has(b.purpose)) byP.set(b.purpose, []);
      byP.get(b.purpose).push(b);
    }
    const order = ctx.engine.optionsFor(ctx.facet("purpose")).filter((p) => byP.has(p));
    const grid = h("div", { class: "qmatrix" });
    grid.appendChild(h("div", { class: "qm-head" }, h("span"), A.DIMS.map((d) => h("span", { class: "qm-dim" }, d.label))));
    for (const p of order) {
      const set = byP.get(p);
      const row = h("div", { class: "qm-row" });
      row.appendChild(h("div", { class: "qm-label" }, p, h("span", { class: "stack-n" }, " (n = " + set.length + ")")));
      for (const d of A.DIMS) {
        const m = A.tally(set, (b) => b.q[d.key].r);
        const track = h("div", { class: "stack-track", role: "group", "aria-label": p + ", " + d.label });
        for (const r of A.Q_ORDER) {
          const n = m.get(r) || 0;
          if (!n) continue;
          const share = (100 * n) / set.length;
          const showPct = share >= 12;
          const clickable = share >= 11; // thinner slivers are display-only (target size)
          const desc = "%: " + p + ", " + d.label + ", " + A.qLabel(r, d.key) + ", " + n + " of " + set.length;
          const seg = h(clickable ? "button" : "div", {
            type: clickable ? "button" : null,
            class: "stack-seg " + A.qClass(r),
            style: { flexGrow: String(n), flexBasis: "0" },
            "aria-label": clickable && !showPct ? Math.round(share) + desc : null,
            "aria-hidden": clickable ? null : "true",
          }, showPct ? [h("span", { class: "stack-pct" }, String(Math.round(share))), clickable ? h("span", { class: "sr-only" }, desc) : null] : null);
          if (clickable) {
            seg.dataset.fk = ctx.fk + "|" + p + "|" + d.key + "|" + r;
            // A segment means "this purpose with this rating": add both filters.
            seg.addEventListener("click", () => ctx.add([["purpose", p], [keys[d.key], r]]));
          }
          A.charts.tipFor(seg, "<strong>" + esc(p) + "</strong><br>" + esc(d.label) + ": " + esc(A.qLabel(r, d.key)) + "<br>" + n + " of " + set.length + " (" + Math.round(share) + "%)" + '<span class="tip-hint">Select to show these benchmarks</span>');
          track.appendChild(seg);
        }
        row.appendChild(track);
        row.appendChild(h("span", { class: "sr-only" }, p + ", " + d.label + ": " + A.Q_ORDER.filter((r) => m.get(r)).map((r) => A.qLabel(r, d.key) + " " + m.get(r) + " of " + set.length).join(", ") + "."));
      }
      grid.appendChild(row);
    }
    el.appendChild(grid);
    A.charts.demoteSmall(grid);
    el.appendChild(A.charts.qualityLegend({ withNR: items.some((b) => b.q.ref.r === "NR"), withNA: items.some((b) => b.q.ref.r === "NA") }));
  }

  function judgeFunnel(el, items, ctx) {
    const judged = items.filter((b) => b.flags.llm_judge);
    const compared = judged.filter((b) => b.judge_compared === "Yes");
    const met = judged.filter((b) => b.judge_agreement === "Met threshold");
    const sel = (k, v) => !!(ctx.sel[k] && ctx.sel[k].has(v));
    A.charts.bars(el, {
      rows: [
        { value: "j", label: "Scored by an LLM judge", count: judged.length, selected: sel("judge", "Scored by an LLM judge") },
        { value: "c", label: "Judge compared with human raters", count: compared.length, selected: sel("judgecompared", "Compared") },
        { value: "m", label: "Agreement met the threshold", count: met.length, selected: sel("agreement", "Met threshold") },
      ],
      max: Math.max(1, judged.length),
      showPct: false,
      unit: "benchmarks",
      fk: ctx.fk,
      emptyText: "None of these benchmarks used an LLM judge.",
      onToggle: (v) => {
        if (v === "j") ctx.toggle("judge", "Scored by an LLM judge");
        else if (v === "c") ctx.toggle("judgecompared", "Compared");
        else ctx.toggle("agreement", "Met threshold");
      },
    });
    let foot = el.querySelector(".chart-foot");
    if (!foot) {
      foot = h("p", { class: "chart-foot" });
      el.appendChild(foot);
    }
    foot.textContent = judged.length
      ? A.fmt(judged.length) + " of " + A.fmt(items.length) + " benchmarks (" + A.pct(judged.length, items.length) + "%) were scored by an LLM judge. For " + A.fmt(compared.length) + " of them (" + A.pct(compared.length, judged.length) + "%), a study compared the judge with human raters; agreement met the threshold (κ ≥ 0.40, or r, ρ, or ICC ≥ 0.50, on most dimensions) for " + A.fmt(met.length) + "."
      : "";
  }

  const reuseShort = { "1 study": "1", "2 studies": "2", "3 studies": "3", "4 or 5 studies": "4–5", "6 to 9 studies": "6–9", "10 or more studies": "10+" };

  // ------------------------------------------------------------------
  // Benchmarks explorer
  // ------------------------------------------------------------------
  A.benchmarkExplorer = function () {
    return new A.Explorer({
      page: "benchmarks",
      prefix: "b",
      title: "Benchmarks",
      noun: ["benchmark", "benchmarks"],
      lede: "All " + A.fmt(A.B.length) + " benchmarks used by the studies in the review. Narrow the list with the filters, then select a benchmark to see its full record and the studies that used it.",
      items: A.B,
      facets: A.benchmarkFacets,
      groups: A.benchmarkGroups,
      presets: A.benchmarkPresets,
      searchText: A.benchmarkSearchText,
      searchPlaceholder: "Name, condition, or instrument",
      sorts: A.benchmarkSorts,
      sortMenu: A.benchmarkSortMenu,
      defaultSort: "used",
      views: ["table", "charts", "map"],
      headGroups: true,
      sidebarNote: "Each count is the number of benchmarks with that value, given your other filters. Options within a filter are combined with OR; different filters with AND.",
      columns: [
        {
          key: "name", label: "Benchmark", sort: "name", cls: "c-name",
          render: (b, href) => '<a class="row-link" href="' + esc(href) + '">' + esc(b.name) + "</a>" + sub(esc(b.constructs.join(", ")) + (b.named ? "" : ' <span class="tag">Unnamed item set</span>')),
        },
        { key: "purpose", label: "Purpose", sort: "purpose", cls: "c-purpose", render: (b) => esc(b.purpose) },
        { key: "condition", label: "Condition or focus", cls: "c-cond", render: (b) => list(b.conditions, 2) },
        {
          key: "studies", label: "Studies", sort: "used", cls: "c-num",
          render: (b) => '<span class="num">' + b.n_studies + "</span>" + sub(esc(A.yearSpan(b.first_year, b.last_year))),
        },
        { key: "qi", label: "Inputs", sort: "qi", cls: "c-q", end: true, group: "Quality rating", groupStart: true, groupSpan: 3, render: qCell("input") },
        { key: "qr", label: "Reference standard", sort: "qr", cls: "c-q", end: true, group: "Quality rating", render: qCell("ref") },
        { key: "qs", label: "Scoring", sort: "qs", cls: "c-q", end: true, group: "Quality rating", render: qCell("scoring") },
      ],
      optionalColumns: [
        { key: "material", label: "Input material", cls: "c-opt", render: (b) => list(b.material) },
        { key: "format", label: "Input format", cls: "c-opt", render: (b) => list(b.input_formats, 2) },
        { key: "conversation", label: "Conversation type", cls: "c-opt", render: (b) => esc(b.conversation) },
        { key: "language", label: "Languages", cls: "c-opt", render: (b) => list(b.languages, 3) },
        { key: "population", label: "Population", cls: "c-opt", render: (b) => list(b.populations, 2) },
        { key: "reftype", label: "Reference standard type", cls: "c-opt", render: (b) => list(b.ref_types, 2) },
        { key: "instrument", label: "Validated instruments", cls: "c-opt", render: (b) => list(b.instruments, 3) },
        { key: "scoring", label: "Scoring method", cls: "c-opt", render: (b) => list(b.scoring) },
        { key: "judge", label: "LLM judge", cls: "c-opt", render: (b) => list(b.judge_families) },
        { key: "availability", label: "Availability", cls: "c-opt", render: (b) => list(b.availability) },
        { key: "size", label: "Size", cls: "c-opt", render: (b) => sizeHtml(b.size) },
        { key: "audience", label: "Intended audience", cls: "c-opt", render: (b) => list(b.audiences) },
      ],
      charts: [
        { key: "purpose", title: "Evaluation purpose", render: barsChart("purpose", { unit: "benchmarks" }) },
        { key: "quality", title: "Quality ratings", note: "Most common rating across the studies that used each benchmark.", render: qualityStack },
        { key: "qbp", title: "Quality by evaluation purpose", wide: true, note: "Share of benchmarks in each purpose with each rating. Select a segment to filter.", render: qualityByPurpose },
        { key: "condition", title: "Condition or focus", note: "A benchmark can address several conditions.", render: barsChart("condition", { top: 12, unit: "benchmarks" }) },
        { key: "construct", title: "Primary evaluation construct", render: barsChart("construct", { top: 12, unit: "benchmarks" }) },
        { key: "material", title: "Type of input material", render: barsChart("material", { unit: "benchmarks" }) },
        { key: "format", title: "Input format", render: barsChart("format", { top: 10, unit: "benchmarks" }) },
        { key: "language", title: "Language", render: barsChart("language", { top: 10, unit: "benchmarks" }) },
        { key: "reftype", title: "Reference standard type", render: barsChart("reftype", { unit: "benchmarks" }) },
        { key: "scoring", title: "Scoring method", render: barsChart("scoring", { unit: "benchmarks" }) },
        { key: "judge", title: "LLM judges and their validation", render: judgeFunnel },
        { key: "conversation", title: "Conversation type", render: barsChart("conversation", { unit: "benchmarks" }) },
        { key: "availability", title: "Availability of inputs", render: barsChart("availability", { unit: "benchmarks" }) },
        { key: "reuse", title: "Studies using each benchmark", render: columnsChart("reuse", (v) => reuseShort[v] || v, { unit: "benchmarks" }) },
        { key: "year", title: "Used in a study from", note: "2026 covers studies published through April 26.", render: columnsChart("year", null, { unit: "benchmarks", partial: (v) => v === "2026" }) },
      ],
      mapDims: [
        { key: "purpose", label: "Evaluation purpose" },
        { key: "condition", label: "Condition or focus" },
        { key: "construct", label: "Primary construct" },
        { key: "material", label: "Input material" },
        { key: "format", label: "Input format" },
        { key: "conversation", label: "Conversation type" },
        { key: "langscope", label: "Languages covered" },
        { key: "population", label: "Population represented" },
        { key: "reftype", label: "Reference standard type" },
        { key: "scoring", label: "Scoring method" },
        { key: "judge", label: "LLM judge" },
        { key: "availability", label: "Availability of inputs" },
        { key: "reuse", label: "Studies using it" },
        { key: "year", label: "Year of use" },
        { key: "qi", label: "Input quality" },
        { key: "qr", label: "Reference standard quality" },
        { key: "qs", label: "Scoring quality" },
      ],
      mapDefault: ["purpose", "condition"],
      multiNote: "A benchmark with several values, such as several conditions, appears in each matching cell.",
      csv: benchmarkCSV,
    });
  };

  function benchmarkCSV(items) {
    const J = (a) => (a || []).join("; ");
    const q = (d) => d.r + (d.low ? " (lowest " + d.low + ")" : "");
    const header = ["Benchmark", "Named", "Evaluation purpose", "Primary evaluation construct", "Mental health condition or focus",
      "Studies using benchmark, No.", "Studies using benchmark", "First year used", "Most recent year used", "Parent benchmark(s)",
      "Input format(s)", "Type of input material", "Source of input", "Conversation type", "Language(s)", "Population represented",
      "Age group represented", "Intended audience", "Size", "Availability of inputs", "Reference standard type(s)",
      "Validated instruments used as reference standard", "Scoring method(s)", "LLM judge model family",
      "LLM judge compared with human raters", "Judge-human agreement", "Reported agreement statistic",
      "Involvement of people with lived experience", "Input quality", "Reference standard quality", "Scoring quality",
      "Source documentation", "Atlas link"];
    const rows = items.map((b) => [
      b.name, b.named ? "Yes" : "No", b.purpose, J(b.constructs) + (b.construct_tie ? " (tie across studies)" : ""), J(b.conditions),
      b.n_studies, b.studies.map((id) => A.sById.get(id).label + ", " + A.sById.get(id).title).join("; "), b.first_year, b.last_year,
      J(b.parents.map((p) => p.name)) || "None", J(b.input_formats), J(b.material), b.input_source, b.conversation, J(b.languages),
      J(b.populations), b.age_group, J(b.audiences), b.size ? b.size.raw : "Not reported", J(b.availability), J(b.ref_types),
      J(b.instruments) || "None", J(b.scoring), J(b.judge_families) || "NA", b.judge_compared || "NA", b.judge_agreement || "NA",
      J(b.agreement_stat) || "NA", J(b.lived) || "None reported", q(b.q.input), q(b.q.ref), q(b.q.scoring),
      b.sources.map((s) => (s.kind === "Note" ? s.text : s.kind + ": " + s.text)).join("; "),
      A.absoluteUrl("#/benchmarks?show=b:" + b.id),
    ]);
    return { header, rows };
  }

  // ------------------------------------------------------------------
  // Studies explorer
  // ------------------------------------------------------------------
  const paperCell = (s) => {
    const L = s.link;
    if (!L) return "";
    return '<a class="paper-link" href="' + esc(L.url) + '" target="_blank" rel="noopener">' + (L.verified ? (L.kind === "arxiv" ? "arXiv" : "Paper") : "Search") + '<span class="sr-only"> (opens in a new tab)</span>' + A.icon("external", "ic-ext") + "</a>";
  };

  A.studyExplorer = function () {
    return new A.Explorer({
      page: "studies",
      prefix: "s",
      title: "Studies",
      noun: ["study", "studies"],
      lede: "The " + A.fmt(A.S.length) + " studies in the review, published from 2023 through April 2026. Filter by year, publication type, the models evaluated, and the benchmarks each study used.",
      items: A.S,
      facets: A.studyFacets,
      groups: A.studyGroups,
      presets: A.studyPresets,
      searchText: A.studySearchText,
      searchPlaceholder: "Title, author, or model",
      sorts: A.studySorts,
      sortMenu: A.studySortMenu,
      defaultSort: "year",
      views: ["table", "charts", "map"],
      sidebarNote: "Each count is the number of studies with that value, given your other filters. Options within a filter are combined with OR; different filters with AND.",
      columns: [
        {
          key: "title", label: "Study", sort: "title", cls: "c-title",
          render: (s, href) => '<a class="row-link" href="' + esc(href) + '">' + esc(s.title) + "</a>" + sub(esc(s.label) + ". " + esc(s.venue) + (s.source_type === "Preprint" ? "" : ", " + esc(s.source_type.toLowerCase()))),
        },
        { key: "year", label: "Year", sort: "year", cls: "c-year", render: (s) => '<span class="num">' + s.year + "</span>" },
        { key: "type", label: "Study type", sort: "type", cls: "c-type", render: (s) => esc(s.study_type) },
        {
          key: "benchmarks", label: "Benchmarks", sort: "nbench", cls: "c-bench",
          render: (s) => '<span class="num">' + s.benchmarks.length + "</span>" + sub(esc(A.listText(s.benchmarks.map((id) => A.bById.get(id).name), 2))),
        },
        {
          key: "models", label: "Models", sort: "nmodels", cls: "c-models",
          render: (s) => '<span class="num">' + (s.n_models == null ? "–" : s.n_models) + "</span>" + sub(esc(A.listText(s.model_families, 3))),
        },
        { key: "paper", label: "Paper", cls: "c-paper", end: true, render: paperCell },
      ],
      optionalColumns: [
        { key: "sourcetype", label: "Publication type", cls: "c-opt", render: (s) => esc(s.source_type) },
        { key: "scope", label: "Mental health scope", cls: "c-opt", render: (s) => esc(s.mh_scope) },
        { key: "access", label: "Model access", cls: "c-opt", render: (s) => esc(s.model_access) },
        { key: "variability", label: "Run-to-run variability", cls: "c-opt", render: (s) => esc(s.variability) },
        { key: "construct", label: "Constructs", cls: "c-opt", render: (s) => list(s.constructs, 2) },
        { key: "scoring", label: "Scoring methods of benchmarks used", cls: "c-opt", render: (s) => list(s.scoring, 2) },
        { key: "judge", label: "LLM judge", cls: "c-opt", render: (s) => (s.llm_judge ? "Yes" : "No") },
        { key: "bpurpose", label: "Benchmark purposes", cls: "c-opt", render: (s) => list(s.bench_purposes, 2) },
      ],
      charts: [
        { key: "year", title: "Studies by year", note: "2026 covers studies published through April 26.", render: columnsChart("year", null, { unit: "studies", partial: (v) => v === "2026" }) },
        { key: "sourcetype", title: "Publication type", render: barsChart("sourcetype", { unit: "studies" }) },
        { key: "studytype", title: "Study type", render: barsChart("studytype", { unit: "studies" }) },
        { key: "bpurpose", title: "Purpose of benchmarks used", note: "A study can use benchmarks with several purposes.", render: barsChart("bpurpose", { unit: "studies" }) },
        { key: "bmaterial", title: "Input material of benchmarks used", render: barsChart("bmaterial", { unit: "studies" }) },
        { key: "family", title: "Model families evaluated", note: "Includes comparator models.", render: barsChart("family", { top: 12, unit: "studies" }) },
        { key: "nmodels", title: "Number of models evaluated", render: columnsChart("nmodels", (v) => v.replace(" models", "").replace(" model", "").replace("More than 10", "11+").replace(" or ", "–").replace(" to ", "–"), { unit: "studies" }) },
        { key: "access", title: "Model access", render: barsChart("access", { unit: "studies" }) },
        { key: "variability", title: "Run-to-run variability", render: barsChart("variability", { unit: "studies" }) },
        { key: "construct", title: "Primary evaluation construct", render: barsChart("construct", { top: 12, unit: "studies" }) },
        { key: "judge", title: "LLM judge in the study", render: barsChart("judge", { unit: "studies" }) },
        { key: "scoring", title: "Scoring methods of the benchmarks used", note: "Pooled across every study that used each benchmark, so a study can show a method it did not apply itself.", render: barsChart("scoring", { unit: "studies" }) },
        { key: "venue", title: "Most common venues", render: barsChart("venue", { top: 12, unit: "studies" }) },
      ],
      mapDims: [
        { key: "bpurpose", label: "Purpose of benchmarks used" },
        { key: "bcondition", label: "Condition of benchmarks used" },
        { key: "year", label: "Year" },
        { key: "sourcetype", label: "Publication type" },
        { key: "studytype", label: "Study type" },
        { key: "scope", label: "Mental health scope" },
        { key: "family", label: "Model family" },
        { key: "nmodels", label: "Number of models" },
        { key: "access", label: "Model access" },
        { key: "variability", label: "Run-to-run variability" },
        { key: "construct", label: "Primary construct" },
        { key: "bmaterial", label: "Input material of benchmarks used" },
        { key: "scoring", label: "Scoring methods of benchmarks used" },
        { key: "judge", label: "LLM judge in the study" },
        { key: "modified", label: "Benchmark modification" },
      ],
      mapDefault: ["bpurpose", "year"],
      multiNote: "A study with several values, such as several model families, appears in each matching cell.",
      csv: studyCSV,
    });
  };

  function studyCSV(items) {
    const J = (a) => (a || []).join("; ");
    const header = ["First author", "Year", "Title", "Source", "Source type", "Study type", "Mental health scope", "Benchmarks used, No.",
      "Benchmarks used", "Modified an existing benchmark", "Models evaluated, No.", "Models evaluated", "Model families evaluated",
      "Model access", "Run-to-run variability", "Primary evaluation construct(s)", "Scoring method(s)", "LLM judge used",
      "Paper link", "Link verified", "DOI", "Atlas link"];
    const rows = items.map((s) => [
      s.first_author, s.year, s.title, s.venue, s.source_type, s.study_type, s.mh_scope, s.benchmarks.length,
      J(s.benchmarks.map((id) => A.bById.get(id).name)), s.modified ? "Yes" : "No", s.n_models,
      J(s.models.map((m) => m.name + (m.comparator ? " (comparator)" : ""))), J(s.model_families) || "NA", s.model_access,
      s.variability, J(s.constructs), J(s.scoring), s.llm_judge ? "Yes" : "No", s.link.url, s.link.verified ? "Yes" : "No (title search)",
      s.link.doi || "", A.absoluteUrl("#/studies?show=s:" + s.id),
    ]);
    return { header, rows };
  }
})();
