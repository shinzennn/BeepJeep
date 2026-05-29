import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const ratingsTable = pgTable("ratings", {
  id: serial("id").primaryKey(),
  commuterId: integer("commuter_id").notNull(),
  commuterName: text("commuter_name").notNull(),
  driverId: integer("driver_id").notNull(),
  driverName: text("driver_name").notNull(),
  fleetId: integer("fleet_id"),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Rating = typeof ratingsTable.$inferSelect;
