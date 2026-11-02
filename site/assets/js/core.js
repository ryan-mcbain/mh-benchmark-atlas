/* Benchmark Atlas: core helpers, URL routing, tooltip, toast, downloads.
   Plain JavaScript, no dependencies. Every module hangs off window.Atlas. */
(function () {
  "use strict";
  const A = (window.Atlas = window.Atlas || {});

  // ------------------------------------------------------------------
  // DOM helpers
  // ------------------------------------------------------------------
  A.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    setAttrs(el, attrs);
    append(el, kids);
    return el;
  };

  A.s = function s(tag, attrs, ...kids) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    setAttrs(el, attrs);
    append(el, kids);
    return el;
  };

  function setAttrs(el, attrs) {
    if (!attrs) return;
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
  }

  function append(el, kids) {
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false || c === "") continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }

  A.clear = function (el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  };

  A.esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  A.fmt = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("en-US"));
  A.pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
  A.plural = (n, one, many) => (n === 1 ? one : many || one + "s");
  A.countLabel = (n, one, many) => A.fmt(n) + " " + A.plural(n, one, many);

  A.norm = (s) =>
    String(s == null ? "" : s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  A.debounce = function (fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  };

  A.listText = function (arr, max) {
    if (!arr || !arr.length) return "";
    if (!max || arr.length <= max) return arr.join(", ");
    return arr.slice(0, max).join(", ") + ", +" + (arr.length - max) + " more";
  };

  A.yearSpan = function (a, b) {
    if (!a) return "";
    return a === b || !b ? String(a) : a + "–" + b;
  };

  A.reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------------
  // Icons (16 px, stroke-based, drawn for this site)
  // ------------------------------------------------------------------
  const ICONS = {
    search: '<circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5 14 14"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
    download: '<path d="M8 2.5v8M4.8 7.4 8 10.6l3.2-3.2M3 13.5h10"/>',
    link: '<path d="M6.8 9.2 9.2 6.8M7.2 4.6l.9-.9a2.7 2.7 0 0 1 3.9 3.9l-.9.9M8.8 11.4l-.9.9a2.7 2.7 0 0 1-3.9-3.9l.9-.9"/>',
    external: '<path d="M9.5 2.8h3.7v3.7M13.2 2.8 7.6 8.4M11.4 9.4v3.8H2.8V4.6h3.8"/>',
    chevron: '<path d="M4.5 6.2 8 9.8l3.5-3.6"/>',
    chevronRight: '<path d="M6.2 4.5 9.8 8l-3.6 3.5"/>',
    filters: '<path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7"/><circle cx="11" cy="4.5" r="1.5"/><circle cx="5" cy="11.5" r="1.5"/>',
    table: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M2.5 6.5h11M2.5 9.8h11M6.5 6.5V13"/>',
    bars: '<path d="M2.5 4h8M2.5 8h11M2.5 12h5.5"/>',
    map: '<circle cx="4.5" cy="4.5" r="1.6"/><circle cx="11.5" cy="4.5" r="0.9"/><circle cx="4.5" cy="11.5" r="0.9"/><circle cx="11.5" cy="11.5" r="2.3"/>',
    columns: '<path d="M2.5 13.5h11M4.5 13V8M8 13V3.5M11.5 13V6.5"/>',
    sortAsc: '<path d="M8 3.5v9M5 6.5l3-3 3 3"/>',
    sortDesc: '<path d="M8 3.5v9M5 9.5l3 3 3-3"/>',
    sortNone: '<path d="M5.5 6 8 3.5 10.5 6M5.5 10 8 12.5 10.5 10"/>',
    check: '<path d="M3.5 8.3 6.6 11.2 12.5 4.8"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M3.5 10.5h-1v-8h8v1"/>',
    info: '<circle cx="8" cy="8" r="5.8"/><path d="M8 7.3v4M8 4.9v.2"/>',
    back: '<path d="M9.8 4.5 6.2 8l3.6 3.5"/>',
    columnsPick: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M6.2 3v10M9.8 3v10"/>',
  };
  A.icon = function (name, cls) {
    return (
      '<svg class="icon' + (cls ? " " + cls : "") + '" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || "") +
      "</svg>"
    );
  };
  A.iconEl = function (name, cls) {
    const t = document.createElement("template");
    t.innerHTML = A.icon(name, cls);
    return t.content.firstChild;
  };

  // ------------------------------------------------------------------
  // URL state. Hash format:  #/page?key=value&key=value2
  // Repeated keys hold several values (OR within a filter).
  // ------------------------------------------------------------------
  A.parseHash = function (hash) {
    const raw = String(hash == null ? location.hash : hash).replace(/^#\/?/, "");
    const qi = raw.indexOf("?");
    const path = qi >= 0 ? raw.slice(0, qi) : raw;
    const query = qi >= 0 ? raw.slice(qi + 1) : "";
    const parts = path.split("/").filter(Boolean).map(safeDecode);
    const params = {};
    for (const pair of query.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const k = safeDecode(eq >= 0 ? pair.slice(0, eq) : pair);
      const v = safeDecode((eq >= 0 ? pair.slice(eq + 1) : "").replace(/\+/g, " "));
      (params[k] = params[k] || []).push(v);
    }
    return { page: parts[0] || "overview", sub: parts.slice(1), params };
  };

  function safeDecode(s) {
    try {
      return decodeURIComponent(s);
    } catch (e) {
      return s;
    }
  }

  A.buildHash = function (page, params) {
    const out = [];
    const keys = Object.keys(params || {});
    for (const k of keys) {
      const v = params[k];
      const vals = Array.isArray(v) ? v : [v];
      for (const x of vals) {
        if (x == null || x === "") continue;
        out.push(encodeURIComponent(k) + "=" + encodeURIComponent(x).replace(/%20/g, "+"));
      }
    }
    return "#/" + page + (out.length ? "?" + out.join("&") : "");
  };

  A.param = (params, key) => (params && params[key] && params[key].length ? params[key][0] : null);

  const routeListeners = [];
  A.onRoute = (fn) => routeListeners.push(fn);
  A.route = A.parseHash();

  A.dispatch = function () {
    A.route = A.parseHash();
    for (const fn of routeListeners) fn(A.route);
  };

  /** Navigate. replace=true updates the address without adding history.
      state is stored with the history entry (used by the record drawer). */
  A.go = function (hash, replace, state) {
    if (hash === location.hash && !state) return;
    try {
      if (replace) history.replaceState(state || null, "", hash);
      else history.pushState(state || null, "", hash);
      A.dispatch();
    } catch (e) {
      location.hash = hash; // very old browsers or sandboxed frames
    }
  };

  /** Open a record in the drawer. Each step remembers how deep into the
      drawer it is, so closing always returns to the page underneath. */
  A.openRecord = function (show, href) {
    const st = history.state || {};
    const openNow = A.drawer && A.drawer.isOpen();
    let next;
    if (openNow) {
      const prev = st.trail && st.trail.length ? st.trail : [A.drawer.current()];
      next = { dd: (st.dd || 0) + 1, root: st.root || "deep", trail: prev.concat(show) };
    } else {
      next = { dd: 1, root: "page", trail: [show] };
    }
    A.go(href || A.openHref(show), false, next);
  };

  window.addEventListener("popstate", A.dispatch);
  window.addEventListener("hashchange", () => {
    if (location.hash !== A._lastHash) A.dispatch();
  });
  A.onRoute(() => (A._lastHash = location.hash));

  A.absoluteUrl = function (hash) {
    return location.href.split("#")[0] + (hash || location.hash);
  };

  // ------------------------------------------------------------------
  // Tooltip (one shared element, follows the pointer or an anchor)
  // ------------------------------------------------------------------
  let tipEl = null;
  A.tip = {
    show(html, evOrEl) {
      if (!tipEl) tipEl = document.getElementById("tooltip");
      if (!tipEl) return;
      tipEl.innerHTML = html;
      tipEl.hidden = false;
      A.tip.move(evOrEl);
    },
    move(evOrEl) {
      if (!tipEl || tipEl.hidden) return;
      let x, y;
      if (evOrEl && evOrEl.getBoundingClientRect && !("clientX" in evOrEl)) {
        const r = evOrEl.getBoundingClientRect();
        x = r.left + r.width / 2;
        y = r.top;
      } else if (evOrEl) {
        x = evOrEl.clientX;
        y = evOrEl.clientY;
      } else return;
      const tw = tipEl.offsetWidth;
      const th = tipEl.offsetHeight;
      let left = x - tw / 2;
      let top = y - th - 14;
      if (top < 8) top = y + 20;
      left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
      tipEl.style.transform = "translate(" + Math.round(left) + "px," + Math.round(top) + "px)";
    },
    hide() {
      if (tipEl) tipEl.hidden = true;
    },
  };

  // ------------------------------------------------------------------
  // Toast and clipboard
  // ------------------------------------------------------------------
  let toastTimer;
  A.toast = function (msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  };

  A.copy = function (text, okMsg) {
    const done = () => A.toast(okMsg || "Copied");
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => fallback());
    } else fallback();
    function fallback() {
      const ta = A.h("textarea", { style: { position: "fixed", opacity: "0" } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch (e) {
        A.toast("Copy failed. Select the address bar and copy it instead.");
      }
      ta.remove();
    }
  };

  // ------------------------------------------------------------------
  // CSV download (works from file:// and any static host)
  // ------------------------------------------------------------------
  A.csv = function (header, rows) {
    const cell = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [header].concat(rows).map((r) => r.map(cell).join(",")).join("\r\n");
  };

  A.download = function (filename, text, type) {
    const blob = new Blob(["\ufeff" + text], { type: type || "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = A.h("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 500);
  };

  // ------------------------------------------------------------------
  // Focus trap for dialogs
  // ------------------------------------------------------------------
  A.focusables = function (root) {
    return Array.from(
      root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  };

  A.trapFocus = function (root, e) {
    if (e.key !== "Tab") return;
    const f = A.focusables(root);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  };
})();
