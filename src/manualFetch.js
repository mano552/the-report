// Run this directly with: npm run fetch-news
// Useful for testing your GEMINI_API_KEY and NEWSDATA_API_KEY without starting the whole server.
require("dotenv").config();
const db = require("./db");
const { fetchFreshNews } = require("./newsAgent");

(async () => {
  console.log("Asking the AI agent for fresh Urdu + English news...");
  try {
    const items = await fetchFreshNews();
    const added = db.addManyNews(items);
    console.log(`Fetched ${items.length} stories, ${added.length} were new and saved.`);
    added.forEach((n) => console.log(" -", n.title));
    (items.notes || []).forEach((m) => console.log("note:", m));
    (items.errors || []).forEach((m) => console.warn("skipped:", m));
  } catch (err) {
    console.error("Failed:", err.message);
    process.exit(1);
  }
})();
