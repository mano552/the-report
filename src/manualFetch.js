// Run this directly with: npm run fetch-news
// Useful for testing your ANTHROPIC_API_KEY without starting the whole server.
require("dotenv").config();
const db = require("./db");
const { fetchFreshUrduNews } = require("./newsAgent");

(async () => {
  console.log("Asking the AI agent for fresh Urdu news...");
  try {
    const items = await fetchFreshUrduNews();
    const added = db.addManyNews(items);
    console.log(`Fetched ${items.length} stories, ${added.length} were new and saved.`);
    added.forEach((n) => console.log(" -", n.title));
  } catch (err) {
    console.error("Failed:", err.message);
    process.exit(1);
  }
})();
