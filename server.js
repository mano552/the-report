require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const path = require("path");

const newsRoutes = require("./src/routes/news");
const db = require("./src/db");
const { fetchFreshUrduNews } = require("./src/newsAgent");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- API ---
app.use("/api/news", newsRoutes);

// --- Static frontend (public/index.html, css, js, assets) ---
app.use(express.static(path.join(__dirname, "public")));

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
const cronExpr = process.env.NEWS_FETCH_CRON || "0 */3 * * *";

const hasAnyNewsKey = process.env.NEWSDATA_API_KEY || process.env.ANTHROPIC_API_KEY;

if (hasAnyNewsKey) {
  cron.schedule(cronExpr, async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled news fetch...`);
    try {
      const items = await fetchFreshUrduNews();
      const added = db.addManyNews(items);
      console.log(`Fetched ${items.length}, added ${added.length} new stories.`);
    } catch (err) {
      console.error("Scheduled news fetch failed:", err.message);
    }
  });
  console.log(`Auto news fetch scheduled: "${cronExpr}"`);
} else {
  console.warn(
    "No NEWSDATA_API_KEY or ANTHROPIC_API_KEY set — automatic news fetching is disabled. Add at least NEWSDATA_API_KEY (free) to .env to enable."
  );
}
