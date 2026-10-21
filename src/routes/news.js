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

// GET /api/news  — public, used by the website's News page
// Visitors only get PUBLISHED stories. The admin panel sends x-admin-key and
// gets drafts too.
router.get("/", wrap(async (req, res) => {
  res.json({ news: isAdmin(req) ? await db.getAllNewsIncludingDrafts() : await db.getAllNews() });
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

// GET /api/news/:id
router.get("/:id", wrap(async (req, res) => {
  const item = await db.getNewsById(req.params.id);
  if (!item || (!db.isPublished(item) && !isAdmin(req))) return res.status(404).json({ error: "Not found" });
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
