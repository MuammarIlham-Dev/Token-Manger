import { pgTable, text, serial, integer, varchar, bigint, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const profilesTable = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  ide: text("ide").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  agent: text("agent").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  status: varchar("status", { length: 50 }).notNull().default('ready'),
  limitedUntil: bigint("limited_until", { mode: 'number' }),
  createdAt: bigint("created_at", { mode: 'number' }).notNull(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true });
export type InsertProfile = typeof profilesTable.$inferInsert;
export type Profile = typeof profilesTable.$inferSelect;