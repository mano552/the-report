// Separate panels for each author: /haider, /adeel, /babar, /jabbar
// Each author has their OWN password (set in .env, never in code) and can only
// see / add / edit / delete THEIR OWN news. The old /admin panels are untouched.
//
// News added here is saved with created_by = "author:<profile-slug>", so it
// automatically shows on that author's profile page (see public/js/app.js).
const express = require("express");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();

// panel slug (URL)  ->  profile slug (used on the website) + env var for password
const AUTHORS = {
  haider: { profile: "haider-munir", name: "Haider Munir", env: "AUTHOR_KEY_HAIDER" },
  adeel: { profile: "adeel-shah", name: "Syed Adeel Asghar Shah", env: "AUTHOR_KEY_ADEEL" },
  babar: { profile: "babar-aladdin", name: "Brigadier Babar Ala-ud-Din", env: "AUTHOR_KEY_BABAR" },
  jabbar: { profile: "abdul-jabbar-bhatti", name: "Abdul Jabbar Bhatti", env: "AUTHOR_KEY_JABBAR" },
};

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

// Very small brute-force guard: 10 wrong tries per IP per 15 minutes.
const fails = new Map();
function tooManyFails(ip) {
  const f = fails.get(ip);
  return f && f.count >= 10 && Date.now() - f.first < 15 * 60 * 1000;
}
function noteFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.first > 15 * 60 * 1000) fails.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}

function requireAuthor(req, res, next) {
  const ip = req.ip;
  if (tooManyFails(ip)) return res.status(429).json({ error: "Too many wrong attempts. Try again in 15 minutes." });
  const slug = String(req.header("x-author-slug") || "").toLowerCase();
  const key = req.header("x-author-key") || "";
  const author = AUTHORS[slug];
  const expected = author && process.env[author.env];
  if (!author || !expected || !key || !safeEqual(key, expected)) {
    noteFail(ip);
    return res.status(401).json({ error: "Wrong password." });
  }
  req.author = { slug, ...author, tag: "author:" + author.profile };
  next();
}

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error("[api/author] error:", err.message);
    res.status(500).json({ error: "Database error: " + err.message });
  });

// Authors may NOT change featured/trending (those control the home page).
const EDITABLE = ["title", "excerpt", "body", "category", "language", "date", "sourceUrl", "image", "video", "status"];

async function ownItem(req) {
  const item = await db.getNewsById(req.params.id);
  return item && item.createdBy === req.author.tag ? item : null;
}

router.get("/me", requireAuthor, (req, res) => res.json({ slug: req.author.slug, name: req.author.name }));

router.get("/news", requireAuthor, wrap(async (req, res) => {
  const all = await db.getAllNewsIncludingDrafts();
  res.json({ news: all.filter((n) => n.createdBy === req.author.tag) });
}));

router.post("/news", requireAuthor, wrap(async (req, res) => {
  const { title, excerpt, body, category, language, date, sourceUrl, image, video, status } = req.body || {};
  if (!title || !excerpt) return res.status(400).json({ error: "title and excerpt are required" });
  const saved = await db.addNews({
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
    featured: false,
    trending: false,
    status: status === "draft" ? "draft" : "published",
    createdBy: req.author.tag,
  });
  res.status(201).json(saved);
}));

router.put("/news/:id", requireAuthor, wrap(async (req, res) => {
  if (!(await ownItem(req))) return res.status(404).json({ error: "Not found" });
  const updates = {};
  for (const k of EDITABLE) if (req.body && k in req.body) updates[k] = req.body[k];
  res.json(await db.updateNews(req.params.id, updates));
}));

router.delete("/news/:id", requireAuthor, wrap(async (req, res) => {
  if (!(await ownItem(req))) return res.status(404).json({ error: "Not found" });
  await db.deleteNews(req.params.id);
  res.json({ deleted: true });
}));

module.exports = router;
module.exports.AUTHORS = AUTHORS;
