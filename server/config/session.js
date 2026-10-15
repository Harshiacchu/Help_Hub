// server/config/session.js - Login sessions (basic)
//
// The session lives in a signed cookie, so nothing is stored on the server and
// it works on Vercel. The cookie has no expiry date: closing the browser logs
// the user out. Log out by setting req.session = null.

import cookieSession from "cookie-session";

// app.js checks that SESSION_SECRET is set before calling this
function createSessionMiddleware() {
  return cookieSession({
    name: "sessionId",
    keys: [process.env.SESSION_SECRET], // signs the cookie so it can't be changed
    httpOnly: true, // JavaScript cannot read the cookie
    secure: process.env.NODE_ENV === "production", // HTTPS only when deployed
    sameSite: "strict", // not sent on requests from other sites
  });
}

export { createSessionMiddleware };
