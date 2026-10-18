import { requestJson } from "../common/api.js";
import { refreshWhenShown, showSignedIn, statusBadge } from "../common/ui.js";

const ticketForm = document.querySelector("#ticket-form");
const descriptionInput = document.querySelector("#ticket-form-text-area");
const formError = document.querySelector("#ticket-form-error");
const submitBtn = document.querySelector("#ticket-form-submit");
const formModal = document.querySelector("#form-modal");
const modal = bootstrap.Modal.getOrCreateInstance(formModal);
const openForm = document.querySelector("#new-ticket-btn");

const inProgressBox = document.querySelector("#in-progress-box");
const completedBox = document.querySelector("#completed-box");
const logoutBtn = document.querySelector("#logout-btn");

const LOGIN_PAGE = "/pages/login.html";
const ROLE_HOME = {
  superior: "/pages/admin-dashboard.html",
  agent: "/pages/agent-dashboard.html",
};
const DONE_STATUSES = ["Completed", "Closed"];

//Returns the logged-in customer, or redirects away and returns null
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

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "numeric",
    day: "2-digit",
    year: "2-digit",
  });

// Builds a ticket card using textContent
function buildTicketCard(ticket) {
  const card = document.createElement("a");
  card.className = "ticket h-auto"; // grows to fit long descriptions
  card.href = `/pages/customer-ticket-view.html?id=${ticket.ticketId}`;

  const header = document.createElement("div");
  header.className = "ticket-header";
  const id = document.createElement("p");
  id.textContent = `Ticket #${ticket.ticketId} `;
  id.append(statusBadge(ticket.status));
  const date = document.createElement("p");
  date.textContent = `${formatDate(ticket.openedAt)}`;
  header.append(id, date);

  const category = document.createElement("p");
  category.textContent = `Category: ${ticket.category}`;
  const description = document.createElement("p");
  description.textContent = `Description: ${ticket.description}`;

  card.append(header, category, description);
  return card;
}

// Open the form
openForm.addEventListener("click", () => {
  ticketForm.reset();
  formError.textContent = "";
  modal.show();
});

// Send the ticket, then close the form and refresh the lists
ticketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const description = descriptionInput.value.trim();
  if (!description) {
    formError.textContent = "Please describe the issue.";
    return;
  }

  submitBtn.disabled = true;
  try {
    await requestJson("/api/v1/tickets", {
      method: "POST",
      body: { description }, // the AI chooses the category and priority
      redirectOn401: true,
    });
    modal.hide();
    await loadTickets();
  } catch (error) {
    formError.textContent = error.message;
  } finally {
    submitBtn.disabled = false;
  }
});

//Logout Button clears session and sets page to Login page
logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try {
    await requestJson("/api/v1/auth/logout", { method: "POST" });
  } catch {
    //
  } finally {
    window.location.href = "/pages/login.html";
  }
});

// Replaces a box's cards with the given tickets (up to `limit`, with a note
// when some are left out), or a short message if none
function fillBox(box, tickets, emptyText, limit = Infinity) {
  const container = box.querySelector(".ticket-container");
  container.replaceChildren();
  if (tickets.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }
  container.append(...tickets.slice(0, limit).map(buildTicketCard));
  if (tickets.length > limit) {
    const note = document.createElement("p");
    note.className = "text-muted small";
    note.textContent = `Showing your ${limit} most recent of ${tickets.length} tickets.`;
    container.append(note);
  }
}

async function loadTickets() {
  try {
    const { data } = await requestJson("/api/v1/tickets/mine", {
      redirectOn401: true,
    });
    const done = data.filter((t) => DONE_STATUSES.includes(t.status));
    const open = data.filter((t) => !DONE_STATUSES.includes(t.status));
    fillBox(inProgressBox, open, "No tickets in progress.");
    // History keeps growing; showing the latest 50 keeps the page small
    fillBox(completedBox, done, "No completed tickets yet.", 50);
  } catch (error) {
    fillBox(inProgressBox, [], `Could not load tickets: ${error.message}`);
    fillBox(completedBox, [], "");
  }
}

const customer = await requireCustomer();
if (!customer) throw new Error("Redirecting");
document.querySelector("h1").textContent = `Welcome, ${customer.name}`;
showSignedIn(customer);
loadTickets();
refreshWhenShown(loadTickets); // stay current when the customer comes back to this page
