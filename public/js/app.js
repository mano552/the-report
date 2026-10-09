// =====================================================================
// THE REPORT — front-end
// Pages: /  (home) · /english · /urdu · /services · /news/<id> (one story)
// Stories now open ON OUR SITE (/news/<id>). The original source is only
// credited with a small link at the bottom of the story page.
// =====================================================================

const PAGE_FOR_PATH = { "/": "homepage", "/english": "news-english", "/urdu": "news-urdu", "/services": "services" };
const PATH_FOR_PAGE = { homepage: "/", "news-english": "/english", "news-urdu": "/urdu", services: "/services" };

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

const cache = { urdu: null, english: null }; // stories per language, once loaded

// ---------------- Router ----------------
function showPage(id) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function navigate(path, replace = false) {
  if (path !== location.pathname) history[replace ? "replaceState" : "pushState"]({}, "", path);
  route();
}

function route() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
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

// Any element with data-nav="/path" (buttons, cards, links) navigates inside the site.
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-nav]");
  if (!el) return;
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // let "open in new tab" work on links
  e.preventDefault();
  navigate(el.dataset.nav);
});

// Home page big buttons
document.querySelectorAll(".homepage-btn").forEach((btn) => {
  btn.addEventListener("click", () => navigate(PATH_FOR_PAGE[btn.dataset.page] || "/"));
});

// Kept for any old onclick="goToHomepage()"
function goToHomepage() { navigate("/"); }

// ---------------- Data ----------------
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

// ---------------- News list pages ----------------
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

  const query = (document.getElementById(cfg.search)?.value || "").trim().toLowerCase();
  const category = document.getElementById(cfg.filter)?.value || "";
  const filtered = stories.filter((a) => {
    const text = `${a.title} ${a.excerpt || ""}`.toLowerCase();
    return (!query || text.includes(query)) && (!category || a.category === category);
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
        <span class="news-category-badge">${escapeHtml(lang === "urdu" ? getCategoryUrdu(a.category) : a.category || "general")}</span>
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

// ---------------- Single story page (on our site) ----------------
let articleBackPath = "/";

async function loadArticle(id) {
  const slot = document.getElementById("articleSlot");
  const backBtn = document.getElementById("articleBackBtn");
  slot.innerHTML = `<p class="loading-msg">Loading… / لوڈ ہو رہا ہے…</p>`;

  try {
    // Use the already-loaded list if we have it, otherwise ask the API for this one story.
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

    slot.innerHTML = `
      <article class="article" ${cfg.rtl ? 'dir="rtl"' : ""}>
        <div class="article-meta">
          <span class="badge-red">${escapeHtml(a.language === "urdu" ? getCategoryUrdu(a.category) : (a.category || "general").toUpperCase())}</span>
          <span>${escapeHtml(displayDate(a))}</span>
        </div>
        <h1 class="article-title ${u}">${escapeHtml(a.title)}</h1>
        <div class="article-media">${mediaHtml(a, true)}</div>
        <div class="article-body">${paragraphs}</div>
      </article>`;
  } catch (err) {
    console.error("Article loading error:", err);
    slot.innerHTML = `<p class="loading-msg">${err.notFound ? LANG.english.t.notFound + "<br><span class='urdu'>" + LANG.urdu.t.notFound + "</span>" : "Could not load this story."}</p>`;
  }
}

document.getElementById("articleBackBtn")?.addEventListener("click", () => navigate(articleBackPath));

// ---------------- Small helpers ----------------
function imageHtml(a) {
  const src = safeUrl(a.image);
  return src
    ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(a.title)}" loading="lazy" onerror="this.onerror=null;this.src='/assets/logo.png';this.classList.add('img-fallback')">`
    : `<div class="img-placeholder"><img src="/assets/logo.png" alt=""></div>`;
}

// On the story page the video plays inline; on cards we only show the picture.
function mediaHtml(a, withVideo) {
  const video = safeUrl(a.video);
  if (withVideo && video) {
    const poster = safeUrl(a.image);
    return `<video controls preload="metadata" playsinline ${poster ? `poster="${escapeAttr(poster)}"` : ""} src="${escapeAttr(video)}"></video>`;
  }
  return imageHtml(a);
}

function shorten(str, n) {
  const s = String(str || "");
  return s.length > n ? s.slice(0, n).trim() + "…" : s;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "link"; }
}

// Only allow http(s), our own /paths and uploaded data:image — blocks "javascript:" links.
function safeUrl(url) {
  if (!url || typeof url !== "string") return "";
  const u = url.trim();
  if (/^https?:\/\//i.test(u) || u.startsWith("/") || /^data:image\//i.test(u)) return u;
  return "";
}

function getCategoryUrdu(category) {
  const categoryMap = {
    general: "عام", business: "کاروبار", technology: "ٹیکنالوجی", entertainment: "تفریح",
    sports: "کھیل", science: "سائنس", health: "صحت", top: "اہم خبریں",
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
  document.getElementById(LANG[lang].filter)?.addEventListener("change", () => cache[lang] && renderNews(lang));
});

// Open the right page for the current URL (e.g. someone opens a shared /news/<id> link)
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
    
    // WhatsApp number (without + and spaces)
    const whatsappNumber = "923054741419";
    
    // Create WhatsApp message
    const whatsappMessage = `*New Contact Form Submission*%0A%0A` +
      `*Name:* ${encodeURIComponent(name)}%0A` +
      `*Email:* ${encodeURIComponent(email)}%0A` +
      `*Phone:* ${encodeURIComponent(phone)}%0A%0A` +
      `*Message:*%0A${encodeURIComponent(message)}`;
    
    // Open WhatsApp with pre-filled message
    const whatsappURL = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;
    window.open(whatsappURL, '_blank');
    
    // Reset form
    contactForm.reset();
  });
}
