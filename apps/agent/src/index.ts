import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import pino from "pino";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

const USER_ID = process.env.CREATORLENS_USER_ID;
if (!USER_ID) {
  log.error("CREATORLENS_USER_ID is required — aborting");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = (() => {
  try {
    return readFileSync(
      join(__dirname, "..", "prompts", "lens-system.md"),
      "utf8"
    );
  } catch {
    return "You are Lens. (prompt file missing)";
  }
})();

log.info({ userId: USER_ID, promptBytes: SYSTEM_PROMPT.length }, "lens_boot");

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "creatorlens-agent",
    userId: USER_ID,
    timestamp: new Date().toISOString(),
  });
});

app.post("/chat", async (req, res) => {
  // Phase 3 — wire Claude Agent SDK, tools, memory read/write
  const { message } = req.body ?? {};
  log.info({ userId: USER_ID, inbound: typeof message }, "chat_stub");
  res.status(501).json({
    error: "not_implemented",
    message: "Lens agent not wired yet — Phase 3.",
  });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  log.info({ userId: USER_ID }, "ws_connected");
  ws.on("message", (raw) => {
    const bytes = Buffer.isBuffer(raw)
      ? raw.length
      : Array.isArray(raw)
        ? raw.reduce((n, b) => n + b.length, 0)
        : (raw as ArrayBuffer).byteLength;
    log.info({ userId: USER_ID, bytes }, "ws_message");
    ws.send(JSON.stringify({ type: "stub", message: "Lens is not live yet." }));
  });
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  log.info({ port, userId: USER_ID }, "creatorlens-agent listening");
});
