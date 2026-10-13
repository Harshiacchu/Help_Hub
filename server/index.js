// server/index.js - Express server entry point

import "dotenv/config"; // first, so .env is loaded before anything reads process.env

import { fileURLToPath } from "node:url";
import express from "express";

import { connectDB } from "./config/db.js";
import { createSessionMiddleware } from "./config/session.js";
import { tenantResolution } from "./middleware/tenantResolution.js";
import { requireAuth, requireRole } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import tenantRoutes from "./routes/tenants.js";
import adminRoutes from "./routes/admin.js";
import apiKeyRoutes from "./routes/apiKeys.js";
import rulesRoutes from "./routes/rules.js";

// Stop with a clear message if .env is incomplete
for (const name of ["MONGODB_URI", "SESSION_SECRET"]) {
  if (!process.env[name]) {
    console.error(`${name} is not set. Add it to your .env file.`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

const app = express();

// Needed for secure cookies when deployed behind a hosting proxy
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use(createSessionMiddleware());
app.use(tenantResolution);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/tenants", requireAuth, tenantRoutes);
app.use("/api/v1/admin", requireAuth, requireRole("superior"), adminRoutes);
app.use("/api/v1/api-keys", requireAuth, requireRole("superior"), apiKeyRoutes);
app.use("/api/v1/rules", requireAuth, rulesRoutes);

// Emily's ticket routes go here, for example:
//   import apiKeyAuth from "./middleware/apiKeyAuth.js";
//   import { requireTenant } from "./middleware/tenantResolution.js";
//   import ticketRoutes from "./routes/tickets.js";
//   app.use("/api/v1/tickets", apiKeyAuth.optional, requireTenant, ticketRoutes);

app.get("/", (req, res) => res.redirect("/pages/login.html"));

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    success: false,
    error: status >= 500 ? "Internal server error" : err.message,
  });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`HelpHub running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
