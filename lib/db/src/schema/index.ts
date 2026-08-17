import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";

export const profilesTable = sqliteTable("profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ide: text("ide").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  agent: text("agent").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  status: text("status").notNull().default('ready'),
  limitedUntil: integer("limited_until"),
  createdAt: integer("created_at").notNull(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true });
export type InsertProfile = typeof profilesTable.$inferInsert;
export type Profile = typeof profilesTable.$inferSelect;