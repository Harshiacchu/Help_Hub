// app.js - The entry point Vercel looks for. Vercel requires this file to
// import express and to export the app as its default export.
// The app itself is built in server/app.js.

import "express";
import app from "./server/app.js";

export default app;
