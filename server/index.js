// server/index.js - Runs the app on your computer (npm start / npm run dev).
// On Vercel, ../app.js is used instead.

import "dotenv/config"; // first, so .env is loaded before the app reads it
import app from "./app.js";
import { connectDB } from "./config/db.js";

const PORT = process.env.PORT || 3000;

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
