/* Benchmark Atlas: data model, filter definitions, filter engine, sorting.
   Field definitions here drive the sidebar filters, the detail panels,
   and the field glossary on the Methods page. */
(function () {
  "use strict";
  const A = window.Atlas;
  const D = window.ATLAS_DATA;
  if (!D) return;

  A.meta = D.meta;
  A.B = D.benchmarks;
  A.S = D.studies;
  A.bById = new Map(A.B.map((b) => [b.id, b]));
  A.sById = new Map(A.S.map((s) => [s.id, s]));
  for (const s of A.S) {
    const mat = [];
    for (const id of s.benchmarks) for (const m of A.bById.get(id).material) if (!mat.includes(m)) mat.push(m);
    s.bench_material = mat;
  }

  // Keep the first n values, plus any tied with the nth (no arbitrary cut).
  A.topWithTies = function (vals, countOf, n) {
    if (vals.length <= n) return vals.slice();
    const cutoff = countOf(vals[n - 1]);
    return vals.filter((v, i) => i < n || countOf(v) === cutoff);
  };

  // ------------------------------------------------------------------
  // Vocabularies and display labels
  // ------------------------------------------------------------------
  A.Q_ORDER = ["High", "Adequate", "Poor", "NR", "NA"];
  A.Q_RANK = { High: 0, Adequate: 1, Poor: 2, NR: 3, NA: 4 };
  A.qLabel = function (r, dim) {
    if (r === "NR") return "Not reported";
    if (r === "NA") return dim === "ref" ? "No reference standard" : "Not applicable";
    return r;
  };
  A.qClass = (r) => "q-" + (r || "NA");
  A.DIMS = [
    { key: "input", label: "Inputs", long: "Input quality" },
    { key: "ref", label: "Reference standard", long: "Reference standard quality" },
    { key: "scoring", label: "Scoring", long: "Scoring quality" },
  ];

  const ORDER = {
    reuse: ["1 study", "2 studies", "3 studies", "4 or 5 studies", "6 to 9 studies", "10 or more studies"],
    size: ["Fewer than 100", "100 to 999", "1,000 to 9,999", "10,000 or more", "Not reported"],
    age: ["Children", "Children and adolescents", "Adolescents", "Adolescents and adults", "Young adults", "Adults", "Older adults", "Not stated"],
    conversation: ["Single-turn", "Multi-turn interactive", "Mixed"],
    langScope: ["English only", "English and other languages", "Other languages only", "Not reported"],
    sourceType: ["Peer-reviewed journal", "Conference proceeding", "Preprint"],
    models: ["None", "1 model", "2 or 3 models", "4 or 5 models", "6 to 10 models", "More than 10 models", "Not reported"],
    nbench: ["1 benchmark", "2 benchmarks", "3 to 5 benchmarks", "6 or more benchmarks"],
    variability: ["Variability across repeated runs reported", "Single run, generation settings reported", "Not reported", "Not applicable (no LLM runs reported)"],
    access: ["API", "Chat user interface", "Not reported"],
    agreement: ["Met threshold", "Met threshold on some dimensions", "Below threshold", "Poor agreement shown, no coefficient", "Percent agreement or match rate only", "Qualitative comparison only", "Not compared"],
  };
  A.ORDER = ORDER;

  const sizeNotes = {
    a: "from the benchmark's source documentation",
    b: "from the study that introduced it",
    c: "single study, no modification stated",
    d: "single study scoring a stated subset",
    e: "largest size reported by any study; source size unconfirmed",
  };
  A.sizeNotes = sizeNotes;

  // ------------------------------------------------------------------
  // Benchmark filters
  // ------------------------------------------------------------------
  const yes = (cond, a, b) => [cond ? a : b];

  A.benchmarkGroups = [
    { key: "quality", label: "Quality ratings", open: true },
    { key: "purpose", label: "Purpose and construct", open: true },
    { key: "condition", label: "Condition or focus", open: true },
    { key: "inputs", label: "Inputs", open: false },
    { key: "reference", label: "Reference standard", open: false },
    { key: "scoring", label: "Scoring and LLM judges", open: false },
    { key: "use", label: "Use and provenance", open: false },
  ];

  A.benchmarkPresets = [
    { value: "high3", label: "High on all three", help: "Rated high for inputs, reference standard, and scoring.", test: (b) => b.flags.high_all3 },
    { value: "nopoor", label: "No poor ratings", help: "No dimension rated poor, and the reference standard, if any, was reported. Benchmarks without a reference standard are included.", test: (b) => !b.flags.any_poor },
    { value: "anypoor", label: "Poor on at least one", help: "At least one dimension rated poor, or a reference standard rated not reported, which the review counts as poor.", test: (b) => b.flags.any_poor },
  ];

  A.benchmarkFacets = [
    { key: "qi", group: "quality", label: "Inputs", values: (b) => [b.q.input.r], order: A.Q_ORDER, quality: "input" },
    { key: "qr", group: "quality", label: "Reference standard", values: (b) => [b.q.ref.r], order: A.Q_ORDER, quality: "ref" },
    { key: "qs", group: "quality", label: "Scoring", values: (b) => [b.q.scoring.r], order: A.Q_ORDER, quality: "scoring" },

    { key: "purpose", group: "purpose", label: "Evaluation purpose", values: (b) => [b.purpose] },
    { key: "construct", group: "purpose", label: "Primary evaluation construct", values: (b) => b.constructs, limit: 7 },

    { key: "condition", group: "condition", label: "Condition or focus", values: (b) => b.conditions, limit: 8, search: "Find a condition", hideTitle: true },

    { key: "material", group: "inputs", label: "Type of input material", values: (b) => b.material },
    { key: "format", group: "inputs", label: "Input format", values: (b) => b.input_formats, limit: 6 },
    { key: "source", group: "inputs", label: "Source of input", values: (b) => [b.input_source] },
    { key: "conversation", group: "inputs", label: "Conversation type", values: (b) => [b.conversation], order: ORDER.conversation },
    { key: "langscope", group: "inputs", label: "Languages covered", values: (b) => [b.lang_scope], order: ORDER.langScope },
    { key: "language", group: "inputs", label: "Language", values: (b) => b.languages, limit: 6, search: "Find a language" },
    { key: "population", group: "inputs", label: "Population represented", values: (b) => b.populations, limit: 6 },
    { key: "age", group: "inputs", label: "Age group represented", values: (b) => [b.age_group], order: ORDER.age },
    { key: "size", group: "inputs", label: "Size", values: (b) => [b.size_bin], order: ORDER.size },
    { key: "availability", group: "inputs", label: "Availability of inputs", values: (b) => b.availability },

    { key: "reftype", group: "reference", label: "Reference standard type", values: (b) => b.ref_types },
    { key: "instrumented", group: "reference", label: "Validated instrument", values: (b) => yes(b.flags.validated_instrument, "Anchored to a validated instrument", "No validated instrument") },
    { key: "instrument", group: "reference", label: "Instrument", values: (b) => b.instruments, limit: 6, search: "Find an instrument" },

    { key: "scoring", group: "scoring", label: "Scoring method", values: (b) => b.scoring },
    { key: "judge", group: "scoring", label: "LLM judge", values: (b) => yes(b.flags.llm_judge, "Scored by an LLM judge", "No LLM judge") },
    { key: "judgefamily", group: "scoring", label: "LLM judge model family", values: (b) => b.judge_families },
    { key: "judgecompared", group: "scoring", label: "Judge compared with human raters", values: (b) => (b.judge_compared ? [b.judge_compared === "Yes" ? "Compared" : "Not compared"] : []) },
    { key: "agreement", group: "scoring", label: "Judge-human agreement", values: (b) => (b.judge_agreement ? [b.judge_agreement] : []), order: ORDER.agreement },

    { key: "reuse", group: "use", label: "Studies using the benchmark", values: (b) => [b.reuse_bin], order: ORDER.reuse },
    { key: "year", group: "use", label: "Used in a study from", values: (b) => b.years.map(String), order: "alpha" },
    { key: "named", group: "use", label: "Name", values: (b) => yes(b.named, "Named benchmark", "Unnamed item set") },
    { key: "derived", group: "use", label: "Origin", values: (b) => yes(b.flags.derived, "Derived from another benchmark", "Not derived") },
    { key: "audience", group: "use", label: "Intended audience", values: (b) => b.audiences },
    { key: "lived", group: "use", label: "People with lived experience", values: (b) => yes(b.flags.lived_experience, "Involvement reported", "None reported") },
  ];

  A.benchmarkSearchText = (b) =>
    [
      b.name, b.purpose, b.constructs, b.conditions, b.input_formats, b.languages, b.instruments,
      b.parents.map((p) => p.name), b.sources.map((s) => s.text), b.populations, b.ref_types, b.scoring,
      b.judge_families, b.studies.map((id) => A.sById.get(id).label),
    ].flat().join(" | ");

  // ------------------------------------------------------------------
  // Study filters
  // ------------------------------------------------------------------
  A.studyGroups = [
    { key: "publication", label: "Publication", open: true },
    { key: "design", label: "Study design", open: true },
    { key: "benchmarks", label: "Benchmarks used", open: false },
    { key: "models", label: "Models evaluated", open: false },
    { key: "evaluation", label: "Evaluation and scoring", open: false },
  ];

  A.studyPresets = [];

  A.studyFacets = [
    { key: "year", group: "publication", label: "Year", values: (s) => [String(s.year)], order: "alpha" },
    { key: "sourcetype", group: "publication", label: "Publication type", values: (s) => [s.source_type], order: ORDER.sourceType },
    { key: "venue", group: "publication", label: "Venue", values: (s) => [s.venue], limit: 6, search: "Find a journal or venue" },

    { key: "studytype", group: "design", label: "Study type", values: (s) => [s.study_type] },
    { key: "scope", group: "design", label: "Mental health scope", values: (s) => [s.mh_scope] },
    { key: "modified", group: "design", label: "Benchmark modification", values: (s) => yes(s.modified, "Modified an existing benchmark", "No modification") },
    { key: "nbench", group: "design", label: "Benchmarks used", values: (s) => [s.benchmarks_bin], order: ORDER.nbench },

    { key: "bpurpose", group: "benchmarks", label: "Purpose of benchmarks used", values: (s) => s.bench_purposes },
    { key: "bcondition", group: "benchmarks", label: "Condition or focus of benchmarks used", values: (s) => s.bench_conditions, limit: 8, search: "Find a condition" },
    { key: "bmaterial", group: "benchmarks", label: "Input material of benchmarks used", values: (s) => s.bench_material },

    { key: "family", group: "models", label: "Model family", values: (s) => s.model_families, limit: 8 },
    { key: "nmodels", group: "models", label: "Number of models", values: (s) => [s.models_bin], order: ORDER.models },
    { key: "access", group: "models", label: "Model access", values: (s) => [s.model_access], order: ORDER.access },
    { key: "variability", group: "models", label: "Run-to-run variability", values: (s) => [s.variability], order: ORDER.variability },

    { key: "construct", group: "evaluation", label: "Primary evaluation construct", values: (s) => s.constructs, limit: 7 },
    { key: "judge", group: "evaluation", label: "LLM judge in this study", values: (s) => yes(s.llm_judge, "Used an LLM judge", "No LLM judge") },
    { key: "scoring", group: "evaluation", label: "Scoring methods of benchmarks used", values: (s) => s.scoring },
  ];

  A.studySearchText = (s) =>
    [
      s.title, s.label, s.venue, s.models.map((m) => m.name), s.model_families,
      s.benchmarks.map((id) => A.bById.get(id).name), s.constructs, s.study_type,
    ].flat().join(" | ");

  // ------------------------------------------------------------------
  // Sorting
  // ------------------------------------------------------------------
  const byName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  const byLabel = (a, b) => a.first_author.localeCompare(b.first_author, "en", { sensitivity: "base" }) || a.title.localeCompare(b.title);
  const qcmp = (dim) => (a, b) => A.Q_RANK[a.q[dim].r] - A.Q_RANK[b.q[dim].r];

  // cmp gives the natural ascending order of the sort key, and dir flips
  // it. tie breaks remaining ties and is never flipped.
  const byUse = (a, b) => b.n_studies - a.n_studies || byName(a, b);
  A.benchmarkSorts = {
    used: { label: "Most used", dir: "desc", cmp: (a, b) => a.n_studies - b.n_studies, tie: byName },
    recent: { label: "Most recently used", dir: "desc", cmp: (a, b) => (a.last_year || 0) - (b.last_year || 0), tie: byUse },
    first: { label: "Newest first use", dir: "desc", cmp: (a, b) => (a.first_year || 0) - (b.first_year || 0), tie: byUse },
    name: { label: "Name", dir: "asc", cmp: byName, tie: () => 0 },
    purpose: { label: "Purpose", dir: "asc", cmp: (a, b) => a.purpose.localeCompare(b.purpose), tie: byUse },
    qi: { label: "Input quality", dir: "asc", cmp: qcmp("input"), tie: byUse },
    qr: { label: "Reference standard quality", dir: "asc", cmp: qcmp("ref"), tie: byUse },
    qs: { label: "Scoring quality", dir: "asc", cmp: qcmp("scoring"), tie: byUse },
  };
  A.benchmarkSortMenu = ["used", "recent", "first", "name", "qi", "qr", "qs"];

  const byRecent = (a, b) => b.year - a.year || byLabel(a, b);
  A.studySorts = {
    year: { label: "Newest first", dir: "desc", cmp: (a, b) => a.year - b.year, tie: byLabel },
    author: { label: "First author", dir: "asc", cmp: (a, b) => a.first_author.localeCompare(b.first_author, "en", { sensitivity: "base" }), tie: byRecent },
    title: { label: "Title", dir: "asc", cmp: (a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }), tie: () => 0 },
    nbench: { label: "Most benchmarks", dir: "desc", cmp: (a, b) => a.benchmarks.length - b.benchmarks.length, tie: byRecent },
    nmodels: { label: "Most models", dir: "desc", cmp: (a, b) => (a.n_models || 0) - (b.n_models || 0), tie: byRecent },
    type: { label: "Study type", dir: "asc", cmp: (a, b) => a.study_type.localeCompare(b.study_type), tie: byRecent },
    sourcetype: { label: "Publication type", dir: "asc", cmp: (a, b) => a.source_type.localeCompare(b.source_type), tie: byRecent },
  };
  A.studySortMenu = ["year", "author", "title", "nbench", "nmodels"];

  A.sortItems = function (items, sorts, key, dir) {
    const s = sorts[key];
    if (!s) return items.slice();
    const sign = (dir || s.dir) === "desc" ? -1 : 1;
    const tie = s.tie || (() => 0);
    return items.slice().sort((a, b) => sign * s.cmp(a, b) || tie(a, b));
  };

  // ------------------------------------------------------------------
  // Filter engine with disjunctive facet counts
  // (OR within a filter, AND across filters; each filter's counts
  //  reflect every other active filter.)
  // ------------------------------------------------------------------
  A.Engine = function (items, facets, presets, searchText) {
    this.items = items;
    this.facets = facets;
    this.presets = presets || [];
    this.fv = items.map((it) => {
      const o = {};
      for (const f of facets) {
        const vals = (f.values(it) || []).filter((v) => v != null && v !== "").map(String);
        o[f.key] = Array.from(new Set(vals));
      }
      return o;
    });
    this.blob = items.map((it) => A.norm(searchText(it)));
    this.global = {};
    for (const f of facets) {
      const m = new Map();
      for (const o of this.fv) for (const v of o[f.key]) m.set(v, (m.get(v) || 0) + 1);
      this.global[f.key] = m;
    }
  };

  A.Engine.prototype.optionsFor = function (f) {
    const m = this.global[f.key];
    let vals = Array.from(m.keys());
    if (Array.isArray(f.order)) {
      const known = f.order.filter((v) => m.has(v));
      const rest = vals.filter((v) => !f.order.includes(v)).sort((a, b) => m.get(b) - m.get(a));
      vals = known.concat(rest);
    } else if (f.order === "alpha") {
      vals.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    } else {
      vals.sort((a, b) => m.get(b) - m.get(a) || a.localeCompare(b));
    }
    return vals;
  };

  A.Engine.prototype.run = function (sel, q, preset) {
    const active = this.facets.filter((f) => sel[f.key] && sel[f.key].size);
    const tokens = A.norm(q || "").split(/\s+/).filter(Boolean);
    const p = preset ? this.presets.find((x) => x.value === preset) : null;
    const counts = {};
    for (const f of this.facets) counts[f.key] = new Map();
    const presetCounts = new Map();
    let presetBase = 0;
    const results = [];
    for (let i = 0; i < this.items.length; i++) {
      if (tokens.length) {
        const blob = this.blob[i];
        let ok = true;
        for (const t of tokens) if (blob.indexOf(t) < 0) { ok = false; break; }
        if (!ok) continue;
      }
      const it = this.items[i];
      const fv = this.fv[i];
      let fails = 0;
      let failKey = null;
      for (const f of active) {
        const s = sel[f.key];
        const vals = fv[f.key];
        let hit = false;
        for (const v of vals) if (s.has(v)) { hit = true; break; }
        if (!hit) {
          fails++;
          failKey = f.key;
          if (fails > 1) break;
        }
      }
      if (fails === 0) {
        presetBase++;
        for (const x of this.presets) if (x.test(it)) presetCounts.set(x.value, (presetCounts.get(x.value) || 0) + 1);
      }
      if (p && !p.test(it)) continue;
      if (fails === 0) {
        results.push(it);
        for (const f of this.facets) {
          const c = counts[f.key];
          for (const v of fv[f.key]) c.set(v, (c.get(v) || 0) + 1);
        }
      } else if (fails === 1) {
        const c = counts[failKey];
        for (const v of fv[failKey]) c.set(v, (c.get(v) || 0) + 1);
      }
    }
    return { results, counts, presetCounts, presetBase };
  };

  // Count values of an arbitrary accessor over a set of items.
  A.tally = function (items, accessor) {
    const m = new Map();
    for (const it of items) {
      const vals = accessor(it);
      for (const v of new Set(Array.isArray(vals) ? vals : [vals])) {
        if (v == null || v === "") continue;
        m.set(v, (m.get(v) || 0) + 1);
      }
    }
    return m;
  };

  // ------------------------------------------------------------------
  // Field glossary (Methods page) and detail labels
  // ------------------------------------------------------------------
  A.glossary = {
    benchmark: [
      ["Benchmark", "The benchmark's published name. Unnamed item sets assembled by study authors were given a descriptive label in the form \"material: scope (first author year)\"."],
      ["Evaluation purpose", "The single purpose each benchmark was assigned, based on its evaluation constructs, input format, and the task given to the model."],
      ["Primary evaluation construct", "What the benchmark measures, such as diagnostic accuracy or empathy. When studies were evenly split, every tied construct is listed."],
      ["Condition or focus", "The mental health conditions or areas of focus the inputs address."],
      ["Studies using the benchmark", "The included studies that used the benchmark, and the years they were published."],
      ["Parent benchmarks", "Existing benchmarks this one was built from, for example by subsetting, translation, or reannotation."],
      ["Input format", "The form the benchmark's items take, such as social media posts, clinical vignettes, or multiple-choice questions."],
      ["Type of input material", "Whether items are real-world data, written by people for the benchmark, or generated by an LLM."],
      ["Source of input", "Whether items were assembled for the benchmark, taken from an existing dataset, instrument, or exam, or both."],
      ["Conversation type", "Whether the model answers single prompts or takes part in multi-turn conversations."],
      ["Languages", "The languages of the benchmark's items."],
      ["Population represented", "Whom the inputs depict or come from."],
      ["Age group represented", "The age group the inputs represent, where stated."],
      ["Intended audience", "Whom the benchmark's results are meant to inform."],
      ["Size", "The number of items. A footnote letter gives the source of the figure: (a) the benchmark's source documentation, (b) the study that introduced it, (c) a single study with no modification stated, (d) a single study scoring a stated subset, (e) the largest size reported by any study, with the source size unconfirmed."],
      ["Availability of inputs", "Whether the items can be obtained: publicly released, available on request, fully or partially specified in the paper, or not available."],
      ["Reference standard type", "What model outputs are compared against, such as expert or clinician ratings, an answer key, or proxy labels like subreddit membership."],
      ["Validated instrument", "Validated clinical instruments the reference standard is anchored to, such as the PHQ-9 or C-SSRS."],
      ["Scoring method", "How outputs are scored: accuracy metrics, human ratings, LLM ratings, text similarity metrics, or other statistics."],
      ["LLM judge model family", "The model family of any LLM used to score outputs."],
      ["Judge compared with human raters", "Whether any study reported agreement, correlation, or a match rate between the LLM judge and human raters on the same outputs."],
      ["Judge-human agreement", "What that comparison showed. Met threshold means κ ≥ 0.40, or r, ρ, or ICC ≥ 0.50, on most dimensions. The reported statistic gives the figures as published."],
      ["People with lived experience", "Whether people with lived experience of mental health conditions helped create the inputs or the scoring, and whether they co-designed or were consulted."],
      ["Quality ratings", "Inputs, reference standard, and scoring were each rated high, adequate, or poor. For benchmarks used in several studies, the rating shown is the most common one, with the lowest rating any study received noted where it differs."],
      ["Source documentation", "Where the benchmark is documented: its own paper or repository (cited source), the included study that introduced it, or the study that describes an unnamed item set."],
    ],
    study: [
      ["First author and year", "As given in the report."],
      ["Source and publication type", "The journal, conference, or preprint server, and whether the report is a peer-reviewed article, a conference proceeding, or a preprint."],
      ["Study type", "Whether the study developed a benchmark, evaluated existing models, or developed a model."],
      ["Mental health scope", "Whether the study was entirely about mental health, or a broader evaluation whose mental health results were reported separately. Only the mental health portion was abstracted."],
      ["Benchmarks used", "Every benchmark the study used, linked to its record."],
      ["Benchmark modification", "Whether the study modified an existing benchmark, for example by subsetting, translation, or reannotation."],
      ["Models evaluated", "Model names as given in the report; they were not standardized. In studies that developed or fine-tuned their own system, existing models it was compared with are marked as comparators."],
      ["Model families evaluated", "Every family represented among the evaluated models, including comparators."],
      ["Model access", "How the models were run: through an API, a chat interface, or not reported."],
      ["Run-to-run variability", "Whether the study repeated the same test and reported variation in model outputs, stated only the generation settings that control variation (for example temperature), or reported neither."],
      ["Primary evaluation constructs", "The constructs the study's benchmarks measured, listed across all benchmarks the study used."],
      ["Scoring methods of benchmarks used", "The scoring methods recorded for the benchmarks the study used. Because benchmark-level methods are pooled across every study that used a benchmark, this can include methods this particular study did not apply. Use \u201cLLM judge used\u201d for whether this study scored outputs with an LLM."],
      ["LLM judge used", "Whether any outputs in this study were scored by an LLM."],
    ],
  };
})();
