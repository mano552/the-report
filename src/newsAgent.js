// The "AI agent" of THE REPORT.
//
// What it does every run (see NEWS_FETCH_CRON in .env, default every 3 hours):
//   1. Pulls fresh headlines for Pakistan from NewsData.io (Urdu + English)
//   2. Skips stories whose source URL is already in the database
//   3. Asks Google Gemini to REWRITE each story in its own words
//      (Urdu stories stay Urdu, English stories stay English) and pick a category
//   4. Uses the SOURCE ARTICLE's original image (from NewsData image_url)
//   5. Saves everything as a DRAFT (or published, if AUTO_PUBLISH=true)
//
// Keys live ONLY here on the server (.env) — never in public/js.
//
// Docs: https://newsdata.io/documentation
//       https://ai.google.dev/gemini-api/docs

const crypto = require("crypto");
const db = require("./db");

const NEWSDATA_URL = "https://newsdata.io/api/1/latest";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// No external image APIs — source article image only

// Categories used by the website filters and the admin panel.
// "general" and "politics" were removed per site restructuring; "international"
// was added. "Latest" and "Trending" are not categories — "Latest" is just the
// default newest-first feed, and "Trending" is the separate `trending` flag
// set automatically below (see markTrending).
const ALLOWED_CATEGORIES = ["business", "technology", "entertainment", "sports", "health", "science", "international", "unique"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every network call gets a time limit. Before, one stuck request (slow network,
// Gemini hanging) kept the agent "working…" forever.
async function fetchWithTimeout(url, opts = {}, ms = 30000) {
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") throw new Error(`timed out after ${ms / 1000}s`);
    throw err;
  }
}

// An error that must stop the WHOLE run (bad key, daily quota used up) —
// retrying the other stories would only waste minutes and give the same error.
class FatalAgentError extends Error {}

let report = () => {}; // progress callback, set by fetchFreshNews()
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

function config() {
  return {
    newsDataKey: process.env.NEWSDATA_API_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
    // images come from source article directly
    // Several models can be listed (comma separated). If one is overloaded (503) or retired (404), the next is tried.
    // GEMINI_MODEL set in .env → use exactly those. Empty → ask Google which models this key can use
    // (see resolveModels). Old names like gemini-2.5-flash are retired for new users.
    models: (process.env.GEMINI_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean),
    perLanguage: num(process.env.MAX_PER_LANGUAGE, 3),
    delayMs: num(process.env.GEMINI_DELAY_MS, 6000),
    deadline: Date.now() + num(process.env.AGENT_MAX_MINUTES, 8) * 60000, // a run never takes longer than this
    deadModels: new Set(), // models whose daily free quota ran out during this run
    status: String(process.env.AUTO_PUBLISH).toLowerCase() === "true" ? "published" : "draft",
  };
}

// ---------- 1) Headlines from NewsData.io ----------

// NewsData.io allows a MAX of 5 values in the category parameter per
// request, so our 7 wanted categories are split into two requests (≤5 each)
// and the results are merged/de-duplicated below.
const CATEGORY_BATCHES = [
  ["top", "business", "technology", "sports", "entertainment"],
  ["health", "world"],
];

async function fetchHeadlinesBatch(apiKey, language, categories) {
  const url =
    `${NEWSDATA_URL}?apikey=${encodeURIComponent(apiKey)}` +
    `&country=pk&language=${language}&category=${categories.join(",")}`;
  let res;
  try {
    res = await fetchWithTimeout(url, {}, 20000);
  } catch (err) {
    throw new Error(`NewsData.io could not be reached: ${err.message}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new FatalAgentError(`NewsData.io rejected the API key (${res.status}). Check NEWSDATA_API_KEY.`);
  }
  if (res.status === 429) {
    throw new FatalAgentError("NewsData.io daily limit reached (free plan: 200 credits/day). Try again tomorrow.");
  }
  if (!res.ok) throw new Error(`NewsData.io error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (data.status !== "success") {
    throw new Error(`NewsData.io returned status "${data.status}": ${JSON.stringify(data.results || data).slice(0, 300)}`);
  }
  return (data.results || []).filter((a) => a.title && a.link);
}

async function fetchHeadlines(apiKey, language) {
  report(`NewsData: fetching ${language === "ur" ? "Urdu" : "English"} headlines…`);
  const seen = new Set();
  const merged = [];
  for (const categories of CATEGORY_BATCHES) {
    const batch = await fetchHeadlinesBatch(apiKey, language, categories);
    for (const article of batch) {
      if (seen.has(article.link)) continue;
      seen.add(article.link);
      merged.push(article);
    }
  }
  return merged;
}

// ---------- 2) Rewrite with Gemini ----------

function systemPrompt(languageName) {
  return `You are a professional news editor for "THE REPORT — A Media Network", a Pakistani media outlet.

You receive ONE news item (source title + description, sometimes more text). Rewrite it completely in your own words, in ${languageName}, as a story that will be published ON OUR OWN WEBSITE.
Rules:
- Do NOT copy sentences from the source. Use different wording and sentence structure.
- Use ONLY facts present in the given source text. Never invent names, numbers, quotes or details.
- If the source is thin, keep the body short (even 1-2 paragraphs) instead of guessing or padding.
- Neutral, clear newsroom tone. Do not mention the source website inside the text.

Return ONLY valid JSON, no markdown fences:
{
  "title": "new headline in ${languageName}",
  "excerpt": "2-3 sentence summary in ${languageName} (about 30-60 words), shown on the news card",
  "body": "the full story in ${languageName}: 2-5 short paragraphs separated by a blank line (\\n\\n), only facts from the source",
  "category": "exactly one of: ${ALLOWED_CATEGORIES.join(", ")}"
}`;
}

// ---------- Which Gemini models can this key use? ----------
// Google retires model names often ("gemini-2.5-flash is no longer available to new users").
// Instead of hard-coding names, ask the API for the list and pick the Flash models.
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];

function rankModel(name) {
  // newer version first, normal Flash before Lite, stable before preview
  const v = parseFloat((name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || "0");
  return v * 100 - (/lite/.test(name) ? 10 : 0) - (/preview|exp/.test(name) ? 5 : 0);
}

async function listFlashModels(apiKey) {
  const res = await fetchWithTimeout(`${GEMINI_BASE}?pageSize=1000`, { headers: { "x-goog-api-key": apiKey } }, 20000);
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new FatalAgentError(`Gemini rejected the API key (${res.status}) — check GEMINI_API_KEY.`);
  }
  if (!res.ok) throw new Error(`model list error ${res.status}`);
  const data = await res.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name).replace(/^models\//, ""))
    .filter((n) => /^gemini-.*flash/.test(n) && !/image|tts|audio|live|thinking|embed|vision|robotics|computer/.test(n));
}

async function resolveModels(cfg) {
  if (cfg.models.length) return; // set by hand in .env
  try {
    const found = await listFlashModels(cfg.geminiKey);
    const versioned = found.filter((n) => /gemini-\d/.test(n)).sort((a, b) => rankModel(b) - rankModel(a));
    // best 4 versioned models + the "-latest" aliases as a last resort
    cfg.models = [...new Set([...versioned.slice(0, 4), ...FALLBACK_MODELS.filter((m) => found.includes(m))])];
    if (!cfg.models.length) cfg.models = FALLBACK_MODELS;
  } catch (err) {
    if (err instanceof FatalAgentError) throw err;
    cfg.models = FALLBACK_MODELS;
  }
  report(`Gemini models to use: ${cfg.models.join(", ")}`);
}

async function callGemini(cfg, language, article) {
  const languageName = language === "ur" ? "Urdu" : "English";
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(languageName) }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Source title: ${article.title}\n` +
              `Source description: ${article.description || "(none)"}\n` +
              (usableContent(article.content) ? `Source text: ${article.content.slice(0, 4000)}\n` : "") +
              `Source name: ${article.source_name || article.source_id || "unknown"}`,
          },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  };

  let lastError;
  const models = cfg.models.filter((m) => !cfg.deadModels.has(m));
  if (models.length === 0) {
    throw new FatalAgentError(
      "No Gemini model is usable right now (" + cfg.models.join(", ") + "): retired or daily free quota used up. " +
        "Run \"npm run check-keys\" to see which models work, then set GEMINI_MODEL in .env, or try again tomorrow."
    );
  }
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      report(`Gemini (${model}) rewriting: "${String(article.title).slice(0, 70)}"${attempt > 1 ? " — retry" : ""}`);
      let res;
      try {
        res = await fetchWithTimeout(
          `${GEMINI_BASE}/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.geminiKey },
            body: JSON.stringify(body),
          },
          60000
        );
      } catch (err) {
        lastError = new Error(`Gemini (${model}) network error: ${err.message}`);
        report(lastError.message);
        await sleep(3000);
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
        if (!text) {
          const why = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "unknown";
          throw new Error(`Gemini returned an empty answer (reason: ${why}) — often the safety filter on crime/violence stories.`);
        }
        // This model works → try it first for the next stories (skips overloaded ones).
        if (cfg.models[0] !== model) cfg.models = [model, ...cfg.models.filter((m) => m !== model)];
        return parseJson(text);
      }

      const raw = await res.text();
      let info = {};
      try { info = JSON.parse(raw).error || {}; } catch {}
      const msg = info.message || raw.slice(0, 200);

      // Bad key / API not enabled → nothing else will work either. Stop the run.
      if (res.status === 400 && /API key|API_KEY/i.test(raw)) {
        throw new FatalAgentError(`Gemini rejected the API key: ${msg.slice(0, 200)} — check GEMINI_API_KEY.`);
      }
      if (res.status === 403) {
        throw new FatalAgentError(`Gemini access denied (403): ${msg.slice(0, 200)}`);
      }

      if (res.status === 404) {
        lastError = new Error(`Gemini model "${model}" is not available (retired?).`);
        cfg.deadModels.add(model);
        report(lastError.message + " Trying the next model.");
        break; // next model
      }

      if (res.status === 429) {
        // Daily quota (or "limit: 0" = this model has no free quota for you) → this model is done for today.
        const daily = /per.?day|PerDay|limit: 0\b/i.test(raw);
        if (daily) {
          lastError = new Error(`Gemini (${model}) free daily quota is used up.`);
          report(lastError.message + " Trying the next model.");
          cfg.deadModels.add(model);
          break; // next model
        }
        // Per-minute limit → wait what Google asks (RetryInfo), max 60s, then retry once.
        const retry = (info.details || []).find((d) => d.retryDelay)?.retryDelay;
        const waitMs = Math.min(60000, retry ? Math.ceil(parseFloat(retry) * 1000) + 1000 : 20000);
        lastError = new Error(`Gemini (${model}) rate limit (429).`);
        report(`${lastError.message} Waiting ${Math.round(waitMs / 1000)}s…`);
        await sleep(waitMs);
        continue;
      }

      if (res.status >= 500) {
        lastError = new Error(`Gemini (${model}) busy (${res.status}): ${msg.slice(0, 120)}`);
        if (attempt === 1) { report(lastError.message + " Retrying in 5s…"); await sleep(5000); continue; }
        report(lastError.message + " Trying the next model.");
        break; // overloaded twice → next model instead of waiting more
      }

      throw new Error(`Gemini (${model}) error ${res.status}: ${msg.slice(0, 300)}`);
    }
  }
  throw lastError || new Error("Gemini failed");
}

// NewsData free plan sends "ONLY AVAILABLE IN PAID PLANS" instead of the article text.
function usableContent(c) {
  return typeof c === "string" && c.length > 200 && !/ONLY AVAILABLE IN/i.test(c);
}

function parseJson(text) {
  let cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // Sometimes the model adds a sentence before/after the JSON — keep only the {...} part.
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first > 0 || (last !== -1 && last < cleaned.length - 1)) cleaned = cleaned.slice(first, last + 1);
  let obj = JSON.parse(cleaned);
  if (Array.isArray(obj)) obj = obj[0]; // model occasionally wraps the object in an array
  if (!obj || !obj.title || !obj.excerpt) throw new Error("Gemini JSON is missing title/excerpt.");
  return obj;
}

// ---------- 3) Media: source article image + video ----------

function getSourceImage(article) {
  const img = article.image_url || article.urlToImage || null;
  if (img && /^https?:\/\//i.test(String(img))) return img;
  return null;
}

function getSourceVideo(article) {
  const vid = article.video_url || null;
  if (vid && /^https?:\/\//i.test(String(vid))) return vid;
  return null;
}

// ---------- 4) Put it together ----------

async function processLanguage(cfg, language, knownUrls, errors, notes) {
  const headlines = await fetchHeadlines(cfg.newsDataKey, language);
  // If a category filter was requested, apply it
  let filtered = headlines;
  if (cfg.categoryFilter) {
    const catMap = { international: "world", business: "business", technology: "technology", entertainment: "entertainment", sports: "sports", health: "health", science: "science" };
    const ndCat = catMap[cfg.categoryFilter] || cfg.categoryFilter;
    filtered = headlines.filter((a) => {
      const cats = Array.isArray(a.category) ? a.category : [a.category];
      return cats.some(c => String(c).toLowerCase() === ndCat || String(c).toLowerCase() === cfg.categoryFilter);
    });
    if (filtered.length === 0) filtered = headlines; // fallback to all if filter returns nothing
  }
  // Recency: always rewrite the MOST RECENTLY PUBLISHED headlines first, not
  // just whatever order the API returned. So if it's 8:26 PM and a headline
  // was published at 8:00 PM, that is picked before an older one from
  // yesterday, even if NewsData listed it lower.
  const withTime = filtered
    .filter((a) => !knownUrls.has(a.link))
    .map((a) => ({ a, t: Date.parse(a.pubDate ? a.pubDate.replace(" ", "T") + "Z" : "") || 0 }))
    .sort((x, y) => y.t - x.t);
  const fresh = withTime.slice(0, cfg.perLanguage).map((x) => x.a);
  report(`NewsData: ${headlines.length} ${language === "ur" ? "Urdu" : "English"} headline(s), ${fresh.length} new to rewrite (newest first).`);
  const records = [];
  if (fresh.length === 0) {
    notes.push(`${language}: NewsData returned ${headlines.length} headline(s), all already saved — nothing new right now.`);
  }

  for (const article of fresh) {
    if (Date.now() > cfg.deadline) {
      notes.push(`Stopped early: the run reached its time limit (AGENT_MAX_MINUTES). The rest will be picked up next run.`);
      break;
    }
    try {
      // IMAGE REQUIRED: if the source article (NewsData) has no real image,
      // skip this story entirely — the agent must not publish image-less
      // news. We check this BEFORE calling Gemini so we don't waste the
      // free Gemini quota rewriting a story we're about to throw away.
      const image = getSourceImage(article);
      if (!image) {
        notes.push(`Skipped (no image available): "${String(article.title).slice(0, 70)}"`);
        report(`Skipped (no image from source): "${String(article.title).slice(0, 70)}"`);
        knownUrls.add(article.link); // don't retry the same image-less story every run
        continue;
      }

      const ai = await callGemini(cfg, language, article);
      const video = getSourceVideo(article);
      // Use the requested date or article's date
      const useDate = cfg.dateOverride || (article.pubDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
      // TRENDING: auto-flag very recent headlines (published within the last
      // 3 hours of this run) so they show up under the site's "Trending" tab.
      const pubMs = Date.parse(article.pubDate ? article.pubDate.replace(" ", "T") + "Z" : "") || 0;
      const trending = pubMs > 0 && Date.now() - pubMs <= 3 * 60 * 60 * 1000;
      records.push({
        id: crypto.randomUUID(),
        title: String(ai.title).trim(),
        excerpt: String(ai.excerpt).trim(),
        body: String(ai.body || ai.excerpt).trim(),
        category: ALLOWED_CATEGORIES.includes(String(ai.category).toLowerCase()) ? String(ai.category).toLowerCase() : "international",
        language: language === "ur" ? "urdu" : "english",
        date: useDate,
        sourceUrl: article.link,
        sourceName: article.source_name || article.source_id || null,
        image,
        video,
        featured: false,
        trending,
        status: cfg.status,
        createdBy: "ai-gemini",
      });
      knownUrls.add(article.link);
      report(`Saved: "${String(ai.title).slice(0, 70)}"${trending ? " 🔥 trending" : ""}`);
    } catch (err) {
      if (err instanceof FatalAgentError) throw err;
      errors.push(`${article.link}: ${err.message}`);
      report(`Skipped one story: ${err.message}`);
      console.error("Skipped one story:", err.message);
    }
    if (article !== fresh[fresh.length - 1]) await sleep(cfg.delayMs);
  }
  return records;
}

/**
 * Returns freshly written story records, ready for db.addManyNews().
 * @param {Function} onProgress - callback for status updates
 * @param {Object} options - { language: "urdu"|"english"|"both", category: "", date: "" }
 */
async function fetchFreshNews(onProgress, options = {}) {
  report = typeof onProgress === "function" ? onProgress : (m) => console.log("[agent]", m);
  const cfg = config();
  if (!cfg.newsDataKey) throw new Error("NEWSDATA_API_KEY is missing in .env");
  if (!cfg.geminiKey) {
    throw new Error("GEMINI_API_KEY is missing in .env (needed to rewrite stories; raw copies are never published).");
  }

  // Apply options
  if (options.category) cfg.categoryFilter = options.category;
  if (options.date) cfg.dateOverride = options.date;

  await resolveModels(cfg);

  const knownUrls = new Set((await db.getAllNewsIncludingDrafts()).map((n) => n.sourceUrl).filter(Boolean));
  const errors = [];
  const notes = [];
  const all = [];

  // Determine which languages to process
  let languages = ["ur", "en"]; // default: both
  if (options.language === "urdu") languages = ["ur"];
  else if (options.language === "english") languages = ["en"];

  for (const language of languages) {
    if (Date.now() > cfg.deadline) break;
    try {
      all.push(...(await processLanguage(cfg, language, knownUrls, errors, notes)));
    } catch (err) {
      if (err instanceof FatalAgentError) {
        if (all.length) { all.errors = [...errors, err.message]; all.notes = notes; return all; }
        throw err;
      }
      errors.push(`${language}: ${err.message}`);
      console.error(`News run for "${language}" failed:`, err.message);
    }
  }

  if (all.length === 0 && errors.length > 0) throw new Error(errors.join(" | "));
  if (errors.length) console.warn(`Finished with ${errors.length} problem(s):`, errors);
  all.errors = errors;
  all.notes = notes;
  return all;
}

// Old name kept so server.js / manualFetch.js / routes keep working.
module.exports = { fetchFreshNews, fetchFreshUrduNews: fetchFreshNews, listFlashModels, rankModel };