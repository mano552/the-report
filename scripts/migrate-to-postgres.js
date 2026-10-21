// One-time import: moves everything from the old data/news.json file into
// PostgreSQL. Run this ONCE after setting DATABASE_URL in .env:
//
//   npm run migrate-db
//
// Safe to run more than once — stories that already exist in Postgres
// (same id) are skipped, nothing is duplicated or overwritten.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const db = require("../src/db");

const JSON_PATH = path.join(__dirname, "..", "data", "news.json");
const BACKUP_PATH = path.join(__dirname, "..", "data", "news.backup.json");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is not set in .env. Add it first, then re-run this script.");
    process.exit(1);
  }

  const source = fs.existsSync(JSON_PATH) ? JSON_PATH : fs.existsSync(BACKUP_PATH) ? BACKUP_PATH : null;
  if (!source) {
    console.log("No data/news.json or news.backup.json found — nothing to migrate. Starting with an empty database.");
    await db.ready();
    process.exit(0);
  }

  const raw = JSON.parse(fs.readFileSync(source, "utf-8"));
  const items = raw.news || [];
  console.log(`Found ${items.length} stories in ${path.basename(source)}. Importing into PostgreSQL...`);

  await db.ready();
  let imported = 0, skipped = 0, failed = 0;
  for (const item of items) {
    try {
      const existing = await db.getNewsById(item.id);
      if (existing) { skipped++; continue; }
      await db.addNews(item);
      imported++;
    } catch (err) {
      failed++;
      console.warn(`  ⚠️ Could not import "${(item.title || "").slice(0, 50)}": ${err.message}`);
    }
  }

  console.log(`\n✅ Done. Imported: ${imported}, already existed (skipped): ${skipped}, failed: ${failed}.`);
  console.log("From now on, both localhost and the live site read/write the SAME PostgreSQL database.");
  process.exit(0);
})();
