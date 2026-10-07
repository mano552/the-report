# THE REPORT — Services + auto-updating Urdu/English News

AI agent (runs on the server every 3 hours):
NewsData.io headlines (Pakistan, Urdu + English) → **Gemini rewrites** each story in its own words
(Urdu stays Urdu, English stays English) → AI image (Pollinations, free) + stock video (Pexels, free, optional)
→ saved as **DRAFT** → you check/edit it and press **Publish** in `/admin`.

Every story opens **on our own site** at `/news/<id>` (full story, image/video).
The original source is only credited with a small "Source" link at the bottom.

## Keys (all free) — only on the server, never in public/js
| Key | Where | Needed |
|---|---|---|
| NEWSDATA_API_KEY | newsdata.io | yes |
| GEMINI_API_KEY | aistudio.google.com/apikey | yes |
| PEXELS_API_KEY | pexels.com/api | optional (videos) |
| ADMIN_KEY | you invent (20+ random chars) | yes |

## Run on your PC
```bash
npm install
cp .env.example .env     # fill in keys
npm start                # http://localhost:3000   admin: /admin
npm run fetch-news       # run the agent once, right now
npm run check-keys       # agent stuck/failing? tests both API keys and prints the exact error
```
In `/admin`: type ADMIN_KEY at the top → **Run AI agent now** (runs in the background, the panel shows
progress and any errors) → **Edit** a draft if needed → **Publish**. Published stories can be **Unpublished** again.

## Hostinger
1. hPanel → Websites → your site → **Node.js** (Node 18+). Upload this folder (zip) or connect GitHub. Startup file: `server.js`. Run `npm install`.
2. Same page → **Environment variables**: add NEWSDATA_API_KEY, GEMINI_API_KEY, PEXELS_API_KEY, ADMIN_KEY, AUTO_PUBLISH=false. (Don't upload a `.env` file.)
3. Restart the app, open `https://thereport.pk/admin`, test with **Run AI agent now**.
4. If the app sleeps/restarts and the 3-hourly schedule seems not to run, add a hPanel **Cron Job** every 3 hours:
   `curl -s -X POST https://thereport.pk/api/news/fetch/run -H "x-admin-key: YOUR_ADMIN_KEY"`
   (returns immediately; the agent keeps working in the background. Result: GET `/api/news/fetch/status` with the same header, or just open `/admin`.)
5. **Your news lives in `data/news.json` on the server.** When you upload a new version of the site, do NOT overwrite the `data/` folder (this zip has no news.json inside for that reason). Back it up now and then.

## Settings (.env)
`AUTO_PUBLISH=false` keep drafts (recommended) · `MAX_PER_LANGUAGE=3` · `NEWS_FETCH_CRON` · `GEMINI_MODEL` (if a model name is retired).

## Notes
- Gemini free tier has rate limits; the agent waits between stories and retries on 429.
- The agent never publishes raw source text: without GEMINI_API_KEY it does nothing.
- Every story keeps its `sourceUrl` ("Read more" link). Review facts before publishing — AI can err.
- Images come from Pollinations and load the first time someone views them (a few seconds).
