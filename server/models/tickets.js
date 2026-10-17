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

import { mustObjectId } from "../config/db.js";
import { ValidationError } from "../utils/validators.js";

const STATUSES = ["Opened", "InProgress", "Completed", "Closed"];
const PRIORITIES = ["Low", "Medium", "High"];

class TicketModel {
    constructor(db) {
        this.collection = db.collection("tickets");
    }

    /** Builds one ticket document (also used by the seed script). */
  static newDocument({
    tenantId,
    customerId,
    ticketId,
    agentId = null,
    status = "Opened",
    priority = "Low",
    description,
    category,
    openedAt = new Date(),
    closedAt = null,
  }) {

    if (!STATUSES.includes(status)) throw new ValidationError("Invalid status");
    if (!PRIORITIES.includes(priority)) throw new ValidationError("Invalid priority");
    if (closedAt !== null && !(new Date(closedAt) > new Date(openedAt))) {
        throw new ValidationError("closedAt must be a date or time after openedAt");
    }
    return {
      tenantId: mustObjectId(tenantId, "tenant id"),
      customerId,
      ticketId,
      agentId,
      status,
      priority,
      description,
      category,
      openedAt,
      closedAt,
    };
}
 
  //Gets the customer's tickets based on tenant, newest first
  async findByCustomer(tenantId, customerId) {
    const id = Number(customerId);
    if (!Number.isInteger(id)) return [];
    return this.collection
        .find({tenantId: mustObjectId(tenantId, "tenant id"), customerId: id})
        .sort({openedAt: -1})
        .toArray();
  }

  //Gets the next available ticketId number for the given tenant
  async nextTicketId(tenantId) {
    const [last] = await this.collection
        .find({ tenantId: mustObjectId(tenantId, "tenant id") })
        .sort({ ticketId: -1 })
        .limit(1)
        .toArray();
      return last ? last.ticketId + 1 : 1;
    }
  

  //Create a ticket
  async create(fields) {
    const ticketId = fields.ticketId ?? (await this.nextTicketId(fields.tenantId));
    const ticket = TicketModel.newDocument({...fields, ticketId});
    const result = await this.collection.insertOne(ticket);
    return {...ticket, _id: result.insertedId };
  }

  /** Bulk insert for the seed script (one round trip). */
  async insertMany(tickets) {
    if (tickets.length === 0) return 0;
    const result = await this.collection.insertMany(tickets, { ordered: false });
    return result.insertedCount;
  }
}

 

export default TicketModel;
