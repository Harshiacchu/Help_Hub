// public/js/common/ui.js - Shared UI helpers used by every page

/** Escape text before it goes inside innerHTML. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Shows a Bootstrap alert. With a container, it replaces the container's
 * content; without one, it floats at the top of the page for 6 seconds.
 * Uses textContent, so server messages are never interpreted as HTML.
 */
export function showAlert(message, type = "info", container = null) {
  const alert = document.createElement("div");
  alert.setAttribute("role", "alert");
  alert.textContent = message;

  if (container) {
    alert.className = `alert alert-${type} mt-3`;
    container.replaceChildren(alert);
    return;
  }

  alert.className = `alert alert-${type} alert-dismissible fade show m-3`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn-close";
  close.setAttribute("data-bs-dismiss", "alert");
  close.setAttribute("aria-label", "Close");
  alert.appendChild(close);
  document.body.prepend(alert);
  setTimeout(() => alert.remove(), 6000);
}

export async function copyText(text, button = null) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) button.textContent = "Copied";
  } catch {
    showAlert(
      "Copy failed - please select the text and copy it manually.",
      "warning"
    );
  }
}
