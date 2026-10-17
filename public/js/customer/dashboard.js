import { requestJson } from "../common/api.js";

const createTicketBtn = document.querySelector("#new-ticket-btn");
const inProgressBox = document.querySelector("#in-progress-box");
const completedBox = document.querySelector("#completed-box");

const LOGIN_PAGE = "/pages/login.html";
const ROLE_HOME = {
  superior: "/pages/admin-dashboard.html",
  agent: "/pages/agent-queue.html",
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

// Builds a ticket card using textContent
function buildTicketCard(ticket) {
  const card = document.createElement("div");
  card.className = "ticket";

  const header = document.createElement("div");
  header.className = "ticket-header";
  const id = document.createElement("p");
  id.textContent = `Ticket #${ticket.ticketId}`;
  const date = document.createElement("p");
  date.textContent = `Opened on: ${ticket.openedAt}`;
  header.append(id, date);

  const status = document.createElement("p");
  status.textContent = `Status: ${ticket.status}`;
  const category = document.createElement("p");
  category.textContent = `Category: ${ticket.category}`;
  const description = document.createElement("p");
  description.textContent = `Description: ${ticket.description}`;

  card.append(header, status, category, description);
  return card;
}

createTicketBtn.addEventListener("click", () => createTicket());

function createTicket() {
  console.log("Creating new ticket");
  const newTicket = document.createElement("div");
  newTicket.className = "ticket";
  newTicket.textContent = "Ticket 3";
  inProgressBox.appendChild(newTicket);
}

// Replaces a box's cards with the given tickets, or a short message if none
function fillBox(box, tickets, emptyText) {
  const container = box.querySelector(".ticket-container");
  container.replaceChildren();
  if (tickets.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }
  container.append(...tickets.map(buildTicketCard));
}

async function loadTickets() {
  try {
    const { data } = await requestJson("/api/v1/tickets/mine", {
      redirectOn401: true,
    });
    const done = data.filter((t) => DONE_STATUSES.includes(t.status));
    const open = data.filter((t) => !DONE_STATUSES.includes(t.status));
    fillBox(inProgressBox, open, "No tickets in progress.");
    fillBox(completedBox, done, "No completed tickets yet.");
  } catch (error) {
    fillBox(inProgressBox, [], `Could not load tickets: ${error.message}`);
    fillBox(completedBox, [], "");
  }
}


const customer = await requireCustomer();
if (!customer) throw new Error("Redirecting");
document.querySelector("h1").textContent = `Welcome, ${customer.name}`;
loadTickets();
