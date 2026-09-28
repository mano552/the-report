// A tiny file-based database. No native modules, no separate DB server to
// install — just a JSON file on disk. Good enough for a news list of a few
// hundred/thousand items. If this site grows a lot, swap this module out
// for real Postgres/MySQL later without touching the routes much.

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "news.json");

function ensureDbFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ news: [] }, null, 2), "utf-8");
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("news.json is corrupted, resetting to empty.", err);
    return { news: [] };
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function getAllNews() {
  const data = readDb();
  // newest first
  return [...data.news].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function getNewsById(id) {
  const data = readDb();
  return data.news.find((n) => n.id === id) || null;
}

function addNews(item) {
  const data = readDb();
  data.news.unshift(item);
  writeDb(data);
  return item;
}

function addManyNews(items) {
  const data = readDb();
  const existingTitles = new Set(data.news.map((n) => n.title.trim().toLowerCase()));
  const fresh = items.filter((n) => !existingTitles.has(n.title.trim().toLowerCase()));
  data.news = [...fresh, ...data.news];
  writeDb(data);
  return fresh;
}

function updateNews(id, updates) {
  const data = readDb();
  const idx = data.news.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  data.news[idx] = { ...data.news[idx], ...updates };
  writeDb(data);
  return data.news[idx];
}

function deleteNews(id) {
  const data = readDb();
  const before = data.news.length;
  data.news = data.news.filter((n) => n.id !== id);
  writeDb(data);
  return data.news.length < before;
}

module.exports = {
  getAllNews,
  getNewsById,
  addNews,
  addManyNews,
  updateNews,
  deleteNews,
};
