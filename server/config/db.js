// server/config/db.js - MongoDB connection (native driver) and id helpers
//
// MONGODB_URI comes from .env, e.g.
//   mongodb+srv://<db_username>:<db_password>@<cluster>.mongodb.net/?appName=HelpHub

import { MongoClient, ObjectId } from "mongodb";

let client = null;
let db = null;

// Unique indexes keep the data consistent. The last one deletes expired share codes.
// (Emily adds indexes for tickets, comments and auditLog with her models.)
const INDEXES = [
  ["tenants", { slug: 1 }, { unique: true }],
  ["users", { tenantId: 1, email: 1 }, { unique: true }],
  ["apikeys", { keyHash: 1 }, { unique: true }],
  ["rules", { tenantId: 1, ruleName: 1 }, { unique: true }],
  ["shareCodes", { code: 1 }, { unique: true }],
  ["shareCodes", { expiresAt: 1 }, { expireAfterSeconds: 0 }],
];

async function connectDB() {
  if (db) return db;
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set. Add it to your .env file.");
  }

  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.DB_NAME || "helpHub");

  for (const [collection, keys, options] of INDEXES) {
    try {
      await db.collection(collection).createIndex(keys, options);
    } catch (error) {
      console.warn(`Index on ${collection} not created: ${error.message}`);
    }
  }
  console.log("MongoDB connected");
  return db;
}

function getDB() {
  if (!db) throw new Error("Database not connected. Call connectDB() first.");
  return db;
}

async function closeDB() {
  if (client) await client.close();
  client = null;
  db = null;
}

/** A 24-character hex string (or ObjectId) as an ObjectId; null for anything else. */
function toObjectId(id) {
  if (id instanceof ObjectId) return id;
  if (typeof id === "string" && /^[a-f0-9]{24}$/i.test(id)) {
    return new ObjectId(id);
  }
  return null;
}

/** Like toObjectId, but a bad id is a 400 error. */
function mustObjectId(id, label = "id") {
  const oid = toObjectId(id);
  if (!oid) {
    const error = new Error(`Invalid ${label}`);
    error.status = 400;
    throw error;
  }
  return oid;
}

function isDuplicateKeyError(error) {
  return Boolean(error) && error.code === 11000;
}

export {
  connectDB,
  getDB,
  closeDB,
  toObjectId,
  mustObjectId,
  isDuplicateKeyError,
};
