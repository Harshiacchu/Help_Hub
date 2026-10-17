//Tickets hold information about the tickets created by customers.
//Each ticket is ascociated with a customer, an agent, and a tenant. The ticket has a status  (opened, in-progress, completed, waiting for customer input, and closed)
//Timestamps are recored for when the ticketed is opened and closed.
//Each ticket has a priority (low, medium, high), a description, and a category (assigned by the company)

// Fields used, from the agreed schema:
// ticket
//   ticket comments: tenantId, ticketId, authorId, isInternal, createdAt
// Response time = first public comment by someone other than the customer.
// All dates are grouped in UTC.

/*
customerId
ticketId : unique
agentId
tenantId
status
openedAt
closedAt : must be after openedAt
priority
description
category
*/

import { readFile } from "node:fs/promises";

const MOCK_TICKETS_PATH = new URL("../../data/Mock_Tickets_1.json", import.meta.url);

class TicketModel {
  // Reads the mock data for now; swap this for a db.collection("tickets") query later.
  async loadAll() {
    return JSON.parse(await readFile(MOCK_TICKETS_PATH, "utf8"));
  }

  /** One customer's tickets, newest first. */
  async findByCustomer(customerId) {
    const id = Number(customerId);
    if (!Number.isInteger(id)) return [];
    const tickets = (await this.loadAll()).filter((t) => t.customerId === id);
    return tickets.sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
  }
}

export default TicketModel;
