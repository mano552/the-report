require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const path = require("path");

const newsRoutes = require("./src/routes/news");
const db = require("./src/db");
const { startRun } = require("./src/agentRunner");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// 15mb: the admin panel sends uploaded images as base64 inside JSON.
// The default (100kb) rejected almost every photo with "413 Payload Too Large".
app.use(express.json({ limit: "15mb" }));

// --- API ---
app.use("/api/news", newsRoutes);

// --- Static frontend (public/index.html, css, js, assets) ---
app.use(express.static(path.join(__dirname, "public")));

// --- Story pages ON OUR SITE: /news/<id> ---
// Serves the normal index.html, but with the story's title/description/image in
// the <head> so WhatsApp/Facebook link previews look right. app.js then shows
// the full story. Also /urdu, /english, /services open those sections directly.
const INDEX_HTML = path.join(__dirname, "public", "index.html");
const escHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

app.get("/news/:id", (req, res) => {
  const item = db.getNewsById(req.params.id);
  let html = fs.readFileSync(INDEX_HTML, "utf-8");
  if (item && db.isPublished(item)) {
    const meta =
      `<meta property="og:type" content="article">\n` +
      `<meta property="og:title" content="${escHtml(item.title)}">\n` +
      `<meta property="og:description" content="${escHtml(item.excerpt)}">\n` +
      (item.image && /^https?:/.test(item.image) ? `<meta property="og:image" content="${escHtml(item.image)}">\n` : "") +
      `<meta name="description" content="${escHtml(item.excerpt)}">\n`;
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(item.title)} — THE REPORT</title>`)
      .replace("</head>", meta + "</head>");
  } else {
    res.status(404); // the page still loads and shows "story not found"
  }
  res.type("html").send(html);
});

["/urdu", "/english", "/services"].forEach((p) => app.get(p, (req, res) => res.sendFile(INDEX_HTML)));

// --- Admin panel route (without .html extension) ---
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`THE REPORT server running: http://localhost:${PORT}`);
});

// --- Automatic Urdu news fetching ---
// Runs on the schedule set in NEWS_FETCH_CRON (.env). Default: every 3 hours.
// This is what makes the News page "reflect new news automatically" —
// no one has to log in and paste anything in; the agent does it.
let cronExpr = process.env.NEWS_FETCH_CRON || "0 */3 * * *";
if (!cron.validate(cronExpr)) {
  console.warn(`NEWS_FETCH_CRON "${cronExpr}" is not a valid cron expression — using every 3 hours.`);
  cronExpr = "0 */3 * * *";
}

// Always scheduled; if keys are missing the run just reports an error in /admin.
cron.schedule(cronExpr, () => {
  if (!startRun("cron")) console.log("Scheduled run skipped: the agent is already running.");
});
console.log(`Auto news fetch scheduled: "${cronExpr}"`);
if (!process.env.NEWSDATA_API_KEY || !process.env.GEMINI_API_KEY) {
  console.warn("NEWSDATA_API_KEY and/or GEMINI_API_KEY missing — the AI agent will fail until you add them (both free).");
}
if (!process.env.ADMIN_KEY) console.warn("ADMIN_KEY missing — the admin panel cannot log in.");
