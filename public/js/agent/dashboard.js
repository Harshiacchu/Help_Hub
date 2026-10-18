import { requestJson } from "../common/api.js";

const LOGIN_PAGE = "/pages/login.html";
const ROLE_HOME = {
  superior: "/pages/admin-dashboard.html",
  customer: "/pages/customer-dashboard.html",
};
const TICKET_PAGE = "/pages/agent-ticket-view.html";

const ticketList = document.querySelector("#ticket-list");

//Returns the logged-in agent, or redirects away and returns null
async function requireAgent() {
  try {
    const { user } = await requestJson("/api/v1/auth/me");
    if (user.role === "agent") return user;
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

//Builds one ticket row as a link to the ticket page, using textContent
function buildTicketRow(ticket) {
  const row = document.createElement("a");
  row.className = "ticket-row";
  row.href = `${TICKET_PAGE}?id=${ticket.ticketId}`;

  const header = document.createElement("div");
  header.className = "ticket-row-header";
  const id = document.createElement("span");
  id.textContent = `Ticket #${ticket.ticketId}`;
  const date = document.createElement("span");
  date.textContent = formatDate(ticket.openedAt);
  header.append(id, date);

  const details = document.createElement("p");
  details.textContent = `${ticket.category} · ${ticket.priority} priority · ${ticket.status}`;
  const description = document.createElement("p");
  description.className = "text-truncate";
  description.textContent = ticket.description;

  row.append(header, details, description);
  return row;
}

function showTickets(tickets, emptyText) {
  ticketList.replaceChildren();
  if (tickets.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = emptyText;
    ticketList.append(empty);
    return;
  }
  ticketList.append(...tickets.map(buildTicketRow));
}

//Fills the summary tiles in the left column
function showCounts(tickets) {
  const count = (...statuses) =>
    tickets.filter((t) => statuses.includes(t.status)).length;
  document.querySelector("#stat-open").textContent = count("Opened");
  document.querySelector("#stat-in-progress").textContent = count("InProgress");
  document.querySelector("#stat-closed").textContent = count(
    "Completed",
    "Closed"
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DONE_STATUSES = ["Completed", "Closed"];

//Fills the stat tiles in the right column
function showStats(tickets) {
  const now = Date.now();
  const withinWeek = (value) =>
    value && now - new Date(value).getTime() <= 7 * DAY_MS;
  const notDone = tickets.filter((t) => !DONE_STATUSES.includes(t.status));

  const oldestOpen = notDone.reduce(
    (oldest, t) => Math.min(oldest, new Date(t.openedAt).getTime()),
    now
  );

  document.querySelector("#stat-high").textContent = notDone.filter(
    (t) => rankOf(t) === 0
  ).length;
  document.querySelector("#stat-opened-week").textContent = tickets.filter(
    (t) => withinWeek(t.openedAt)
  ).length;
  document.querySelector("#stat-closed-week").textContent = tickets.filter(
    (t) => withinWeek(t.closedAt)
  ).length;
  document.querySelector("#stat-oldest").textContent = Math.floor(
    (now - oldestOpen) / DAY_MS
  );
}

const isDone = (ticket) => DONE_STATUSES.includes(ticket.status);
const closedTime = (ticket) => new Date(ticket.closedAt ?? ticket.openedAt);

//The queues in the left column: which tickets each one shows
const QUEUES = {
  mine: {
    title: "My Tickets",
    empty: "No open tickets assigned to you.",
    pick: (tickets) => tickets.filter((t) => !isDone(t)),
  },
  closed: {
    title: "Recently Closed",
    empty: "No closed tickets yet.",
    pick: (tickets) =>
      tickets.filter(isDone).sort((a, b) => closedTime(b) - closedTime(a)),
  },
};

// Most urgent first, for the priority labels in the demo companies' prompt
// files (Acme Corp and Cascade Health). Any other label sorts after these.
const PRIORITY_RANK = {
  High: 0,
  Medium: 1,
  Low: 3,
  "Urgent Care Access": 0,
  "Time-Sensitive": 1,
  Standard: 2,
  "General Inquiry": 4,
};
const rankOf = (ticket) => PRIORITY_RANK[ticket.priority] ?? 5;

let allTickets = [];
let currentQueue = "mine";
let sortMode = "default"; // "default", "priority" or "oldest"

//Shows one queue in the middle column and marks its link as active
function showQueue(name) {
  const queue = QUEUES[name];
  if (!queue) return;
  currentQueue = name;
  document.querySelector("#ticket-heading").textContent = queue.title;
  document.querySelectorAll(".queue-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.queue === name);
  });

  let tickets = queue.pick(allTickets);
  if (sortMode === "priority") {
    // Array.sort is stable, so tickets with the same priority keep their order
    tickets = [...tickets].sort((a, b) => rankOf(a) - rankOf(b));
  } else if (sortMode === "oldest") {
    tickets = [...tickets].sort(
      (a, b) => new Date(a.openedAt) - new Date(b.openedAt)
    );
  }
  showTickets(tickets, queue.empty);
}

//Sort buttons: one sort is active at a time; clicking the active one goes back to the default order
const SORT_BUTTONS = {
  priority: document.querySelector("#sort-priority-btn"),
  oldest: document.querySelector("#sort-date-btn"),
};

for (const [mode, button] of Object.entries(SORT_BUTTONS)) {
  button.addEventListener("click", () => {
    sortMode = sortMode === mode ? "default" : mode;
    for (const [name, other] of Object.entries(SORT_BUTTONS)) {
      other.classList.toggle("active", sortMode === name);
      other.setAttribute("aria-pressed", String(sortMode === name));
    }
    showQueue(currentQueue);
  });
}

document.querySelectorAll(".queue-link").forEach((button) => {
  button.addEventListener("click", () => showQueue(button.dataset.queue));
});

async function loadTickets() {
  try {
    const { data } = await requestJson("/api/v1/tickets/assigned", {
      redirectOn401: true,
    });
    allTickets = data;
    showQueue("mine");
    showCounts(data);
    showStats(data);
  } catch (error) {
    ticketList.textContent = `Could not load tickets: ${error.message}`;
  }
}

//Logout button clears the session and returns to the login page
const logoutBtn = document.querySelector("#logout-btn");
logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try {
    await requestJson("/api/v1/auth/logout", { method: "POST" });
  } catch {
    // ignore: we leave the page either way
  } finally {
    window.location.href = LOGIN_PAGE;
  }
});

const agent = await requireAgent();
if (!agent) throw new Error("Redirecting");
loadTickets();
