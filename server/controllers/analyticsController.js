// server/controllers/analyticsController.js - Dashboard & analytics metrics
//
// Reads Emily's collections (tickets, comments) - never writes to them.
// Fields used, from the agreed schema:
//   tickets:  tenantId, customerId, assigneeId, priority (1-5), category, status,
//             createdAt, resolvedAt, slaDueAt
//   comments: tenantId, ticketId, authorId, isInternal, createdAt
// Response time = first public comment by someone other than the customer.
// All dates are grouped in UTC.

import { mustObjectId } from "../config/db.js";
import {
  assertPriority,
  parseDateParam,
  ValidationError,
} from "../utils/validators.js";

const HOUR_MS = 60 * 60 * 1000;
const EXPORT_ROW_LIMIT = 10000;
const CLOSED_STATUSES = ["resolved", "closed"];
const PRIORITY_LABELS = {
  1: "Critical",
  2: "High",
  3: "Medium",
  4: "Low",
  5: "Minimal",
};

const round1 = (n) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
const msToHours = (ms) => round1((ms || 0) / HOUR_MS);
const percent = (part, total) => (total > 0 ? round1((part / total) * 100) : 0);

// "resolved on time" for tickets that have both resolvedAt and slaDueAt
const IS_DATE = (field) => ({ $eq: [{ $type: field }, "date"] });
const SLA_TRACKED = { $and: [IS_DATE("$resolvedAt"), IS_DATE("$slaDueAt")] };
const SLA_MET = { $and: [SLA_TRACKED, { $lte: ["$resolvedAt", "$slaDueAt"] }] };

class AnalyticsController {
  constructor(db) {
    this.tickets = db.collection("tickets");
    this.users = db.collection("users");
  }

  /** Validates query params into a Mongo match stage (always tenant-scoped). */
  buildMatch(tenantId, filters = {}) {
    const match = { tenantId: mustObjectId(tenantId, "tenant id") };

    const start = parseDateParam(filters.startDate, "startDate");
    const end = parseDateParam(filters.endDate, "endDate", { endOfDay: true });
    if (start && end && start > end)
      throw new ValidationError("startDate must be before endDate");
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = start;
      if (end) match.createdAt.$lte = end;
    }

    if (filters.priority !== undefined && filters.priority !== "") {
      match.priority = assertPriority(filters.priority);
    }
    if (typeof filters.category === "string" && filters.category.trim()) {
      match.category = filters.category.trim();
    }
    return match;
  }

  /** Pipeline stages that attach firstReplyAt (earliest public non-customer comment). */
  firstReplyStages(tenantOid) {
    return [
      {
        $lookup: {
          from: "comments",
          let: { ticketId: "$_id", customerId: "$customerId" },
          pipeline: [
            {
              $match: {
                tenantId: tenantOid,
                $expr: {
                  $and: [
                    { $eq: ["$ticketId", "$$ticketId"] },
                    { $ne: ["$authorId", "$$customerId"] },
                    { $ne: ["$isInternal", true] },
                  ],
                },
              },
            },
            { $group: { _id: null, first: { $min: "$createdAt" } } },
          ],
          as: "firstReply",
        },
      },
      { $unwind: "$firstReply" },
      {
        $addFields: {
          responseMs: { $subtract: ["$firstReply.first", "$createdAt"] },
        },
      },
    ];
  }

  // ============================================
  // DASHBOARD
  // ============================================

  async getDashboardMetrics(tenantId) {
    const match = this.buildMatch(tenantId);
    const [labels, facetResult, avgResponseTime, agentWorkload] =
      await Promise.all([
        PRIORITY_LABELS,
        this.tickets
          .aggregate([
            { $match: match },
            {
              $facet: {
                byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
                byPriority: [
                  { $group: { _id: "$priority", count: { $sum: 1 } } },
                ],
                resolution: [
                  { $match: { resolvedAt: { $type: "date" } } },
                  {
                    $group: {
                      _id: null,
                      avgMs: {
                        $avg: { $subtract: ["$resolvedAt", "$createdAt"] },
                      },
                      slaTracked: { $sum: { $cond: [SLA_TRACKED, 1, 0] } },
                      slaMet: { $sum: { $cond: [SLA_MET, 1, 0] } },
                    },
                  },
                ],
                topCategories: [
                  { $match: { category: { $type: "string", $ne: "" } } },
                  { $group: { _id: "$category", count: { $sum: 1 } } },
                  { $sort: { count: -1, _id: 1 } },
                  { $limit: 5 },
                ],
              },
            },
          ])
          .toArray(),
        this.getAverageResponseTime(tenantId),
        this.getAgentWorkload(tenantId),
      ]);

    const facet = facetResult[0] || {};
    const statusCounts = Object.fromEntries(
      (facet.byStatus || []).map((s) => [s._id, s.count])
    );
    const priorityCounts = Object.fromEntries(
      (facet.byPriority || []).map((p) => [String(p._id), p.count])
    );
    const resolution = (facet.resolution && facet.resolution[0]) || {};

    const ticketsByPriority = {};
    for (let level = 1; level <= 5; level++) {
      ticketsByPriority[labels[level]] = priorityCounts[String(level)] || 0;
    }

    const totalTickets = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    // The categories this company's tickets use (fills the analytics filter)
    const categories = (
      await this.tickets.distinct("category", { tenantId: match.tenantId })
    )
      .filter(Boolean)
      .sort();

    return {
      totalTickets,
      openTickets: statusCounts.open || 0,
      inProgressTickets: statusCounts.in_progress || 0,
      pendingTickets: statusCounts.pending || 0,
      resolvedTickets: statusCounts.resolved || 0,
      closedTickets: CLOSED_STATUSES.reduce(
        (sum, s) => sum + (statusCounts[s] || 0),
        0
      ),
      avgResponseTime,
      avgResolutionTime: msToHours(resolution.avgMs),
      slaCompliance: percent(
        resolution.slaMet || 0,
        resolution.slaTracked || 0
      ),
      ticketsByPriority,
      ticketsByStatus: statusCounts,
      agentWorkload,
      topCategories: (facet.topCategories || []).map((c) => ({
        category: c._id,
        count: c.count,
      })),
      categories,
    };
  }

  /** Average hours from ticket creation to first agent reply. */
  async getAverageResponseTime(tenantId, filters = {}) {
    const match = this.buildMatch(tenantId, filters);
    const [row] = await this.tickets
      .aggregate([
        { $match: match },
        ...this.firstReplyStages(match.tenantId),
        { $group: { _id: null, avgMs: { $avg: "$responseMs" } } },
      ])
      .toArray();
    return msToHours(row && row.avgMs);
  }

  /** { Critical: %, High: %, ... } */
  async getSLAByPriority(tenantId, filters = {}) {
    const [labels, rows] = await Promise.all([
      PRIORITY_LABELS,
      this.tickets
        .aggregate([
          { $match: this.buildMatch(tenantId, filters) },
          {
            $group: {
              _id: "$priority",
              tracked: { $sum: { $cond: [SLA_TRACKED, 1, 0] } },
              met: { $sum: { $cond: [SLA_MET, 1, 0] } },
            },
          },
        ])
        .toArray(),
    ]);
    const byPriority = Object.fromEntries(rows.map((r) => [String(r._id), r]));
    const result = {};
    for (let level = 1; level <= 5; level++) {
      const r = byPriority[String(level)];
      result[labels[level]] = percent(r ? r.met : 0, r ? r.tracked : 0);
    }
    return result;
  }

  /** One row per active agent/superior, including people with no tickets yet. */
  async getAgentWorkload(tenantId) {
    const tenantOid = mustObjectId(tenantId, "tenant id");
    const [staff, rows] = await Promise.all([
      this.users
        .find({
          tenantId: tenantOid,
          role: { $in: ["agent", "superior"] },
          status: "active",
        })
        .project({ name: 1, role: 1 })
        .toArray(),
      this.tickets
        .aggregate([
          { $match: { tenantId: tenantOid, assigneeId: { $ne: null } } },
          {
            $group: {
              _id: "$assigneeId",
              ticketCount: { $sum: 1 },
              openCount: {
                $sum: { $cond: [{ $in: ["$status", CLOSED_STATUSES] }, 0, 1] },
              },
              avgResolutionMs: {
                $avg: {
                  $cond: [
                    IS_DATE("$resolvedAt"),
                    { $subtract: ["$resolvedAt", "$createdAt"] },
                    null,
                  ],
                },
              },
              slaMet: { $sum: { $cond: [SLA_MET, 1, 0] } },
            },
          },
        ])
        .toArray(),
    ]);

    const statsById = Object.fromEntries(rows.map((r) => [String(r._id), r]));
    return staff
      .map((user) => {
        const s = statsById[String(user._id)] || {};
        return {
          userId: String(user._id),
          name: user.name,
          role: user.role,
          ticketCount: s.ticketCount || 0,
          openCount: s.openCount || 0,
          avgResolutionTime: msToHours(s.avgResolutionMs),
          slaMet: s.slaMet || 0,
        };
      })
      .sort(
        (a, b) => b.ticketCount - a.ticketCount || a.name.localeCompare(b.name)
      );
  }

  /** { Q1: { ticketsCreated, resolved, slaCompliance }, ... } for one calendar year (UTC). */
  async getQuarterlyMetrics(
    tenantId,
    year = new Date().getUTCFullYear(),
    filters = {}
  ) {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100)
      throw new ValidationError("year must be between 2000 and 2100");

    const base = this.buildMatch(tenantId, {
      priority: filters.priority,
      category: filters.category,
    });
    const yearStart = new Date(Date.UTC(y, 0, 1));
    const yearEnd = new Date(Date.UTC(y + 1, 0, 1));
    const quarterOf = (field) => ({
      $ceil: { $divide: [{ $month: field }, 3] },
    });

    const [facet] = await this.tickets
      .aggregate([
        { $match: base },
        {
          $facet: {
            created: [
              { $match: { createdAt: { $gte: yearStart, $lt: yearEnd } } },
              { $group: { _id: quarterOf("$createdAt"), count: { $sum: 1 } } },
            ],
            resolved: [
              { $match: { resolvedAt: { $gte: yearStart, $lt: yearEnd } } },
              {
                $group: {
                  _id: quarterOf("$resolvedAt"),
                  count: { $sum: 1 },
                  tracked: { $sum: { $cond: [SLA_TRACKED, 1, 0] } },
                  met: { $sum: { $cond: [SLA_MET, 1, 0] } },
                },
              },
            ],
          },
        },
      ])
      .toArray();

    const created = Object.fromEntries(
      ((facet && facet.created) || []).map((r) => [r._id, r.count])
    );
    const resolved = Object.fromEntries(
      ((facet && facet.resolved) || []).map((r) => [r._id, r])
    );
    const result = {};
    for (let q = 1; q <= 4; q++) {
      const r = resolved[q] || {};
      result[`Q${q}`] = {
        ticketsCreated: created[q] || 0,
        resolved: r.count || 0,
        slaCompliance: percent(r.met || 0, r.tracked || 0),
      };
    }
    return result;
  }

  /** [{ category, avgResponseTime }] sorted slowest first. */
  async getResponseTimeByCategory(tenantId, filters = {}) {
    const match = this.buildMatch(tenantId, filters);
    const rows = await this.tickets
      .aggregate([
        { $match: { ...match, category: { $type: "string", $ne: "" } } },
        ...this.firstReplyStages(match.tenantId),
        { $group: { _id: "$category", avgMs: { $avg: "$responseMs" } } },
        { $sort: { avgMs: -1 } },
      ])
      .toArray();
    return rows.map((r) => ({
      category: r._id,
      avgResponseTime: msToHours(r.avgMs),
    }));
  }

  /** Everything the Analytics tab shows, for one set of filters. */
  async getAnalytics(tenantId, filters = {}) {
    const match = this.buildMatch(tenantId, filters); // validates filters once, up front
    const year =
      match.createdAt && match.createdAt.$lte
        ? match.createdAt.$lte.getUTCFullYear()
        : new Date().getUTCFullYear();

    const [slaByPriority, responseTimeByCategory, quarterlyMetrics] =
      await Promise.all([
        this.getSLAByPriority(tenantId, filters),
        this.getResponseTimeByCategory(tenantId, filters),
        this.getQuarterlyMetrics(tenantId, year, filters),
      ]);

    return {
      filters: {
        startDate: filters.startDate || null,
        endDate: filters.endDate || null,
        priority: match.priority || null,
        category: match.category || null,
        year,
      },
      slaByPriority,
      responseTimeByCategory,
      quarterlyMetrics,
    };
  }

  // ============================================
  // CSV EXPORT
  // ============================================

  static csvCell(value) {
    if (value === null || value === undefined) return "";
    let text = value instanceof Date ? value.toISOString() : String(value);
    // Stop spreadsheet apps from running cell contents as formulas
    if (/^[-=+@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  async exportTicketsCsv(tenantId, filters = {}) {
    const match = this.buildMatch(tenantId, filters);
    const [labels, tickets, staff] = await Promise.all([
      PRIORITY_LABELS,
      this.tickets
        .find(match)
        .project({
          title: 1,
          category: 1,
          priority: 1,
          status: 1,
          source: 1,
          assigneeId: 1,
          createdAt: 1,
          resolvedAt: 1,
          slaDueAt: 1,
          slaStatus: 1,
        })
        .sort({ createdAt: -1 })
        .limit(EXPORT_ROW_LIMIT)
        .toArray(),
      this.users
        .find({ tenantId: match.tenantId })
        .project({ name: 1 })
        .toArray(),
    ]);

    const names = Object.fromEntries(staff.map((u) => [String(u._id), u.name]));
    const header = [
      "Ticket ID",
      "Title",
      "Category",
      "Priority",
      "Status",
      "Source",
      "Assignee",
      "Created At",
      "Resolved At",
      "SLA Due At",
      "SLA Status",
      "Resolution Hours",
    ];

    const lines = [header.join(",")];
    for (const t of tickets) {
      const resolutionHours =
        t.resolvedAt && t.createdAt
          ? msToHours(new Date(t.resolvedAt) - new Date(t.createdAt))
          : "";
      lines.push(
        [
          t._id,
          t.title,
          t.category,
          labels[t.priority] || t.priority,
          t.status,
          t.source,
          t.assigneeId ? names[String(t.assigneeId)] || "" : "",
          t.createdAt,
          t.resolvedAt,
          t.slaDueAt,
          t.slaStatus,
          resolutionHours,
        ]
          .map(AnalyticsController.csvCell)
          .join(",")
      );
    }
    return lines.join("\r\n") + "\r\n";
  }
}

export default AnalyticsController;
