// public/js/admin/dashboard.js - Admin dashboard (superior role only)
// Dashboard metrics, analytics, API keys, team invites and configuration.

import { requestJson } from "../common/api.js";
import { copyText, escapeHtml, showAlert } from "../common/ui.js";

let currentUser = null;

const $ = (id) => document.getElementById(id);
const fmt1 = (n) => (typeof n === "number" ? n.toFixed(1) : "0.0");
const fmtDate = (d) => (d ? new Date(d).toLocaleString() : "Never");

/** Every dashboard request sends expired sessions back to the login page. */
function api(url, options = {}) {
  return requestJson(url, { ...options, redirectOn401: true });
}

// ============================================
// DASHBOARD METRICS
// ============================================

async function loadDashboard() {
  try {
    const { data } = await api("/api/v1/admin/dashboard");

    $("totalTickets").textContent = data.totalTickets;
    $("openedTickets").textContent = data.openedTickets;
    $("inProgressTickets").textContent = data.inProgressTickets;
    $("completedTickets").textContent = data.completedTickets;
    $("closedTickets").textContent = data.closedTickets;
    $("avgResponseTime").textContent = fmt1(data.avgResponseTime);
    $("avgResolutionTime").textContent = fmt1(data.avgResolutionTime);
    fillFilter("analyticsCategory", data.categories);
    fillFilter("analyticsPriority", data.priorities);

    $("priorityStats").innerHTML =
      Object.entries(data.ticketsByPriority)
        .map(
          ([label, count]) =>
            `<p class="mb-1"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(count)}</p>`
        )
        .join("") || '<p class="text-muted mb-0">No tickets yet</p>';

    $("topCategories").innerHTML =
      data.topCategories
        .map(
          (c) =>
            `<p class="mb-1"><strong>${escapeHtml(c.category)}:</strong> ${escapeHtml(c.count)}</p>`
        )
        .join("") || '<p class="text-muted mb-0">No tickets yet</p>';

    document.querySelector("#agentWorkloadTable tbody").innerHTML =
      data.agentWorkload
        .map(
          (a) => `
            <tr>
              <td>${escapeHtml(a.name)}</td>
              <td>${escapeHtml(a.ticketCount)}</td>
              <td>${escapeHtml(a.completed)}</td>
              <td>${fmt1(a.avgResolutionTime)} hours</td>
            </tr>`
        )
        .join("") ||
      '<tr><td colspan="4" class="text-muted">No agents yet - invite them from the Team tab</td></tr>';
  } catch (error) {
    console.error("Dashboard load error:", error);
    showAlert("Failed to load dashboard metrics: " + error.message, "danger");
  }
}

// ============================================
// ANALYTICS
// ============================================

function analyticsQuery() {
  const query = new URLSearchParams();
  const startDate = $("analyticsStartDate").value;
  const endDate = $("analyticsEndDate").value;
  const priority = $("analyticsPriority").value;
  const category = $("analyticsCategory").value;
  if (startDate) query.append("startDate", startDate);
  if (endDate) query.append("endDate", endDate);
  if (priority) query.append("priority", priority);
  if (category) query.append("category", category);
  return query;
}

async function loadAnalytics() {
  try {
    const { data } = await api(`/api/v1/admin/analytics?${analyticsQuery()}`);

    const priorityRows =
      Object.entries(data.ticketsByPriority)
        .map(
          ([label, count]) =>
            `<li class="list-group-item">${escapeHtml(label)}: ${escapeHtml(count)}</li>`
        )
        .join("") ||
      '<li class="list-group-item text-muted">No tickets in this range</li>';

    const responseRows =
      data.responseTimeByCategory
        .map(
          (c) =>
            `<li class="list-group-item">${escapeHtml(c.category)}: ${fmt1(c.avgResponseTime)} hours</li>`
        )
        .join("") ||
      '<li class="list-group-item text-muted">No replied tickets in this range</li>';

    const quarterRows = Object.entries(data.quarterlyMetrics)
      .map(
        ([q, m]) => `
          <tr>
            <td>${escapeHtml(q)}</td>
            <td>${escapeHtml(m.opened)}</td>
            <td>${escapeHtml(m.closed)}</td>
          </tr>`
      )
      .join("");

    $("analyticsResults").innerHTML = `
      <div class="row mt-3">
        <div class="col-md-6">
          <h6>Tickets by Priority</h6>
          <ul class="list-group">${priorityRows}</ul>
        </div>
        <div class="col-md-6">
          <h6>Response Time by Category</h6>
          <ul class="list-group">${responseRows}</ul>
        </div>
      </div>
      <div class="row mt-3">
        <div class="col-12">
          <h6>Quarterly Metrics (${escapeHtml(data.filters.year)})</h6>
          <table class="table table-sm">
            <thead><tr><th>Quarter</th><th>Opened</th><th>Closed</th></tr></thead>
            <tbody>${quarterRows}</tbody>
          </table>
        </div>
      </div>`;
  } catch (error) {
    console.error("Analytics load error:", error);
    showAlert("Failed to load analytics: " + error.message, "danger");
  }
}

function exportAnalytics() {
  const start = $("analyticsStartDate").value;
  const end = $("analyticsEndDate").value;
  if (start && end && start > end) {
    showAlert("The start date must be on or before the end date", "warning");
    return;
  }
  // A plain navigation sends the session cookie and lets the browser download the CSV
  window.location.href = `/api/v1/admin/analytics/export?${analyticsQuery()}`;
}

// ============================================
// API KEYS
// ============================================

async function loadApiKeys() {
  try {
    const { data } = await api("/api/v1/api-keys");
    document.querySelector("#apiKeysTable tbody").innerHTML =
      data
        .map(
          (key) => `
            <tr>
              <td>${escapeHtml(key.name)}</td>
              <td><code>${escapeHtml(key.prefix)}…</code></td>
              <td>${escapeHtml(new Date(key.createdAt).toLocaleDateString())}</td>
              <td>${escapeHtml(fmtDate(key.lastUsedAt))}</td>
              <td>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-action="rotate" data-id="${escapeHtml(key.keyId)}">Rotate</button>
                <button type="button" class="btn btn-sm btn-danger" data-action="revoke" data-id="${escapeHtml(key.keyId)}">Revoke</button>
              </td>
            </tr>`
        )
        .join("") ||
      '<tr><td colspan="5" class="text-muted">No active API keys</td></tr>';
  } catch (error) {
    console.error("API keys load error:", error);
    showAlert("Failed to load API keys: " + error.message, "danger");
  }
}

function showNewKey(key) {
  $("displayedKey").textContent = key;
  $("copyKeyButton").textContent = "Copy";
  $("newKeyDisplay").classList.remove("d-none");
}

async function createApiKey() {
  const input = $("apiKeyName");
  const name = input.value.trim();
  if (!name) {
    showAlert("Please enter a key name", "warning");
    return;
  }
  try {
    const result = await api("/api/v1/api-keys", {
      method: "POST",
      body: { name },
    });
    showNewKey(result.data.key);
    input.value = "";
    await loadApiKeys();
    showAlert(
      "API key created. Copy it now - it will not be shown again.",
      "success"
    );
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

async function revokeApiKey(keyId) {
  if (
    !confirm(
      "Revoke this API key? Systems using it will stop working immediately."
    )
  ) {
    return;
  }
  try {
    await api(`/api/v1/api-keys/${encodeURIComponent(keyId)}`, {
      method: "DELETE",
    });
    showAlert("API key revoked", "success");
    await loadApiKeys();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

async function rotateApiKey(keyId) {
  if (
    !confirm(
      "Rotate this key? The old key stops working now and a new one is issued."
    )
  ) {
    return;
  }
  try {
    const result = await api(
      `/api/v1/api-keys/${encodeURIComponent(keyId)}/rotate`,
      { method: "POST" }
    );
    showNewKey(result.data.key);
    await loadApiKeys();
    showAlert(
      "Key rotated. Copy the new key now - it will not be shown again.",
      "success"
    );
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

// ============================================
// TEAM & INVITES
// ============================================

function inviteLink(code) {
  return `${window.location.origin}/pages/register.html?code=${encodeURIComponent(code)}`;
}

async function loadShareCodes() {
  try {
    const { data } = await api("/api/v1/tenants/share-codes");
    document.querySelector("#shareCodesTable tbody").innerHTML =
      data
        .map(
          (c) => `
            <tr>
              <td><code>${escapeHtml(c.code)}</code></td>
              <td>${escapeHtml(c.role)}</td>
              <td>${escapeHtml(fmtDate(c.expiresAt))}</td>
              <td>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-action="copy-link" data-code="${escapeHtml(c.code)}">Copy invite link</button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="cancel" data-code="${escapeHtml(c.code)}">Cancel</button>
              </td>
            </tr>`
        )
        .join("") ||
      '<tr><td colspan="4" class="text-muted">No unused share codes</td></tr>';
  } catch (error) {
    console.error("Share codes load error:", error);
  }
}

async function createShareCode() {
  const role = $("inviteRole").value;
  try {
    const { data } = await api("/api/v1/tenants/share-codes", {
      method: "POST",
      body: { role },
    });
    const box = $("newShareCode");
    const text = document.createElement("span");
    text.innerHTML = `New <strong>${escapeHtml(data.role)}</strong> code: <code>${escapeHtml(data.code)}</code> (expires ${escapeHtml(fmtDate(data.expiresAt))}) `;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn btn-sm btn-outline-dark ms-2";
    copy.textContent = "Copy invite link";
    copy.addEventListener("click", () => copyText(inviteLink(data.code), copy));
    box.replaceChildren(text, copy);
    box.classList.remove("d-none");
    await loadShareCodes();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

async function cancelShareCode(code) {
  if (!confirm("Cancel this share code?")) return;
  try {
    await api(`/api/v1/tenants/share-codes/${encodeURIComponent(code)}`, {
      method: "DELETE",
    });
    await loadShareCodes();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

async function loadTeam() {
  try {
    const { data } = await api("/api/v1/tenants/agents");
    document.querySelector("#teamTable tbody").innerHTML = data
      .map((u) => {
        const isMe = u.userId === currentUser.userId;
        const active = u.status === "active";
        const action = isMe
          ? '<span class="text-muted small">You</span>'
          : `<button type="button" class="btn btn-sm ${active ? "btn-outline-danger" : "btn-outline-success"}"
               data-action="${active ? "deactivate" : "reactivate"}" data-id="${escapeHtml(u.userId)}">
               ${active ? "Deactivate" : "Reactivate"}
             </button>`;
        return `
          <tr>
            <td>${escapeHtml(u.name)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td>${escapeHtml(u.role)}</td>
            <td><span class="badge ${active ? "bg-success" : "bg-secondary"}">${escapeHtml(u.status)}</span></td>
            <td>${escapeHtml(fmtDate(u.lastLogin))}</td>
            <td>${action}</td>
          </tr>`;
      })
      .join("");
  } catch (error) {
    console.error("Team load error:", error);
    showAlert("Failed to load team: " + error.message, "danger");
  }
}

async function setMemberStatus(userId, action) {
  if (
    action === "deactivate" &&
    !confirm("Deactivate this user? They will no longer be able to sign in.")
  ) {
    return;
  }
  try {
    await api(
      `/api/v1/tenants/agents/${encodeURIComponent(userId)}/${action}`,
      { method: "POST" }
    );
    await Promise.all([loadTeam(), loadDashboard()]);
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

// ============================================
// ANALYTICS CATEGORY FILTER
// ============================================

/** Fills an analytics filter with the values this company's tickets use. */
function fillFilter(selectId, values) {
  const select = $(selectId);
  const current = select.value;
  select.replaceChildren(
    new Option("All", ""),
    ...values.map((value) => new Option(value, value))
  );
  if (values.includes(current)) select.value = current;
}

// ============================================
// ORGANIZATION
// ============================================

function tenantUrl() {
  return `/api/v1/tenants/${encodeURIComponent(currentUser.tenantId)}`;
}

async function loadOrganization() {
  try {
    const { data } = await api(tenantUrl());
    $("orgName").value = data.name;
    $("orgSupportEmail").value = data.supportEmailAlias;
    $("orgSlug").value = data.slug;
  } catch (error) {
    console.error("Organization load error:", error);
    showAlert("Failed to load organization: " + error.message, "danger");
  }
}

async function saveOrganization(event) {
  event.preventDefault();
  try {
    const { data } = await api(tenantUrl(), {
      method: "PUT",
      body: {
        name: $("orgName").value.trim(),
        supportEmailAlias: $("orgSupportEmail").value.trim(),
      },
    });
    $("tenantName").textContent = `${data.name} - ${currentUser.name}`;
    showAlert("Organization updated", "success");
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

// ============================================
// LOGOUT
// ============================================

async function logout() {
  try {
    await requestJson("/api/v1/auth/logout", { method: "POST" });
  } finally {
    window.location.href = "/pages/login.html";
  }
}

// ============================================
// EVENT WIRING (no inline onclick attributes)
// ============================================

function bindEvents() {
  $("logoutButton").addEventListener("click", logout);
  $("loadAnalyticsButton").addEventListener("click", loadAnalytics);
  $("exportCsvButton").addEventListener("click", exportAnalytics);
  $("createApiKeyButton").addEventListener("click", createApiKey);
  $("copyKeyButton").addEventListener("click", (event) =>
    copyText($("displayedKey").textContent, event.currentTarget)
  );
  $("createShareCodeButton").addEventListener("click", createShareCode);
  $("organizationForm").addEventListener("submit", saveOrganization);

  // Row buttons are rendered dynamically, so listen on the table bodies
  document
    .querySelector("#apiKeysTable tbody")
    .addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      if (button.dataset.action === "revoke") revokeApiKey(button.dataset.id);
      if (button.dataset.action === "rotate") rotateApiKey(button.dataset.id);
    });

  document
    .querySelector("#shareCodesTable tbody")
    .addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      if (button.dataset.action === "copy-link") {
        copyText(inviteLink(button.dataset.code), button);
      }
      if (button.dataset.action === "cancel") {
        cancelShareCode(button.dataset.code);
      }
    });

  document
    .querySelector("#teamTable tbody")
    .addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (button) setMemberStatus(button.dataset.id, button.dataset.action);
    });
}

// ============================================
// STARTUP
// ============================================

async function init() {
  bindEvents();

  try {
    const me = await api("/api/v1/auth/me");
    currentUser = me.user;
  } catch {
    return; // api() already redirected to login
  }

  if (currentUser.role !== "superior") {
    window.location.href = "/pages/login.html";
    return;
  }
  $("tenantName").textContent =
    `${currentUser.tenantName || ""} - ${currentUser.name}`;

  await Promise.all([
    loadDashboard(),
    loadApiKeys(),
    loadTeam(),
    loadShareCodes(),
    loadOrganization(),
  ]);
}

init();
