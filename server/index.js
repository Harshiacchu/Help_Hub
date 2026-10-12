// server/index.js - Express server entry point
//
// Order matters: database -> session -> tenant context -> routes -> 404 -> errors.
// (Previously the session middleware was added after the routes, so req.session
// was undefined inside every route.)

require("dotenv").config();

const path = require("path");
const express = require("express");

const {
  connectDB,
  getDB,
  getClient,
  closeDB,
  DB_NAME,
} = require("./config/db");
const { createSessionMiddleware } = require("./config/session");
const { tenantResolution } = require("./middleware/tenantResolution");
const { requireAuth, requireRole } = require("./middleware/auth");

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

function createApp(mongoClient) {
  const app = express();

  if (isProduction) app.set("trust proxy", 1); // secure cookies behind a hosting proxy
  app.disable("x-powered-by");

  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  // Static files don't need a session
  app.use(express.static(path.join(__dirname, "../public")));

  app.use(createSessionMiddleware(mongoClient, DB_NAME));
  app.use(tenantResolution);

  // ===== Abhinay's routes =====
  app.use("/api/v1/auth", require("./routes/auth"));
  app.use("/api/v1/tenants", requireAuth, require("./routes/tenants"));
  app.use(
    "/api/v1/admin",
    requireAuth,
    requireRole("superior"),
    require("./routes/admin")
  );
  app.use(
    "/api/v1/api-keys",
    requireAuth,
    requireRole("superior"),
    require("./routes/apiKeys")
  );
  app.use("/api/v1/rules", requireAuth, require("./routes/rules"));

  // ===== Emily's routes go here =====
  // const apiKeyAuth = require('./middleware/apiKeyAuth');
  // const { requireTenant } = require('./middleware/tenantResolution');
  // app.use('/api/v1/tickets', apiKeyAuth.optional, requireTenant, require('./routes/tickets'));

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

    // Sessions saved by older code as JSON strings can't be read by the current store settings
    await getDB()
      .collection("sessions")
      .deleteMany({ session: { $type: "string" } });

    const app = createApp(getClient());
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

if (require.main === module) {
  start();
}

module.exports = { createApp, start };
