import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, fleetsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.use(authMiddleware);

// Create fleet
router.post("/fleets", requireRole("admin"), async (req: AuthRequest, res) => {
  const { name } = req.body ?? {};
  if (!name?.trim()) {
    res.status(400).json({ error: "Fleet name is required" });
    return;
  }
  const [fleet] = await db
    .insert(fleetsTable)
    .values({ name: name.trim(), adminId: req.user!.id })
    .returning();
  res.status(201).json(fleet);
});

// List admin's fleets with driver counts
router.get("/fleets", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleets = await db
    .select()
    .from(fleetsTable)
    .where(eq(fleetsTable.adminId, req.user!.id));

  const withCounts = await Promise.all(
    fleets.map(async (f) => {
      const drivers = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.fleetId, f.id), eq(usersTable.role, "fleet_driver")));
      return { ...f, driverCount: drivers.length };
    })
  );

  res.json(withCounts);
});

// Get drivers in a fleet
router.get("/fleets/:id/drivers", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(req.params["id"] ?? "");
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleet id" }); return; }

  const fleet = await db.select().from(fleetsTable).where(
    and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id))
  ).limit(1);
  if (!fleet.length) { res.status(404).json({ error: "Fleet not found" }); return; }

  const drivers = await db
    .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, vehicleNumber: usersTable.vehicleNumber, route: usersTable.route, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(and(eq(usersTable.fleetId, fleetId), eq(usersTable.role, "fleet_driver")));

  res.json(drivers);
});

// Add driver to fleet
router.post("/fleets/:id/drivers", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(req.params["id"] ?? "");
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleet id" }); return; }

  const fleet = await db.select().from(fleetsTable).where(
    and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id))
  ).limit(1);
  if (!fleet.length) { res.status(404).json({ error: "Fleet not found" }); return; }

  const { name, username, password, vehicleNumber, route } = req.body ?? {};
  if (!name || !username || !password) {
    res.status(400).json({ error: "name, username, and password are required" });
    return;
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (existing.length) { res.status(409).json({ error: "Username already taken" }); return; }

  const passwordHash = await bcrypt.hash(password, 10);
  const [driver] = await db.insert(usersTable).values({
    name, username, passwordHash, role: "fleet_driver",
    fleetId, vehicleNumber: vehicleNumber ?? null, route: route ?? null,
  }).returning({ id: usersTable.id, name: usersTable.name, username: usersTable.username, vehicleNumber: usersTable.vehicleNumber, route: usersTable.route });

  res.status(201).json(driver);
});

// Remove driver from fleet
router.delete("/fleets/:id/drivers/:driverId", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(req.params["id"] ?? "");
  const driverId = parseInt(req.params["driverId"] ?? "");
  if (isNaN(fleetId) || isNaN(driverId)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(usersTable).where(
    and(eq(usersTable.id, driverId), eq(usersTable.fleetId, fleetId), eq(usersTable.role, "fleet_driver"))
  );
  res.json({ success: true });
});

// Delete fleet
router.delete("/fleets/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(req.params["id"] ?? "");
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleet id" }); return; }
  await db.delete(fleetsTable).where(and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id)));
  res.json({ success: true });
});

export default router;
