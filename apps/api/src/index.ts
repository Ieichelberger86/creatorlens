import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { log } from "./lib/logger.js";
import { stripeWebhook } from "./routes/stripe-webhook.js";
import { preordersRouter } from "./routes/preorders.js";
import { healthRouter } from "./routes/health.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
    credentials: true,
  })
);
app.use(pinoHttp({ logger: log }));

// Stripe webhook MUST receive the raw body for signature verification.
// Mount BEFORE global express.json().
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

// JSON parser for everything else.
app.use(express.json({ limit: "1mb" }));

app.use("/health", healthRouter);
app.use("/preorders", preordersRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error({ err }, "unhandled error");
  res.status(500).json({ error: "internal_error" });
});

app.listen(port, () => {
  log.info({ port }, "creatorlens-api listening");
});
