// server/utils/validators.js - Shared validation helpers
// One source of truth for roles, SLA levels and input rules, so routes and
// models never disagree about what "valid" means.

class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ValidationError";
    this.status = status;
    this.expose = true; // safe to show this message to the client
  }
}

const ROLES = ["customer", "agent", "superior"];
const STAFF_ROLES = ["agent", "superior"];
const USER_STATUSES = ["active", "inactive", "locked", "deleted"];

const SLA_LEVELS = ["critical", "high", "medium", "low", "minimal"];
const PRIORITY_TO_SLA_LEVEL = {
  1: "critical",
  2: "high",
  3: "medium",
  4: "low",
  5: "minimal",
};
const SLA_MIN_HOURS = 1;
const SLA_MAX_HOURS = 168; // one week
const DEFAULT_SLA_TARGETS = Object.freeze({
  critical: 2,
  high: 4,
  medium: 8,
  low: 24,
  minimal: 48,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function assertEmail(email, field = "Email") {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254 || !EMAIL_RE.test(normalized)) {
    throw new ValidationError(`${field} is not a valid email address`);
  }
  return normalized;
}

function assertPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters");
  }
  // bcrypt silently ignores everything after 72 bytes
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new ValidationError("Password must be at most 72 characters");
  }
  if (!/[A-Z]/.test(password)) {
    throw new ValidationError(
      "Password must contain at least one uppercase letter"
    );
  }
  if (!/\d/.test(password)) {
    throw new ValidationError("Password must contain at least one number");
  }
  return password;
}

function assertSlug(slug) {
  const normalized = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  if (
    normalized.length < 3 ||
    normalized.length > 50 ||
    !SLUG_RE.test(normalized)
  ) {
    throw new ValidationError(
      "Company slug must be 3-50 characters: lowercase letters, numbers and single hyphens"
    );
  }
  return normalized;
}

function cleanText(value, field, { min = 1, max = 100 } = {}) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min) {
    throw new ValidationError(
      min <= 1
        ? `${field} is required`
        : `${field} must be at least ${min} characters`
    );
  }
  if (text.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters`);
  }
  return text;
}

function assertRole(role, allowed = ROLES) {
  if (!allowed.includes(role)) {
    throw new ValidationError(`Role must be one of: ${allowed.join(", ")}`);
  }
  return role;
}

/**
 * Validates SLA targets and returns a clean { critical, high, medium, low, minimal }
 * object of whole hours. Accepts numbers or numeric strings (form inputs).
 */
function validateSlaTargets(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError(
      "SLA targets must be an object with critical, high, medium, low and minimal hours"
    );
  }
  const result = {};
  for (const level of SLA_LEVELS) {
    const raw = input[level];
    const hours =
      typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
    if (
      !Number.isInteger(hours) ||
      hours < SLA_MIN_HOURS ||
      hours > SLA_MAX_HOURS
    ) {
      throw new ValidationError(
        `SLA target for "${level}" must be a whole number between ${SLA_MIN_HOURS} and ${SLA_MAX_HOURS} hours`
      );
    }
    result[level] = hours;
  }
  return result;
}

function assertPriority(value) {
  const priority = Number(value);
  if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
    throw new ValidationError(
      "Priority must be a whole number from 1 (Critical) to 5 (Minimal)"
    );
  }
  return priority;
}

/** Parses a YYYY-MM-DD query value into a UTC Date (start or end of that day). */
function parseDateParam(value, field, { endOfDay = false } = {}) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${field} must be a date in YYYY-MM-DD format`);
  }
  const date = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
  );
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${field} is not a valid date`);
  }
  return date;
}

export {
  ValidationError,
  ROLES,
  STAFF_ROLES,
  USER_STATUSES,
  PRIORITY_TO_SLA_LEVEL,
  DEFAULT_SLA_TARGETS,
  normalizeEmail,
  assertEmail,
  assertPassword,
  assertSlug,
  cleanText,
  assertRole,
  validateSlaTargets,
  assertPriority,
  parseDateParam,
};
