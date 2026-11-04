const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { startRun, getStatus } = require("../agentRunner");

const router = express.Router();

// Simple shared-secret auth for write actions. Fine for a small site run by
// one team; swap for real user accounts/JWT if you add multiple admins.
function isAdmin(req) {
  const key = req.header("x-admin-key");
  return Boolean(process.env.ADMIN_KEY) && key === process.env.ADMIN_KEY;
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized. Missing or wrong x-admin-key header." });
  }
  next();
}

// Only these fields may be changed through PUT (stops overwriting id/createdBy etc.)
const EDITABLE = ["title", "excerpt", "body", "category", "language", "date", "sourceUrl", "image", "video", "featured", "trending", "status"];

// Wrap async route handlers so a thrown/rejected error becomes a clean 500
// instead of crashing the process.
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
  console.error("[api/news] error:", err.message);
  res.status(500).json({ error: "Database error: " + err.message });
});

// ---------- tiny in-memory cache for the public list ----------
// Same page requested by many visitors = ONE database query per 30 seconds.
// Any write (add/edit/delete/agent run) bumps db.getVersion(), which empties it.
const listCache = new Map();
const LIST_TTL_MS = 30 * 1000;
let listCacheVersion = -1;
function cacheGet(key) {
  if (listCacheVersion !== db.getVersion()) { listCache.clear(); listCacheVersion = db.getVersion(); }
  const hit = listCache.get(key);
  return hit && Date.now() - hit.t < LIST_TTL_MS ? hit.v : null;
}
function cacheSet(key, v) {
  if (listCache.size > 300) listCache.clear();
  listCache.set(key, { t: Date.now(), v });
}

// GET /api/news  — public, used by the website's News pages (PAGINATED)
//   ?language=urdu|english  &category=sports|trending|...  &q=search words
//   &author=<profile-slug>  &limit=20 (max 100)  &page=1
// Returns { news: [...], page, limit, hasMore }. List items have NO "body".
//
// The admin panels call this WITHOUT "limit"/"page" but WITH x-admin-key and
// still receive the full list incl. drafts, exactly as before.
router.get("/", wrap(async (req, res) => {
  const wantsPaging = "limit" in req.query || "page" in req.query || "language" in req.query;
  if (isAdmin(req) && !wantsPaging) {
    res.set("Cache-Control", "no-store");
    return res.json({ news: await db.getAllNewsIncludingDrafts() });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const params = {
    language: ["urdu", "english"].includes(req.query.language) ? req.query.language : undefined,
    category: req.query.category ? String(req.query.category).slice(0, 40) : undefined,
    q: req.query.q ? String(req.query.q).slice(0, 100) : undefined,
    author: req.query.author ? String(req.query.author).slice(0, 60) : undefined,
    limit,
    offset: (page - 1) * limit,
  };
  const key = JSON.stringify(params);
  let out = cacheGet(key);
  if (!out) {
    const r = await db.getNewsPage(params);
    out = { news: r.items, page, limit, hasMore: r.hasMore };
    cacheSet(key, out);
  }
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  res.json(out);
}));

// --- AI agent (admin only) ---
// POST /api/news/fetch/run  — starts the agent in the background, returns at once (202)
// GET  /api/news/fetch/status — progress / result of the latest run
// (Also runs on the cron schedule automatically — see server.js)
router.post("/fetch/run", requireAdmin, (req, res) => {
  const options = {};
  if (req.body?.language) options.language = req.body.language;
  if (req.body?.category) options.category = req.body.category;
  if (req.body?.date) options.date = req.body.date;
  if (!startRun("manual", options)) {
    return res.status(409).json({ error: "The agent is already running. Wait a minute.", status: getStatus() });
  }
  res.status(202).json({ started: true, status: getStatus() });
});

router.get("/fetch/status", requireAdmin, (req, res) => {
  res.json(getStatus());
});

// GET /api/news/:id/image — serves a base64 image stored in the database as a
// real image file, so the browser can cache it (and the list stays small).
router.get("/:id/image", wrap(async (req, res) => {
  const row = await db.getNewsImage(req.params.id);
  const m = row && /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/s.exec(row.image || "");
  if (!m || ((row.status || "published") !== "published" && !isAdmin(req))) return res.status(404).end();
  res.set("Content-Type", m[1]);
  res.set("Cache-Control", "public, max-age=604800, immutable");
  res.send(Buffer.from(m[2], "base64"));
}));

// GET /api/news/:id
router.get("/:id", wrap(async (req, res) => {
  const item = await db.getNewsById(req.params.id);
  if (!item || (!db.isPublished(item) && !isAdmin(req))) return res.status(404).json({ error: "Not found" });
  // Public visitors get inline (base64) images as a cacheable URL; the admin
  // edit form still gets the raw value so saving never corrupts the image.
  if (!isAdmin(req) && typeof item.image === "string" && item.image.startsWith("data:")) {
    item.image = `/api/news/${encodeURIComponent(item.id)}/image`;
  }
  res.set("Cache-Control", isAdmin(req) ? "no-store" : "public, max-age=30, stale-while-revalidate=120");
  res.json(item);
}));

// POST /api/news  — manually add a story (admin panel uses this)
router.post("/", requireAdmin, wrap(async (req, res) => {
  const { title, excerpt, body, category, language, date, sourceUrl, image, video, featured, trending, status } = req.body || {};
  if (!title || !excerpt) {
    return res.status(400).json({ error: "title and excerpt are required" });
  }
  const item = {
    id: crypto.randomUUID(),
    title,
    excerpt,
    body: body || excerpt,
    category: category || "general",
    language: language || "urdu",
    date: date || new Date().toISOString().slice(0, 10),
    sourceUrl: sourceUrl || null,
    image: image || null,
    video: video || null,
    featured: Boolean(featured),
    trending: Boolean(trending),
    status: status === "draft" ? "draft" : "published",
    createdBy: "manual",
  };
  const saved = await db.addNews(item);
  res.status(201).json(saved);
}));

// PUT /api/news/:id — edit
router.put("/:id", requireAdmin, wrap(async (req, res) => {
  const updates = {};
  for (const k of EDITABLE) if (req.body && k in req.body) updates[k] = req.body[k];
  const updated = await db.updateNews(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
}));

// DELETE /api/news/:id
router.delete("/:id", requireAdmin, wrap(async (req, res) => {
  const ok = await db.deleteNews(req.params.id);
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ deleted: true });
}));

module.exports = router;
