import { Router } from "express";
import { db, fareRecordsTable, usersTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { authMiddleware, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.use(authMiddleware);

// Add fare record (any driver)
router.post("/fares", requireRole("fleet_driver", "independent_driver"), async (req: AuthRequest, res) => {
  const { passengerType, amount } = req.body ?? {};
  if (!passengerType || amount === undefined) {
    res.status(400).json({ error: "passengerType and amount are required" });
    return;
  }

  const [record] = await db.insert(fareRecordsTable).values({
    driverId: req.user!.id,
    driverName: req.user!.name,
    fleetId: req.user!.fleetId ?? null,
    passengerType,
    amount: String(amount),
  }).returning();

  res.status(201).json(record);
});

// Get fares (driver: own; admin: fleet)
router.get("/fares", requireRole("fleet_driver", "independent_driver", "admin"), async (req: AuthRequest, res) => {
  const since = req.query["since"] ? new Date(req.query["since"] as string) : new Date(new Date().setHours(0, 0, 0, 0));

  if (req.user!.role === "admin") {
    const fleetId = req.user!.fleetId ?? parseInt((req.query["fleetId"] as string) ?? "");
    const records = fleetId
      ? await db.select().from(fareRecordsTable).where(and(eq(fareRecordsTable.fleetId, fleetId), gte(fareRecordsTable.createdAt, since)))
      : await db.select().from(fareRecordsTable).where(gte(fareRecordsTable.createdAt, since));
    res.json(records);
    return;
  }

  const records = await db.select().from(fareRecordsTable)
    .where(and(eq(fareRecordsTable.driverId, req.user!.id), gte(fareRecordsTable.createdAt, since)));
  res.json(records);
});

export default router;
