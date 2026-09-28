# THE REPORT — A Media Network

Services page + a News page that **updates itself automatically**: an AI
agent (Claude API + web search) goes out every few hours, finds fresh news,
writes it up in Urdu, and saves it — your News page then just reads from
that saved list. No one has to manually paste news in for it to show up.

```
the-report-website/
├── server.js              # starts everything
├── src/
│   ├── db.js               # tiny JSON-file database
│   ├── newsAgent.js         # calls Claude API + web search, returns Urdu news
│   ├── manualFetch.js        # run the agent once from the terminal
│   └── routes/news.js         # GET/POST/PUT/DELETE /api/news
├── public/
│   ├── index.html            # Services + News pages (this is your site)
│   ├── admin.html             # simple panel to add/delete news, run the agent
│   ├── css/style.css
│   ├── js/app.js               # fetches /api/news and renders it
│   └── assets/logo.png
└── data/news.json             # where news gets stored
```

---

## Free vs. paid — pick your setup

| | **Free setup** | **Better-quality setup** |
|---|---|---|
| Keys needed | `NEWSDATA_API_KEY` only | `NEWSDATA_API_KEY` + `ANTHROPIC_API_KEY` |
| Cost | $0, forever (200 requests/day free tier) | Small Claude API usage cost per fetch |
| How news looks | Real Urdu headlines, used exactly as the source wrote them | Claude rewrites everything into clean, consistent newsroom-style Urdu |
| Good for | Getting started, testing, tight budgets | A more polished, professional final product |

Both are fully wired up already — the code auto-detects which keys are present and picks the right path. Start free, add the Claude key later if you want the writing quality upgrade.

---

## Part 1 — Run it on your computer (5 minutes)

**You need [Node.js](https://nodejs.org) version 18 or newer installed.** Check with:
```bash
node -v
```

1. **Install dependencies**
   ```bash
   cd the-report-website
   npm install
   ```

2. **Get a NewsData.io key** (this is the only key the free setup needs)
   - Go to https://newsdata.io → **Sign Up** (free, no card needed)
   - Your API key is shown right on the dashboard after signup
   - Free tier = 200 requests/day — plenty for a fetch every few hours
   - Copy the key (starts with `pub_...`)

2b. **(Optional, costs money) Get a Claude API key** — only if you want the
   better-quality setup where headlines are rewritten into polished Urdu
   - Go to https://console.anthropic.com → sign up / log in
   - Left sidebar → **API Keys** → **Create Key**
   - Requires adding a payment method + purchasing credits
   - Copy the key (starts with `sk-ant-...`)
   - **Skip this step entirely for the free setup** — leave it blank in `.env`

3. **Set up your environment file**
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in:
   - `NEWSDATA_API_KEY` → the key from step 2 (required)
   - `ANTHROPIC_API_KEY` → leave **blank** for the free setup, or the key
     from step 2b if you want AI-polished Urdu
   - `ADMIN_KEY` → invent any long random password (this protects your
     admin panel so strangers can't add/delete news)

4. **Start the server**
   ```bash
   npm start
   ```
   You should see:
   ```
   THE REPORT server running: http://localhost:3000
   Auto news fetch scheduled: "0 */3 * * *"
   ```

5. **Open the site**
   - Website: http://localhost:3000
   - Admin panel: http://localhost:3000/admin.html

6. **Test the AI agent immediately** (don't wait 3 hours):
   ```bash
   npm run fetch-news
   ```
   or click **"Fetch fresh news now"** in the admin panel (paste your
   `ADMIN_KEY` into the box at the top first). Refresh the News tab on the
   site — the new stories should appear.

---

## Part 2 — How the "auto-update" actually works

`src/newsAgent.js` checks which keys you've set and picks a path automatically:

- **Only `NEWSDATA_API_KEY`** (free setup) → calls NewsData.io with
  `language=ur` so it only returns articles from actual Urdu-language
  sources, and uses their title/description exactly as published. No AI
  call happens at all.
- **Both keys set** → calls NewsData.io for real headlines (any language),
  then sends them to `https://api.anthropic.com/v1/messages` asking Claude
  to rewrite each one as a clean Urdu title + summary.
- **Only `ANTHROPIC_API_KEY`** → Claude searches the web itself (via the
  built-in **web search tool**) and writes the news directly.

- `server.js` uses **node-cron** to run that same function on a schedule —
  by default every 3 hours (`NEWS_FETCH_CRON=0 */3 * * *` in `.env`). Change
  that value any time — https://crontab.guru helps build the expression.
- New stories are saved into `data/news.json`. Duplicate titles are skipped
  automatically.
- The News page (`public/js/app.js`) simply calls `GET /api/news` whenever
  someone opens the News tab, so it always shows whatever's currently saved
  — no page redeploy needed for new stories to show up.

If you'd rather pull from a real news wire (e.g. APP, INP) instead of/along
with AI-written summaries, that would plug in as another function inside
`src/newsAgent.js` that also calls `db.addManyNews(...)`.

---

## Part 3 — Editing the site content

- **Services page text**: edit directly in `public/index.html` (services
  cards, hero text, testimonial, etc.)
- **News categories**: edit the `ALLOWED_CATEGORIES` array in
  `src/newsAgent.js` and the `<select>` options in `public/index.html` /
  `public/admin.html` together, so they stay in sync.
- **Colors/fonts**: all in `public/css/style.css` under `:root { ... }` at
  the top.
- **Logo**: replace `public/assets/logo.png`.

---

## Part 4 — Putting it live on the internet

Pick one:

**Option A — Render.com (easiest, has a free tier)**
1. Push this folder to a GitHub repo.
2. On https://render.com → New → Web Service → connect your repo.
3. Build command: `npm install` — Start command: `npm start`.
4. Under Environment, add `ANTHROPIC_API_KEY`, `ADMIN_KEY`, `NEWS_FETCH_CRON`
   (same values as your `.env`).
5. Deploy. Render gives you a live URL — point your domain at it later
   (Settings → Custom Domain).

**Option B — A VPS (DigitalOcean, Hostinger VPS, etc.)**
1. `git clone` your repo onto the server, `npm install`.
2. Create `.env` on the server the same way as locally.
3. Run it permanently with [pm2](https://pm2.keymetrics.io/):
   ```bash
   npm install -g pm2
   pm2 start server.js --name the-report
   pm2 save && pm2 startup
   ```
4. Put **nginx** in front of it as a reverse proxy on ports 80/443, and use
   `certbot` for a free SSL certificate.

**Important either way:**
- Never commit your real `.env` file to git (a `.gitignore` should exclude it).
- The JSON file database (`data/news.json`) lives on that one server's disk.
  That's fine for one server. If you ever run multiple server instances
  behind a load balancer, swap `src/db.js` for a real database
  (Postgres/MySQL) so all instances share the same data.

---

## Troubleshooting

| Problem | Likely fix |
|---|---|
| "ANTHROPIC_API_KEY is not set" | You forgot to fill in `.env`, or forgot `cp .env.example .env` |
| "NewsData.io error 401" | Your `NEWSDATA_API_KEY` is wrong/missing — double check it on your newsdata.io dashboard |
| "NewsData.io returned status: error" | You've hit the free tier's daily limit (200 requests), or the query params need adjusting — see the raw error message for details |
| Agent runs but adds 0 stories | Claude's JSON reply didn't match the expected shape — check the server terminal log for the raw error, or lower how strict `parseNewsJson` is if needed |
| 401 Unauthorized in admin panel | The `x-admin-key` you typed doesn't match `ADMIN_KEY` in `.env` |
| News page stuck on "loading" | Open browser dev tools → Network tab → check the `/api/news` request for errors; confirm the server is running |
