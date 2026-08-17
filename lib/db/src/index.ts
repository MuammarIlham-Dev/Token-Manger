import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import path from "path";

// Initialize a local SQLite database file in the current working directory
// Default to local.db if DATABASE_URL is not provided
const dbPath = process.env.DATABASE_URL || `file:${path.join(process.cwd(), "local.db")}`;

export const client = createClient({ url: dbPath });
export const db = drizzle(client, { schema });

export * from "./schema";
