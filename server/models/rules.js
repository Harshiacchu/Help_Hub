// server/models/rules.js - Per-company configuration
//
// The rules collection is the single source of truth for priority labels,
// categories, SLA targets and custom fields. Emily's ticket code should read
// these through this model (e.g. getSlaHoursForPriority) so both halves agree.

const { mustObjectId, toObjectId } = require("../config/db");
const {
  ValidationError,
  DEFAULT_SLA_TARGETS,
  PRIORITY_TO_SLA_LEVEL,
  validateSlaTargets,
  assertPriority,
} = require("../utils/validators");

const RULE_NAMES = Object.freeze({
  PRIORITY_LABELS: "priority_labels",
  CATEGORIES: "categories",
  SLA_TARGETS: "sla_targets",
  CUSTOM_FIELDS: "custom_fields",
});

const DEFAULT_PRIORITY_LABELS = Object.freeze({
  1: "Critical",
  2: "High",
  3: "Medium",
  4: "Low",
  5: "Minimal",
});
const DEFAULT_CATEGORIES = Object.freeze([
  "General",
  "Technical Support",
  "Billing",
  "Account Management",
]);

const MAX_CATEGORIES = 50;
const MAX_CUSTOM_FIELDS = 20;
const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "select",
  "checkbox",
  "date",
];

class RulesModel {
  constructor(db) {
    this.collection = db.collection("rules");
    this.tenants = db.collection("tenants");
  }

  // ============================================
  // VALIDATION (static so routes can reuse them)
  // ============================================

  static validatePriorityLabels(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new ValidationError(
        'Priority labels must be an object like { "1": "Critical", ..., "5": "Minimal" }'
      );
    }
    const labels = {};
    const seen = new Set();
    for (let level = 1; level <= 5; level++) {
      const raw =
        input[level] !== undefined ? input[level] : input[String(level)];
      const label = typeof raw === "string" ? raw.trim() : "";
      if (!label) throw new ValidationError(`Priority ${level} needs a label`);
      if (label.length > 30)
        throw new ValidationError(
          `Priority ${level} label must be at most 30 characters`
        );
      const key = label.toLowerCase();
      if (seen.has(key))
        throw new ValidationError(
          `Priority label "${label}" is used more than once`
        );
      seen.add(key);
      labels[level] = label;
    }
    return labels;
  }

  static validateCategories(input) {
    if (!Array.isArray(input)) {
      throw new ValidationError("Categories must be a JSON array of names");
    }
    const categories = [];
    const seen = new Set();
    for (const raw of input) {
      const name = typeof raw === "string" ? raw.trim() : "";
      if (!name) continue; // ignore blank lines
      if (name.length > 50)
        throw new ValidationError(
          `Category "${name.slice(0, 20)}..." must be at most 50 characters`
        );
      const key = name.toLowerCase();
      if (seen.has(key))
        throw new ValidationError(
          `Category "${name}" is listed more than once`
        );
      seen.add(key);
      categories.push(name);
    }
    if (categories.length === 0)
      throw new ValidationError("Add at least one category");
    if (categories.length > MAX_CATEGORIES)
      throw new ValidationError(
        `At most ${MAX_CATEGORIES} categories are allowed`
      );
    return categories;
  }

  /**
   * Custom fields are an array of definitions:
   *   [{ key: "order_number", label: "Order #", type: "text", required: false }]
   *   [{ key: "region", label: "Region", type: "select", options: ["EU", "US"] }]
   */
  static validateCustomFields(input) {
    if (!Array.isArray(input)) {
      throw new ValidationError(
        "customFields must be an array of field definitions"
      );
    }
    if (input.length > MAX_CUSTOM_FIELDS) {
      throw new ValidationError(
        `At most ${MAX_CUSTOM_FIELDS} custom fields are allowed`
      );
    }
    const seenKeys = new Set();
    return input.map((field, index) => {
      const where = `Custom field #${index + 1}`;
      if (!field || typeof field !== "object")
        throw new ValidationError(`${where} must be an object`);

      const key = typeof field.key === "string" ? field.key.trim() : "";
      if (!/^[a-z][a-z0-9_]{0,29}$/.test(key)) {
        throw new ValidationError(
          `${where}: key must start with a letter and use only lowercase letters, numbers and underscores (max 30)`
        );
      }
      if (seenKeys.has(key))
        throw new ValidationError(
          `${where}: key "${key}" is used more than once`
        );
      seenKeys.add(key);

      const label = typeof field.label === "string" ? field.label.trim() : "";
      if (!label || label.length > 50)
        throw new ValidationError(
          `${where}: label is required (max 50 characters)`
        );

      if (!CUSTOM_FIELD_TYPES.includes(field.type)) {
        throw new ValidationError(
          `${where}: type must be one of ${CUSTOM_FIELD_TYPES.join(", ")}`
        );
      }

      const clean = {
        key,
        label,
        type: field.type,
        required: field.required === true,
      };

      if (field.type === "select") {
        const options = Array.isArray(field.options)
          ? field.options
              .map((o) => (typeof o === "string" ? o.trim() : ""))
              .filter(Boolean)
          : [];
        if (options.length === 0)
          throw new ValidationError(
            `${where}: select fields need at least one option`
          );
        clean.options = [...new Set(options)].slice(0, 50);
      }
      return clean;
    });
  }

  // ============================================
  // READS
  // ============================================

  async getRuleValue(tenantId, ruleName) {
    const rule = await this.collection.findOne({
      tenantId: mustObjectId(tenantId, "tenant id"),
      ruleName,
    });
    return rule ? rule.value : undefined;
  }

  /** Everything the dashboard and ticket forms need, with defaults filled in. */
  async getAll(tenantId) {
    const rules = await this.collection
      .find({ tenantId: mustObjectId(tenantId, "tenant id") })
      .toArray();
    const byName = Object.fromEntries(rules.map((r) => [r.ruleName, r.value]));

    return {
      priorities: byName[RULE_NAMES.PRIORITY_LABELS] || {
        ...DEFAULT_PRIORITY_LABELS,
      },
      categories: (byName[RULE_NAMES.CATEGORIES] &&
        byName[RULE_NAMES.CATEGORIES].categories) || [...DEFAULT_CATEGORIES],
      slaTargets: byName[RULE_NAMES.SLA_TARGETS] || { ...DEFAULT_SLA_TARGETS },
      customFields: byName[RULE_NAMES.CUSTOM_FIELDS] || [],
    };
  }

  async getPriorityLabels(tenantId) {
    return (
      (await this.getRuleValue(tenantId, RULE_NAMES.PRIORITY_LABELS)) || {
        ...DEFAULT_PRIORITY_LABELS,
      }
    );
  }

  /** Used by ticket creation (Emily): reject categories the company hasn't configured. */
  async getCategories(tenantId) {
    const value = await this.getRuleValue(tenantId, RULE_NAMES.CATEGORIES);
    return (value && value.categories) || [...DEFAULT_CATEGORIES];
  }

  async getSlaTargets(tenantId) {
    return (
      (await this.getRuleValue(tenantId, RULE_NAMES.SLA_TARGETS)) || {
        ...DEFAULT_SLA_TARGETS,
      }
    );
  }

  /** Used by ticket creation (Emily): which extra fields a ticket may carry. */
  async getCustomFields(tenantId) {
    return (await this.getRuleValue(tenantId, RULE_NAMES.CUSTOM_FIELDS)) || [];
  }

  /** Used by ticket creation (Emily): hours allowed for a priority 1-5 (1 = Critical). */
  async getSlaHoursForPriority(tenantId, priority) {
    const level = PRIORITY_TO_SLA_LEVEL[assertPriority(priority)];
    const targets = await this.getSlaTargets(tenantId);
    return targets[level];
  }

  // ============================================
  // WRITES (validated)
  // ============================================

  async setPriorityLabels(tenantId, input, updatedBy = null) {
    const labels = RulesModel.validatePriorityLabels(input);
    await this._upsert(tenantId, RULE_NAMES.PRIORITY_LABELS, labels, updatedBy);
    return labels;
  }

  async setCategories(tenantId, input, updatedBy = null) {
    const categories = RulesModel.validateCategories(input);
    await this._upsert(
      tenantId,
      RULE_NAMES.CATEGORIES,
      { categories },
      updatedBy
    );
    return categories;
  }

  /** Also mirrors the targets onto the tenant document so the two never drift apart. */
  async setSlaTargets(tenantId, input, updatedBy = null) {
    const slaTargets = validateSlaTargets(input);
    const tid = mustObjectId(tenantId, "tenant id");
    await this._upsert(tid, RULE_NAMES.SLA_TARGETS, slaTargets, updatedBy);
    await this.tenants.updateOne(
      { _id: tid },
      { $set: { slaTargets, updatedAt: new Date() } }
    );
    return slaTargets;
  }

  async setCustomFields(tenantId, input, updatedBy = null) {
    const customFields = RulesModel.validateCustomFields(input);
    await this._upsert(
      tenantId,
      RULE_NAMES.CUSTOM_FIELDS,
      customFields,
      updatedBy
    );
    return customFields;
  }

  /** Safe to call more than once - only fills in rules that don't exist yet. */
  async initializeDefaults(tenantId, { slaTargets } = {}) {
    const tid = mustObjectId(tenantId, "tenant id");
    const now = new Date();
    const defaults = {
      [RULE_NAMES.PRIORITY_LABELS]: { ...DEFAULT_PRIORITY_LABELS },
      [RULE_NAMES.CATEGORIES]: { categories: [...DEFAULT_CATEGORIES] },
      [RULE_NAMES.SLA_TARGETS]: slaTargets
        ? validateSlaTargets(slaTargets)
        : { ...DEFAULT_SLA_TARGETS },
      [RULE_NAMES.CUSTOM_FIELDS]: [],
    };

    await this.collection.bulkWrite(
      Object.entries(defaults).map(([ruleName, value]) => ({
        updateOne: {
          filter: { tenantId: tid, ruleName },
          update: {
            $setOnInsert: {
              value,
              createdAt: now,
              updatedAt: now,
              updatedBy: null,
            },
          },
          upsert: true,
        },
      }))
    );
  }

  async deleteByTenant(tenantId) {
    const result = await this.collection.deleteMany({
      tenantId: mustObjectId(tenantId, "tenant id"),
    });
    return result.deletedCount;
  }

  async _upsert(tenantId, ruleName, value, updatedBy) {
    const tid = mustObjectId(tenantId, "tenant id");
    const now = new Date();
    await this.collection.updateOne(
      { tenantId: tid, ruleName },
      {
        $set: {
          value,
          updatedAt: now,
          updatedBy: updatedBy ? toObjectId(updatedBy) : null,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }
}

module.exports = RulesModel;
