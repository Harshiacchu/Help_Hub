// server/models/user.js - Users (customers, agents and superiors)
//
// Every query filters by tenantId, so one company can never read or change
// another company's users.

import { mustObjectId, toObjectId } from "../config/db.js";
import {
  ROLES,
  USER_STATUSES,
  ValidationError,
  normalizeEmail,
} from "../utils/validators.js";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 30;

class UserModel {
  constructor(db) {
    this.collection = db.collection("users");
  }

  /** What the API returns - never the password hash. */
  static toPublic(user) {
    if (!user) return null;
    return {
      userId: user._id.toString(),
      tenantId: user.tenantId.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    };
  }

  /** Builds a new user document (also used by the seed script). */
  static newDocument({ tenantId, email, passwordHash, name, role }) {
    if (!ROLES.includes(role)) throw new ValidationError("Invalid role");
    return {
      tenantId: mustObjectId(tenantId, "tenant id"),
      email: normalizeEmail(email),
      passwordHash,
      name,
      role,
      status: "active",
      createdAt: new Date(),
      lastLogin: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    };
  }

  /** True while the account is locked after too many wrong passwords. */
  static isLocked(user) {
    return Boolean(user.lockedUntil && user.lockedUntil > new Date());
  }

  /** Throws a duplicate-key error (code 11000) if the email is already used in this company. */
  async create(fields) {
    const user = UserModel.newDocument(fields);
    const result = await this.collection.insertOne(user);
    return UserModel.toPublic({ ...user, _id: result.insertedId });
  }

  /** Includes the password hash - only for login. */
  async findByEmailWithPassword(tenantId, email) {
    return this.collection.findOne({
      tenantId: mustObjectId(tenantId, "tenant id"),
      email: normalizeEmail(email),
    });
  }

  async findById(tenantId, userId) {
    const _id = toObjectId(userId);
    if (!_id) return null;
    const user = await this.collection.findOne({
      _id,
      tenantId: mustObjectId(tenantId, "tenant id"),
    });
    return UserModel.toPublic(user);
  }

  /** Everyone with one of these roles, except deleted users. */
  async findByTenantAndRole(tenantId, roles) {
    const users = await this.collection
      .find({
        tenantId: mustObjectId(tenantId, "tenant id"),
        role: { $in: roles },
        status: { $ne: "deleted" },
      })
      .sort({ role: -1, name: 1 })
      .toArray();
    return users.map(UserModel.toPublic);
  }

  /** Returns the updated user, or null if the user isn't in this company. */
  async updateStatus(tenantId, userId, status) {
    if (!USER_STATUSES.includes(status)) {
      throw new ValidationError(`Invalid status: ${status}`);
    }
    const _id = toObjectId(userId);
    if (!_id) return null;
    const result = await this.collection.updateOne(
      { _id, tenantId: mustObjectId(tenantId, "tenant id") },
      { $set: { status } }
    );
    return result.matchedCount ? this.findById(tenantId, userId) : null;
  }

  /** A successful login: records the time and clears any failed attempts. */
  async recordLogin(tenantId, userId) {
    await this.collection.updateOne(
      { _id: userId, tenantId: mustObjectId(tenantId, "tenant id") },
      {
        $set: {
          lastLogin: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }
    );
  }

  /** Counts a wrong password. After 5 in a row the account is locked for 30 minutes. */
  async recordFailedLogin(user) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const locked = attempts >= MAX_FAILED_LOGINS;
    await this.collection.updateOne(
      { _id: user._id },
      {
        $set: locked
          ? {
              failedLoginAttempts: 0,
              lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
            }
          : { failedLoginAttempts: attempts },
      }
    );
    return locked;
  }
}

export default UserModel;
