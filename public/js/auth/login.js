// public/js/auth/login.js - Login (organization + email + password)

import { requestJson } from "../common/api.js";
import { showAlert } from "../common/ui.js";

const ROLE_HOME = {
  superior: "/pages/admin-dashboard.html",
  agent: "/pages/agent-queue.html", // Emily's page
  customer: "/pages/my-tickets.html", // Emily's page
};
const LAST_ORG_KEY = "helphub.lastOrg";

const form = document.getElementById("loginForm");
const alertContainer = document.getElementById("alertContainer");

function goHome(role) {
  window.location.href = ROLE_HOME[role] || "/pages/login.html";
}

function readSavedOrganization() {
  try {
    return localStorage.getItem(LAST_ORG_KEY);
  } catch {
    return null; // storage can be blocked by the browser
  }
}

function saveOrganization(slug) {
  try {
    localStorage.setItem(LAST_ORG_KEY, slug);
  } catch {
    // not critical - the user just types the organization next time
  }
}

// Prefill organization from ?org=... (after registering) or from the last login
const org =
  new URLSearchParams(window.location.search).get("org") ||
  readSavedOrganization();
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
    rememberMe: document.getElementById("rememberMe").checked,
  };

  button.disabled = true;
  try {
    const result = await requestJson("/api/v1/auth/login", {
      method: "POST",
      body: credentials,
    });
    saveOrganization(result.user.tenantSlug);
    showAlert("Login successful! Redirecting...", "success", alertContainer);
    setTimeout(() => goHome(result.user.role), 600);
  } catch (error) {
    showAlert(error.message, "danger", alertContainer);
    button.disabled = false;
  }
});
