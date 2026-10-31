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
      badge: "نمایاں خبر", readFull: "مکمل خبر پڑھیں ←", readMore: "مزید پڑھیں ←",
      back: "← خبروں پر واپس", source: "ماخذ", notFound: "یہ خبر موجود نہیں یا ہٹا دی گئی ہے۔",
    },
  },
  english: {
    page: "news-english", path: "/english", rtl: false,
    featured: "featuredSlotEnglish", list: "newsListEnglish", search: "searchInputEnglish", filter: "categoryFilterEnglish",
    t: {
      loading: "Loading news...", none: "No stories published yet. Please check back soon.",
      noMatch: "No news found.", error: "Could not load news. Please try again.",
      badge: "FEATURED NEWS", readFull: "Read Full Story →", readMore: "Read More →",
      back: "← Back to News", source: "Source", notFound: "This story does not exist or was removed.",
    },
  },
};

const cache = { urdu: null, english: null };

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
  if (cache[lang]) renderNews(lang);
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
        if (cache[lang]) renderNews(lang);
      }
    }
  });
});

// ================ Data ================
async function getStories(lang) {
  if (cache[lang]) return cache[lang];
  const res = await fetch("/api/news");
  if (!res.ok) throw new Error("API error " + res.status);
  const data = await res.json();
  const all = data.news || [];
  cache.urdu = all.filter((a) => a.language === "urdu");
  cache.english = all.filter((a) => a.language === "english");
  return cache[lang];
}

function displayDate(article) {
  if (!article.date) return article.language === "urdu" ? "آج" : "Today";
  const d = new Date(article.date);
  if (isNaN(d)) return article.date;
  return d.toLocaleDateString(article.language === "urdu" ? "ur-PK" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ================ News list pages ================
async function loadNews(lang) {
  const cfg = LANG[lang];
  const featuredSlot = document.getElementById(cfg.featured);
  if (!cache[lang]) featuredSlot.innerHTML = `<p class="${lang === "urdu" ? "urdu " : ""}loading-msg">${cfg.t.loading}</p>`;
  try {
    await getStories(lang);
    renderNews(lang);
  } catch (err) {
    console.error(lang + " news loading error:", err);
    featuredSlot.innerHTML = `<p class="${lang === "urdu" ? "urdu " : ""}loading-msg">${cfg.t.error}</p>`;
  }
}

function renderNews(lang) {
  const cfg = LANG[lang];
  const u = lang === "urdu" ? "urdu" : "";
  const featuredSlot = document.getElementById(cfg.featured);
  const listSlot = document.getElementById(cfg.list);
  const stories = cache[lang] || [];

  if (stories.length === 0) {
    featuredSlot.innerHTML = `<p class="${u} loading-msg">${cfg.t.none}</p>`;
    listSlot.innerHTML = "";
    return;
  }

  // normalize() handles Urdu/Arabic text (diacritics, different Unicode forms
  // of the same letter) so searching finds matches that a plain .includes()
  // used to miss.
  const query = normalizeSearchText(document.getElementById(cfg.search)?.value || "");
  const category = document.getElementById(cfg.filter)?.value || "";
  // "trending" is not a real category — it's the `trending` flag the AI
  // agent (or admin) sets on recent/hot stories. Everything else filters by
  // the `category` field as before. No filter = "Latest" (newest-first, the
  // default sort already applied by the API).
  // Match each typed word separately (AND match) instead of requiring the
  // whole typed phrase to appear as one exact substring — so "پاکستان کرکٹ"
  // still finds a story titled "کرکٹ بورڈ: پاکستان نے..." even though the
  // words aren't in that exact order/position. A single-word search behaves
  // exactly as before.
  const queryWords = query.split(" ").filter(Boolean);
  const filtered = stories.filter((a) => {
    const text = normalizeSearchText(`${a.title} ${a.excerpt || ""} ${a.body || ""}`);
    const matchesCategory = !category || (category === "trending" ? Boolean(a.trending) : a.category === category);
    const matchesSearch = queryWords.length === 0 || queryWords.every((w) => text.includes(w));
    return matchesSearch && matchesCategory;
  });

  if (filtered.length === 0) {
    featuredSlot.innerHTML = `<p class="${u} loading-msg">${cfg.t.noMatch}</p>`;
    listSlot.innerHTML = "";
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
    await getStories("urdu");
    const mine = [...(cache.urdu || []), ...(cache.english || [])]
      .filter((a) => {
        if (a.createdBy === "author:" + slug) return true; // posted from this author's own panel
        const who = normalizeSearchText(a.author || a.authorName || a.byline || "");
        return who && (who === slug || au.match.some((m) => who.includes(m)));
      })
      .sort((x, y) => new Date(y.date || 0) - new Date(x.date || 0));
    if (mine.length === 0) {
      list.innerHTML = `<p class="loading-msg">No news at the moment.</p>`;
      return;
    }
    list.innerHTML = mine.map((a) => {
      const ur = a.language === "urdu";
      return `
      <div class="author-news-item ${ur ? "rtl" : ""}" data-nav="/news/${encodeURIComponent(a.id)}">
        ${imageHtml(a)}
        <div>
          <h3 class="${ur ? "urdu" : ""}">${escapeHtml(a.title)}</h3>
          <div class="an-date" style="direction:ltr;text-align:${ur ? "right" : "left"}">${escapeHtml(authorTime(a))}</div>
        </div>
      </div>`;
    }).join("");
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
    let a = [...(cache.urdu || []), ...(cache.english || [])].find((x) => x.id === id);
    if (!a) {
      const res = await fetch("/api/news/" + encodeURIComponent(id));
      if (res.status === 404) throw Object.assign(new Error("not found"), { notFound: true });
      if (!res.ok) throw new Error("API error " + res.status);
      a = await res.json();
    }

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

// Search + category filter
["urdu", "english"].forEach((lang) => {
  document.getElementById(LANG[lang].search)?.addEventListener("input", () => cache[lang] && renderNews(lang));
  document.getElementById(LANG[lang].filter)?.addEventListener("change", () => {
    if (cache[lang]) renderNews(lang);
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