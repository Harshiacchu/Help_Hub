// public/js/auth/register-tenant.js - Organization registration

import { requestJson } from "../common/api.js";
import { copyText, showAlert } from "../common/ui.js";

const form = document.getElementById("registerTenantForm");
const alertContainer = document.getElementById("alertContainer");
const slugInput = document.getElementById("slug");
let slugEditedByHand = false;

// Suggest a slug from the company name until the user types their own
document.getElementById("companyName").addEventListener("input", (event) => {
  if (slugEditedByHand) return;
  slugInput.value = event.target.value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
});

slugInput.addEventListener("input", () => {
  slugEditedByHand = slugInput.value.trim() !== "";
  slugInput.value = slugInput.value.toLowerCase();
});

function hours(id) {
  return parseInt(document.getElementById(id).value, 10);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');

  const organization = {
    name: document.getElementById("companyName").value.trim(),
    slug: slugInput.value.trim().toLowerCase(),
    supportEmailAlias: document.getElementById("supportEmail").value.trim(),
    slaTargets: {
      critical: hours("slaCritical"),
      high: hours("slaHigh"),
      medium: hours("slaMedium"),
      low: hours("slaLow"),
      minimal: hours("slaMinimal"),
    },
  };

  button.disabled = true;
  try {
    const result = await requestJson("/api/v1/auth/register-tenant", {
      method: "POST",
      body: organization,
    });

    // Keep the share code on screen - redirecting away would lose it
    const { shareCode, slug } = result.data;
    document.getElementById("shareCodeValue").textContent = shareCode;
    document.getElementById("slugValue").textContent = slug;
    document.getElementById("continueToRegister").href =
      `register.html?code=${encodeURIComponent(shareCode)}&org=${encodeURIComponent(slug)}`;
    document.getElementById("registrationResult").classList.remove("d-none");
    alertContainer.replaceChildren();
    form.classList.add("d-none");
  } catch (error) {
    showAlert(error.message, "danger", alertContainer);
    button.disabled = false;
  }
});

document.getElementById("copyShareCode").addEventListener("click", (event) => {
  copyText(
    document.getElementById("shareCodeValue").textContent,
    event.currentTarget
  );
});
