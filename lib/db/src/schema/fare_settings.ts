import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";

export const fareSettingsTable = pgTable("fare_settings", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  ownerType: text("owner_type").notNull(),
  regularFare: numeric("regular_fare", { precision: 10, scale: 2 }).notNull().default("13"),
  studentFare: numeric("student_fare", { precision: 10, scale: 2 }).notNull().default("10"),
  seniorFare: numeric("senior_fare", { precision: 10, scale: 2 }).notNull().default("10"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FareSetting = typeof fareSettingsTable.$inferSelect;
