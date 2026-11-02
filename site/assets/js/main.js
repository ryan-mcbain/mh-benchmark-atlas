/* Benchmark Atlas: router and page shell. */
(function () {
  "use strict";
  const A = window.Atlas;
  const h = A.h;
  const main = document.getElementById("main");
  const SITE = "Benchmark Atlas";

  if (!window.ATLAS_DATA || !A.B) {
    main.innerHTML = '<div class="wrap notfound"><h1 class="doc-title">The data did not load</h1><p>The file <code>assets/data/atlas-data.js</code> is missing or damaged. Rebuild it with <code>python3 build/build_data.py</code>.</p></div>';
    return;
  }

  // Footer data version
  const fv = document.getElementById("foot-version");
  if (fv) {
    const d = A.meta.workbook_modified ? new Date(A.meta.workbook_modified) : null;
    fv.textContent = "Data: " + A.fmt(A.B.length) + " benchmarks and " + A.fmt(A.S.length) + " studies" + (d ? ", workbook saved " + d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "") + ".";
  }

  // Mobile menu
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  navToggle.addEventListener("click", () => {
    const open = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  const closeNav = () => {
    nav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  };
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) closeNav();
  });
  document.addEventListener("click", (e) => {
    if (nav.classList.contains("is-open") && !nav.contains(e.target) && !navToggle.contains(e.target)) closeNav();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      closeNav();
      navToggle.focus();
    }
  });

  // Skip link and record links. Record links keep their real href (so they
  // can be opened in a new tab) but open in the drawer on a plain click.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href^='#']");
    if (!a) return;
    const href = a.getAttribute("href");
    if (href === "#main") {
      e.preventDefault();
      main.focus();
      main.scrollIntoView({ block: "start" });
      return;
    }
    if (href.slice(0, 2) !== "#/" || a.target === "_blank") return;
    const show = A.param(A.parseHash(href).params, "show");
    if (show) {
      e.preventDefault();
      A.openRecord(show, href);
    }
  });

  const explorers = {};
  const notFound = {
    title: "Page not found",
    mount(root) {
      A.clear(root);
      root.appendChild(h("div", { class: "wrap notfound" },
        h("h1", { class: "doc-title", tabindex: "-1" }, "That page does not exist"),
        h("p", null, "Try the ", h("a", { href: "#/" }, "overview"), ", the ", h("a", { href: "#/benchmarks" }, "benchmarks"), ", or the ", h("a", { href: "#/studies" }, "studies"), ".")));
    },
    update() {},
  };

  function pageFor(name) {
    if (name === "benchmarks") return explorers.b || (explorers.b = A.benchmarkExplorer());
    if (name === "studies") return explorers.s || (explorers.s = A.studyExplorer());
    return A.pages[name] || notFound;
  }

  let current = null;
  function onRoute(route) {
    // Ignore in-page anchors such as #main; only "#/..." addresses are routes.
    if (location.hash && location.hash !== "#" && location.hash.slice(0, 2) !== "#/") return;
    let name = route.page;
    // Short permalinks: #/b/<id> and #/s/<id>
    if ((name === "b" || name === "s") && route.sub[0]) {
      A.go(A.buildHash(name === "b" ? "benchmarks" : "studies", { show: [name + ":" + route.sub[0]] }), true);
      return;
    }
    const known = ["overview", "benchmarks", "studies", "methods", "about"];
    if (!known.includes(name)) name = "notfound";
    const page = name === "notfound" ? notFound : pageFor(name);
    if (name !== current) {
      const first = current === null;
      current = name;
      document.body.dataset.page = name;
      A.tip.hide();
      A.currentExplorer = null;
      page.mount(main, route);
      for (const a of document.querySelectorAll(".site-nav a")) {
        if (a.dataset.page === name) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }
      const t = page.title || (page.cfg && page.cfg.title);
      A.pageTitle = name === "overview" ? SITE + ": LLM benchmarks in mental health" : t + " | " + SITE;
      document.title = A.pageTitle;
      if (!first) {
        window.scrollTo(0, 0);
        const h1 = main.querySelector("h1");
        if (h1) {
          if (!h1.hasAttribute("tabindex")) h1.setAttribute("tabindex", "-1");
          h1.focus({ preventScroll: true });
        }
      }
    } else page.update(route);
    A.drawer.sync(route);
  }

  A.onRoute(onRoute);
  A.dispatch();
})();
