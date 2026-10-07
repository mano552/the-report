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
const EDITABLE = ["title", "excerpt", "body", "category", "language", "date", "sourceUrl", "image", "video", "featured", "status"];

// GET /api/news  — public, used by the website's News page
// Visitors only get PUBLISHED stories. The admin panel sends x-admin-key and
// gets drafts too.
router.get("/", (req, res) => {
  res.json({ news: isAdmin(req) ? db.getAllNewsIncludingDrafts() : db.getAllNews() });
});

// --- AI agent (admin only) ---
// POST /api/news/fetch/run  — starts the agent in the background, returns at once (202)
// GET  /api/news/fetch/status — progress / result of the latest run
// (Also runs on the cron schedule automatically — see server.js)
router.post("/fetch/run", requireAdmin, (req, res) => {
  if (!startRun("manual")) {
    return res.status(409).json({ error: "The agent is already running. Wait a minute.", status: getStatus() });
  }
  res.status(202).json({ started: true, status: getStatus() });
});

router.get("/fetch/status", requireAdmin, (req, res) => {
  res.json(getStatus());
});

// GET /api/news/:id
router.get("/:id", (req, res) => {
  const item = db.getNewsById(req.params.id);
  if (!item || (!db.isPublished(item) && !isAdmin(req))) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

// POST /api/news  — manually add a story (admin panel uses this)
router.post("/", requireAdmin, (req, res) => {
  const { title, excerpt, body, category, language, date, sourceUrl, image, video, featured, status } = req.body || {};
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
    status: status === "draft" ? "draft" : "published",
    createdBy: "manual",
  };
  db.addNews(item);
  res.status(201).json(item);
});

// PUT /api/news/:id — edit
router.put("/:id", requireAdmin, (req, res) => {
  const updates = {};
  for (const k of EDITABLE) if (req.body && k in req.body) updates[k] = req.body[k];
  const updated = db.updateNews(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

// DELETE /api/news/:id
router.delete("/:id", requireAdmin, (req, res) => {
  const ok = db.deleteNews(req.params.id);
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ deleted: true });
});

module.exports = router;
