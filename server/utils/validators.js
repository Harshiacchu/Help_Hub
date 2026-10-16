// server/utils/validators.js - Shared validation helpers
// One source of truth for roles and input rules, so routes and
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
const USER_STATUSES = ["active", "inactive", "deleted"];

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
  normalizeEmail,
  assertEmail,
  assertPassword,
  assertSlug,
  cleanText,
  assertRole,
  assertPriority,
  parseDateParam,
};
