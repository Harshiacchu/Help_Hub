import { requestJson } from "../common/api.js";

const title = document.querySelector("#ticket-title");
const company = document.querySelector("#ticket-company");
const description = document.querySelector("#ticket-description");

const DASHBOARD_PAGE = "/pages/customer-dashboard.html";
const LOGIN_PAGE = "/pages/login.html";
const ROLE_HOME = {
  superior: "/pages/admin-dashboard.html",
  agent: "/pages/agent-queue.html",
};

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
    try{
        const {data} = await requestJson(`/api/v1/tickets/${ticketId}`, {redirectOn401: true,});
        title.textContent = `Viewing Ticket #${data.ticketId}`;
        company.textContent = `Issued to: ${customer.tenantName}`;
        description.textContent = `${data.description}`;
    } catch(error) {
        title.textContent = 
            error.status === 404 
            ? "Ticket not found"
            : `Could not load ticket: ${error.message}`;
        company.textContent = "";
        description.textContent = "";
    }
}

const customer = await requireCustomer();
if (!customer) throw new Error("Redirecting");
loadTicketInfo();