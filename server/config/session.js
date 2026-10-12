// server/config/session.js - Login sessions (basic)
//
// express-session with its default in-memory store. The cookie has no expiry
// date, so closing the browser logs the user out (so does restarting the server).

import session from "express-session";

const SESSION_COOKIE_NAME = "sessionId";

const COOKIE_OPTIONS = Object.freeze({
  httpOnly: true, // JavaScript cannot read the cookie
  secure: process.env.NODE_ENV === "production", // HTTPS only when deployed
  sameSite: "strict", // not sent on requests from other sites
  path: "/",
});

function createSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Add it to your .env file.");
  }
  return session({
    name: SESSION_COOKIE_NAME,
    secret,
    resave: false,
    saveUninitialized: false, // no session until someone logs in
    cookie: { ...COOKIE_OPTIONS },
  });
}

export { createSessionMiddleware, SESSION_COOKIE_NAME, COOKIE_OPTIONS };
