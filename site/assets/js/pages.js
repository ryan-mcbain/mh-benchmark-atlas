/* Benchmark Atlas: Overview, Methods, and About pages. */
(function () {
  "use strict";
  const A = window.Atlas;
  const h = A.h;
  const esc = A.esc;
  A.pages = A.pages || {};

  // ------------------------------------------------------------------
  // Facts about the review that are not in the workbook. Edit here if the
  // manuscript changes. Everything else on the site is computed from data.
  // ------------------------------------------------------------------
  A.review = {
    title: "Benchmarks for Evaluating Generative Large Language Models in Mental Health: A Systematic Review",
    authors: [
      ["Samantha Matthews", [1]], ["Maya Mudambi", [2]], ["Hao Yu", [3, 4]], ["John Torous", [5]], ["Jina Suh", [6]],
      ["Jason M. Nagata", [7]], ["Pat Pataranutaporn", [8]], ["Jonathan H. Cantor", [9]], ["Ryan K. McBain", [1]],
    ],
    affiliations: [
      "RAND, Arlington, VA, USA",
      "University of Massachusetts Amherst, Amherst, MA, USA",
      "Harvard Pilgrim Health Care Institute, Boston, MA, USA",
      "Harvard Medical School, Boston, MA, USA",
      "Beth Israel Deaconess Medical Center, Boston, MA, USA",
      "School of Computer Science & Engineering, University of Washington, Seattle, WA, USA",
      "University of California, San Francisco, San Francisco, CA, USA",
      "MIT Media Lab, Massachusetts Institute of Technology, Cambridge, MA, USA",
      "RAND, Santa Monica, CA, USA",
    ],
    citation: "Matthews S, Mudambi M, Yu H, Torous J, Suh J, Nagata JM, Pataranutaporn P, Cantor JH, McBain RK. Benchmarks for evaluating generative large language models in mental health: a systematic review. Manuscript in preparation; 2026.",
    contact: { name: "Samantha Matthews", email: "smatthew@rand.org" },
    searchStart: "January 1, 2020",
    searchEnd: "April 26, 2026",
    databases: "PubMed, APA PsycINFO, Web of Science Core Collection, Embase, and arXiv",
    records: 3454,
    fullText: 751,
  };

  // ------------------------------------------------------------------
  // Shared bits
  // ------------------------------------------------------------------
  const purposeOrder = () => {
    const m = A.tally(A.B, (b) => b.purpose);
    return Array.from(m.keys()).sort((a, b) => m.get(b) - m.get(a));
  };
  const n = A.fmt;
  const share = (k, d) => A.pct(k, d) + "%";

  function sigKey() {
    return h("div", { class: "sig-key" },
      h("div", { class: "sig-key-diagram", "aria-hidden": "true" },
        h("span", { class: "sig sig-xl sig-blank" }, h("i"), h("i"), h("i")),
        h("span", { class: "sig-key-labels" }, h("span", null, "Inputs"), h("span", null, "Reference standard"), h("span", null, "Scoring"))),
      h("div", { class: "sig-key-text" },
        h("p", null, "Each mark is one benchmark. Its three cells show the quality ratings for its inputs, its reference standard, and its scoring."),
        A.charts.qualityLegend({ withNR: true, withNA: true })));
  }

  // ------------------------------------------------------------------
  // Overview
  // ------------------------------------------------------------------
  A.pages.overview = {
    title: "Overview",
    mount(root) {
      A.clear(root);
      const B = A.B;
      const S = A.S;
      const total = B.length;
      const high3 = B.filter((b) => b.flags.high_all3).length;
      const anyPoor = B.filter((b) => b.flags.any_poor).length;
      const nrOnly = B.filter((b) => b.flags.any_poor && !A.DIMS.some((d) => b.q[d.key].r === "Poor")).length;
      const reused = B.filter((b) => b.n_studies > 1).length;
      const judged = B.filter((b) => b.flags.llm_judge);
      const judgedCompared = judged.filter((b) => b.judge_compared === "Yes").length;
      const llmgen = B.filter((b) => b.material.includes("LLM-generated material")).length;
      const pub = B.filter((b) => b.availability.includes("Publicly released")).length;
      const lived = B.filter((b) => b.flags.lived_experience).length;
      const purposes = purposeOrder();

      // ---- Hero ----
      root.appendChild(
        h("section", { class: "ov-hero" },
          h("div", { class: "wrap" },
            h("h1", { class: "ov-title", tabindex: "-1" }, "Benchmarks for evaluating large language models in mental health"),
            h("p", { class: "ov-lede" },
              "An interactive companion to a systematic review of " + n(S.length) + " studies and the " + n(total) +
              " benchmarks they used to test generative AI on mental health tasks. Every benchmark is appraised on the quality of its inputs, its reference standard, and its scoring."),
            h("div", { class: "ov-cta" },
              h("a", { class: "btn btn-primary btn-lg", href: "#/benchmarks" }, "Browse the benchmarks"),
              h("a", { class: "btn btn-secondary btn-lg", href: "#/studies" }, "Browse the studies")))));

      // ---- Field of signatures ----
      const lenses = [
        { key: "", label: "All benchmarks", test: null, note: n(total) + " benchmarks across " + purposes.length + " evaluation purposes. Darker cells mean higher ratings.", href: "#/benchmarks" },
        { key: "high3", label: "High on all three", test: (b) => b.flags.high_all3, note: n(high3) + " of " + n(total) + " benchmarks (" + share(high3, total) + ") were rated high for inputs, reference standard, and scoring.", href: "#/benchmarks?preset=high3" },
        { key: "anypoor", label: "Poor on at least one", test: (b) => b.flags.any_poor, note: n(anyPoor) + " benchmarks (" + share(anyPoor, total) + ") were rated poor on at least one of the three" + (nrOnly ? ", counting the " + n(nrOnly) + " whose reference standard was not reported, as the review does." : "."), href: "#/benchmarks?preset=anypoor" },
        { key: "reused", label: "Used in 2 or more studies", test: (b) => b.n_studies > 1, note: n(reused) + " benchmarks (" + share(reused, total) + ") were used in more than one study. The other " + n(total - reused) + " appeared once.", href: A.buildHash("benchmarks", { reuse: A.ORDER.reuse.slice(1) }) },
        { key: "judge", label: "Scored by an LLM judge", test: (b) => b.flags.llm_judge, note: n(judged.length) + " benchmarks (" + share(judged.length, total) + ") were scored by an LLM judge. For " + n(judgedCompared) + " of them, a study compared the judge with human raters.", href: A.buildHash("benchmarks", { judge: ["Scored by an LLM judge"] }) },
        { key: "llmgen", label: "Includes LLM-generated items", test: (b) => b.material.includes("LLM-generated material"), note: n(llmgen) + " benchmarks (" + share(llmgen, total) + ") include material generated by an LLM.", href: A.buildHash("benchmarks", { material: ["LLM-generated material"] }) },
        { key: "public", label: "Items publicly released", test: (b) => b.availability.includes("Publicly released"), note: n(pub) + " benchmarks (" + share(pub, total) + ") have publicly released items.", href: A.buildHash("benchmarks", { availability: ["Publicly released"] }) },
        { key: "lived", label: "Lived experience involved", test: (b) => b.flags.lived_experience, note: n(lived) + " benchmarks (" + share(lived, total) + ") report involving people with lived experience of mental health conditions.", href: A.buildHash("benchmarks", { lived: ["Involvement reported"] }) },
      ];
      const note = h("p", { class: "lens-note", "aria-live": "polite" });
      const fieldEl = h("div", { class: "ov-field" });
      const lensBar = h("div", { class: "lenses", role: "group", "aria-label": "Highlight benchmarks" });
      const groups = purposes.map((p) => ({
        key: p,
        label: p,
        items: B.filter((b) => b.purpose === p).sort((a, b) =>
          A.Q_RANK[a.q.input.r] - A.Q_RANK[b.q.input.r] || A.Q_RANK[a.q.ref.r] - A.Q_RANK[b.q.ref.r] || A.Q_RANK[a.q.scoring.r] - A.Q_RANK[b.q.scoring.r] || b.n_studies - a.n_studies || a.name.localeCompare(b.name)),
      }));
      let api;
      const setLens = (L) => {
        for (const btn of lensBar.children) btn.setAttribute("aria-pressed", btn.dataset.k === L.key ? "true" : "false");
        api.setLens(L.test);
        A.clear(note);
        note.appendChild(document.createTextNode(L.note + " "));
        note.appendChild(h("a", { href: L.href }, L.key ? "List them in the explorer" : "Open the full list"));
      };
      for (const L of lenses) {
        lensBar.appendChild(h("button", { class: "lens", type: "button", "aria-pressed": "false", dataset: { k: L.key }, onclick: () => setLens(L) },
          L.label, L.test ? h("span", { class: "lens-n" }, n(B.filter(L.test).length)) : null));
      }
      root.appendChild(
        h("section", { class: "ov-field-sec", "aria-labelledby": "ov-field-h" },
          h("div", { class: "wrap" },
            h("div", { class: "ov-field-head" },
              h("h2", { class: "ov-h2", id: "ov-field-h" }, "Every benchmark in the review"),
              sigKey()),
            lensBar,
            note,
            fieldEl,
            h("p", { class: "ov-foot" }, "Within each purpose, benchmarks are ordered by input rating, then reference standard, then scoring. Select any mark to open its record; use the arrow keys to move between marks."))));
      api = A.charts.field(fieldEl, {
        groups,
        label: "All " + total + " benchmarks, grouped by evaluation purpose",
        animate: true,
        onOpen: (b) => A.openRecord("b:" + b.id),
      });
      setLens(lenses[0]);

      // ---- Reuse ----
      const reuseCounts = A.tally(B, (b) => b.reuse_bin);
      const once = reuseCounts.get("1 study") || 0;
      const fivePlus = B.filter((b) => b.n_studies >= 5).length;
      const reuseCols = h("div", { class: "chart-body" });
      const topBars = h("div", { class: "chart-body" });
      root.appendChild(
        h("section", { class: "ov-sec", "aria-labelledby": "ov-reuse-h" },
          h("div", { class: "wrap" },
            h("h2", { class: "ov-h2", id: "ov-reuse-h" }, "How often benchmarks were reused"),
            h("p", { class: "ov-p" }, n(once) + " of " + n(total) + " benchmarks (" + share(once, total) + ") appeared in only one study, and " + n(fivePlus) + " were used in five or more. Reuse is what lets results be compared across models and studies."),
            h("div", { class: "ov-split ov-reuse" },
              h("div", { class: "ov-col" }, h("h3", { class: "ov-h3" }, "Benchmarks by number of studies using them"), reuseCols),
              h("div", { class: "ov-col" }, h("h3", { class: "ov-h3" }, "The most used named benchmarks"), topBars)))));
      const short = { "1 study": "1", "2 studies": "2", "3 studies": "3", "4 or 5 studies": "4–5", "6 to 9 studies": "6–9", "10 or more studies": "10+" };
      A.charts.columns(reuseCols, {
        cols: A.ORDER.reuse.filter((k) => reuseCounts.get(k)).map((k) => ({
          key: k,
          label: short[k],
          count: reuseCounts.get(k),
          sr: "benchmarks (" + k + ")",
          tip: "<strong>" + esc(k) + "</strong><br>" + n(reuseCounts.get(k)) + " benchmarks (" + share(reuseCounts.get(k), total) + ")" + '<span class="tip-hint">Select to list them</span>',
        })),
        onToggle: (k) => A.go(A.buildHash("benchmarks", { reuse: [k] })),
        opener: true,
      });
      reuseCols.appendChild(h("p", { class: "chart-foot" }, "Number of studies using the benchmark"));
      const named = B.filter((b) => b.named).sort((a, b) => b.n_studies - a.n_studies || a.name.localeCompare(b.name));
      let top = named.slice(0, 20);
      let tieNote = null;
      if (named.length > 20 && named[20].n_studies === named[19].n_studies) {
        const tieCount = named[19].n_studies;
        top = named.filter((b) => b.n_studies > tieCount);
        const tied = named.filter((b) => b.n_studies === tieCount).length;
        tieNote = [tied, tieCount];
      }
      A.charts.bars(topBars, {
        rows: top.map((b) => ({ value: b.id, label: b.name, count: b.n_studies })),
        unit: "studies",
        showPct: false,
        inline: true,
        mode: "open",
        onToggle: (id) => A.openRecord("b:" + id),
      });
      if (tieNote) {
        topBars.appendChild(h("p", { class: "chart-foot" }, "Another " + tieNote[0] + " named benchmarks were used in " + tieNote[1] + " studies each. ",
          h("a", { href: A.buildHash("benchmarks", { reuse: [tieNote[1] + " studies"], named: ["Named benchmark"] }) }, "List them")));
      }

      // ---- Gap map ----
      const condCounts = A.tally(B, (b) => b.conditions);
      const condsAll = Array.from(condCounts.keys()).sort((a, b) => condCounts.get(b) - condCounts.get(a) || a.localeCompare(b));
      const conds = A.topWithTies(condsAll, (c) => condCounts.get(c), 12);
      const pair = new Map();
      for (const b of B) for (const c of b.conditions) pair.set(b.purpose + "|" + c, (pair.get(b.purpose + "|" + c) || 0) + 1);
      let best = null;
      for (const [k, v] of pair) if (!best || v > best[1]) best = [k, v];
      const [bp, bc] = best ? best[0].split("|") : ["", ""];
      const gapEl = h("div", { class: "ov-gap" });
      root.appendChild(
        h("section", { class: "ov-sec ov-band", "aria-labelledby": "ov-gap-h" },
          h("div", { class: "wrap" },
            h("h2", { class: "ov-h2", id: "ov-gap-h" }, "Where the benchmarks concentrate"),
            h("p", { class: "ov-p" }, "Benchmarks by evaluation purpose and the conditions their inputs address. The largest cell is " + bp.toLowerCase() + " benchmarks on " + bc.toLowerCase() + " (" + n(best ? best[1] : 0) + "). Empty cells are gaps where no benchmark in the review applied."),
            gapEl,
            h("p", { class: "ov-foot" }, "Circle area is proportional to the number of benchmarks. A benchmark covering several conditions appears in each column. Showing the " + conds.length + " most common of " + condsAll.length + " conditions; ",
              h("a", { href: "#/benchmarks?view=map" }, "open the map in the explorer"), " to change the rows and columns."))));
      A.charts.gapmap(gapEl, {
        rows: purposes.map((p) => ({ key: p, label: p, total: B.filter((b) => b.purpose === p).length })),
        cols: conds.map((c) => ({ key: c, label: c })),
        cell: (r, c) => pair.get(r + "|" + c) || 0,
        unit: "benchmarks",
        label: "Benchmarks by evaluation purpose and condition",
        corner: "Purpose by condition",
        maxD: 44,
        onCell: (r, c) => A.go(A.buildHash("benchmarks", { purpose: [r], condition: [c] })),
      });

      // ---- Trends ----
      const years = Array.from(new Set(S.map((s) => s.year))).sort();
      const byYear = (pred) => years.map((y) => {
        const set = S.filter((s) => s.year === y);
        const k = set.filter(pred).length;
        return { y, k, d: set.length, p: A.pct(k, set.length) };
      });
      const usesLLMGen = (s) => s.benchmarks.some((id) => A.bById.get(id).material.includes("LLM-generated material"));
      const series = [
        { key: "judge", title: "LLM judges", note: "Share of studies that scored outputs with an LLM", data: byYear((s) => s.llm_judge), href: (y) => A.buildHash("studies", { year: [String(y)], judge: ["Used an LLM judge"] }) },
        { key: "gen", title: "LLM-generated items", note: "Share of studies using a benchmark that includes them", data: byYear(usesLLMGen), href: (y) => A.buildHash("studies", { year: [String(y)], bmaterial: ["LLM-generated material"] }) },
        { key: "var", title: "Run-to-run variability", note: "Share of studies that repeated runs and reported the variation", data: byYear((s) => s.variability === "Variability across repeated runs reported"), href: (y) => A.buildHash("studies", { year: [String(y)], variability: ["Variability across repeated runs reported"] }) },
      ];
      const maxShare = Math.max(10, ...series.flatMap((s) => s.data.map((d) => d.p)));
      const scaleMax = Math.ceil(maxShare / 10) * 10;
      const yearCounts = years.map((y) => ({ y, d: S.filter((s) => s.year === y).length }));
      const trends = h("div", { class: "ov-trends" });
      const countCol = h("div", { class: "trend" }, h("h3", { class: "ov-h3" }, "Studies per year"), h("p", { class: "trend-note" }, "Number of included studies"));
      const countBody = h("div", { class: "chart-body" });
      countCol.appendChild(countBody);
      trends.appendChild(countCol);
      A.charts.columns(countBody, {
        cols: yearCounts.map((c) => ({
          key: String(c.y), label: String(c.y), count: c.d, partial: c.y === 2026,
          sr: "studies",
          tip: "<strong>" + c.y + "</strong><br>" + c.d + " studies" + (c.y === 2026 ? " (through April 26)" : "") + '<span class="tip-hint">Select to list them</span>',
        })),
        onToggle: (y) => A.go(A.buildHash("studies", { year: [y] })),
        opener: true,
      });
      for (const s of series) {
        const col = h("div", { class: "trend" }, h("h3", { class: "ov-h3" }, s.title), h("p", { class: "trend-note" }, s.note));
        const body = h("div", { class: "chart-body" });
        col.appendChild(body);
        trends.appendChild(col);
        A.charts.columns(body, {
          percent: true,
          max: scaleMax,
          cols: s.data.map((d) => ({
            key: String(d.y), label: String(d.y), value: d.p, partial: d.y === 2026,
            sr: "(" + d.k + " of " + d.d + " studies)",
            tip: "<strong>" + d.y + "</strong><br>" + d.k + " of " + d.d + " studies (" + d.p + "%)",
          })),
          onToggle: (y) => A.go(s.href(Number(y))),
          opener: true,
        });
      }
      const first = series[0].data[0];
      const last = series[0].data[series[0].data.length - 1];
      root.appendChild(
        h("section", { class: "ov-sec", "aria-labelledby": "ov-trend-h" },
          h("div", { class: "wrap" },
            h("h2", { class: "ov-h2", id: "ov-trend-h" }, "How the studies changed, " + years[0] + " to " + years[years.length - 1]),
            h("p", { class: "ov-p" }, "Every included study appeared in " + years[0] + " or later, and " + n(S.filter((s) => s.year >= 2025).length) + " (" + share(S.filter((s) => s.year >= 2025).length, S.length) + ") in 2025 or 2026. LLM judges went from " + first.k + " of " + first.d + " studies in " + first.y + " (" + first.p + "%) to " + last.k + " of " + last.d + " in " + last.y + " (" + last.p + "%)."),
            trends,
            h("p", { class: "ov-foot" }, "2026 includes studies published through " + A.review.searchEnd + " and is shown lighter. The three share charts use the same scale. Select a column to list those studies."))));

      // ---- Doors ----
      root.appendChild(
        h("section", { class: "ov-sec ov-doors-sec", "aria-label": "Explore the data" },
          h("div", { class: "wrap" }, h("div", { class: "ov-doors" },
            h("a", { class: "ov-door", href: "#/benchmarks" },
              h("span", { class: "ov-door-t" }, "Browse the " + n(total) + " benchmarks"),
              h("span", { class: "ov-door-d" }, "Filter by purpose, condition, inputs, reference standard, scoring, and quality. Open any benchmark to see the studies that used it.")),
            h("a", { class: "ov-door", href: "#/studies" },
              h("span", { class: "ov-door-t" }, "Browse the " + n(S.length) + " studies"),
              h("span", { class: "ov-door-d" }, "Filter by year, publication type, models evaluated, and the benchmarks used, with a link to each paper."))))));
    },
    update() {},
  };

  // ------------------------------------------------------------------
  // Methods
  // ------------------------------------------------------------------
  A.pages.methods = {
    title: "Methods",
    mount(root, route) {
      A.clear(root);
      const R = A.review;
      const B = A.B;
      const S = A.S;
      const preprints = S.filter((s) => s.source_type === "Preprint").length;
      const verifiedLinks = S.filter((s) => s.link && s.link.verified).length;
      const manualLinks = S.filter((s) => s.link && s.link.manual).length;
      const sections = [
        ["about", "About the review"],
        ["benchmark", "What counts as a benchmark"],
        ["search", "How studies were found"],
        ["abstraction", "What was recorded"],
        ["quality", "How quality was rated"],
        ["multi", "Benchmarks used in several studies"],
        ["links", "Paper links"],
        ["fields", "Field definitions"],
        ["limits", "Limitations"],
        ["version", "Data version"],
      ];
      const toc = h("nav", { class: "doc-toc", "aria-label": "On this page" },
        h("p", { class: "doc-toc-h" }, "On this page"),
        h("ol", null, sections.map(([id, t]) => h("li", null, h("a", { href: "#/methods/" + id, "data-target": id }, t)))));
      toc.addEventListener("click", (e) => {
        const a = e.target.closest("a[data-target]");
        if (!a) return;
        e.preventDefault();
        history.replaceState(null, "", a.getAttribute("href"));
        scrollToId(a.dataset.target);
      });

      const P = (...kids) => h("p", null, kids);
      const H2 = (id, t) => h("h2", { id: id, tabindex: "-1" }, t);
      const rubric = h("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": "Quality rubric table" },
        h("table", { class: "doc-table" },
          h("caption", { class: "sr-only" }, "Quality rubric"),
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "Dimension"), h("th", { scope: "col" }, "Rated on"), h("th", { scope: "col" }, "High requires"), h("th", { scope: "col" }, "Poor reflects"))),
          h("tbody", null,
            h("tr", null, h("th", { scope: "row" }, "Inputs"),
              h("td", null, "Their source, independent validation, and the expertise of the people who created or annotated them."),
              h("td", null, "The strongest option on every criterion."),
              h("td", null, "A disqualifying weakness, such as LLM-generated items with no reported expert verification, or labels inferred from forum membership or self-report rather than clinical assessment.")),
            h("tr", null, h("th", { scope: "row" }, "Reference standard"),
              h("td", null, "Its basis in a validated instrument, recorded outcome, or established framework; who produced and verified it; and its fit with the construct being measured."),
              h("td", null, "The strongest option on every criterion, for example a clinician-produced standard anchored to a validated instrument."),
              h("td", null, "Proxy labels, such as subreddit membership, or labelers whose qualifications were not described.")),
            h("tr", null, h("th", { scope: "row" }, "Scoring"),
              h("td", null, "Fit between metric and task, transparency, and validation of the human, LLM, or automated judgment."),
              h("td", null, "The strongest option on every criterion, for example a judge validated against expert raters."),
              h("td", null, "Text similarity metrics, or LLM judges and classifiers not validated against human judgment.")))));

      const gloss = (rows) => h("dl", { class: "gloss" }, rows.map(([k, v]) => h("div", { class: "gloss-row" }, h("dt", null, k), h("dd", null, v))));

      const prose = h("div", { class: "prose" },
        H2("about", "About the review"),
        P("This atlas presents the full data from a systematic review of benchmarks used to evaluate generative large language models (LLMs) in mental health. The review characterizes the benchmarks and rates the quality of their inputs, reference standards, and scoring. It does not compare the performance of models, because the benchmarks differ too widely in tasks, inputs, and metrics."),
        P("The review followed the PRISMA reporting guideline. The Harvard Pilgrim Health Care Institute institutional review board deemed it exempt."),

        H2("benchmark", "What counts as a benchmark"),
        P("A benchmark is a structured test of an LLM with four parts: a fixed set of inputs (prompts, questions, or tasks), a reference standard or other structured basis for judgment, a relevant evaluation domain, and a replicable scoring procedure. A study contributed more than one benchmark when it used more than one distinct set of inputs."),
        P("Benchmark names were harmonized so that each benchmark is counted once. Unnamed item sets assembled by study authors count as benchmarks and carry a descriptive label in the form “material: scope (first author year).” Each benchmark was assigned one evaluation purpose based on its evaluation constructs, its input format, and the task given to the model."),

        H2("search", "How studies were found"),
        P(R.databases + " were searched for reports published from " + R.searchStart + ", through " + R.searchEnd + ", supplemented by screening reference lists. The search combined terms for generative AI, LLMs, and conversational agents; mental health conditions, distress, well-being, counseling and psychotherapy, emotional support, and suicide, self-harm, or crisis; and benchmarking, evaluation, and performance assessment."),
        P("Eligible reports, peer reviewed or gray literature in English, evaluated a generative LLM in a mental health application, including benchmark development papers without model results, and assessed at least one clinically relevant domain such as diagnostic accuracy, psychiatric knowledge, safety, empathy, or equity. General medical benchmarks were eligible when mental health results were reported separately, and only the mental health portion was abstracted. Reviews, nongenerative models, and evaluations limited to technical performance, language quality, or user satisfaction were excluded."),
        P("Of " + n(R.records) + " deduplicated records, " + n(R.fullText) + " full-text reports were assessed and " + n(S.length) + " studies were included, using " + n(B.length) + " unique benchmarks. Two reviewers screened every record independently at each stage, and a third resolved disagreements. An LLM-based tool organized full-text information for eligibility, but every inclusion decision was made by human reviewers."),

        H2("abstraction", "What was recorded"),
        P("A structured form captured study-level and benchmark-level characteristics in four areas: purpose (domain, task, and evaluation constructs), inputs (material type, source, language, population, and availability), reference standard (type, provenance, and any validated instrument), and scoring (method and judge validation)."),
        P("Abstraction used an LLM-assisted workflow (Claude Sonnet 4.6, temperature 0) whose outputs were checked against a predefined schema, controlled vocabularies, and logic rules. Two authors verified every field and rating for an initial 25 reports against the source and the rubric, with a third adjudicating, and the workflow was refined until its output matched the corrected abstraction. For the remaining reports, one author verified every field, rating, and flagged value against the source. In an independent rerun of 10 randomly selected studies (26 benchmarks), agreement on quality ratings was 92% for inputs, 92% for reference standards, and 100% for scoring, with no disagreement larger than one category."),

        H2("quality", "How quality was rated"),
        P("No validated appraisal tool exists for AI benchmarks, so the review used its own rubric. Each benchmark's inputs, reference standard, and scoring were rated poor, adequate, or high. A high rating required the strongest option on every criterion; a poor rating reflected a disqualifying weakness; adequate covers everything in between."),
        rubric,
        P("An LLM judge's validation counted as high when agreement with human raters on the same outputs reached κ ≥ 0.40 for categorical ratings or a correlation of at least 0.50 for continuous ratings, and was capped at adequate when the judge shared a model family with a system it evaluated."),
        P("Two further values appear for the reference standard. ", h("em", null, "No reference standard"), " (shown hatched) means no study compared outputs with a human judgment or ground-truth value. ", h("em", null, "Not reported"), " (shown in grey) means the studies described neither who produced the labels, what they were based on, nor whether they were checked."),
        P("The atlas's quality presets combine the three ratings. ", h("em", null, "High on all three"), " requires a high rating for every dimension. ", h("em", null, "Poor on at least one"), " counts any dimension rated poor, and treats a reference standard rated not reported as poor, as the review's summary statistics do. ", h("em", null, "No poor ratings"), " is everything else, including benchmarks without a reference standard. The atlas does not combine the ratings into a single score."),

        H2("multi", "Benchmarks used in several studies"),
        P("For benchmarks used in more than one study, fixed characteristics and quality ratings take the most common value across the studies. Where any study gave a lower rating, the record notes the lowest. Characteristics that can vary between studies, such as the scoring method or reference standard, list every value any study reported, and the evaluation construct lists every tied value when studies were split evenly."),
        P("Counts in the filters reflect the other filters you have chosen. Within one filter, options combine with OR; across filters, with AND. Because many fields hold several values, a benchmark can count toward several options, so option counts can add up to more than the total."),

        H2("links", "Paper links"),
        P("Links to each study were found by matching its exact title against Crossref, arXiv, and other scholarly indexes, and confirmed by first author and year. Reports from arXiv link to arXiv. Other reports link to their DOI, or to an arXiv version with the same title when no publisher DOI was found." +
          (manualLinks ? " For " + n(manualLinks) + " studies whose titles could not be matched automatically, including reports published only on the web, the authors supplied the link." : "") +
          (S.length - verifiedLinks ? " Where no link could be confirmed, it searches Google Scholar for the exact title instead." : "") +
          " " + n(verifiedLinks) + " of " + n(S.length) + " studies have a confirmed link."),

        H2("fields", "Field definitions"),
        h("h3", null, "Benchmarks"),
        gloss(A.glossary.benchmark),
        h("h3", null, "Studies"),
        gloss(A.glossary.study),

        H2("limits", "Limitations"),
        P("Only English-language reports were included, and the ACL Anthology was not searched because its interface could not support structured searching, so some computational linguistics benchmarks may be missing. " + n(preprints) + " of the studies (" + share(preprints, S.length) + ") are preprints, which may later change. Abstraction and quality rating used an LLM-assisted workflow; despite human verification and high agreement between independent runs, judgment-dependent fields may be less reliable than duplicate human abstraction. Quality ratings describe benchmarks as instruments, not how each study implemented them, and the atlas describes benchmarks, not model performance. Benchmarks released after " + R.searchEnd + ", are not included."),

        H2("version", "Data version"),
        P("Built from ", h("strong", null, A.meta.workbook), A.meta.workbook_modified ? ", last saved " + new Date(A.meta.workbook_modified).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "", ". The atlas was generated on " + new Date(A.meta.built).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) + ". ", h("a", { href: "#/about/downloads" }, "Download the data"), "."));

      root.appendChild(
        h("div", { class: "doc" },
          h("header", { class: "doc-head" },
            h("h1", { class: "doc-title", tabindex: "-1" }, "Methods"),
            h("p", { class: "doc-lede" }, "How the review found, recorded, and appraised the studies and benchmarks shown in this atlas.")),
          h("div", { class: "doc-grid" }, toc, prose)));
      if (route && route.sub && route.sub[0]) setTimeout(() => scrollToId(route.sub[0]), 30);
    },
    update(route) {
      if (route.sub && route.sub[0]) scrollToId(route.sub[0]);
    },
  };

  function scrollToId(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top: y, behavior: A.reducedMotion() ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }
  A.scrollToId = scrollToId;

  // ------------------------------------------------------------------
  // About
  // ------------------------------------------------------------------
  A.pages.about = {
    title: "About",
    mount(root, route) {
      A.clear(root);
      const R = A.review;
      const authorList = h("p", { class: "authors" },
        R.authors.map(([name, aff], i) => [i ? ", " : "", name, h("sup", null, aff.join(","))]));
      const affList = h("ol", { class: "affs" }, R.affiliations.map((a) => h("li", null, a)));
      const citeBox = h("div", { class: "cite" },
        h("p", { class: "cite-text" }, R.citation),
        h("button", { class: "btn btn-secondary", type: "button", onclick: () => A.copy(R.citation, "Citation copied") }, A.iconEl("copy"), "Copy citation"));
      const asOf = A.meta.workbook_modified ? new Date(A.meta.workbook_modified).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null;
      const atlasCite = "Benchmark Atlas: LLM benchmarks in mental health. " + A.absoluteUrl("#/") + (asOf ? ". Data as of " + asOf : "") + ". Accessed " + new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) + ".";
      const files = [
        ["downloads/benchmarks.csv", "Benchmarks (CSV)", "One row per benchmark with every field, the studies that used it, and its quality ratings."],
        ["downloads/studies.csv", "Studies (CSV)", "One row per study with its benchmarks, models, and a link to the paper."],
        ["downloads/atlas-workbook.xlsx", "Original workbook (Excel)", "The supplementary tables exactly as abstracted, with the review's footnotes."],
      ];
      const aboutSecs = [["about", "Why an atlas"], ["authors", "Authors"], ["cite", "How to cite"], ["downloads", "Download the data"], ["corrections", "Corrections"], ["credits", "Credits"]];
      const toc = h("nav", { class: "doc-toc", "aria-label": "On this page" },
        h("p", { class: "doc-toc-h" }, "On this page"),
        h("ol", null, aboutSecs.map(([id, t]) => h("li", null, h("a", { href: "#/about/" + id, "data-target": id }, t)))));
      toc.addEventListener("click", (e) => {
        const a = e.target.closest("a[data-target]");
        if (!a) return;
        e.preventDefault();
        history.replaceState(null, "", a.getAttribute("href"));
        scrollToId(a.dataset.target);
      });
      root.appendChild(
        h("div", { class: "doc" },
          h("header", { class: "doc-head" },
            h("h1", { class: "doc-title", tabindex: "-1" }, "About the atlas"),
            h("p", { class: "doc-lede" }, "Who made it, how to cite it, and where to get the data.")),
          h("div", { class: "doc-grid" },
            toc,
            h("div", { class: "prose" },
              h("h2", { id: "about", tabindex: "-1" }, "Why an atlas"),
              h("p", null, "Systematic reviews usually present their included studies as a table in the article or an appendix. This review includes " + n(A.S.length) + " studies and " + n(A.B.length) + " benchmarks, too many to read that way, so the atlas lets you filter, chart, and cross-reference them instead. Every count and chart is computed from the review's supplementary data; the few facts about the search and the verification process on the Methods page come from the manuscript."),
              h("h2", { id: "authors", tabindex: "-1" }, "Authors"),
              authorList,
              affList,
              h("h2", { id: "cite", tabindex: "-1" }, "How to cite"),
              h("p", null, "Please cite the review:"),
              citeBox,
              h("p", null, "To cite the atlas itself:"),
              h("div", { class: "cite" }, h("p", { class: "cite-text" }, atlasCite),
                h("button", { class: "btn btn-secondary", type: "button", onclick: () => A.copy(atlasCite, "Citation copied") }, A.iconEl("copy"), "Copy citation")),
              h("h2", { id: "downloads", tabindex: "-1" }, "Download the data"),
              h("ul", { class: "files" }, files.map(([href, t, d]) =>
                h("li", null, h("a", { class: "file-link", href, download: "" }, A.iconEl("download"), t), h("span", { class: "file-d" }, d)))),
              h("p", null, "Each explorer also has a ", h("strong", null, "Download CSV"), " button that exports only the rows matching your filters."),
              h("h2", { id: "corrections", tabindex: "-1" }, "Corrections"),
              h("p", null, "Spotted an error, or know of a benchmark the review missed? Email the corresponding author, " + R.contact.name + ", at ", h("a", { href: "mailto:" + R.contact.email }, R.contact.email), "."),
              h("h2", { id: "credits", tabindex: "-1" }, "Credits"),
              h("p", null, "Set in Newsreader by Production Type and Public Sans by the U.S. Web Design System, both under the SIL Open Font License. The atlas uses no tracking or cookies.")))));
      if (route && route.sub && route.sub[0]) setTimeout(() => scrollToId(route.sub[0]), 30);
    },
    update(route) {
      if (route.sub && route.sub[0]) scrollToId(route.sub[0]);
    },
  };
})();
