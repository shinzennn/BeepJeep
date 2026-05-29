import { pgTable, serial, text, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fareRecordsTable = pgTable("fare_records", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull(),
  driverName: text("driver_name").notNull(),
  fleetId: integer("fleet_id"),
  passengerType: text("passenger_type").notNull(), // regular | student | senior
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFareRecordSchema = createInsertSchema(fareRecordsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFareRecord = z.infer<typeof insertFareRecordSchema>;
export type FareRecord = typeof fareRecordsTable.$inferSelect;
