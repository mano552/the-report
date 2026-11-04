// PostgreSQL-backed database for THE REPORT.
//
// WHY THIS REPLACED THE OLD data/news.json FILE:
// A JSON file lives on the server's local disk. Every time you `git push` to
// deploy, the hosting platform rebuilds/redeploys the app from git — and the
// local disk (including data/news.json) gets wiped or replaced. That's why
// news added/generated on one place (localhost or live) used to disappear
// after a deploy. PostgreSQL is a separate, persistent database: localhost
// and the live site both connect to the SAME database (same DATABASE_URL),
// so they always show the same news, and a `git push` never touches it.
//
// Set DATABASE_URL in your .env (and in your host's environment variables)
// to the connection string from your Postgres provider (Render/Railway/
// Neon/Supabase/ElephantSQL/etc). Example:
//   DATABASE_URL=postgres://user:password@host:5432/dbname
//
// Every function below is now ASYNC (returns a Promise) because talking to a
// real database is a network call. Callers must `await` them.

if (!process.env.DATABASE_URL) {
  console.warn(
    "[db] DATABASE_URL is missing in .env — the app cannot read/write news until it is set. " +
      "See README.md > 'PostgreSQL setup'."
  );
}

// Is this a Neon database? (hostname contains "neon.tech" / "neon.build" etc.)
// Neon's own driver connects over a WebSocket on port 443 (the same port
// normal HTTPS websites use) instead of the raw Postgres port 5432. Some
// ISPs/office WiFi networks block 5432 outbound (even though the database
// itself is fine — this is what caused the ETIMEDOUT error), so for Neon we
// use their driver to avoid that entirely. For any other Postgres provider
// (local Postgres, Render, Railway, Supabase, etc.) the standard "pg"
// library over normal TCP is used, unchanged.
const isNeon = /neon\.(tech|build)/i.test(process.env.DATABASE_URL || "");

let pool;
if (isNeon) {
  // HTTPS driver (port 443): same cheez jo test-db.js mein chali thi.
  const { neon } = require("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  pool = {
    async query(text, params) {
      const res = await sql.query(text, params || [], { fullResults: true });
      return { rows: res.rows, rowCount: res.rowCount };
    },
    on() {},
  };
  console.log("[db] Neon database detected — using Neon's HTTPS driver.");
} else {
  const { Pool } = require("pg");
  const needsSsl =
    process.env.DATABASE_URL &&
    process.env.PGSSLMODE !== "disable" &&
    !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 15000,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", (err) => {
    console.error("[db] Unexpected Postgres error on idle client:", err.message);
  });
}

// ---------- schema ----------
// Created automatically on first boot — no manual SQL needed.
let readyPromise = null;
function ready() {
  if (!readyPromise) {
    readyPromise = init().catch((err) => {
      readyPromise = null; // next request dobara koshish karega
      throw err;
    });
  }
  return readyPromise;
}

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS news (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      excerpt     TEXT NOT NULL,
      body        TEXT,
      category    TEXT DEFAULT 'general',
      language    TEXT DEFAULT 'urdu',
      date        TEXT,
      source_url  TEXT,
      source_name TEXT,
      image       TEXT,
      video       TEXT,
      featured    BOOLEAN DEFAULT FALSE,
      trending    BOOLEAN DEFAULT FALSE,
      status      TEXT DEFAULT 'published',
      created_by  TEXT,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
  `);
  // Safe to re-run: adds columns to an older table without losing data.
  await pool.query(`ALTER TABLE news ADD COLUMN IF NOT EXISTS trending BOOLEAN DEFAULT FALSE;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS news_date_idx ON news (date DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS news_status_idx ON news (status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS news_source_url_idx ON news (source_url);`);
  // Speeds up the public paginated list (filter by language + status, newest first).
  await pool.query(`CREATE INDEX IF NOT EXISTS news_lang_status_date_idx ON news (language, status, date DESC);`);
  console.log("[db] Connected to PostgreSQL. Table \"news\" is ready.");
}

// ---------- row <-> app object mapping ----------
// The rest of the app (routes, newsAgent) uses the same field names as
// before (sourceUrl, sourceName, createdBy, camelCase) so nothing else had
// to change when this file moved from JSON to Postgres.
function rowToItem(r) {
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    excerpt: r.excerpt,
    body: r.body,
    category: r.category,
    language: r.language,
    date: r.date,
    sourceUrl: r.source_url,
    sourceName: r.source_name,
    image: r.image,
    video: r.video,
    featured: r.featured,
    trending: r.trending,
    status: r.status,
    createdBy: r.created_by,
  };
}

// Stories without a "status" (shouldn't happen with Postgres defaults, kept
// for safety / old-data compatibility) count as published.
// Bumped on every write so the in-memory list cache (routes/news.js) knows to refresh.
let dataVersion = 0;
const getVersion = () => dataVersion;
const bump = () => { dataVersion++; };

const isPublished = (n) => (n.status || "published") === "published";

// Public site: published stories only, newest first.
async function getAllNews() {
  await ready();
  const { rows } = await pool.query(
    `SELECT * FROM news WHERE status = 'published' ORDER BY date DESC NULLS LAST, created_at DESC`
  );
  return rows.map(rowToItem);
}

// PUBLIC PAGINATED LIST — this is what the website uses.
// Differences from getAllNews(): returns ONE page only, without the (large)
// story body, with a trimmed excerpt, and never ships base64 images inside the
// list (those are served separately from /api/news/:id/image and cached).
async function getNewsPage({ language, category, q, author, limit = 20, offset = 0 } = {}) {
  await ready();
  limit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  offset = Math.max(parseInt(offset, 10) || 0, 0);

  const where = [`status = 'published'`];
  const vals = [];
  const add = (v) => { vals.push(v); return "$" + vals.length; };

  if (language) where.push(`language = ${add(language)}`);
  if (author) {
    where.push(`created_by = ${add("author:" + author)}`);
  } else {
    // Stories posted from an author's own panel show only on that author's profile.
    where.push(`(created_by IS NULL OR created_by NOT LIKE 'author:%')`);
  }
  if (category === "trending") where.push(`trending = TRUE`);
  else if (category) where.push(`category = ${add(category)}`);

  const words = String(q || "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
  for (const w of words) {
    const p = add("%" + w.replace(/[\\%_]/g, "\\$&") + "%");
    where.push(`(title ILIKE ${p} OR excerpt ILIKE ${p} OR body ILIKE ${p})`);
  }

  // Fetch one extra row so we know if there is a next page without a COUNT(*).
  const limP = add(limit + 1);
  const offP = add(offset);
  const { rows } = await pool.query(
    `SELECT id, title, left(excerpt, 400) AS excerpt, category, language, date,
            source_url, source_name,
            CASE WHEN image LIKE 'data:%' THEN NULL ELSE image END AS image,
            (image LIKE 'data:%') AS image_inline,
            video, featured, trending, status, created_by
       FROM news
      WHERE ${where.join(" AND ")}
      ORDER BY date DESC NULLS LAST, created_at DESC
      LIMIT ${limP} OFFSET ${offP}`,
    vals
  );
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((r) => {
    const it = rowToItem(r);
    delete it.body;
    if (r.image_inline) it.image = `/api/news/${encodeURIComponent(r.id)}/image`;
    return it;
  });
  return { items, hasMore, offset, limit };
}

// Raw image column (used to serve base64 images as real, cacheable image files).
async function getNewsImage(id) {
  await ready();
  const { rows } = await pool.query(`SELECT image, status FROM news WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Admin panel + duplicate checks: everything, including drafts.
async function getAllNewsIncludingDrafts() {
  await ready();
  const { rows } = await pool.query(`SELECT * FROM news ORDER BY date DESC NULLS LAST, created_at DESC`);
  return rows.map(rowToItem);
}

async function getNewsById(id) {
  await ready();
  const { rows } = await pool.query(`SELECT * FROM news WHERE id = $1`, [id]);
  return rowToItem(rows[0]) || null;
}

async function addNews(item) {
  await ready();
  const { rows } = await pool.query(
    `INSERT INTO news (id, title, excerpt, body, category, language, date, source_url, source_name, image, video, featured, trending, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      item.id,
      item.title,
      item.excerpt,
      item.body || item.excerpt,
      item.category || "general",
      item.language || "urdu",
      item.date || new Date().toISOString().slice(0, 10),
      item.sourceUrl || null,
      item.sourceName || null,
      item.image || null,
      item.video || null,
      Boolean(item.featured),
      Boolean(item.trending),
      item.status === "draft" ? "draft" : "published",
      item.createdBy || "manual",
    ]
  );
  bump();
  return rowToItem(rows[0]);
}

// Bulk-insert (used by the AI agent). Skips stories whose title or sourceUrl
// already exists, same de-duplication rule as before.

async function addManyNews(items) {
  await ready();
  const added = [];
  for (const item of items) {
    const dupe = await pool.query(
      `SELECT 1 FROM news WHERE lower(title) = lower($1) OR (source_url IS NOT NULL AND source_url = $2) LIMIT 1`,
      [item.title.trim(), item.sourceUrl || null]
    );
    if (dupe.rowCount > 0) continue;
    const { rows } = await pool.query(
      `INSERT INTO news (id, title, excerpt, body, category, language, date, source_url, source_name, image, video, featured, trending, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        item.id,
        item.title,
        item.excerpt,
        item.body || item.excerpt,
        item.category || "general",
        item.language || "urdu",
        item.date || new Date().toISOString().slice(0, 10),
        item.sourceUrl || null,
        item.sourceName || null,
        item.image || null,
        item.video || null,
        Boolean(item.featured),
        Boolean(item.trending),
        item.status === "draft" ? "draft" : "published",
        item.createdBy || "ai-gemini",
      ]
    );
    added.push(rowToItem(rows[0]));
  }
  if (added.length) bump();
  return added;
}

async function updateNews(id, updates) {
  await ready();
  const colMap = {
    title: "title", excerpt: "excerpt", body: "body", category: "category", language: "language",
    date: "date", sourceUrl: "source_url", sourceName: "source_name", image: "image", video: "video",
    featured: "featured", trending: "trending", status: "status", createdBy: "created_by",
  };
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [key, col] of Object.entries(colMap)) {
    if (key in updates) {
      sets.push(`${col} = $${i++}`);
      vals.push(updates[key]);
    }
  }
  if (!sets.length) return getNewsById(id);
  vals.push(id);
  const { rows } = await pool.query(`UPDATE news SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
  if (!rows[0]) return null;
  bump();
  return rowToItem(rows[0]);
}

async function deleteNews(id) {
  await ready();
  const { rowCount } = await pool.query(`DELETE FROM news WHERE id = $1`, [id]);
  if (rowCount > 0) bump();
  return rowCount > 0;
}

module.exports = {
  ready,
  pool,
  getAllNews,
  getNewsPage,
  getNewsImage,
  getVersion,
  getAllNewsIncludingDrafts,
  isPublished,
  getNewsById,
  addNews,
  addManyNews,
  updateNews,
  deleteNews,
};