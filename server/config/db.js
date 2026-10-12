// server/config/db.js - MongoDB Atlas connection (native driver)
//
// MONGODB_URI comes from .env, e.g.
//   mongodb+srv://<db_username>:<db_password>@helphub.xemb4n8.mongodb.net/?appName=HelpHub

const { MongoClient, ObjectId } = require("mongodb");

const DB_NAME = process.env.DB_NAME || "helpHub";

let client = null;
let db = null;

async function connectDB() {
  if (db) return db;

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not set. Add it to your .env file.");
  }

  client = new MongoClient(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });

  await client.connect();
  db = client.db(DB_NAME);
  await db.command({ ping: 1 });

  console.log(`MongoDB connected (database: ${DB_NAME})`);

  await createIndexes();
  return db;
}

/**
 * Creates one index. Unique/TTL indexes protect data integrity, so a failure
 * stops the server - except when an older index with the same keys already
 * exists, in which case we explain how to fix it instead of crashing.
 */
async function ensureIndex(
  collectionName,
  keys,
  options = {},
  { critical = false } = {}
) {
  try {
    await db.collection(collectionName).createIndex(keys, options);
  } catch (error) {
    const conflict = error.code === 85 || error.code === 86; // IndexOptionsConflict / IndexKeySpecsConflict
    if (conflict) {
      console.warn(
        `Index on ${collectionName} ${JSON.stringify(keys)} already exists with different options. ` +
          `Drop it in Atlas (Collections > ${collectionName} > Indexes) and restart to apply the new one.`
      );
      return;
    }
    if (critical) throw error;
    console.warn(
      `Could not create index on ${collectionName} ${JSON.stringify(keys)}: ${error.message}`
    );
  }
}

// Indexes for Abhinay's collections only. Emily adds tickets/comments/auditLog
// indexes alongside her models. The sessions TTL index is created by connect-mongo.
async function createIndexes() {
  // Integrity (must succeed)
  await ensureIndex(
    "tenants",
    { slug: 1 },
    { unique: true },
    { critical: true }
  );
  await ensureIndex(
    "users",
    { tenantId: 1, email: 1 },
    { unique: true },
    { critical: true }
  );
  await ensureIndex(
    "apikeys",
    { keyHash: 1 },
    { unique: true },
    { critical: true }
  );
  await ensureIndex(
    "rules",
    { tenantId: 1, ruleName: 1 },
    { unique: true },
    { critical: true }
  );
  await ensureIndex(
    "shareCodes",
    { code: 1 },
    { unique: true },
    { critical: true }
  );
  await ensureIndex(
    "shareCodes",
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },
    { critical: true }
  );

  // Performance
  await ensureIndex("users", { tenantId: 1, role: 1 });
  await ensureIndex("apikeys", { tenantId: 1, revokedAt: 1 });
  await ensureIndex("shareCodes", { tenantId: 1 });

  console.log("Database indexes ready");
}

function getDB() {
  if (!db) throw new Error("Database not connected. Call connectDB() first.");
  return db;
}

function getClient() {
  if (!client)
    throw new Error("MongoDB client not initialized. Call connectDB() first.");
  return client;
}

async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("MongoDB connection closed");
  }
}

/**
 * Converts a 24-character hex string (or ObjectId) to an ObjectId.
 * Returns null for anything else, so callers can answer 400/404
 * instead of crashing or silently querying with a bad id.
 */
function toObjectId(id) {
  if (id instanceof ObjectId) return id;
  if (typeof id === "string" && /^[a-f0-9]{24}$/i.test(id))
    return new ObjectId(id);
  return null;
}

/** Like toObjectId, but throws a 400 error instead of returning null. */
function mustObjectId(id, label = "id") {
  const oid = toObjectId(id);
  if (!oid) {
    const error = new Error(`Invalid ${label}`);
    error.status = 400;
    error.expose = true;
    throw error;
  }
  return oid;
}

function isDuplicateKeyError(error) {
  return Boolean(error) && error.code === 11000;
}

module.exports = {
  DB_NAME,
  connectDB,
  getDB,
  getClient,
  closeDB,
  toObjectId,
  mustObjectId,
  isDuplicateKeyError,
  ObjectId,
};
