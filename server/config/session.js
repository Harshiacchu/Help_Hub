// server/config/session.js - 7-day sessions stored in MongoDB
//
// - Expires 7 days after the LAST request (rolling: true), not 7 days after login
// - Stored in the "sessions" collection, so it survives server restarts
// - connect-mongo creates the TTL index that deletes expired sessions

const crypto = require("crypto");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = "sessionId";
const isProduction = process.env.NODE_ENV === "production";

const COOKIE_OPTIONS = Object.freeze({
  httpOnly: true, // JavaScript cannot read the cookie (XSS protection)
  secure: isProduction, // HTTPS only in production
  sameSite: "strict", // not sent on cross-site requests (CSRF protection)
  path: "/",
});

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (isProduction) {
    throw new Error("SESSION_SECRET must be set in production.");
  }
  console.warn(
    "SESSION_SECRET is not set - using an insecure development secret."
  );
  return "dev-only-insecure-session-secret";
}

function createSessionMiddleware(mongoClient, dbName) {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: getSessionSecret(),
    store: MongoStore.create({
      client: mongoClient,
      dbName,
      collectionName: "sessions",
      ttl: SEVEN_DAYS_MS / 1000, // seconds
      autoRemove: "native", // MongoDB TTL index removes expired sessions
      touchAfter: 60 * 60, // refresh the stored expiry at most once an hour
      stringify: false, // store as an object so a user's sessions can be revoked
    }),
    genid: () => crypto.randomBytes(32).toString("hex"),
    resave: false, // the store's touch() keeps the TTL alive
    saveUninitialized: false, // no session until someone logs in
    rolling: true, // cookie expiry resets on every response
    proxy: isProduction,
    cookie: { ...COOKIE_OPTIONS, maxAge: SEVEN_DAYS_MS },
  });
}

module.exports = {
  createSessionMiddleware,
  SESSION_COOKIE_NAME,
  COOKIE_OPTIONS,
};
