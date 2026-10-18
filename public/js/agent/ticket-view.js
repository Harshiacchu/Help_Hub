import { requestJson } from "../common/api.js";
import { refreshWhenShown, showSignedIn, statusBadge } from "../common/ui.js";

const DASHBOARD_PAGE = "/pages/agent-dashboard.html";
const commentInternal = document.querySelector("#comment-internal");
const commentContainer = document.querySelector("#comment-container");
const commentForm = document.querySelector("#comment-form");
const commentText = document.querySelector("#comment-text");
const commentError = document.querySelector("#comment-error");
const commentSubmit = document.querySelector("#comment-submit");
const commentClosed = document.querySelector("#comment-closed");

const formatDateTime = (value) =>
  new Date(value).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });

//Read the ticket number from the URL
const ticketId = Number(new URLSearchParams(window.location.search).get("id"));
if (!Number.isInteger(ticketId) || ticketId < 1) {
  window.location.href = DASHBOARD_PAGE; // missing or invalid id
  throw new Error("Missing ticket id"); // stop the rest of the script
}

async function requireStaff() {
  try {
    const { user } = await requestJson("/api/v1/auth/me");
    if (user.role === "agent" || user.role === "superior") return user;
    window.location.href = "/pages/customer-dashboard.html";
  } catch {
    window.location.href = "/pages/login.html";
  }
  return null;
}

const me = await requireStaff();
if (!me) throw new Error("Redirecting");
showSignedIn(me);

// Admins open escalated tickets here too; send them back to their own dashboard
if (me.role === "superior") {
  document.querySelector("#back-link").href = "/pages/admin-dashboard.html";
  document.querySelector("#navbar-brand").textContent =
    "HelpHub Admin Dashboard";
}

const title = document.querySelector("#ticket-title");
const company = document.querySelector("#ticket-company");
const description = document.querySelector("#ticket-description");
const priority = document.querySelector("#ticket-priority");
const category = document.querySelector("#ticket-category");
const source = document.querySelector("#ticket-source");
const status = document.querySelector("#ticket-status");
const completeBtn = document.querySelector("#complete-ticket-btn");
const escalateBtn = document.querySelector("#escalate-btn");
const escalationInfo = document.querySelector("#escalation-info");
const escalateForm = document.querySelector("#escalate-form");
const escalateReason = document.querySelector("#escalate-reason");
const escalateNote = document.querySelector("#escalate-note");
const escalateError = document.querySelector("#escalate-error");
const escalateSubmit = document.querySelector("#escalate-submit");
const escalateCancel = document.querySelector("#escalate-cancel");

const DONE_STATUSES = ["Completed", "Closed"];
const ESCALATION_REASONS = {
  needs_approval: "Needs an admin's approval",
  beyond_access: "Outside what I can resolve",
  unhappy_customer: "Customer asked for a manager",
  other: "Other",
};

//Show the escalation, and the Escalate button only to the ticket's own agent
//while the ticket is open and not yet escalated
function showEscalation(ticket, done) {
  if (ticket.escalation) {
    const reason =
      ESCALATION_REASONS[ticket.escalation.reason] || ticket.escalation.reason;
    escalationInfo.textContent = `Escalated to the admins on ${formatDateTime(ticket.escalation.escalatedAt)}. Reason: ${reason}. Note: ${ticket.escalation.note}`;
  }
  escalationInfo.hidden = !ticket.escalation;
  escalateBtn.hidden =
    !escalateForm.hidden || // the escalate form is already open
    me.role !== "agent" ||
    done ||
    Boolean(ticket.escalation) ||
    String(ticket.agentId) !== me.userId;
}

//Load the ticket's info into the page
async function loadTicketInfo() {
  try {
    const { data } = await requestJson(`/api/v1/tickets/${ticketId}`, {
      redirectOn401: true,
    });
    title.textContent = `Viewing Ticket #${data.ticketId}`;
    company.textContent = `Issued to: ${me.tenantName}`;
    description.textContent = data.description;
    priority.textContent = data.priority;
    category.textContent = data.category;
    const channel = {
      web: "Customer portal",
      api: "API (another system)",
      email: "Email",
    }[data.source];
    source.textContent =
      (channel || "Customer portal") +
      (data.fromEmail ? ` (from ${data.fromEmail})` : "");
    status.replaceChildren(statusBadge(data.status));
    const done = DONE_STATUSES.includes(data.status);
    completeBtn.hidden = done; // nothing left to complete
    showEscalation(data, done);
    // A finished ticket is closed: no more comments and no escalation
    commentForm.hidden = done;
    commentClosed.hidden = !done;
    if (done) escalateForm.hidden = true;
  } catch (error) {
    completeBtn.hidden = true;
    escalateBtn.hidden = true;
    commentForm.hidden = true;
    commentClosed.hidden = true;
    escalationInfo.hidden = true;
    title.textContent =
      error.status === 404
        ? "Ticket not found"
        : `Could not load ticket: ${error.message}`;
    company.textContent = "";
    description.textContent = "";
    priority.textContent = "";
    category.textContent = "";
    source.textContent = "";
    status.textContent = "";
  }
}

//Label each comment with author and flag internal notes
function buildCommentElement(comment) {
  const item = document.createElement("div");
  item.className = "comment";
  const meta = document.createElement("p");
  const who =
    { customer: "Customer", agent: "Agent", superior: "Admin" }[
      comment.authorRole
    ] || "Staff";
  const internal = comment.isInternal ? " · Internal note" : "";
  meta.textContent = `${who}${internal} · ${formatDateTime(comment.createdAt)}`;
  const body = document.createElement("p");
  body.textContent = comment.body;
  item.append(meta, body);
  return item;
}

async function loadComments() {
  try {
    const { data } = await requestJson(`/api/v1/tickets/${ticketId}/comments`, {
      redirectOn401: true,
    });
    commentContainer.replaceChildren();
    if (data.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No comments yet.";
      commentContainer.append(empty);
      return;
    }
    commentContainer.append(...data.map(buildCommentElement));
  } catch (error) {
    commentContainer.textContent = `Could not load comments: ${error.message}`;
  }
}

//
commentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = commentText.value.trim();
  if (!body) {
    commentError.textContent = "Please write a comment first.";
    return;
  }

  commentSubmit.disabled = true;
  commentError.textContent = "";
  try {
    await requestJson(`/api/v1/tickets/${ticketId}/comments`, {
      method: "POST",
      body: { body, isInternal: commentInternal.checked },
      redirectOn401: true,
    });
    commentForm.reset();
    await loadComments();
    await loadTicketInfo(); // a reply to the customer moves the ticket to In progress
  } catch (error) {
    commentError.textContent = error.message;
  } finally {
    commentSubmit.disabled = false;
  }
});

//Mark the ticket as completed, then refresh the page info
completeBtn.addEventListener("click", async () => {
  completeBtn.disabled = true;
  try {
    await requestJson(`/api/v1/tickets/${ticketId}/complete`, {
      method: "POST",
      redirectOn401: true,
    });
    await loadTicketInfo(); // hides the button
  } catch (error) {
    alert(error.message);
  } finally {
    completeBtn.disabled = false;
  }
});

//Escalate: show the form, then send the ticket up to the admins
escalateBtn.addEventListener("click", () => {
  escalateForm.hidden = false;
  escalateBtn.hidden = true;
  escalateReason.focus();
});

escalateCancel.addEventListener("click", () => {
  escalateForm.reset();
  escalateError.textContent = "";
  escalateForm.hidden = true;
  escalateBtn.hidden = false;
});

escalateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  escalateSubmit.disabled = true;
  escalateError.textContent = "";
  try {
    await requestJson(`/api/v1/tickets/${ticketId}/escalate`, {
      method: "POST",
      body: { reason: escalateReason.value, note: escalateNote.value.trim() },
      redirectOn401: true,
    });
    escalateForm.reset();
    escalateForm.hidden = true;
    await loadTicketInfo(); // shows the escalation banner
    await loadComments(); // shows the internal note with the reason
  } catch (error) {
    escalateError.textContent = error.message;
  } finally {
    escalateSubmit.disabled = false;
  }
});

//Log Out button clears the session and returns to the login page
const logoutBtn = document.querySelector("#logout-btn");
logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try {
    await requestJson("/api/v1/auth/logout", { method: "POST" });
  } catch {
    // leave the page either way
  } finally {
    window.location.href = "/pages/login.html";
  }
});

loadTicketInfo();
loadComments();
// Stay current when someone comes back to this page
refreshWhenShown(() => {
  loadTicketInfo();
  loadComments();
});
