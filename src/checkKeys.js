// Quick health check for the AI agent:  npm run check-keys
// Tests NEWSDATA_API_KEY and GEMINI_API_KEY directly and prints the exact error, if any.
require("dotenv").config();

const t = (ms) => AbortSignal.timeout(ms);
const { listFlashModels, rankModel } = require("./newsAgent");

(async () => {
  console.log("\n1) NewsData.io");
  if (!process.env.NEWSDATA_API_KEY) console.log("   ❌ NEWSDATA_API_KEY is empty in .env");
  else {
    try {
      const r = await fetch(`https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(process.env.NEWSDATA_API_KEY)}&country=pk&language=ur`, { signal: t(20000) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.status === "success") console.log(`   ✅ OK — ${d.results?.length || 0} Urdu headlines received`);
      else console.log(`   ❌ HTTP ${r.status}: ${JSON.stringify(d.results || d).slice(0, 300)}`);
    } catch (e) { console.log("   ❌ Could not connect:", e.message); }
  }

  console.log("\n2) Gemini");
  if (!process.env.GEMINI_API_KEY) return console.log("   ❌ GEMINI_API_KEY is empty in .env\n");
  let models = (process.env.GEMINI_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean);
  if (models.length) console.log(`   (testing GEMINI_MODEL from .env: ${models.join(", ")})`);
  else {
    try {
      const found = await listFlashModels(process.env.GEMINI_API_KEY);
      models = found.sort((a, b) => rankModel(b) - rankModel(a)).slice(0, 8);
      console.log(`   Your key can see ${found.length} Flash model(s). Testing: ${models.join(", ")}`);
    } catch (e) {
      return console.log("   ❌ Could not list models:", e.message, "\n");
    }
  }
  const ok = [];
  for (const m of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word OK" }] }] }),
        signal: t(60000),
      });
      const raw = await r.text();
      if (r.ok) { console.log(`   ✅ ${m}: OK`); ok.push(m); }
      else {
        let msg = raw; try { msg = JSON.parse(raw).error.message; } catch {}
        console.log(`   ❌ ${m}: HTTP ${r.status} — ${msg.slice(0, 250)}`);
      }
    } catch (e) { console.log(`   ❌ ${m}: could not connect — ${e.message}`); }
  }
  if (ok.length) console.log(`\n   👍 Working models: ${ok.join(", ")}\n   The agent picks these automatically. (Optional: put them in .env as GEMINI_MODEL=${ok.slice(0, 3).join(",")})`);
  else console.log("\n   No model answered OK right now. If you saw 503, Google is overloaded — try again in a few minutes.");
  console.log("");
})();
