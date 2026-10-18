// public/js/auth/login.js - Login (organization + email + password)

import { requestJson } from "../common/api.js";
import { showAlert } from "../common/ui.js";

const ROLE_HOME = {
  superior: "/pages/admin-dashboard.html",
  agent: "/pages/agent-dashboard.html",
  customer: "/pages/customer-dashboard.html", // Emily's page
};

const form = document.getElementById("loginForm");
const alertContainer = document.getElementById("alertContainer");

/** True if the page exists on the server (Emily's pages may not be built yet). */
async function pageExists(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

/** Only redirects when the page exists, so nobody gets stuck on a missing page. */
async function goHome(role) {
  const page = ROLE_HOME[role];
  if (page && (await pageExists(page))) window.location.href = page;
}

// Prefill the organization when arriving from registration (?org=...)
const org = new URLSearchParams(window.location.search).get("org");
if (org) {
  document.getElementById("tenantSlug").value = org;
  document.getElementById("email").focus();
}

// Already logged in? Skip the form.
requestJson("/api/v1/auth/me")
  .then((result) => goHome(result.user.role))
  .catch(() => {});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');

  const credentials = {
    tenantSlug: document
      .getElementById("tenantSlug")
      .value.trim()
      .toLowerCase(),
    email: document.getElementById("email").value.trim(),
    password: document.getElementById("password").value,
  };

  button.disabled = true;
  try {
    const result = await requestJson("/api/v1/auth/login", {
      method: "POST",
      body: credentials,
    });
    const home = ROLE_HOME[result.user.role];
    if (home && (await pageExists(home))) {
      showAlert("Login successful! Redirecting...", "success", alertContainer);
      setTimeout(() => {
        window.location.href = home;
      }, 600);
    } else {
      showAlert(
        `Signed in as ${result.user.name}, but the ${result.user.role} pages are not available yet.`,
        "warning",
        alertContainer
      );
      button.disabled = false;
    }
  } catch (error) {
    showAlert(error.message, "danger", alertContainer);
    button.disabled = false;
  }
});
