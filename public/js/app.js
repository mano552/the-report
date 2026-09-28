// --- Homepage button navigation ---
const homepageButtons = document.querySelectorAll(".homepage-btn");
homepageButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetPage = btn.dataset.page;
    
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.getElementById(targetPage).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
    
    // Load news on demand
    if (targetPage === "news-urdu" && !urduNewsLoaded) {
      loadUrduNews();
    } else if (targetPage === "news-english" && !englishNewsLoaded) {
      loadEnglishNews();
    }
  });
});

// --- Back to homepage function ---
function goToHomepage() {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.getElementById("homepage").classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- News loading state ---
let urduNewsLoaded = false;
let englishNewsLoaded = false;
let allUrduNews = [];
let allEnglishNews = [];

// --- Load Urdu News from Backend or API ---
async function loadUrduNews() {
  const featuredSlot = document.getElementById("featuredSlotUrdu");
  const listSlot = document.getElementById("newsListUrdu");
  
  featuredSlot.innerHTML = `<p class="urdu loading-msg">خبریں لوڈ ہو رہی ہیں...</p>`;
  
  try {
    // First try to load from backend
    const backendResponse = await fetch('/api/news');
    const backendData = await backendResponse.json();
    
    let urduNewsFromDB = [];
    if (backendData.news) {
      urduNewsFromDB = backendData.news.filter(article => article.language === 'urdu').map(article => ({
        title: article.title,
        description: article.excerpt,
        image: article.image || null,
        url: article.sourceUrl,
        date: article.date || 'آج',
        category: article.category || 'general',
        id: article.id
      }));
    }
    
    // If we have news from database, use them
    if (urduNewsFromDB.length > 0) {
      allUrduNews = urduNewsFromDB;
      urduNewsLoaded = true;
      renderUrduNews();
      return;
    }
    
    // Otherwise, try to fetch from NewsData API
    const NEWS_API_KEY = 'pub_1c5a4177a02048799b7b000174be3cb3';
    const apiResponse = await fetch(`https://newsdata.io/api/1/latest?apikey=${NEWS_API_KEY}&country=pk&language=ur&category=top,business,technology,sports,entertainment`);
    const apiData = await apiResponse.json();
    
    if (apiData.status === "success" && apiData.results) {
      allUrduNews = apiData.results.filter(article => article.title && article.description).map(article => ({
        title: article.title,
        description: article.description || article.title,
        image: article.image_url || null,
        url: article.link,
        date: article.pubDate ? new Date(article.pubDate).toLocaleDateString('ur-PK') : 'آج',
        category: article.category ? (Array.isArray(article.category) ? article.category[0] : article.category) : 'general'
      }));
      
      urduNewsLoaded = true;
      renderUrduNews();
    } else {
      throw new Error('Failed to load news from API');
    }
  } catch (err) {
    console.error('Urdu news loading error:', err);
    featuredSlot.innerHTML = `<p class="urdu loading-msg">خبریں لوڈ نہیں ہو سکیں۔ براہ کرم Admin Panel سے news add کریں۔</p>`;
  }
}

// --- Load English News from Backend or API ---
async function loadEnglishNews() {
  const featuredSlot = document.getElementById("featuredSlotEnglish");
  const listSlot = document.getElementById("newsListEnglish");
  
  featuredSlot.innerHTML = `<p class="loading-msg">Loading news...</p>`;
  
  try {
    // First try to load from backend
    const backendResponse = await fetch('/api/news');
    const backendData = await backendResponse.json();
    
    let englishNewsFromDB = [];
    if (backendData.news) {
      englishNewsFromDB = backendData.news.filter(article => article.language === 'english').map(article => ({
        title: article.title,
        description: article.excerpt,
        image: article.image || null,
        url: article.sourceUrl,
        date: article.date ? new Date(article.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today',
        category: article.category || 'general',
        id: article.id
      }));
    }
    
    // If we have news from database, use them
    if (englishNewsFromDB.length > 0) {
      allEnglishNews = englishNewsFromDB;
      englishNewsLoaded = true;
      renderEnglishNews();
      return;
    }
    
    // Otherwise, try to fetch from NewsData API
    const NEWS_API_KEY = 'pub_1c5a4177a02048799b7b000174be3cb3';
    const apiResponse = await fetch(`https://newsdata.io/api/1/latest?apikey=${NEWS_API_KEY}&country=pk&language=en&category=top,business,technology,sports,entertainment`);
    const apiData = await apiResponse.json();
    
    if (apiData.status === "success" && apiData.results) {
      allEnglishNews = apiData.results.filter(article => article.title && article.description).map(article => ({
        title: article.title,
        description: article.description || article.title,
        image: article.image_url || null,
        url: article.link,
        date: article.pubDate ? new Date(article.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today',
        category: article.category ? (Array.isArray(article.category) ? article.category[0] : article.category) : 'general'
      }));
      
      englishNewsLoaded = true;
      renderEnglishNews();
    } else {
      throw new Error('Failed to load news from API');
    }
  } catch (err) {
    console.error('English news loading error:', err);
    featuredSlot.innerHTML = `<p class="loading-msg">Failed to load news. Please add news from Admin Panel.</p>`;
  }
}

// --- Render Urdu News ---
function renderUrduNews() {
  const searchInput = document.getElementById("searchInputUrdu");
  const categoryFilter = document.getElementById("categoryFilterUrdu");
  const featuredSlot = document.getElementById("featuredSlotUrdu");
  const listSlot = document.getElementById("newsListUrdu");
  
  const query = (searchInput?.value || "").trim().toLowerCase();
  const category = categoryFilter?.value || "";
  
  let filtered = allUrduNews.filter((article) => {
    const matchesQuery = !query || 
      article.title.toLowerCase().includes(query) || 
      article.description.toLowerCase().includes(query);
    const matchesCategory = !category || article.category === category;
    return matchesQuery && matchesCategory;
  });
  
  if (filtered.length === 0) {
    featuredSlot.innerHTML = `<p class="urdu loading-msg">کوئی خبر نہیں ملی۔</p>`;
    listSlot.innerHTML = "";
    return;
  }
  
  // Featured news (first article)
  const featured = filtered[0];
  featuredSlot.innerHTML = `
    <div class="featured">
      <div class="featured-art">
        ${featured.image ? 
          `<img src="${escapeAttr(featured.image)}" alt="${escapeAttr(featured.title)}" onerror="this.src='/assets/logo.png'">` : 
          `<img src="/assets/logo.png" alt="The Report">`
        }
      </div>
      <div class="featured-body">
        <span class="badge-red">نمایاں خبر</span>
        <h2 class="urdu">${escapeHtml(featured.title)}</h2>
        <p class="urdu">${escapeHtml(featured.description.substring(0, 200))}...</p>
        <div class="meta-row">
          <a href="${escapeAttr(featured.url)}" target="_blank" rel="noopener">مکمل خبر پڑھیں →</a>
          <span>${escapeHtml(featured.date)}</span>
        </div>
      </div>
    </div>
  `;
  
  // Rest of the news
  const rest = filtered.slice(1);
  listSlot.innerHTML = rest.map((article) => `
    <div class="news-card-modern">
      <div class="news-image">
        ${article.image ? 
          `<img src="${escapeAttr(article.image)}" alt="${escapeAttr(article.title)}" onerror="this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;background:linear-gradient(135deg, var(--navy-3), var(--navy));display:flex;align-items:center;justify-content:center;\\'><img src=\\'/assets/logo.png\\' style=\\'width:60px;height:60px;\\'></div>'">` : 
          `<div style="width:100%;height:100%;background:linear-gradient(135deg, var(--navy-3), var(--navy));display:flex;align-items:center;justify-content:center;"><img src="/assets/logo.png" style="width:60px;height:60px;"></div>`
        }
        <span class="news-category-badge">${getCategoryUrdu(article.category)}</span>
      </div>
      <div class="news-content">
        <h3 class="urdu">${escapeHtml(article.title)}</h3>
        <p class="urdu">${escapeHtml(article.description.substring(0, 150))}...</p>
        <div class="news-meta">
          <span class="news-date">${escapeHtml(article.date)}</span>
          <a href="${escapeAttr(article.url)}" class="news-read-more" target="_blank" rel="noopener">مزید پڑھیں →</a>
        </div>
      </div>
    </div>
  `).join("");
}

// --- Render English News ---
function renderEnglishNews() {
  const searchInput = document.getElementById("searchInputEnglish");
  const categoryFilter = document.getElementById("categoryFilterEnglish");
  const featuredSlot = document.getElementById("featuredSlotEnglish");
  const listSlot = document.getElementById("newsListEnglish");
  
  const query = (searchInput?.value || "").trim().toLowerCase();
  const category = categoryFilter?.value || "";
  
  let filtered = allEnglishNews.filter((article) => {
    const matchesQuery = !query || 
      article.title.toLowerCase().includes(query) || 
      article.description.toLowerCase().includes(query);
    const matchesCategory = !category || article.category === category;
    return matchesQuery && matchesCategory;
  });
  
  if (filtered.length === 0) {
    featuredSlot.innerHTML = `<p class="loading-msg">No news found.</p>`;
    listSlot.innerHTML = "";
    return;
  }
  
  // Featured news (first article)
  const featured = filtered[0];
  featuredSlot.innerHTML = `
    <div class="featured">
      <div class="featured-art">
        ${featured.image ? 
          `<img src="${escapeAttr(featured.image)}" alt="${escapeAttr(featured.title)}" onerror="this.src='/assets/logo.png'">` : 
          `<img src="/assets/logo.png" alt="The Report">`
        }
      </div>
      <div class="featured-body">
        <span class="badge-red">FEATURED NEWS</span>
        <h2>${escapeHtml(featured.title)}</h2>
        <p>${escapeHtml(featured.description.substring(0, 200))}...</p>
        <div class="meta-row">
          <a href="${escapeAttr(featured.url)}" target="_blank" rel="noopener">Read Full Story →</a>
          <span>${escapeHtml(featured.date)}</span>
        </div>
      </div>
    </div>
  `;
  
  // Rest of the news
  const rest = filtered.slice(1);
  listSlot.innerHTML = rest.map((article) => `
    <div class="news-card-modern">
      <div class="news-image">
        ${article.image ? 
          `<img src="${escapeAttr(article.image)}" alt="${escapeAttr(article.title)}" onerror="this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;background:linear-gradient(135deg, var(--navy-3), var(--navy));display:flex;align-items:center;justify-content:center;\\'><img src=\\'/assets/logo.png\\' style=\\'width:60px;height:60px;\\'></div>'">` : 
          `<div style="width:100%;height:100%;background:linear-gradient(135deg, var(--navy-3), var(--navy));display:flex;align-items:center;justify-content:center;"><img src="/assets/logo.png" style="width:60px;height:60px;"></div>`
        }
        <span class="news-category-badge">${escapeHtml(article.category)}</span>
      </div>
      <div class="news-content">
        <h3>${escapeHtml(article.title)}</h3>
        <p>${escapeHtml(article.description.substring(0, 150))}...</p>
        <div class="news-meta">
          <span class="news-date">${escapeHtml(article.date)}</span>
          <a href="${escapeAttr(article.url)}" class="news-read-more" target="_blank" rel="noopener">Read More →</a>
        </div>
      </div>
    </div>
  `).join("");
}

// --- Category Translation ---
function getCategoryUrdu(category) {
  const categoryMap = {
    'general': 'عام',
    'business': 'کاروبار',
    'technology': 'ٹیکنالوجی',
    'entertainment': 'تفریح',
    'sports': 'کھیل',
    'science': 'سائنس',
    'health': 'صحت',
    'top': 'اہم خبریں'
  };
  return categoryMap[category] || 'خبریں';
}

// --- Helper functions ---
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// --- Event listeners for search and filter ---
document.getElementById("searchInputUrdu")?.addEventListener("input", () => {
  if (urduNewsLoaded) renderUrduNews();
});

document.getElementById("categoryFilterUrdu")?.addEventListener("change", () => {
  if (urduNewsLoaded) renderUrduNews();
});

document.getElementById("searchInputEnglish")?.addEventListener("input", () => {
  if (englishNewsLoaded) renderEnglishNews();
});

document.getElementById("categoryFilterEnglish")?.addEventListener("change", () => {
  if (englishNewsLoaded) renderEnglishNews();
});

// --- Handle direct hash navigation (removed - now homepage first) ---
