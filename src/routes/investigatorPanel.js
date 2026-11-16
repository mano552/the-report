// The Investigator panel: /investigator-panel
// Same design as the author panels (authorPanel.js): its OWN password (INVESTIGATOR_KEY
// in .env, never in code), and it can only see / add / edit / delete Investigator news.
// The old /admin panels and the author panels are untouched.
//
// News added here is saved with created_by = "investigator", so it shows ONLY on the
// Investigator page (see db.getNewsPage + public/js/app.js), not on the English/Urdu pages.
const express = require("express");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();

const TAG = "investigator";
const CATEGORIES = [
  "trending", "health", "crime", "politics", "support", "education",
  "business", "sports", "international", "technology", "entertainment", "general",
];

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

function requireInvestigator(req, res, next) {
  const ip = req.ip;
  if (tooManyFails(ip)) return res.status(429).json({ error: "Too many wrong attempts. Try again in 15 minutes." });
  const key = req.header("x-investigator-key") || "";
  const expected = process.env.INVESTIGATOR_KEY;
  if (!expected || !key || !safeEqual(key, expected)) {
    noteFail(ip);
    return res.status(401).json({ error: "Wrong password." });
  }
  next();
}

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error("[api/investigator] error:", err.message);
    res.status(500).json({ error: "Database error: " + err.message });
  });

// featured stays off (that controls the home page). Trending follows the category.
const EDITABLE = [
  "title", "excerpt", "body", "category", "language", "date", "sourceUrl", "image", "video", "status",
  "reporterName", "reporterPhoto",
];

const isImage = (v) =>
  typeof v === "string" && (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v) || /^https?:\/\//i.test(v));

async function ownItem(req) {
  const item = await db.getNewsById(req.params.id);
  return item && item.createdBy === TAG ? item : null;
}

router.get("/me", requireInvestigator, (req, res) => res.json({ name: "The Investigator" }));

router.get("/news", requireInvestigator, wrap(async (req, res) => {
  const all = await db.getAllNewsIncludingDrafts();
  res.json({ news: all.filter((n) => n.createdBy === TAG) });
}));

// one story (full, raw image) — in case the shared edit screen asks for it
router.get("/news/:id", requireInvestigator, wrap(async (req, res) => {
  const item = await ownItem(req);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.set("Cache-Control", "no-store");
  res.json(item);
}));

router.post("/news", requireInvestigator, wrap(async (req, res) => {
  const { title, excerpt, body, category, language, date, sourceUrl, image, video, status, reporterName, reporterPhoto } = req.body || {};

  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
  const text = String(body || excerpt || "").trim();
  if (!text) return res.status(400).json({ error: "Story is required." });
  if (language !== "english" && language !== "urdu") return res.status(400).json({ error: "Choose Urdu or English." });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: "Choose a valid category." });
  if (!isImage(image) || image.length > 9 * 1024 * 1024) return res.status(400).json({ error: "News image is required (valid and not too large)." });
  if (!reporterName || !String(reporterName).trim()) return res.status(400).json({ error: "Reporter name is required." });
  if (!isImage(reporterPhoto) || reporterPhoto.length > 400 * 1024) return res.status(400).json({ error: "Reporter photo is required (valid and small)." });
  const when = new Date(date);
  if (!date || isNaN(when)) return res.status(400).json({ error: "Date and time are required." });

  const saved = await db.addNews({
    id: crypto.randomUUID(),
    title: String(title).trim().slice(0, 300),
    excerpt: String(excerpt || text.replace(/\s+/g, " ")).slice(0, 400),
    body: text,
    category,
    language,
    date: when.toISOString(), // full date + time
    sourceUrl: sourceUrl || null,
    image,
    video: video || null,
    featured: false,
    trending: category === "trending",
    status: status === "draft" ? "draft" : "published",
    createdBy: TAG,
    reporterName: String(reporterName).trim().slice(0, 80),
    reporterPhoto,
  });
  res.status(201).json(saved);
}));

router.put("/news/:id", requireInvestigator, wrap(async (req, res) => {
  if (!(await ownItem(req))) return res.status(404).json({ error: "Not found" });
  const updates = {};
  for (const k of EDITABLE) if (req.body && k in req.body) updates[k] = req.body[k];
  if ("category" in updates) {
    if (!CATEGORIES.includes(updates.category)) return res.status(400).json({ error: "Choose a valid category." });
    updates.trending = updates.category === "trending";
  }
  if ("language" in updates && updates.language !== "english" && updates.language !== "urdu") delete updates.language;
  if ("image" in updates && !isImage(updates.image) && !/^\/api\/news\/[^/]+\/image$/.test(String(updates.image))) {
    return res.status(400).json({ error: "News image is invalid." });
  }
  if ("reporterPhoto" in updates && updates.reporterPhoto && !isImage(updates.reporterPhoto)) delete updates.reporterPhoto;
  if ("reporterName" in updates && !String(updates.reporterName || "").trim()) delete updates.reporterName;
  res.json(await db.updateNews(req.params.id, updates));
}));

router.delete("/news/:id", requireInvestigator, wrap(async (req, res) => {
  if (!(await ownItem(req))) return res.status(404).json({ error: "Not found" });
  await db.deleteNews(req.params.id);
  res.json({ deleted: true });
}));

module.exports = router;
