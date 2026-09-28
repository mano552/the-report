// The "AI agent" part of the project.
//
// Three ways this can get news, tried in this order:
//
//  1) FREE PATH — NEWSDATA_API_KEY only, no ANTHROPIC_API_KEY needed.
//     Pulls headlines straight from real Urdu-language news sources
//     (language=ur) via https://newsdata.io and uses their title/description
//     as-is. Zero AI cost — the free NewsData.io tier is all you need.
//
//  2) PAID PATH (better quality) — both keys set.
//     Pulls real headlines from NewsData.io (any language), then asks
//     Claude to rewrite each one as a clean, newsroom-style Urdu title +
//     excerpt. Costs a small amount of Claude API usage per fetch.
//
//  3) FALLBACK — ANTHROPIC_API_KEY only, no NEWSDATA_API_KEY.
//     Claude searches the web itself and writes the news directly.
//
// Docs: https://newsdata.io/documentation
//       https://docs.claude.com/en/api/messages

const crypto = require("crypto");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5"; // check https://platform.claude.com/docs/en/models/overview for the latest model id
const NEWSDATA_URL = "https://newsdata.io/api/1/latest";

const ALLOWED_CATEGORIES = ["اعلانات", "کاروبار", "تجزیہ", "صنعتی خبریں"];

// Maps NewsData.io's English category codes to our Urdu category labels,
// used only in the free path (no AI available to choose a category).
const CATEGORY_MAP = {
  business: "کاروبار",
  technology: "صنعتی خبریں",
  science: "صنعتی خبریں",
  politics: "اعلانات",
  world: "اعلانات",
  top: "اعلانات",
};
function mapCategory(newsDataCategory) {
  const first = Array.isArray(newsDataCategory) ? newsDataCategory[0] : newsDataCategory;
  return CATEGORY_MAP[first] || "تجزیہ";
}

// ---------- Shared: get real, live headlines from NewsData.io ----------

async function fetchFromNewsData(params) {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return null;

  const url = `${NEWSDATA_URL}?apikey=${key}&${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NewsData.io error ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (data.status !== "success") {
    throw new Error(`NewsData.io returned status: ${data.status} — ${JSON.stringify(data.results || data)}`);
  }
  return data.results || [];
}

// ---------- FREE PATH: use NewsData.io's own Urdu-language results as-is ----------

async function fetchFreeUrduNews() {
  // language=ur restricts results to sources NewsData.io has tagged as Urdu
  // (e.g. Jang, Dawn Urdu, BBC Urdu). No rewriting — used exactly as given.
  const results = await fetchFromNewsData("country=pk&language=ur&category=top,business,technology");
  if (!results || results.length === 0) return [];

  return results
    .filter((item) => item.title)
    .slice(0, 8)
    .map((item) => ({
      id: crypto.randomUUID(),
      title: item.title.trim(),
      excerpt: (item.description || item.title).trim().slice(0, 220),
      category: mapCategory(item.category),
      date: (item.pubDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      sourceUrl: item.link || null,
      featured: false,
      createdBy: "newsdata-free",
    }));
}

// ---------- PAID PATH: NewsData.io headlines rewritten by Claude ----------

async function callClaude({ apiKey, system, userMessage, useWebSearch }) {
  const body = {
    model: MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: userMessage }],
  };
  if (useWebSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }
  return response.json();
}

function extractText(data) {
  return (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function parseNewsJson(text) {
  const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array from the model.");
  return parsed;
}

function toNewsRecords(rawItems, fallbackUrls = {}) {
  return rawItems
    .filter((item) => item && item.title && item.excerpt)
    .map((item) => ({
      id: crypto.randomUUID(),
      title: String(item.title).trim(),
      excerpt: String(item.excerpt).trim(),
      category: ALLOWED_CATEGORIES.includes(item.category) ? item.category : "اعلانات",
      date: item.date || new Date().toISOString().slice(0, 10),
      sourceUrl: item.sourceUrl || fallbackUrls[item.title] || null,
      featured: false,
      createdBy: item.createdBy || "ai-agent",
    }));
}

async function rewriteHeadlinesInUrdu(apiKey, rawHeadlines) {
  const system = `You are a news desk assistant for a Pakistani Urdu-language media outlet called "THE REPORT — A Media Network".

You will be given a list of real news headlines (with short descriptions) pulled live from news wires. Rewrite each one as a proper Urdu newsroom item:
- "title": a short, natural Urdu headline (not a stiff word-for-word translation)
- "excerpt": 1-2 sentence Urdu summary
- "category": exactly one of: ${ALLOWED_CATEGORIES.join(", ")}
- "date": keep the date given to you
- "sourceUrl": keep the URL given to you, unchanged

Respond with ONLY a raw JSON array, no markdown fences, no commentary.`;

  const userMessage = `Here are the raw headlines:\n${JSON.stringify(rawHeadlines, null, 2)}\n\nReturn the JSON array now.`;
  const data = await callClaude({ apiKey, system, userMessage, useWebSearch: false });
  const text = extractText(data);
  const items = parseNewsJson(text);
  const fallbackUrls = Object.fromEntries(rawHeadlines.map((h) => [h.sourceTitle, h.sourceUrl]));
  return toNewsRecords(items, fallbackUrls);
}

async function searchAndWriteUrduNews(apiKey) {
  const system = `You are a news desk assistant for a Pakistani Urdu-language media outlet called "THE REPORT — A Media Network".

Use the web_search tool to find 3 to 5 genuinely recent, real news stories (general/current-affairs or business, relevant to a Pakistani audience, from the last 24-48 hours). For each, write:
- "title": short Urdu headline
- "excerpt": 1-2 sentence Urdu summary
- "category": exactly one of: ${ALLOWED_CATEGORIES.join(", ")}
- "date": YYYY-MM-DD
- "sourceUrl": the URL you found it at

Respond with ONLY a raw JSON array, no markdown fences, no commentary.`;

  const data = await callClaude({
    apiKey,
    system,
    userMessage: "Find today's fresh news and return the JSON array now.",
    useWebSearch: true,
  });
  const text = extractText(data);
  const items = parseNewsJson(text);
  return toNewsRecords(items);
}

/**
 * Fetches fresh Urdu news records ready to save into the database.
 *
 *  - NEWSDATA_API_KEY only            -> free path, raw Urdu-source headlines
 *  - NEWSDATA_API_KEY + ANTHROPIC_API_KEY -> best quality, AI-rewritten Urdu
 *  - ANTHROPIC_API_KEY only           -> fallback, Claude web search
 */
async function fetchFreshUrduNews() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const newsDataKey = process.env.NEWSDATA_API_KEY;

  if (!anthropicKey && !newsDataKey) {
    throw new Error(
      "No API key set. Add at least NEWSDATA_API_KEY to your .env file (free) — see README.md."
    );
  }

  // Free path: NewsData.io only.
  if (newsDataKey && !anthropicKey) {
    return fetchFreeUrduNews();
  }

  // Best quality: both keys.
  if (newsDataKey && anthropicKey) {
    const raw = await fetchFromNewsData("country=pk&language=ur,en&category=top,business");
    const rawHeadlines = (raw || []).slice(0, 6).map((item) => ({
      sourceTitle: item.title,
      sourceDescription: item.description || "",
      sourceUrl: item.link,
      sourceDate: (item.pubDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    }));
    if (rawHeadlines.length > 0) {
      return rewriteHeadlinesInUrdu(anthropicKey, rawHeadlines);
    }
    // NewsData returned nothing usable this time — fall through to Claude web search.
  }

  // Fallback: Claude web search alone.
  return searchAndWriteUrduNews(anthropicKey);
}

module.exports = { fetchFreshUrduNews };
