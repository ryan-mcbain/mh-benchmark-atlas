/* Benchmark Atlas: the detail drawer for a benchmark or a study.
   Opened by the "show" URL parameter (show=b:<id> or show=s:<id>), so every
   record has its own shareable link and the browser Back button works. */
(function () {
  "use strict";
  const A = window.Atlas;
  const h = A.h;

  let root, panel, body, backBtn, openerEl;
  let current = null;
  let trail = [];

  function ensure() {
    if (root) return;
    root = document.getElementById("drawer-root");
    const scrim = h("div", { class: "dr-scrim", onclick: () => A.drawer.close() });
    backBtn = h("button", { class: "btn btn-quiet dr-back", type: "button", hidden: true, onclick: () => history.back() }, A.iconEl("back"), h("span", { class: "dr-back-label" }, "Back"));
    const copyBtn = h("button", { class: "btn btn-quiet", type: "button", onclick: () => A.copy(A.absoluteUrl(permalink(current)), "Link to this record copied") }, A.iconEl("link"), "Copy link");
    const closeBtn = h("button", { class: "icon-btn dr-close", type: "button", "aria-label": "Close details", onclick: () => A.drawer.close() }, A.iconEl("close"));
    body = h("div", { class: "dr-body" });
    panel = h("div", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-labelledby": "dr-title", tabindex: "-1" },
      h("div", { class: "dr-bar" }, backBtn, h("div", { class: "dr-bar-right" }, copyBtn, closeBtn)),
      body);
    root.appendChild(scrim);
    root.appendChild(panel);
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        A.drawer.close();
      } else A.trapFocus(panel, e);
    });
  }

  function permalink(show) {
    if (!show) return location.hash;
    const page = show[0] === "b" ? "benchmarks" : "studies";
    return A.buildHash(page, { show });
  }

  // Link to the current page with a different record open.
  function openHref(show) {
    const r = A.parseHash();
    const params = Object.assign({}, r.params, { show: [show] });
    const page = ["benchmarks", "studies", "overview"].includes(r.page) ? r.page : show[0] === "b" ? "benchmarks" : "studies";
    return A.buildHash(page, params);
  }
  A.openHref = openHref;

  function filterHref(page, key, value) {
    return A.buildHash(page, { [key]: [value] });
  }

  function recordName(show) {
    const id = show.slice(2);
    return show[0] === "b" ? A.bById.get(id).name : A.sById.get(id).label;
  }

  function withoutShow() {
    const r = A.parseHash();
    const params = Object.assign({}, r.params);
    delete params.show;
    return A.buildHash(r.page, params);
  }

  A.drawer = {
    sync(route) {
      ensure();
      const show = A.param(route.params, "show");
      if (!show) {
        if (current) hide();
        return;
      }
      const valid = (show[0] === "b" && A.bById.has(show.slice(2))) || (show[0] === "s" && A.sById.has(show.slice(2)));
      if (!valid) {
        A.toast("That record was not found. It may have been renamed in a data update.");
        A.go(withoutShow(), true);
        return;
      }
      // The history entry knows the trail of records that led here.
      const st = history.state || {};
      trail = st.trail && st.trail[st.trail.length - 1] === show ? st.trail.slice() : [show];
      if (!current) openerEl = document.activeElement;
      if (show === current) {
        updateBack();
        return;
      }
      current = show;
      render(show);
    },
    close() {
      if (!current) return;
      const st = history.state || {};
      if (st.dd > 0 && st.root === "page") history.go(-st.dd);
      else A.go(withoutShow(), true);
    },
    isOpen: () => !!current,
    current: () => current,
  };

  function hide() {
    current = null;
    trail = [];
    document.body.classList.remove("dr-open");
    A.tip.hide();
    if (A.pageTitle) document.title = A.pageTitle;
    setTimeout(() => {
      if (!current) A.clear(body);
    }, 300);
    if (openerEl && openerEl !== document.body && document.contains(openerEl)) openerEl.focus({ preventScroll: true });
    else {
      const target = document.querySelector("#main h1") || document.getElementById("main");
      if (target) {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
    }
    openerEl = null;
  }

  function updateBack() {
    const prev = trail.length > 1 ? trail[trail.length - 2] : null;
    backBtn.hidden = !prev;
    if (prev) backBtn.querySelector(".dr-back-label").textContent = "Back to " + truncate(recordName(prev), 34);
  }

  function render(show) {
    const type = show[0];
    const id = show.slice(2);
    A.clear(body);
    body.scrollTop = 0;
    body.appendChild(type === "b" ? benchmarkView(A.bById.get(id)) : studyView(A.sById.get(id)));
    updateBack();
    document.title = recordName(show) + " | Benchmark Atlas";
    const wasOpen = document.body.classList.contains("dr-open");
    document.body.classList.add("dr-open");
    requestAnimationFrame(() => {
      const t = body.querySelector("#dr-title");
      (t || panel).focus({ preventScroll: true });
    });
    if (!wasOpen) A.tip.hide();
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  // ------------------------------------------------------------------
  // Building blocks
  // ------------------------------------------------------------------
  function dl(rows) {
    const out = h("dl", { class: "dr-dl" });
    for (const [k, v, note] of rows) {
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
      out.appendChild(h("div", { class: "dr-dl-row" }, h("dt", null, k), h("dd", null, v, note ? h("span", { class: "dr-note" }, note) : null)));
    }
    return out;
  }

  function section(title, ...kids) {
    return h("section", { class: "dr-sec" }, h("h3", { class: "dr-h" }, title), kids);
  }

  // A list of values, each linking to the explorer filtered on it.
  function vals(page, key, arr, fallback) {
    const items = (arr || []).filter(Boolean);
    if (!items.length) return fallback ? h("span", { class: "muted" }, fallback) : null;
    if (items.length === 1) return key ? h("a", { class: "val-link", href: filterHref(page, key, items[0]), title: "See every record with this value" }, items[0]) : items[0];
    return h("ul", { class: "dr-vals" }, items.map((v) => h("li", null, key ? h("a", { class: "val-link", href: filterHref(page, key, v), title: "See every record with this value" }, v) : v)));
  }

  function qBlock(b) {
    const wrap = h("div", { class: "dr-quality", role: "list", "aria-label": "Quality ratings" });
    for (const d of A.DIMS) {
      const q = b.q[d.key];
      const low = q.low ? "Lowest rating in any study: " + q.low.toLowerCase() : null;
      wrap.appendChild(
        h("div", { class: "dr-qitem", role: "listitem" },
          h("span", { class: "q q-lg " + A.qClass(q.r), "aria-hidden": "true" }),
          h("span", { class: "dr-qtext" },
            h("span", { class: "dr-qdim" }, d.label),
            h("a", { class: "dr-qval val-link", href: filterHref("benchmarks", { input: "qi", ref: "qr", scoring: "qs" }[d.key], q.r), title: "See every benchmark with this rating" }, A.qLabel(q.r, d.key)),
            low ? h("span", { class: "dr-qlow" }, low) : null)));
    }
    return wrap;
  }

  function studyRow(s, inBenchmark) {
    const L = s.link;
    return h("li", { class: "dr-item" },
      h("a", { class: "dr-item-title", href: openHref("s:" + s.id) }, s.title),
      h("span", { class: "dr-item-meta" }, s.label + ". " + s.venue + "."),
      L ? h("a", { class: "paper-link", href: L.url, target: "_blank", rel: "noopener" }, L.verified ? (L.kind === "arxiv" ? "arXiv" : "Paper") : "Search", h("span", { class: "sr-only" }, ": " + s.title + " (opens in a new tab)"), A.iconEl("external", "ic-ext")) : null);
  }

  // "Inputs adequate, no reference standard, scoring high"
  function qPhrase(b) {
    const part = (d) => {
      const r = b.q[d.key].r;
      if (d.key === "ref" && r === "NA") return "no reference standard";
      if (r === "NR") return d.label.toLowerCase() + " not reported";
      return d.label.toLowerCase() + " " + r.toLowerCase();
    };
    const t = A.DIMS.map(part).join(", ");
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  A.qPhrase = qPhrase;

  function benchRow(b) {
    return h("li", { class: "dr-item dr-bitem" },
      h("span", { class: "sig sig-inline", "aria-hidden": "true" }, A.DIMS.map((d) => h("i", { class: A.qClass(b.q[d.key].r) }))),
      h("span", { class: "dr-bitem-text" },
        h("a", { class: "dr-item-title", href: openHref("b:" + b.id) }, b.name),
        h("span", { class: "dr-item-meta" }, b.purpose + ". " + A.countLabel(b.n_studies, "study", "studies") + ". " + qPhrase(b) + ".")));
  }

  // ------------------------------------------------------------------
  // Benchmark record
  // ------------------------------------------------------------------
  function benchmarkView(b) {
    const studies = b.studies.map((id) => A.sById.get(id)).sort((x, y) => y.year - x.year || x.first_author.localeCompare(y.first_author));
    const P = "benchmarks";
    const frag = h("article", { class: "dr-article" });
    frag.appendChild(h("h2", { class: "dr-title", id: "dr-title", tabindex: "-1" }, b.name));
    frag.appendChild(h("p", { class: "dr-lede" },
      h("a", { class: "val-link", href: filterHref(P, "purpose", b.purpose) }, b.purpose), ". ",
      b.constructs.map((c, i) => [i ? ", " : "", h("a", { class: "val-link", href: filterHref(P, "construct", c) }, c)]),
      b.construct_tie ? " (studies split evenly)" : "", "."));
    frag.appendChild(h("p", { class: "dr-meta" },
      (b.named ? "Named benchmark" : "Unnamed item set") + ", used in " + A.countLabel(b.n_studies, "study", "studies") + (b.first_year ? ", " + (b.first_year === b.last_year ? b.first_year : b.first_year + " to " + b.last_year) : "") + "."));

    frag.appendChild(section("Quality", qBlock(b),
      h("p", { class: "dr-small" }, b.n_studies > 1 ? "The most common rating across the " + b.n_studies + " studies that used it." : "Rated from the one study that used it.", " ",
        h("a", { href: "#/methods/quality" }, "How quality was rated"))));

    const size = b.size ? [document.createTextNode(A.sizeText(b.size)), b.size.note ? h("span", { class: "dr-note" }, "Source of this figure: " + A.sizeNotes[b.size.note] + ".") : null] : "Not reported";
    frag.appendChild(section("Inputs", dl([
      ["Condition or focus", vals(P, "condition", b.conditions)],
      ["Input format", vals(P, "format", b.input_formats)],
      ["Type of material", vals(P, "material", b.material)],
      ["Source of input", vals(P, "source", [b.input_source])],
      ["Conversation type", vals(P, "conversation", [b.conversation])],
      ["Languages", vals(P, "language", b.languages)],
      ["Population", vals(P, "population", b.populations)],
      ["Age group", vals(P, "age", [b.age_group])],
      ["Size", size],
      ["Availability", vals(P, "availability", b.availability)],
    ])));

    frag.appendChild(section("Reference standard", dl([
      ["Type", vals(P, "reftype", b.ref_types)],
      ["Validated instruments", vals(P, "instrument", b.instruments, "None")],
    ])));

    const judgeRows = [["Scoring method", vals(P, "scoring", b.scoring)]];
    if (b.flags.llm_judge) {
      judgeRows.push(["LLM judge family", vals(P, "judgefamily", b.judge_families, "Not specified")]);
      judgeRows.push(["Compared with human raters", b.judge_compared || "Not reported"]);
      if (b.judge_agreement) judgeRows.push(["Agreement", vals(P, "agreement", [b.judge_agreement])]);
      if (b.agreement_stat && b.agreement_stat.length) judgeRows.push(["Reported statistic", vals(null, null, b.agreement_stat)]);
    } else judgeRows.push(["LLM judge", "None"]);
    frag.appendChild(section("Scoring", dl(judgeRows)));

    const parents = b.parents.map((p) => (p.id ? h("a", { class: "val-link", href: openHref("b:" + p.id) }, p.name) : p.name));
    const srcs = b.sources.map((s) => {
      const label = s.kind === "Note" ? null : s.kind;
      let content;
      if (s.study_ids && s.study_ids.length) {
        content = s.study_ids.map((sid, i) => [i ? "; " : "", h("a", { class: "val-link", href: openHref("s:" + sid) }, A.sById.get(sid).label)]);
      } else content = s.text;
      return h("li", null, label ? h("span", { class: "dr-src-k" }, label + ": ") : null, content);
    });
    frag.appendChild(section("Context and provenance", dl([
      ["Intended audience", vals(P, "audience", b.audiences)],
      ["People with lived experience", b.lived.length ? vals(null, null, b.lived) : h("span", { class: "muted" }, "None reported")],
      ["Derived from", parents.length ? (parents.length === 1 ? parents[0] : h("ul", { class: "dr-vals" }, parents.map((p) => h("li", null, p)))) : null],
      ["Documentation", srcs.length ? h("ul", { class: "dr-vals dr-srcs" }, srcs) : null],
    ])));

    const derived = A.B.filter((x) => x.parents.some((p) => p.id === b.id));
    if (derived.length) {
      frag.appendChild(section("Benchmarks derived from it (" + derived.length + ")", h("ul", { class: "dr-list" }, derived.map(benchRow))));
    }

    frag.appendChild(section("Studies that used it (" + studies.length + ")", h("ul", { class: "dr-list" }, studies.map((s) => studyRow(s, true)))));
    return frag;
  }

  // ------------------------------------------------------------------
  // Study record
  // ------------------------------------------------------------------
  function studyView(s) {
    const P = "studies";
    const frag = h("article", { class: "dr-article" });
    frag.appendChild(h("h2", { class: "dr-title dr-title-study", id: "dr-title", tabindex: "-1" }, s.title));
    frag.appendChild(h("p", { class: "dr-lede" }, s.label + ". ", h("a", { class: "val-link", href: filterHref(P, "venue", s.venue) }, s.venue), " (" + s.source_type.toLowerCase() + ")."));
    const L = s.link;
    if (L) {
      frag.appendChild(h("div", { class: "dr-actions" },
        h("a", { class: "btn " + (L.verified ? "btn-primary" : "btn-secondary"), href: L.url, target: "_blank", rel: "noopener" },
          L.verified ? (L.kind === "arxiv" ? "Read on arXiv" : "Read the paper") : "Search for the paper", h("span", { class: "sr-only" }, " (opens in a new tab)"), A.iconEl("external", "ic-ext")),
        L.doi && L.verified && L.kind !== "arxiv" ? h("span", { class: "dr-doi" }, "doi:" + L.doi) : null,
        !L.verified ? h("p", { class: "dr-small" }, "We could not confirm a direct link for this study, so this searches Google Scholar for its exact title.") : null));
    }

    const benches = s.benchmarks.map((id) => A.bById.get(id));
    frag.appendChild(section("Benchmarks used (" + benches.length + ")", h("ul", { class: "dr-list" }, benches.map(benchRow)),
      s.modified ? h("p", { class: "dr-small" }, "This study modified an existing benchmark, for example by subsetting, translating, or reannotating it.") : null));

    const models = s.models.filter((m) => !m.comparator);
    const comps = s.models.filter((m) => m.comparator);
    frag.appendChild(section("Models evaluated (" + (s.n_models == null ? s.models.length : s.n_models) + ")", dl([
      ["Model families", vals(P, "family", s.model_families, s.n_models === 0 ? "None (no models evaluated)" : "Not reported")],
      [comps.length ? "Systems evaluated" : "Models", models.length ? h("ul", { class: "dr-vals dr-models" }, models.map((m) => h("li", null, m.name))) : null],
      ["Comparators", comps.length ? h("ul", { class: "dr-vals dr-models" }, comps.map((m) => h("li", null, m.name))) : null],
      ["Note", s.model_notes && s.model_notes.length ? s.model_notes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join("; ") + "." : null],
      ["Model access", vals(P, "access", [s.model_access])],
      ["Run-to-run variability", vals(P, "variability", [s.variability])],
    ]), h("p", { class: "dr-small" }, "Model names are given as reported and were not standardized.")));

    frag.appendChild(section("Evaluation", dl([
      ["Study type", vals(P, "studytype", [s.study_type])],
      ["Mental health scope", vals(P, "scope", [s.mh_scope])],
      ["Primary constructs", vals(P, "construct", s.constructs)],
      ["Scoring methods of the benchmarks used", vals(P, "scoring", s.scoring), "Pooled across every study that used these benchmarks, so it can include methods this study did not apply."],
      ["LLM judge used in this study", s.llm_judge ? "Yes" : "No"],
    ])));
    return frag;
  }
})();
