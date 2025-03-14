import { MongoClient } from 'mongodb';

// Define types for our MongoDB connection cache
interface MongoConnection {
  client: MongoClient;
  db: any;
}

interface CachedConnection {
  conn: MongoConnection | null;
  promise: Promise<MongoConnection> | null;
}

// Define the global type for MongoDB cache
declare global {
  var mongo: CachedConnection | undefined;
}

const MONGODB_URI = process.env.MONGO_DB_STRING;
const MONGODB_DB = process.env.MONGODB_DB_NAME || 'tgnoti';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGO_DB_STRING environment variable');
}

// Initialize cached connection
let cached: CachedConnection = global.mongo || { conn: null, promise: null };

// If not in global, set it
if (!global.mongo) {
  global.mongo = cached;
}

export async function connectToDatabase(): Promise<MongoConnection> {
  // If we have a connection, return it
  if (cached.conn) {
    return cached.conn;
  }

  // If we don't have a promise to connect yet, create one
  if (!cached.promise) {
    // We know MONGODB_URI is defined because we checked above
    cached.promise = MongoClient.connect(MONGODB_URI as string).then((client) => {
      return {
        client,
        db: client.db(MONGODB_DB),
      };
    });
  }
  
  // Wait for the promise to resolve and cache the connection
  cached.conn = await cached.promise;
  return cached.conn;
}
