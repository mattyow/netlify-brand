/* Netlify Brand Hub · shared shell */
(() => {
  "use strict";
  const ICONS = "/assets/icons/sprite.svg";
  const ico = (id, cls = "icon") => `<svg class="${cls}" aria-hidden="true"><use href="${ICONS}#${id}"></use></svg>`;
  window.nfIcon = ico;

  /* ── Gradient palette · 24 tiles from Color → Gradient palette (CSS approximations of the grain textures) ── */
  const R = (p, stops) => `radial-gradient(${p}, ${stops})`;
  const L = (a, stops) => `linear-gradient(${a}, ${stops})`;
  const GRADIENTS = [
    { id: "01", name: "Lilac Cobalt", ink: "light", css: L("180deg", "#c7b6ff 0%, #a59cff 16%, #2f63ff 38%, #0a5bff 58%, #14a6ef 80%, #19dfc9 100%") },
    { id: "02", name: "Lime Glow", ink: "dark", css: R("120% 110% at 92% 8%", "#d4f43a 0%, #b9ef3d 26%, #5fe07e 52%, #17ddbb 74%, #0fdcc8 100%") },
    { id: "03", name: "Peach Swirl", ink: "light", css: `${R("60% 45% at 40% 52%", "#ffb989 0%, #ffb084 55%, transparent 80%")}, ${L("125deg", "#5a49ff 0%, #7a63ff 24%, #ffad80 44%, #ffbc8a 62%, #9a6bff 80%, #5d4dff 100%")}` },
    { id: "04", name: "Ember Bands", ink: "light", css: L("180deg", "#071a22 0%, #0e2229 12%, #b8302f 26%, #f5463a 40%, #ff5e2f 58%, #ff7a3e 76%, #ffa46c 100%") },
    { id: "05", name: "Midnight Orbs", ink: "light", css: `${R("38% 38% at 14% 8%", "#c9b8ff 0%, #9d8bff 30%, transparent 72%")}, ${R("26% 26% at 88% 92%", "#b7a3ff 0%, #8f74ff 35%, transparent 80%")}, ${R("70% 60% at 42% 34%", "#2a25d6 0%, #13156a 50%, transparent 80%")}, #04121a` },
    { id: "06", name: "Lime Halo", ink: "dark", css: R("62% 56% at 50% 50%", "#d0f53b 0%, #c2f03b 40%, #73c78a 54%, #1890b0 64%, #2e7ea0 72%, #e79a72 88%, #ffa06c 100%") },
    { id: "07", name: "Cobalt Red", ink: "light", css: `${R("60% 70% at 4% 88%", "#ff3b36 0%, #e42a35 30%, transparent 64%")}, ${L("160deg", "#081028 0%, #0b1238 34%, #1f3cff 72%, #3d5bff 100%")}` },
    { id: "08", name: "Teal Orange", ink: "light", css: `${R("40% 30% at 92% 96%", "#ff7a3a 0%, #ff8d4a 30%, transparent 70%")}, ${R("70% 22% at 70% 6%", "#21d8ee 0%, transparent 80%")}, ${L("150deg", "#0e6f97 0%, #0a77a2 50%, #08628a 100%")}` },
    { id: "09", name: "Plum Pink", ink: "light", css: `${R("46% 40% at 22% 12%", "#5b1f5f 0%, #772a6a 40%, transparent 80%")}, ${L("165deg", "#b8327a 0%, #ff3d9c 40%, #ff4f9a 64%, #ff9a8a 100%")}` },
    { id: "10", name: "Gold Sun", ink: "dark", css: R("62% 56% at 50% 52%", "#ffd36a 0%, #fdcb65 44%, #ff9a58 62%, #ff4f8f 78%, #8c43e8 92%, #5e49ff 100%") },
    { id: "11", name: "Lime Teal", ink: "dark", css: L("180deg", "#5c2361 0%, #6a3168 10%, #a7d544 30%, #bbee3c 46%, #bbee3c 60%, #2ec7b4 76%, #0a77a2 92%, #0a6a92 100%") },
    { id: "12", name: "Pink Turquoise", ink: "light", css: `${R("44% 60% at 96% 60%", "#0b1d22 0%, #0d2a2c 40%, transparent 80%")}, ${L("125deg", "#ff3d9c 0%, #ff5ea6 22%, #2fe0c6 50%, #10ddc4 64%, #0f6b67 100%")}` },
    { id: "13", name: "Sky Halo", ink: "dark", css: R("60% 56% at 50% 52%", "#12e3f0 0%, #01d4e5 40%, #1a8cf2 58%, #2346ff 72%, #6a2bd8 88%, #d03b7c 100%") },
    { id: "14", name: "Gold Teal Bands", ink: "dark", css: L("180deg", "#06262a 0%, #0b5a5a 10%, #16d9c6 24%, #b3efe6 32%, #fdcb65 42%, #ffc33a 60%, #23dcc6 80%, #19d9cf 100%") },
    { id: "15", name: "Orange Plum", ink: "light", css: R("68% 58% at 50% 34%", "#ff7a3e 0%, #ff7542 44%, #b04a50 60%, #612d68 74%, #9a7fd6 90%, #c1b5ff 100%") },
    { id: "16", name: "Peach Dusk", ink: "light", css: L("180deg", "#ffaa76 0%, #ffbc8a 46%, #d39ad8 58%, #5a3ff4 70%, #2c2fb0 80%, #0d1f27 100%") },
    { id: "17", name: "Lilac Beam", ink: "light", css: L("120deg", "#0f1230 0%, #171a3e 34%, #8c7cff 52%, #c1b5ff 64%, #3a3a72 82%, #b0b4ff 100%") },
    { id: "18", name: "Pink Halo", ink: "light", css: R("62% 56% at 50% 50%", "#ff3d9c 0%, #ff3d9c 42%, #a3307d 62%, #5c2361 74%, #1fbfb0 92%, #10ddc4 100%") },
    { id: "19", name: "Cobalt Coral", ink: "light", css: L("180deg", "#065eff 0%, #6a7bff 24%, #c1b5ff 38%, #ff5a4f 54%, #f84747 82%, #c9a4ff 100%") },
    { id: "20", name: "Coral Halo", ink: "light", css: R("62% 56% at 50% 50%", "#ffbc8a 0%, #ffa576 30%, #ff4a3a 58%, #a31c26 78%, #0d1f27 100%") },
    { id: "21", name: "Green Lime", ink: "light", css: `${R("40% 70% at 70% 50%", "#fdcb65 0%, #f2c45a 30%, transparent 64%")}, ${L("120deg", "#0b6e52 0%, #3fb66b 34%, #0a77a2 68%, #3d4bff 100%")}` },
    { id: "22", name: "Turquoise Lime", ink: "light", css: L("125deg", "#10ddc4 0%, #2f9bf0 26%, #4e49ff 46%, #6a55ff 58%, #9ad54a 84%, #bbee3c 100%") },
    { id: "23", name: "Pink Orange", ink: "light", css: L("180deg", "#ff7542 0%, #ff6a4a 16%, #ff3d9c 30%, #ff3d9c 70%, #ff6a4a 84%, #ff7542 100%") },
    { id: "24", name: "Gold Dust", ink: "light", css: `${R("60% 60% at 90% 12%", "#fdcb65 0%, #ffb07a 32%, rgba(255,160,108,.2) 58%, transparent 74%)")}, #0b1a20` }
  ];
  window.NF_GRADIENTS = GRADIENTS;
  const gradById = id => GRADIENTS.find(g => g.id === String(id).padStart(2, "0"));
  function paintGradients(root = document) {
    root.querySelectorAll("[data-grad]").forEach(el => {
      const g = gradById(el.dataset.grad); if (!g) return;
      el.classList.add("grad"); el.style.background = g.css;
      if (!el.dataset.ink) el.dataset.ink = g.ink;
    });
  }
  window.nfPaintGradients = paintGradients;

  /* ── Navigation ── */
  const NAV = [
    { title: "Start", items: [["/", "Overview", "app-window"], ["/platform", "Brand platform"], ["/downloads", "Downloads", "download-simple"]] },
    { title: "Foundations", items: [["/logo", "Logo"], ["/color", "Color"], ["/typography", "Typography"], ["/layout", "Spacing & shape"], ["/iconography", "Icons"], ["/illustration", "Illustration"], ["/motion", "Motion"]] },
    { title: "Building blocks", items: [["/components", "Components"], ["/patterns", "Patterns"], ["/tools", "Tools"]] },
    { title: "Restricted", items: [["/locked/", "Locked assets", "lock-simple"], ["/locked/strategy", "Brand strategy", "lock-simple"], ["/access", "Request access"]] }
  ];
  const here = location.pathname.replace(/\.html$/, "").replace(/\/index$/, "/") || "/";
  const isCurrent = href => href === "/" ? here === "/" : href.endsWith("/") ? here === href || here === href.slice(0, -1) : here === href || here.startsWith(href + "/");

  function buildShell() {
    const side = document.querySelector("[data-side]");
    if (!side) return;
    const groups = NAV.map(g => `<nav class="nav-group" aria-label="${g.title}"><h2>${g.title}</h2>${g.items.map(([href, label, icon]) =>
      `<a href="${href}"${isCurrent(href) ? ' aria-current="page"' : ""}>${label}${icon ? ico("ph-" + icon, "icon-s") : ""}</a>`).join("")}</nav>`).join("");
    side.innerHTML = `
      <a class="brand" href="/" aria-label="Netlify Brand Hub home">${ico("nf-mark")}<svg class="wm" viewBox="0 0 420 144" aria-hidden="true"><use href="${ICONS}#nf-wordmark"></use></svg><span>Brand</span></a>
      ${groups}
      <div class="side-foot">
        <div class="theme-toggle" role="group" aria-label="Color mode">
          <button type="button" data-theme-set="light">${ico("ph-sun", "icon-s")}Light</button>
          <button type="button" data-theme-set="dark">${ico("ph-moon", "icon-s")}Dark</button>
        </div>
        <p class="b-xs muted" data-access-line>Brand assets for Netlify and its partners.</p>
      </div>`;
    const bar = document.querySelector("[data-mobile-bar]");
    if (bar) {
      bar.innerHTML = `<a class="brand" href="/" aria-label="Netlify Brand Hub home">${ico("nf-mark")}<span>Brand</span></a>
        <button class="btn tertiary sm" type="button" data-nav-open aria-expanded="false" aria-controls="side">${ico("ph-list", "icon-s")}Menu</button>`;
    }
    const scrim = document.createElement("div"); scrim.className = "scrim"; document.body.appendChild(scrim);
    const openBtn = () => document.querySelector("[data-nav-open]");
    const setOpen = v => { document.body.classList.toggle("nav-open", v); openBtn()?.setAttribute("aria-expanded", String(v)); };
    document.addEventListener("click", e => {
      if (e.target.closest("[data-nav-open]")) setOpen(!document.body.classList.contains("nav-open"));
      else if (e.target === scrim) setOpen(false);
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });
  }

  /* ── Theme ── */
  function theme() {
    let saved = null; try { saved = localStorage.getItem("nf-theme"); } catch {}
    const sys = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const apply = t => {
      document.documentElement.dataset.theme = t;
      document.querySelectorAll("[data-theme-set]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeSet === t)));
    };
    apply(saved || sys);
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-theme-set]"); if (!b) return;
      apply(b.dataset.themeSet); try { localStorage.setItem("nf-theme", b.dataset.themeSet); } catch {}
    });
  }

  /* ── Copy ── */
  const toast = (() => { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t);
    let h; return msg => { t.textContent = msg; t.classList.add("show"); clearTimeout(h); h = setTimeout(() => t.classList.remove("show"), 1600); }; })();
  window.nfToast = toast;
  document.addEventListener("click", async e => {
    const el = e.target.closest("[data-copy]"); if (!el) return;
    try { await navigator.clipboard.writeText(el.dataset.copy); toast(`Copied ${el.dataset.copyLabel || el.dataset.copy}`); }
    catch { toast("Copy failed. Select the text and copy it manually."); }
  });

  /* ── Access status (reads the signed session cookie server-side) ── */
  async function access() {
    try {
      const r = await fetch("/api/access/status", { credentials: "same-origin" });
      if (!r.ok) return;
      const s = await r.json();
      document.documentElement.dataset.access = s.access ? "granted" : "none";
      const line = document.querySelector("[data-access-line]");
      if (line && s.access) line.textContent = `Locked assets unlocked for ${s.email}.`;
    } catch {}
  }

  buildShell(); theme(); paintGradients(); access();
  const y = document.querySelector("[data-year]"); if (y) y.textContent = new Date().getFullYear();
})();
