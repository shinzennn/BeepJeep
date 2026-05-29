import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fleetsTable = pgTable("fleets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  adminId: integer("admin_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFleetSchema = createInsertSchema(fleetsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFleet = z.infer<typeof insertFleetSchema>;
export type Fleet = typeof fleetsTable.$inferSelect;
