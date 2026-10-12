// public/js/auth/register.js - Create an account with a share code

import { requestJson } from "../common/api.js";
import { showAlert } from "../common/ui.js";

const form = document.getElementById("registerForm");
const alertContainer = document.getElementById("alertContainer");

// Min 8 chars, 1 uppercase, 1 number (the server checks this too)
const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d).{8,72}$/;

// Prefill ?code=SHARE_... from an invite link
const code = new URLSearchParams(window.location.search).get("code");
if (code) {
  document.getElementById("shareCode").value = code;
  document.getElementById("name").focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');

  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password !== confirmPassword) {
    showAlert("Passwords do not match", "danger", alertContainer);
    return;
  }
  if (!PASSWORD_RULE.test(password)) {
    showAlert(
      "Password must be 8-72 characters with at least 1 uppercase letter and 1 number",
      "danger",
      alertContainer
    );
    return;
  }

  const account = {
    shareCode: document.getElementById("shareCode").value.trim(),
    name: document.getElementById("name").value.trim(),
    email: document.getElementById("email").value.trim(),
    password,
  };

  button.disabled = true;
  try {
    const result = await requestJson("/api/v1/auth/register", {
      method: "POST",
      body: account,
    });
    showAlert(
      `Account created for ${result.data.tenantName}! Redirecting to login...`,
      "success",
      alertContainer
    );
    setTimeout(() => {
      window.location.href = `/pages/login.html?org=${encodeURIComponent(result.data.tenantSlug)}`;
    }, 1500);
  } catch (error) {
    showAlert(error.message, "danger", alertContainer);
    button.disabled = false;
  }
});
