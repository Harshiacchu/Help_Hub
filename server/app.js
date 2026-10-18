// server/app.js - The Express app (used by server/index.js locally and by ../app.js on Vercel)

import { fileURLToPath } from "node:url";
import express from "express";

import { connectDB } from "./config/db.js";
import { createSessionMiddleware } from "./config/session.js";
import {
  tenantResolution,
  requireTenant,
} from "./middleware/tenantResolution.js";
import { requireAuth, requireRole } from "./middleware/auth.js";
import apiKeyAuth from "./middleware/apiKeyAuth.js";
import authRoutes from "./routes/auth.js";
import tenantRoutes from "./routes/tenants.js";
import adminRoutes from "./routes/admin.js";
import apiKeyRoutes from "./routes/apiKeys.js";
import ticketRoutes from "./routes/tickets.js";

// Stop with a clear message if the environment variables are missing
for (const name of ["MONGODB_URI", "SESSION_SECRET"]) {
  if (!process.env[name]) {
    console.error(
      `${name} is not set. Add it to .env (or to Vercel's Environment Variables).`
    );
    process.exit(1);
  }
}

const app = express();

app.set("trust proxy", 1); // Vercel (and other hosts) sit behind a proxy that handles HTTPS

app.use(express.json());
// Locally this serves public/. On Vercel it is ignored and Vercel serves public/ itself.
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
app.use(createSessionMiddleware());
app.use(tenantResolution);

// Connect to MongoDB on the first request; later requests reuse the connection
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/tenants", requireAuth, tenantRoutes);
app.use("/api/v1/admin", requireAuth, requireRole("superior"), adminRoutes);
app.use("/api/v1/api-keys", requireAuth, requireRole("superior"), apiKeyRoutes);
// Tickets accept a logged-in user OR another platform's X-API-Key
app.use("/api/v1/tickets", apiKeyAuth.optional, requireTenant, ticketRoutes);

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

export default app;
