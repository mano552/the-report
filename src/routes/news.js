const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { fetchFreshUrduNews } = require("../newsAgent");

const router = express.Router();

// Simple shared-secret auth for write actions. Fine for a small site run by
// one team; swap for real user accounts/JWT if you add multiple admins.
function requireAdmin(req, res, next) {
  const key = req.header("x-admin-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized. Missing or wrong x-admin-key header." });
  }
  next();
}

// GET /api/news  — public, used by the website's News page
router.get("/", (req, res) => {
  res.json({ news: db.getAllNews() });
});

// GET /api/news/:id
router.get("/:id", (req, res) => {
  const item = db.getNewsById(req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

// POST /api/news  — manually add a story (admin panel uses this)
router.post("/", requireAdmin, (req, res) => {
  const { title, excerpt, category, language, date, sourceUrl, image, featured } = req.body || {};
  if (!title || !excerpt) {
    return res.status(400).json({ error: "title and excerpt are required" });
  }
  const item = {
    id: crypto.randomUUID(),
    title,
    excerpt,
    category: category || "general",
    language: language || "urdu",
    date: date || new Date().toISOString().slice(0, 10),
    sourceUrl: sourceUrl || null,
    image: image || null,
    featured: Boolean(featured),
    createdBy: "manual",
  };
  db.addNews(item);
  res.status(201).json(item);
});

// PUT /api/news/:id — edit
router.put("/:id", requireAdmin, (req, res) => {
  const updated = db.updateNews(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

// DELETE /api/news/:id
router.delete("/:id", requireAdmin, (req, res) => {
  const ok = db.deleteNews(req.params.id);
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ deleted: true });
});

// POST /api/news/fetch/run — trigger the AI agent on demand (also runs on
// the cron schedule automatically — see server.js)
router.post("/fetch/run", requireAdmin, async (req, res) => {
  try {
    const items = await fetchFreshUrduNews();
    const added = db.addManyNews(items);
    res.json({ fetched: items.length, added: added.length, items: added });
  } catch (err) {
    console.error("AI news fetch failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
