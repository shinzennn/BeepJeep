import { Router } from "express";
import { db, ratingsTable, fleetsTable, usersTable } from "@workspace/db";
import { eq, and, avg, count } from "drizzle-orm";
import { authMiddleware, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

router.post("/ratings", requireRole("commuter"), async (req: AuthRequest, res) => {
  const { driverId, rating, comment } = req.body ?? {};
  if (!driverId || !rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: "driverId and rating (1-5) are required" });
    return;
  }

  const [driver] = await db
    .select({ id: usersTable.id, name: usersTable.name, fleetId: usersTable.fleetId })
    .from(usersTable)
    .where(eq(usersTable.id, Number(driverId)))
    .limit(1);

  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  const [record] = await db
    .insert(ratingsTable)
    .values({
      commuterId: req.user!.id,
      commuterName: req.user!.name,
      driverId: Number(driverId),
      driverName: driver.name,
      fleetId: driver.fleetId ?? null,
      rating: Number(rating),
      comment: comment ?? null,
    })
    .returning();

  res.status(201).json(record);
});

router.get("/ratings/driver/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  const driverId = parseInt(req.params["id"] ?? "");
  if (isNaN(driverId)) {
    res.status(400).json({ error: "Invalid driver id" });
    return;
  }

  const adminFleets = await db
    .select({ id: fleetsTable.id })
    .from(fleetsTable)
    .where(eq(fleetsTable.adminId, req.user!.id));
  const fleetIds = adminFleets.map((f) => f.id);

  const driver = await db
    .select({ id: usersTable.id, fleetId: usersTable.fleetId })
    .from(usersTable)
    .where(eq(usersTable.id, driverId))
    .limit(1);

  if (!driver.length || !fleetIds.includes(driver[0].fleetId!)) {
    res.status(403).json({ error: "Driver not in your fleet" });
    return;
  }

  const ratings = await db
    .select()
    .from(ratingsTable)
    .where(eq(ratingsTable.driverId, driverId));

  const total = ratings.length;
  const avgRating = total > 0 ? ratings.reduce((s, r) => s + r.rating, 0) / total : 0;

  res.json({ ratings, average: avgRating, count: total });
});

export default router;
