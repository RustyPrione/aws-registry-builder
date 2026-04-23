const express = require("express");

const router = express.Router();

const MAX_LINES_PER_SESSION = 500;
/** @type {Map<string, Array<{ ts: string, msg: string, type: string }>>} */
const serverLogsBySession = new Map();

router.post("/log", express.json(), (req, res) => {
  try {
    const { sessionId, entries } = req.body || {};
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "sessionId is required" });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "entries must be a non-empty array" });
    }

    if (!serverLogsBySession.has(sessionId)) {
      serverLogsBySession.set(sessionId, []);
    }
    const arr = serverLogsBySession.get(sessionId);
    for (const e of entries) {
      if (e && typeof e.msg === "string") {
        arr.push({
          ts: typeof e.ts === "string" ? e.ts : "",
          msg: e.msg,
          type: typeof e.type === "string" ? e.type : "",
        });
      }
    }
    while (arr.length > MAX_LINES_PER_SESSION) {
      arr.splice(0, arr.length - MAX_LINES_PER_SESSION);
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/log", (req, res) => {
  const sessionId = req.headers["x-session-id"];
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "X-Session-Id header is required" });
  }
  serverLogsBySession.delete(sessionId);
  return res.json({ ok: true });
});

module.exports = router;
