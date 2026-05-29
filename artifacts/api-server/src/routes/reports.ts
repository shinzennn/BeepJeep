import { Router } from "express";
import * as XLSX from "xlsx";
import { db, fareRecordsTable, usersTable, fleetsTable } from "@workspace/db";
import { eq, gte, and, inArray } from "drizzle-orm";
import { tokenFromQuery, authMiddleware, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/reports/export", tokenFromQuery, async (req: AuthRequest, res) => {
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const format = (req.query["format"] as string) ?? "xlsx";
  const days = parseInt((req.query["days"] as string) ?? "7");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const adminFleets = await db
    .select({ id: fleetsTable.id })
    .from(fleetsTable)
    .where(eq(fleetsTable.adminId, req.user!.id));
  const fleetIds = adminFleets.map((f) => f.id);

  const records = fleetIds.length > 0
    ? await db
        .select()
        .from(fareRecordsTable)
        .where(and(gte(fareRecordsTable.createdAt, since), inArray(fareRecordsTable.fleetId, fleetIds)))
        .orderBy(fareRecordsTable.createdAt)
    : [];

  const rows = records.map((r) => ({
    Date: r.createdAt.toISOString().split("T")[0],
    Time: r.createdAt.toTimeString().split(" ")[0],
    Driver: r.driverName,
    "Driver ID": r.driverId,
    "Fleet ID": r.fleetId ?? "Independent",
    "Passenger Type": r.passengerType,
    "Amount (₱)": parseFloat(String(r.amount)),
  }));

  const summary = {
    "Report Period": `Last ${days} days`,
    "Generated At": new Date().toISOString(),
    "Total Records": rows.length,
    "Total Fare (₱)": rows.reduce((s, r) => s + r["Amount (₱)"], 0),
    "Regular Passengers": rows.filter((r) => r["Passenger Type"] === "regular").length,
    "Student Passengers": rows.filter((r) => r["Passenger Type"] === "student").length,
    "Senior Passengers": rows.filter((r) => r["Passenger Type"] === "senior").length,
  };

  const wb = XLSX.utils.book_new();
  const summaryRows = Object.entries(summary).map(([k, v]) => ({ Field: k, Value: v }));
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  const wsRecords = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No records in range" }]);
  XLSX.utils.book_append_sheet(wb, wsRecords, "Fare Records");

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(wsRecords);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="beepjeep-report-${Date.now()}.csv"`);
    res.send(csv);
    return;
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="beepjeep-report-${Date.now()}.xlsx"`);
  res.send(buf);
});

router.get("/reports/summary", authMiddleware, requireRole("admin"), async (req: AuthRequest, res) => {
  const since = new Date(new Date().setHours(0, 0, 0, 0));

  const adminFleets = await db
    .select({ id: fleetsTable.id })
    .from(fleetsTable)
    .where(eq(fleetsTable.adminId, req.user!.id));
  const fleetIds = adminFleets.map((f) => f.id);

  const records = fleetIds.length > 0
    ? await db
        .select()
        .from(fareRecordsTable)
        .where(and(gte(fareRecordsTable.createdAt, since), inArray(fareRecordsTable.fleetId, fleetIds)))
    : [];

  const fleetDriverIds = fleetIds.length > 0
    ? (await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(inArray(usersTable.fleetId, fleetIds), eq(usersTable.role, "fleet_driver"))))
        .map((d) => d.id)
    : [];

  res.json({
    totalFareToday: records.reduce((s, r) => s + parseFloat(String(r.amount)), 0),
    totalPassengersToday: records.length,
    regularCount: records.filter((r) => r.passengerType === "regular").length,
    studentCount: records.filter((r) => r.passengerType === "student").length,
    seniorCount: records.filter((r) => r.passengerType === "senior").length,
    totalDrivers: fleetDriverIds.length,
    totalFleetDrivers: fleetDriverIds.length,
    totalFleets: fleetIds.length,
  });
});

export default router;
