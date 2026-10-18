// server/controllers/analyticsController.js - Dashboard numbers, analytics and CSV export
//
// Reads Emily's ticket data:
//   tickets:        ticketId, customerId, agentId, status, priority, category,
//                   description, openedAt, closedAt
//   ticketComments: ticketId, authorRole, isInternal, createdAt
// Statuses: Opened, InProgress, Completed, Closed.
// Priorities are the labels from each company's prompt file, counted as stored.
// Response time = opened -> first reply by an agent or admin that the customer
// can see (internal notes don't count).
// Resolution time = opened -> closed.

import { mustObjectId } from "../config/db.js";
import {
  STAFF_ROLES,
  ValidationError,
  parseDateParam,
} from "../utils/validators.js";

const DONE_STATUSES = ["Completed", "Closed"];
const HOUR_MS = 60 * 60 * 1000;
const EXPORT_ROW_LIMIT = 10000;

const isDone = (ticket) =>
  DONE_STATUSES.includes(ticket.status) && ticket.closedAt instanceof Date;

/** Average of durations in milliseconds, as hours with one decimal (0 if none). */
function averageHours(durations) {
  if (durations.length === 0) return 0;
  const average = durations.reduce((a, b) => a + b, 0) / durations.length;
  return Math.round((average / HOUR_MS) * 10) / 10;
}

/** { value: count } for one field, e.g. countBy(tickets, "priority"). */
function countBy(tickets, field) {
  const counts = {};
  for (const ticket of tickets) {
    const key = ticket[field] || "None";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

const resolutionTimes = (tickets) =>
  tickets.filter(isDone).map((t) => t.closedAt - t.openedAt);

class AnalyticsController {
  constructor(db) {
    this.tickets = db.collection("tickets");
    this.comments = db.collection("ticketComments");
    this.users = db.collection("users");
  }

  /** A company's tickets, optionally filtered by opened date, priority and category. */
  async findTickets(tenantId, filters = {}) {
    const query = { tenantId: mustObjectId(tenantId, "tenant id") };
    const start = parseDateParam(filters.startDate, "startDate");
    const end = parseDateParam(filters.endDate, "endDate", { endOfDay: true });
    if (start && end && start > end) {
      throw new ValidationError("startDate must be before endDate");
    }
    if (start || end) {
      query.openedAt = {};
      if (start) query.openedAt.$gte = start;
      if (end) query.openedAt.$lte = end;
    }
    if (filters.priority) query.priority = String(filters.priority);
    if (filters.category) query.category = String(filters.category);
    return this.tickets.find(query).toArray();
  }

  /** Response times (ms) of the tickets that have a staff reply the customer can see. */
  async responseTimes(tenantId, tickets) {
    const replies = await this.comments
      .find({
        tenantId: mustObjectId(tenantId, "tenant id"),
        authorRole: { $in: STAFF_ROLES },
        isInternal: false,
      })
      .toArray();
    const firstReply = new Map();
    for (const reply of replies) {
      const earliest = firstReply.get(reply.ticketId);
      if (!earliest || reply.createdAt < earliest) {
        firstReply.set(reply.ticketId, reply.createdAt);
      }
    }
    return tickets
      .filter((t) => firstReply.has(t.ticketId))
      .map((t) => ({ ticket: t, ms: firstReply.get(t.ticketId) - t.openedAt }));
  }

  async getDashboardMetrics(tenantId) {
    const tenantOid = mustObjectId(tenantId, "tenant id");
    const [tickets, agents] = await Promise.all([
      this.findTickets(tenantId),
      this.users
        .find({ tenantId: tenantOid, role: "agent", status: "active" })
        .sort({ name: 1 })
        .toArray(),
    ]);
    const responses = await this.responseTimes(tenantId, tickets);
    const byStatus = countBy(tickets, "status");
    const byPriority = countBy(tickets, "priority");
    const byCategory = countBy(tickets, "category");

    return {
      totalTickets: tickets.length,
      openedTickets: byStatus.Opened || 0,
      inProgressTickets: byStatus.InProgress || 0,
      completedTickets: byStatus.Completed || 0,
      closedTickets: byStatus.Closed || 0,
      avgResponseTime: averageHours(responses.map((r) => r.ms)),
      avgResolutionTime: averageHours(resolutionTimes(tickets)),
      ticketsByPriority: byPriority,
      topCategories: Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([category, count]) => ({ category, count })),
      agentWorkload: agents.map((agent) => {
        const mine = tickets.filter(
          (t) => String(t.agentId) === String(agent._id)
        );
        return {
          name: agent.name,
          ticketCount: mine.length,
          completed: mine.filter(isDone).length,
          avgResolutionTime: averageHours(resolutionTimes(mine)),
        };
      }),
      // The values the company's tickets use, for the analytics filters
      categories: Object.keys(byCategory)
        .filter((c) => c !== "None")
        .sort(),
      priorities: Object.keys(byPriority)
        .filter((p) => p !== "None")
        .sort(),
    };
  }

  async getAnalytics(tenantId, filters = {}) {
    const tickets = await this.findTickets(tenantId, filters);
    const responses = await this.responseTimes(tenantId, tickets);

    const responseByCategory = {};
    for (const { ticket, ms } of responses) {
      (responseByCategory[ticket.category] ||= []).push(ms);
    }

    const end = parseDateParam(filters.endDate, "endDate");
    const start = parseDateParam(filters.startDate, "startDate");
    const year = (end || start || new Date()).getUTCFullYear();
    const quarterOf = (date) => Math.floor(date.getUTCMonth() / 3) + 1;
    const quarterlyMetrics = {};
    for (let q = 1; q <= 4; q++) {
      quarterlyMetrics[`Q${q}`] = {
        opened: tickets.filter(
          (t) =>
            t.openedAt.getUTCFullYear() === year && quarterOf(t.openedAt) === q
        ).length,
        closed: tickets.filter(
          (t) =>
            isDone(t) &&
            t.closedAt.getUTCFullYear() === year &&
            quarterOf(t.closedAt) === q
        ).length,
      };
    }

    return {
      ticketsByPriority: countBy(tickets, "priority"),
      responseTimeByCategory: Object.entries(responseByCategory)
        .map(([category, list]) => ({
          category,
          avgResponseTime: averageHours(list),
        }))
        .sort((a, b) => b.avgResponseTime - a.avgResponseTime),
      quarterlyMetrics,
      filters: {
        startDate: filters.startDate || null,
        endDate: filters.endDate || null,
        priority: filters.priority || null,
        category: filters.category || null,
        year,
      },
    };
  }

  async exportTicketsCsv(tenantId, filters = {}) {
    const [tickets, staff] = await Promise.all([
      this.findTickets(tenantId, filters),
      this.users
        .find({
          tenantId: mustObjectId(tenantId, "tenant id"),
          role: { $in: STAFF_ROLES },
        })
        .toArray(),
    ]);
    const names = new Map(staff.map((u) => [String(u._id), u.name]));
    const header = [
      "Ticket ID",
      "Opened At",
      "Closed At",
      "Status",
      "Priority",
      "Category",
      "Customer ID",
      "Agent",
      "Description",
    ];
    const rows = tickets
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, EXPORT_ROW_LIMIT)
      .map((t) => [
        t.ticketId,
        t.openedAt,
        t.closedAt,
        t.status,
        t.priority,
        t.category,
        t.customerId,
        t.agentId ? names.get(String(t.agentId)) || "" : "",
        t.description,
      ]);
    const lines = [header, ...rows].map((row) =>
      row.map(AnalyticsController.csvCell).join(",")
    );
    return lines.join("\r\n") + "\r\n";
  }

  static csvCell(value) {
    if (value === null || value === undefined) return "";
    let text = value instanceof Date ? value.toISOString() : String(value);
    // Stop spreadsheet apps from running cell contents as formulas
    if (/^[-=+@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
}

export default AnalyticsController;
