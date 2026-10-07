// Runs the AI news agent in the BACKGROUND and remembers how the last run went.
//
// Why: one run takes 1-3 minutes (Gemini rate-limit waits). If the admin
// panel waits for the whole run inside one HTTP request, Hostinger's proxy
// cuts the request off (504 / "Failed to fetch" / "Unexpected token <"), so
// it looked like the agent "does nothing". Now the request returns at once
// and the admin panel polls /api/news/fetch/status.
//
// The cron job (server.js) and the "Run AI agent now" button share ONE lock,
// so they can never run at the same time and burn the free API limits.

const db = require("./db");
const { fetchFreshNews } = require("./newsAgent");

const state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  trigger: null, // "manual" | "cron"
  ok: null,
  fetched: 0,
  added: 0,
  addedTitles: [],
  errors: [],
  notes: [],
  message: "The agent has not run since the server started.",
  progress: "",
  log: [], // last steps, shown live in the admin panel
};

function progress(msg) {
  const line = `${new Date().toLocaleTimeString("en-GB")}  ${msg}`;
  state.progress = msg;
  state.log.push(line);
  if (state.log.length > 40) state.log.shift();
  console.log("[agent]", msg);
}

function getStatus() {
  return { ...state };
}

/** Starts a run. Returns false if one is already running. Never throws. */
function startRun(trigger = "manual") {
  if (state.running) return false;

  Object.assign(state, {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    trigger,
    ok: null,
    fetched: 0,
    added: 0,
    addedTitles: [],
    errors: [],
    notes: [],
    message: "Agent is working…",
    progress: "Starting…",
    log: [],
  });
  console.log(`[${state.startedAt}] AI agent started (${trigger})`);

  (async () => {
    try {
      const items = await fetchFreshNews(progress);
      const added = db.addManyNews(items);
      Object.assign(state, {
        ok: true,
        fetched: items.length,
        added: added.length,
        addedTitles: added.map((n) => n.title),
        errors: items.errors || [],
        notes: items.notes || [],
        message:
          added.length > 0
            ? `Saved ${added.length} new ${added[0].status === "draft" ? "draft(s)" : "published story(ies)"}.`
            : "Finished, but there was nothing new to save.",
      });
      console.log(`AI agent: fetched ${items.length}, added ${added.length}.`);
    } catch (err) {
      Object.assign(state, { ok: false, errors: [err.message], message: "Agent run failed." });
      progress("FAILED: " + err.message);
      console.error("AI agent failed:", err.message);
    } finally {
      if (state.ok) progress("Finished. " + state.message);
      state.running = false;
      state.finishedAt = new Date().toISOString();
    }
  })();

  return true;
}

module.exports = { startRun, getStatus };
