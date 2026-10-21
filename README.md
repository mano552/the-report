# THE REPORT — A Project of BM Enterprises

AI-assisted Urdu/English news website. Full update: PostgreSQL database, split admin panels,
improved AI agent, new categories, About Us page, WhatsApp/social, search & font fixes.

---

## 1) PostgreSQL setup (fixes "news disappears after git push")

**Why this was happening:** the old version stored news in `data/news.json`, a plain file on the
server's disk. Every `git push` deploy rebuilds the app from git, so that file got wiped/replaced —
news added on localhost never matched what was live, and vice versa.

**The fix:** one PostgreSQL database that BOTH localhost and the live site connect to, using the
same `DATABASE_URL`. Deploys never touch it, so news stays in sync everywhere.

### Steps
1. Create a free/paid Postgres database with any provider — e.g. **Render** (free Postgres),
   **Railway**, **Neon**, or **Supabase**. Copy the connection string it gives you, it looks like:
   ```
   postgres://USER:PASSWORD@HOST:5432/DBNAME
   ```
2. Put it in `.env` (locally) **and** in your hosting provider's Environment Variables (for the
   live site) — **the exact same value in both places**:
   ```
   DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME
   ```
3. Install the new dependency and import your existing news (one time only):
   ```bash
   npm install
   npm run migrate-db
   ```
   This reads your old `data/news.json`/`news.backup.json` and copies every story into Postgres.
   Safe to run more than once — it skips stories that are already there.
4. Start the app as usual:
   ```bash
   npm start
   ```
   The `news` table is created automatically on first boot — no manual SQL needed.

From now on: add a story on localhost (manually or via the AI agent) → `git push` to deploy →
the live site shows the SAME story immediately, because both read the same database. No more
"news disappeared" / "have to regenerate" problem.

---

## 2) Two separate Admin Panels

| Panel | URL | What it does |
|---|---|---|
| **AI Agent Panel** | `/admin/ai` | Only runs the AI news agent + review/publish/edit/delete its generated drafts. No manual writing form here. |
| **Manual Panel** | `/admin/manual` | Only for writing/adding news by hand (title, image, full story) + editing/publishing/deleting any story. No AI controls here. |
| `/admin` | — | A small chooser page that links to both. |

Same `ADMIN_KEY` works on both (type it once; it's remembered in the browser tab via
`sessionStorage` so you don't have to retype it switching panels).

---

## 3) AI Agent improvements
- **Image required:** a story with no real source image is now **skipped entirely** — the agent
  never publishes an image-less news item.
- **Freshness/recency:** headlines are sorted by their actual published time before being picked,
  so the newest news (e.g. an 8:00 PM story when it's 8:26 PM) is rewritten first, not whatever
  order the API happened to list them in.
- **Trending auto-flag:** any headline published within the last 3 hours is automatically marked
  🔥 Trending and shows under the site's "Trending" tab. You can also toggle Trending by hand on
  any story from either admin panel.
- **Categories:** `general` and `politics` were removed; `international` was added (alongside the
  existing business/technology/entertainment/sports/health/science/unique).

---

## 4) Website sections — added / removed
**Added:** Latest News (تازہ ترین) — the default feed, newest first · Trending (ٹرینڈنگ) — flag-based ·
International (انٹرنیشنل) · Health (صحت) — already existed as a category, now has its own tab.
**Removed:** General (عام خبر), Politics (سیاست) — both from the category filters and the icon strip.

---

## 5) Branding, About Us, WhatsApp & Social
- Tagline **"A Project of BM Enterprises"** added under the logo (header + footer).
- New **`/about`** page: description, office address, WhatsApp, social links.
  ⚠️ **Action needed from you:** open `public/index.html`, find
  `<p id="aboutAddress">[OFFICE ADDRESS — ...]</p>` and replace the placeholder with your real,
  complete office address.
- WhatsApp number used everywhere (header, footer, About Us): `+92 305 4741419` — this was already
  your number used in the contact form (`public/js/app.js`). If this is not the right official
  number, search-and-replace `923054741419` across `public/index.html` and `public/js/app.js`.
- Facebook/Instagram/TikTok icons are shown next to WhatsApp in header, footer, mobile menu and
  About Us. Update the links in `public/index.html` if any of these change.

---

## 6) Business email (info@thereport.pk) — Google Workspace

This is **not a code change** — it's a mail-hosting setup on your domain, done through your
domain registrar / DNS panel:

1. Go to https://workspace.google.com and start a plan, using domain `thereport.pk`.
2. Google will ask you to verify domain ownership — it gives you a TXT (or HTML file) record.
   Add that TXT record in your domain's DNS settings (wherever `thereport.pk` is registered —
   Hostinger, GoDaddy, etc.).
3. Google then gives you **MX records** — add exactly those in the same DNS panel (replace any
   existing MX records so mail actually routes to Google).
4. Once DNS propagates (minutes to ~24 hrs), create the mailbox `info@thereport.pk` inside your
   new Google Workspace admin console (admin.google.com → Users → Add new user).
5. Log into it like normal Gmail at https://mail.google.com, or add it in the Gmail app.

If you'd rather not pay for Google Workspace, **Zoho Mail** has a free tier for a single custom-domain
mailbox and works the same way (verify domain → add MX records → create mailbox).

---

## 7) Search & font fixes
- **Search:** the front-end search now normalizes Urdu text (strips diacritics like zer/zabar,
  handles different Unicode forms of the same letter) so Urdu queries match reliably. Note: the
  biggest real-world cause of "search finds nothing" was that AI-generated stories sit as
  **drafts** until approved in the admin panel (`AUTO_PUBLISH=false` by default) — a draft is
  invisible to the public site and therefore to search. Approve stories in `/admin/ai` to make
  them searchable, or set `AUTO_PUBLISH=true` in `.env` to publish automatically (not recommended
  without review).
- **Fonts:** consistent font stacks (Inter for English UI, Noto Nastaliq Urdu for Urdu text, with
  proper fallbacks), fixed base font size (16px) and line-height across the site for readability.

---

## Keys (all free) — only on the server, never in public/js
| Key | Where | Needed |
|---|---|---|
| DATABASE_URL | your Postgres provider | **yes** |
| NEWSDATA_API_KEY | newsdata.io | yes |
| GEMINI_API_KEY | aistudio.google.com/apikey | yes |
| ADMIN_KEY | you invent (20+ random chars) | yes |

## Run on your PC
```bash
npm install
cp .env.example .env     # fill in DATABASE_URL + keys
npm run migrate-db       # one-time: import old data/news.json into Postgres
npm start                # http://localhost:3000
npm run fetch-news       # run the agent once, right now
npm run check-keys       # agent stuck/failing? tests both API keys and prints the exact error
```
- `/admin` — choose AI or Manual panel
- `/admin/ai` — run the AI agent, review/publish its drafts
- `/admin/manual` — add/edit news by hand

## Deploying (Hostinger / Render / Railway / any Node host)
1. Set these Environment Variables on the host: `DATABASE_URL`, `NEWSDATA_API_KEY`,
   `GEMINI_API_KEY`, `ADMIN_KEY`, `PORT` (usually auto-set by the host).
2. `git push` as normal — because the database is external (Postgres), news is never lost on
   deploy anymore.
3. Run `npm run migrate-db` once against the SAME `DATABASE_URL` (from either localhost or the
   server, doesn't matter — it's the same database) to bring in any pre-existing stories.
