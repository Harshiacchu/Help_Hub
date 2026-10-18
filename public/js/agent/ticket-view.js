import { requestJson } from "../common/api.js";

const DASHBOARD_PAGE = "/pages/agent-dashboard.html";
const commentInternal = document.querySelector("#comment-internal");
const commentContainer = document.querySelector("#comment-container");
const commentForm = document.querySelector("#comment-form");
const commentText = document.querySelector("#comment-text");
const commentError = document.querySelector("#comment-error");
const commentSubmit = document.querySelector("#comment-submit");

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

const title = document.querySelector("#ticket-title");
const company = document.querySelector("#ticket-company");
const description = document.querySelector("#ticket-description");
const priority = document.querySelector("#ticket-priority");
const category = document.querySelector("#ticket-category");
const status = document.querySelector("#ticket-status");
const completeBtn = document.querySelector("#complete-ticket-btn");

const DONE_STATUSES = ["Completed", "Closed"];
const STATUS_TEXT = {
  Opened: "Opened",
  InProgress: "In progress",
  Completed: "Completed",
  Closed: "Closed",
};

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
    status.textContent = STATUS_TEXT[data.status] || data.status;
    completeBtn.hidden = DONE_STATUSES.includes(data.status); // nothing left to complete
  } catch (error) {
    completeBtn.hidden = true;
    title.textContent =
      error.status === 404
        ? "Ticket not found"
        : `Could not load ticket: ${error.message}`;
    company.textContent = "";
    description.textContent = "";
    priority.textContent = "";
    category.textContent = "";
    status.textContent = "";
  }
}

//Label each comment with author and flag internal notes
function buildCommentElement(comment) {
  const item = document.createElement("div");
  item.className = "comment";
  const meta = document.createElement("p");
  const who = comment.authorRole === "customer" ? "Customer" : "Agent";
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
