//Tickets hold information about the tickets created by customers.
//Each ticket is ascociated with a customer, an agent, and a tenant. The ticket has a status  (opened, in-progress, completed, waiting for customer input, and closed)
//Timestamps are recored for when the ticketed is opened and closed.
//Each ticket has a priority and a category. Both are chosen by the AI from the
//company's prompt file, so each company can use its own priority labels.

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
    if (typeof priority !== "string" || !priority.trim()) {
      throw new ValidationError("Invalid priority");
    }
    if (closedAt !== null && !(new Date(closedAt) > new Date(openedAt))) {
      throw new ValidationError(
        "closedAt must be a date or time after openedAt"
      );
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
      .find({ tenantId: mustObjectId(tenantId, "tenant id"), customerId: id })
      .sort({ openedAt: -1 })
      .toArray();
  }

  //Gets the tickets assigned to an agent, newest first
  async findByAgent(tenantId, agentId) {
    return this.collection
      .find({
        tenantId: mustObjectId(tenantId, "tenant id"),
        agentId: mustObjectId(agentId, "agent id"),
      })
      .sort({ openedAt: -1 })
      .toArray();
  }

  //Counts each agent's unfinished tickets: { agentId: count }
  async countOpenByAgent(tenantId) {
    const open = await this.collection
      .find({
        tenantId: mustObjectId(tenantId, "tenant id"),
        status: { $in: ["Opened", "InProgress"] },
      })
      .toArray();
    const counts = {};
    for (const ticket of open) {
      if (ticket.agentId) {
        const id = String(ticket.agentId);
        counts[id] = (counts[id] || 0) + 1;
      }
    }
    return counts;
  }

  //Looks for a ticket in a company by ticket id (for agents and superiors)
  async findTicketInTenant(tenantId, ticketId) {
    const ticket = Number(ticketId);
    if (!Number.isInteger(ticket)) return null;
    return this.collection.findOne({
      tenantId: mustObjectId(tenantId, "tenant id"),
      ticketId: ticket,
    });
  }

  //Looks for a customer's ticket given ticket id, customer id, and tenant id
  async findTicketForCustomer(customerId, ticketId, tenantId) {
    const customer = Number(customerId);
    const ticket = Number(ticketId);
    if (!Number.isInteger(customer) || !Number.isInteger(ticket)) return null;
    return this.collection.findOne({
      tenantId: mustObjectId(tenantId, "tenant id"),
      customerId: customer,
      ticketId: ticket,
    });
  }

  //Marks an open ticket in a company as completed (done by an agent or superior).
  //Returns false if the ticket is missing or already completed or closed.
  async completeTicket(tenantId, ticketId) {
    const result = await this.collection.updateOne(
      {
        tenantId: mustObjectId(tenantId, "tenant id"),
        ticketId: Number(ticketId),
        status: { $nin: ["Completed", "Closed"] },
      },
      { $set: { status: "Completed", closedAt: new Date() } }
    );
    return result.matchedCount === 1;
  }

  //Reasons a customer can give when closing their own ticket
  static CLOSE_REASONS = ["fixed", "no_longer_issue"];

  //Closes a customer's open ticket and records why.
  //Returns false if there is no open ticket of theirs to close.
  async closeTicket(tenantId, customerId, ticketId, reason) {
    if (!TicketModel.CLOSE_REASONS.includes(reason)) {
      throw new ValidationError(
        "Please choose a reason for closing this ticket"
      );
    }
    const result = await this.collection.updateOne(
      {
        tenantId: mustObjectId(tenantId, "tenant id"),
        customerId: Number(customerId),
        ticketId: Number(ticketId),
        status: { $nin: ["Completed", "Closed"] },
      },
      { $set: { status: "Closed", closedAt: new Date(), closeReason: reason } }
    );
    return result.matchedCount === 1;
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
    const ticketId =
      fields.ticketId ?? (await this.nextTicketId(fields.tenantId));
    const ticket = TicketModel.newDocument({ ...fields, ticketId });
    const result = await this.collection.insertOne(ticket);
    return { ...ticket, _id: result.insertedId };
  }

  /** Bulk insert for the seed script (one round trip). */
  async insertMany(tickets) {
    if (tickets.length === 0) return 0;
    const result = await this.collection.insertMany(tickets, {
      ordered: false,
    });
    return result.insertedCount;
  }
}

export default TicketModel;
