// =====================================================================
// THE REPORT — front-end (Updated with all new features)
// Pages: / (home) · /english · /urdu · /services · /news/<id>
//        /investigator · /report-family · /live · /zarvity
// =====================================================================

const PAGE_FOR_PATH = {
  "/": "homepage", "/english": "news-english", "/urdu": "news-urdu",
  "/services": "services", "/investigator": "investigator",
  "/report-family": "report-family", "/official-authors": "official-authors",
  "/guest-authors": "guest-authors", "/live": "live", "/zarvity": "zarvity",
  "/about": "about-us"
};
const PATH_FOR_PAGE = {
  homepage: "/", "news-english": "/english", "news-urdu": "/urdu",
  services: "/services", investigator: "/investigator",
  "report-family": "/report-family", "official-authors": "/official-authors",
  "guest-authors": "/guest-authors", live: "/live", zarvity: "/zarvity",
  "about-us": "/about"
};

const LANG = {
  urdu: {
    page: "news-urdu", path: "/urdu", rtl: true,
    featured: "featuredSlotUrdu", list: "newsListUrdu", search: "searchInputUrdu", filter: "categoryFilterUrdu",
    t: {
      loading: "خبریں لوڈ ہو رہی ہیں...", none: "ابھی کوئی خبر شائع نہیں ہوئی۔ جلد حاضر ہوں گے۔",
      noMatch: "کوئی خبر نہیں ملی۔", error: "خبریں لوڈ نہیں ہو سکیں۔ دوبارہ کوشش کریں۔",
      badge: "نمایاں خبر", loadMore: "مزید خبریں", readFull: "مکمل خبر پڑھیں ←", readMore: "مزید پڑھیں ←",
      back: "← خبروں پر واپس", source: "ماخذ", notFound: "یہ خبر موجود نہیں یا ہٹا دی گئی ہے۔",
    },
  },
  english: {
    page: "news-english", path: "/english", rtl: false,
    featured: "featuredSlotEnglish", list: "newsListEnglish", search: "searchInputEnglish", filter: "categoryFilterEnglish",
    t: {
      loading: "Loading news...", none: "No stories published yet. Please check back soon.",
      noMatch: "No news found.", error: "Could not load news. Please try again.",
      badge: "FEATURED NEWS", loadMore: "Load more news", readFull: "Read Full Story →", readMore: "Read More →",
      back: "← Back to News", source: "Source", notFound: "This story does not exist or was removed.",
    },
  },
};

// Per-language list state. Stories are loaded one page at a time from
// /api/news?language=..&page=..  (server-side filter + search + pagination).
const PAGE_SIZE = 12;
const state = {
  urdu: { items: [], page: 0, hasMore: false, loading: false, loaded: false, req: 0 },
  english: { items: [], page: 0, hasMore: false, loading: false, loaded: false, req: 0 },
};

// ================ Router ================
function showPage(id) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  // Close mobile menu if open
  document.getElementById("mobileMenu")?.classList.remove("open");
}

function navigate(path, replace = false) {
  if (path !== location.pathname) history[replace ? "replaceState" : "pushState"]({}, "", path);
  route();
}

function route() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const am = path.match(/^\/author\/([^/]+)$/);
  if (am) {
    showPage("author-page");
    loadAuthor(decodeURIComponent(am[1]));
    return;
  }
  const m = path.match(/^\/news\/([^/]+)$/);
  if (m) {
    showPage("article");
    loadArticle(decodeURIComponent(m[1]));
    return;
  }
  document.title = "THE REPORT — A Media Network";
  const page = PAGE_FOR_PATH[path] || "homepage";
  showPage(page);
  if (page === "news-urdu") loadNews("urdu");
  if (page === "news-english") loadNews("english");
}

window.addEventListener("popstate", route);

// Category badge on a news card (e.g. "TECHNOLOGY", "INTERNATIONAL") — clicking
// it filters the list to that category instead of opening the article. This
// listener is registered with capture:true so it runs BEFORE the data-nav
// listener below (which would otherwise open the article underneath it).
document.addEventListener("click", (e) => {
  const badge = e.target.closest(".news-category-badge");
  if (!badge) return;
  const cat = badge.dataset.cat;
  if (!cat) return;
  e.preventDefault();
  e.stopPropagation();
  const lang = badge.closest("#news-urdu") ? "urdu" : "english";
  const filterEl = document.getElementById(LANG[lang].filter);
  if (filterEl) filterEl.value = cat;
  document.querySelectorAll(`#${LANG[lang].page} .cat-icon-btn`).forEach((b) => b.classList.toggle("active", b.dataset.cat === cat));
  reloadNews(lang);
  document.getElementById(LANG[lang].page)?.scrollIntoView({ behavior: "smooth", block: "start" });
}, true);

// Any element with data-nav="/path" navigates inside the site.
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-nav]");
  if (!el) return;
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
  e.preventDefault();
  navigate(el.dataset.nav);
});

// Home page big buttons
document.querySelectorAll(".homepage-btn").forEach((btn) => {
  btn.addEventListener("click", () => navigate(PATH_FOR_PAGE[btn.dataset.page] || "/"));
});

function goToHomepage() { navigate("/"); }

// ================ Mobile Menu ================
document.getElementById("mobileMenuBtn")?.addEventListener("click", () => {
  document.getElementById("mobileMenu")?.classList.add("open");
});
document.getElementById("mobileMenuClose")?.addEventListener("click", () => {
  document.getElementById("mobileMenu")?.classList.remove("open");
});

// ================ Category Icon Buttons ================
// (.lang-switch-btn — the "English News"/"اردو خبریں" button at the end of the
// strip — is excluded: it just navigates via data-nav, it's not a category.)
document.querySelectorAll(".cat-icon-btn:not(.lang-switch-btn)").forEach((btn) => {
  btn.addEventListener("click", () => {
    const lang = btn.dataset.lang;
    const cat = btn.dataset.cat;
    // Update active state
    btn.closest(".category-icons-strip").querySelectorAll(".cat-icon-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    // Sync dropdown
    const cfg = LANG[lang];
    if (cfg) {
      const filterEl = document.getElementById(cfg.filter);
      if (filterEl) {
        filterEl.value = cat;
        reloadNews(lang);
      }
    }
  });
});

// ================ Data ================
// Fetch ONE page of stories. Search + category are filtered on the server, so
// the browser never downloads the whole archive.
async function fetchPage(lang, page) {
  const cfg = LANG[lang];
  const params = new URLSearchParams({ language: lang, page: String(page), limit: String(PAGE_SIZE) });
  const category = document.getElementById(cfg.filter)?.value || "";
  const q = normalizeSearchText(document.getElementById(cfg.search)?.value || "");
  if (category) params.set("category", category);
  if (q) params.set("q", q);
  const res = await fetch("/api/news?" + params.toString());
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

function displayDate(article) {
  if (!article.date) return article.language === "urdu" ? "آج" : "Today";
  const d = new Date(article.date);
  if (isNaN(d)) return article.date;
  return d.toLocaleDateString(article.language === "urdu" ? "ur-PK" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ================ News list pages ================
function loadMoreEl(lang) {
  let el = document.getElementById("loadMore-" + lang);
  if (!el) {
    el = document.createElement("div");
    el.id = "loadMore-" + lang;
    el.className = "load-more-wrap";
    document.getElementById(LANG[lang].list).after(el);
  }
  return el;
}

// First open of a page: load page 1 (later visits reuse what is already shown).
async function loadNews(lang) {
  if (state[lang].loaded) return renderNews(lang);
  return reloadNews(lang);
}

// Start again from page 1 (used for first load, search and category changes).
async function reloadNews(lang) {
  const cfg = LANG[lang];
  const st = state[lang];
  const reqId = ++st.req;
  const featuredSlot = document.getElementById(cfg.featured);
  const u = lang === "urdu" ? "urdu " : "";
  featuredSlot.innerHTML = `<p class="${u}loading-msg">${cfg.t.loading}</p>`;
  document.getElementById(cfg.list).innerHTML = "";
  loadMoreEl(lang).innerHTML = "";
  st.loading = true;
  try {
    const data = await fetchPage(lang, 1);
    if (reqId !== st.req) return; // a newer search/filter replaced this request
    st.items = data.news || [];
    st.page = 1;
    st.hasMore = Boolean(data.hasMore);
    st.loaded = true;
    st.loading = false;
    renderNews(lang);
  } catch (err) {
    if (reqId !== st.req) return;
    st.loading = false;
    console.error(lang + " news loading error:", err);
    featuredSlot.innerHTML = `<p class="${u}loading-msg">${cfg.t.error}</p>`;
  }
}

async function loadMoreNews(lang) {
  const st = state[lang];
  if (st.loading || !st.hasMore) return;
  const reqId = st.req;
  st.loading = true;
  renderNews(lang);
  try {
    const data = await fetchPage(lang, st.page + 1);
    if (reqId !== st.req) return;
    st.items = st.items.concat(data.news || []);
    st.page += 1;
    st.hasMore = Boolean(data.hasMore);
  } catch (err) {
    console.error(lang + " load more error:", err);
  }
  st.loading = false;
  renderNews(lang);
}

function renderNews(lang) {
  const cfg = LANG[lang];
  const u = lang === "urdu" ? "urdu" : "";
  const featuredSlot = document.getElementById(cfg.featured);
  const listSlot = document.getElementById(cfg.list);
  const st = state[lang];
  const filtered = st.items;
  const hasFilter = Boolean(document.getElementById(cfg.search)?.value.trim() || document.getElementById(cfg.filter)?.value);

  if (filtered.length === 0) {
    featuredSlot.innerHTML = `<p class="${u} loading-msg">${hasFilter ? cfg.t.noMatch : cfg.t.none}</p>`;
    listSlot.innerHTML = "";
    loadMoreEl(lang).innerHTML = "";
    return;
  }

  const [featured, ...rest] = filtered;
  const link = (a) => `/news/${encodeURIComponent(a.id)}`;

  featuredSlot.innerHTML = `
    <div class="featured clickable" data-nav="${escapeAttr(link(featured))}">
      <div class="featured-art">${mediaHtml(featured, false)}</div>
      <div class="featured-body">
        <span class="badge-red">${cfg.t.badge}</span>
        <h2 class="${u}">${escapeHtml(featured.title)}</h2>
        <p class="${u}">${escapeHtml(shorten(featured.excerpt, 220))}</p>
        <div class="meta-row">
          <a href="${escapeAttr(link(featured))}" data-nav="${escapeAttr(link(featured))}">${cfg.t.readFull}</a>
          <span>${escapeHtml(displayDate(featured))}</span>
        </div>
      </div>
    </div>`;

  listSlot.innerHTML = rest.map((a) => `
    <div class="news-card-modern clickable" data-nav="${escapeAttr(link(a))}">
      <div class="news-image">
        ${imageHtml(a)}
        <button type="button" class="news-category-badge" data-cat="${escapeAttr(a.category || "")}">${escapeHtml(lang === "urdu" ? getCategoryUrdu(a.category) : a.category || "general")}</button>
        ${a.video ? `<span class="news-video-badge">▶</span>` : ""}
      </div>
      <div class="news-content">
        <h3 class="${u}">${escapeHtml(a.title)}</h3>
        <p class="${u}">${escapeHtml(shorten(a.excerpt, 150))}</p>
        <div class="news-meta">
          <span class="news-date">${escapeHtml(displayDate(a))}</span>
          <a href="${escapeAttr(link(a))}" data-nav="${escapeAttr(link(a))}" class="news-read-more">${cfg.t.readMore}</a>
        </div>
      </div>
    </div>`).join("");

  const more = loadMoreEl(lang);
  more.innerHTML = st.hasMore
    ? `<button type="button" class="load-more-btn ${u}" ${st.loading ? "disabled" : ""}>${st.loading ? cfg.t.loading : cfg.t.loadMore}</button>`
    : "";
  more.querySelector("button")?.addEventListener("click", () => loadMoreNews(lang));
}


// ================ Author profile page ================
// Shows every published story (Urdu + English) whose `author` field matches.
const AUTHORS = {
  "adeel-shah": { name: "Syed Adeel Asghar Shah", photo: "/assets/adeel-shah.png", match: ["adeel"] },
  "babar-aladdin": { name: "Brigadier Babar Ala-ud-Din, SI(M) (R)", photo: "/assets/babar-aladdin.png", match: ["babar"] },
  "abdul-jabbar-bhatti": { name: "Abdul Jabbar Bhatti", photo: "/assets/abdul-jabbar-bhatti.png", match: ["jabbar", "bhatti"] },
  "haider-munir": { name: "Haider Munir", photo: "/assets/haider-munir.jpg", match: ["haider", "munir"] },
};

function authorTime(a) {
  const d = new Date(a.date);
  if (!a.date || isNaN(d)) return displayDate(a);
  const t = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  const day = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/(\w{3}) (\d{4})$/, "$1, $2");
  return `${t}, ${day}`;
}

async function loadAuthor(slug) {
  const head = document.getElementById("authorHead");
  const list = document.getElementById("authorNewsList");
  const au = AUTHORS[slug];
  if (!au) {
    head.innerHTML = "";
    list.innerHTML = `<p class="loading-msg">Author not found.</p>`;
    return;
  }
  document.title = `${au.name} — THE REPORT`;
  head.innerHTML = `<img src="${escapeAttr(au.photo)}" alt="${escapeAttr(au.name)}"><h1>${escapeHtml(au.name)}</h1>`;
  list.innerHTML = `<p class="loading-msg">Loading...</p>`;
  try {
    const resp = await fetch("/api/news?author=" + encodeURIComponent(slug) + "&limit=100");
    if (!resp.ok) throw new Error("API error " + resp.status);
    const mine = ((await resp.json()).news || []).sort((x, y) => new Date(y.date || 0) - new Date(x.date || 0));
    const card = (a) => {
      const ur = a.language === "urdu";
      return `
      <div class="ap-card ${ur ? "rtl" : ""}" data-nav="/news/${encodeURIComponent(a.id)}">
        <div class="ap-img">${imageHtml(a)}</div>
        <div class="ap-body">
          <h3 class="${ur ? "urdu" : ""}">${escapeHtml(a.title)}</h3>
          <div class="an-date" style="direction:ltr;text-align:${ur ? "right" : "left"}">${escapeHtml(authorTime(a))}</div>
        </div>
      </div>`;
    };
    const section = (cls, title, items, empty) => `
      <div class="ap-section ${cls}">
        <div class="ap-section-head">
          <h2 class="${cls === "ur" ? "urdu" : ""}">${title}</h2>
          <span class="ap-count">${items.length}</span>
        </div>
        ${items.length ? `<div class="ap-grid">${items.map(card).join("")}</div>` : `<p class="ap-empty ${cls === "ur" ? "urdu" : ""}">${empty}</p>`}
      </div>`;
    const en = mine.filter((a) => a.language !== "urdu");
    const ur = mine.filter((a) => a.language === "urdu");
    list.innerHTML =
  section("en", "English", en, "No English news at the moment.") +
  section("ur", "اردو", ur, "فی الحال کوئی خبر موجود نہیں");
  } catch (err) {
    console.error("Author page error:", err);
    list.innerHTML = `<p class="loading-msg">Could not load articles. Please try again.</p>`;
  }
}

// ================ Single story page ================
let articleBackPath = "/";

async function loadArticle(id) {
  const slot = document.getElementById("articleSlot");
  const backBtn = document.getElementById("articleBackBtn");
  slot.innerHTML = `<p class="loading-msg">Loading… / لوڈ ہو رہا ہے…</p>`;

  try {
    // The list only carries a short excerpt, so fetch the full story here.
    const res = await fetch("/api/news/" + encodeURIComponent(id));
    if (res.status === 404) throw Object.assign(new Error("not found"), { notFound: true });
    if (!res.ok) throw new Error("API error " + res.status);
    const a = await res.json();

    const cfg = LANG[a.language] || LANG.english;
    const u = a.language === "urdu" ? "urdu" : "";
    articleBackPath = cfg.path;
    backBtn.textContent = cfg.t.back;
    document.title = `${a.title} — THE REPORT`;

    const paragraphs = String(a.body || a.excerpt || "")
      .split(/\n\s*\n|\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p class="${u}">${escapeHtml(p)}</p>`)
      .join("");

    const articleUrl = encodeURIComponent(window.location.href);
    const articleTitle = encodeURIComponent(a.title);

    slot.innerHTML = `
      <article class="article" ${cfg.rtl ? 'dir="rtl"' : ""}>
        <div class="article-meta">
          <span class="badge-red">${escapeHtml(a.language === "urdu" ? getCategoryUrdu(a.category) : (a.category || "general").toUpperCase())}</span>
          <span>${escapeHtml(displayDate(a))}</span>
        </div>
        <h1 class="article-title ${u}">${escapeHtml(a.title)}</h1>
        <div class="article-media">${mediaHtml(a, true)}</div>
        <div class="article-body">${paragraphs}</div>
        <div class="article-share">
          <span><i class="fas fa-share-alt"></i> Share:</span>
          <button class="share-btn fb" onclick="window.open('https://www.facebook.com/sharer/sharer.php?u=${articleUrl}','_blank')" title="Share on Facebook"><i class="fab fa-facebook-f"></i></button>
          <button class="share-btn tw" onclick="window.open('https://twitter.com/intent/tweet?url=${articleUrl}&text=${articleTitle}','_blank')" title="Share on X"><i class="fab fa-x-twitter"></i></button>
          <button class="share-btn wa" onclick="window.open('https://wa.me/?text=${articleTitle}%20${articleUrl}','_blank')" title="Share on WhatsApp"><i class="fab fa-whatsapp"></i></button>
          <button class="share-btn copy" onclick="navigator.clipboard.writeText(window.location.href).then(()=>this.innerHTML='<i class=\\'fas fa-check\\'></i>')" title="Copy Link"><i class="fas fa-link"></i></button>
        </div>
      </article>`;
  } catch (err) {
    console.error("Article loading error:", err);
    slot.innerHTML = `<p class="loading-msg">${err.notFound ? LANG.english.t.notFound + "<br><span class='urdu'>" + LANG.urdu.t.notFound + "</span>" : "Could not load this story."}</p>`;
  }
}

document.getElementById("articleBackBtn")?.addEventListener("click", () => navigate(articleBackPath));

// ================ Small helpers ================
function imageHtml(a) {
  const src = safeUrl(a.image);
  return src
    ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(a.title)}" loading="lazy" onerror="this.onerror=null;this.src='/assets/logo.png';this.classList.add('img-fallback')">`
    : `<div class="img-placeholder"><img src="/assets/logo.png" alt=""></div>`;
}

function mediaHtml(a, withVideo) {
  const video = safeUrl(a.video);
  if (withVideo && video) {
    const poster = safeUrl(a.image);
    return `<video controls preload="metadata" playsinline ${poster ? `poster="${escapeAttr(poster)}"` : ""} src="${escapeAttr(video)}"></video>`;
  }
  return imageHtml(a);
}

// Search fix: normalize text before matching so Urdu diacritics / different
// Unicode representations of the same letter, plus extra spaces/case, don't
// make an otherwise-correct search return "no results".
function normalizeSearchText(str) {
  return String(str || "")
    .normalize("NFC")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // strip Arabic/Urdu diacritics (zer/zabar/pesh etc.)
    .replace(/[\u200B-\u200F\uFEFF]/g, "") // strip zero-width joiner/non-joiner marks common in Urdu text
    .replace(/[،۔,.!؟?]/g, " ") // punctuation shouldn't block a word match
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function shorten(str, n) {
  const s = String(str || "");
  return s.length > n ? s.slice(0, n).trim() + "…" : s;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "link"; }
}

function safeUrl(url) {
  if (!url || typeof url !== "string") return "";
  const u = url.trim();
  if (/^https?:\/\//i.test(u) || u.startsWith("/") || /^data:image\//i.test(u)) return u;
  return "";
}

function getCategoryUrdu(category) {
  const categoryMap = {
    business: "کاروبار", technology: "ٹیکنالوجی", entertainment: "تفریح",
    sports: "کھیل", science: "سائنس", health: "صحت", top: "اہم خبریں",
    international: "انٹرنیشنل", trending: "ٹرینڈنگ", showbiz: "شوبز", unique: "منفرد اور حیرت انگیز",
  };
  return categoryMap[category] || "خبریں";
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const escapeAttr = escapeHtml;

// Search + category filter (server-side; search waits 400ms after typing stops)
["urdu", "english"].forEach((lang) => {
  let timer;
  document.getElementById(LANG[lang].search)?.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => reloadNews(lang), 400);
  });
  document.getElementById(LANG[lang].filter)?.addEventListener("change", () => {
    reloadNews(lang);
    // Sync category icon buttons
    const cat = document.getElementById(LANG[lang].filter)?.value || "";
    const strip = document.getElementById(lang === "urdu" ? "news-urdu" : "news-english")?.querySelector(".category-icons-strip");
    if (strip) {
      strip.querySelectorAll(".cat-icon-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.cat === cat);
      });
    }
  });
});

// Open the right page for the current URL
route();

// --- Contact Form WhatsApp Integration ---
const contactForm = document.getElementById("contactForm");
if (contactForm) {
  contactForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const name = document.getElementById("contactName").value.trim();
    const email = document.getElementById("contactEmail").value.trim();
    const phone = document.getElementById("contactPhone").value.trim();
    const message = document.getElementById("contactMessage").value.trim();
    const whatsappNumber = "923158550842";
    const whatsappMessage = `*New Contact Form Submission*%0A%0A` +
      `*Name:* ${encodeURIComponent(name)}%0A` +
      `*Email:* ${encodeURIComponent(email)}%0A` +
      `*Phone:* ${encodeURIComponent(phone)}%0A%0A` +
      `*Message:*%0A${encodeURIComponent(message)}`;
    const whatsappURL = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;
    window.open(whatsappURL, '_blank');
    contactForm.reset();
  });
}