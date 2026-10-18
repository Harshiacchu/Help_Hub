import { requestJson } from "../common/api.js";
import { refreshWhenShown, showSignedIn, statusBadge } from "../common/ui.js";

const title = document.querySelector("#ticket-title");
const company = document.querySelector("#ticket-company");
const description = document.querySelector("#ticket-description");
const status = document.querySelector("#ticket-status");
const commentContainer = document.querySelector("#comment-container");
const commentForm = document.querySelector("#comment-form");
const commentText = document.querySelector("#comment-text");
const commentError = document.querySelector("#comment-error");
const commentSubmit = document.querySelector("#comment-submit");
const commentClosed = document.querySelector("#comment-closed");
const closeBtn = document.querySelector("#close-ticket-btn");
const closeForm = document.querySelector("#close-form");
const closeError = document.querySelector("#close-error");
const closeSubmit = document.querySelector("#close-submit");
const closeModal = bootstrap.Modal.getOrCreateInstance(
  document.querySelector("#close-modal")
); // `bootstrap` is global from the bundle script

const DONE_STATUSES = ["Completed", "Closed"];

// What an unfinished status means for the customer, shown after the badge
const STATUS_HINTS = {
  Opened: "waiting for an agent",
  InProgress: "an agent is working on it",
};

const DASHBOARD_PAGE = "/pages/customer-dashboard.html";
const LOGIN_PAGE = "/pages/login.html";
const ROLE_HOME = {
  superior: "/pages/admin-dashboard.html",
  agent: "/pages/agent-dashboard.html",
};

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

//Check that the user is logged in as a customer. End the session otherwise.
async function requireCustomer() {
  try {
    const { user } = await requestJson("/api/v1/auth/me");
    if (user.role === "customer") return user;
    window.location.href = ROLE_HOME[user.role] || LOGIN_PAGE;
  } catch {
    window.location.href = LOGIN_PAGE; // not logged in, or the session expired
  }
  return null;
}

//Load ticket info into webpage
async function loadTicketInfo() {
  try {
    const { data } = await requestJson(`/api/v1/tickets/${ticketId}`, {
      redirectOn401: true,
    });
    title.textContent = `Viewing Ticket #${data.ticketId}`;
    company.textContent = `Issued to: ${customer.tenantName}`;
    description.textContent = `${data.description}`;
    status.replaceChildren(
      statusBadge(data.status),
      STATUS_HINTS[data.status] ? ` ${STATUS_HINTS[data.status]}` : ""
    );
    closeBtn.hidden = DONE_STATUSES.includes(data.status); // nothing to close
    // A finished ticket is closed: no more comments
    commentForm.hidden = DONE_STATUSES.includes(data.status);
    commentClosed.hidden = !commentForm.hidden;
  } catch (error) {
    closeBtn.hidden = true;
    commentForm.hidden = true;
    commentClosed.hidden = true;
    title.textContent =
      error.status === 404
        ? "Ticket not found"
        : `Could not load ticket: ${error.message}`;
    company.textContent = "";
    description.textContent = "";
    status.textContent = "";
  }
}

// Builds one comment
function buildCommentElement(comment) {
  const item = document.createElement("div");
  item.className = "comment";
  const meta = document.createElement("p");
  const who = comment.authorRole === "customer" ? "You" : "Support agent";
  meta.textContent = `${who} · ${formatDateTime(comment.createdAt)}`;
  const body = document.createElement("p");
  body.textContent = comment.body;
  item.append(meta, body);
  return item;
}

//Loads comments into page
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
      body: { body },
      redirectOn401: true,
    });
    commentForm.reset();
    await loadComments();
  } catch (error) {
    commentError.textContent = error.message;
  } finally {
    commentSubmit.disabled = false;
  }
});

//Open the close-ticket form with nothing selected
closeBtn.addEventListener("click", () => {
  closeForm.reset();
  closeError.textContent = "";
  closeModal.show();
});

//"Close this ticket": a reason must be chosen, then the ticket is closed
closeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const chosen = closeForm.querySelector('input[name="close-reason"]:checked');
  if (!chosen) {
    closeError.textContent =
      "Please choose a reason before closing this ticket.";
    return;
  }

  closeSubmit.disabled = true;
  closeError.textContent = "";
  try {
    await requestJson(`/api/v1/tickets/${ticketId}/close`, {
      method: "POST",
      body: { reason: chosen.value },
      redirectOn401: true,
    });
    closeModal.hide();
    await loadTicketInfo(); // hides the Close Ticket button
  } catch (error) {
    closeError.textContent = error.message;
  } finally {
    closeSubmit.disabled = false;
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
    window.location.href = LOGIN_PAGE;
  }
});

const customer = await requireCustomer();
if (!customer) throw new Error("Redirecting");
showSignedIn(customer);
loadTicketInfo();
loadComments();
// Stay current when the customer comes back to this page
refreshWhenShown(() => {
  loadTicketInfo();
  loadComments();
});
