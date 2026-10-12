// server/index.js - Express server entry point
//
// Order matters: database -> session -> tenant context -> routes -> 404 -> errors.

// Must be the first import: loads .env before any other module reads process.env
import "dotenv/config";

import { fileURLToPath } from "node:url";
import express from "express";

import { connectDB, closeDB } from "./config/db.js";
import { createSessionMiddleware } from "./config/session.js";
import { tenantResolution } from "./middleware/tenantResolution.js";
import { requireAuth, requireRole } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import tenantRoutes from "./routes/tenants.js";
import adminRoutes from "./routes/admin.js";
import apiKeyRoutes from "./routes/apiKeys.js";
import rulesRoutes from "./routes/rules.js";

// ES modules have no __dirname, so resolve the folder from this file's URL
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

function createApp() {
  const app = express();

  if (isProduction) app.set("trust proxy", 1); // secure cookies behind a hosting proxy
  app.disable("x-powered-by");

  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  // Static files don't need a session
  app.use(express.static(PUBLIC_DIR));

  app.use(createSessionMiddleware());
  app.use(tenantResolution);

  // ===== Abhinay's routes =====
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/tenants", requireAuth, tenantRoutes);
  app.use("/api/v1/admin", requireAuth, requireRole("superior"), adminRoutes);
  app.use(
    "/api/v1/api-keys",
    requireAuth,
    requireRole("superior"),
    apiKeyRoutes
  );
  app.use("/api/v1/rules", requireAuth, rulesRoutes);

  // ===== Emily's routes go here =====
  // Add these imports at the top of the file:
  //   import apiKeyAuth from "./middleware/apiKeyAuth.js";
  //   import { requireTenant } from "./middleware/tenantResolution.js";
  //   import ticketRoutes from "./routes/tickets.js";
  // Then mount (session OR X-API-Key can create tickets):
  //   app.use("/api/v1/tickets", apiKeyAuth.optional, requireTenant, ticketRoutes);

  app.get("/", (req, res) => res.redirect("/pages/login.html"));

  app.use((req, res) => {
    res.status(404).json({ success: false, error: "Route not found" });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
      return res
        .status(400)
        .json({ success: false, error: "Request body is not valid JSON" });
    }
    const status = Number.isInteger(err.status) ? err.status : 500;
    if (status >= 500) console.error("Server error:", err);

    const showMessage = err.expose || (!isProduction && status >= 500);
    res.status(status).json({
      success: false,
      error: showMessage
        ? err.message
        : status >= 500
          ? "Internal server error"
          : "Request failed",
    });
  });

  return app;
}

async function start() {
  try {
    await connectDB();

    const app = createApp();
    const server = app.listen(PORT, () => {
      console.log(
        `HelpHub running on http://localhost:${PORT} (${process.env.NODE_ENV || "development"})`
      );
    });

    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down...`);
      server.close(async () => {
        await closeDB();
        process.exit(0);
      });
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("Failed to start server:", error.message);
    console.error(
      "Check that .env has MONGODB_URI and SESSION_SECRET, and that your IP is allowed in Atlas Network Access."
    );
    process.exit(1);
  }
}

start();
