import { Router } from "express";

export const healthRouter: Router = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "creatorlens-api",
    env: process.env.NODE_ENV ?? "development",
    timestamp: new Date().toISOString(),
  });
});
