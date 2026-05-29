import { Router } from "express";
import { db, fareRecordsTable, ratingsTable } from "@workspace/db";
import { eq, gte, and, desc } from "drizzle-orm";
import { authMiddleware, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

router.get("/driver/stats", requireRole("independent_driver"), async (req: AuthRequest, res) => {
  const driverId = req.user!.id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [todayFares, weekFares, allFares, ratings] = await Promise.all([
    db.select().from(fareRecordsTable)
      .where(and(eq(fareRecordsTable.driverId, driverId), gte(fareRecordsTable.createdAt, today))),
    db.select().from(fareRecordsTable)
      .where(and(eq(fareRecordsTable.driverId, driverId), gte(fareRecordsTable.createdAt, weekAgo))),
    db.select().from(fareRecordsTable)
      .where(eq(fareRecordsTable.driverId, driverId)),
    db.select().from(ratingsTable)
      .where(eq(ratingsTable.driverId, driverId))
      .orderBy(desc(ratingsTable.createdAt))
      .limit(50),
  ]);

  const avgRating = ratings.length > 0
    ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
    : 0;

  res.json({
    today: {
      passengers: todayFares.length,
      earnings: todayFares.reduce((s, r) => s + parseFloat(String(r.amount)), 0),
      regular: todayFares.filter((r) => r.passengerType === "regular").length,
      student: todayFares.filter((r) => r.passengerType === "student").length,
      senior: todayFares.filter((r) => r.passengerType === "senior").length,
    },
    week: {
      passengers: weekFares.length,
      earnings: weekFares.reduce((s, r) => s + parseFloat(String(r.amount)), 0),
    },
    allTime: {
      passengers: allFares.length,
      earnings: allFares.reduce((s, r) => s + parseFloat(String(r.amount)), 0),
    },
    recentFares: todayFares.slice(-20).reverse().map((r) => ({
      id: r.id,
      passengerType: r.passengerType,
      amount: parseFloat(String(r.amount)),
      createdAt: r.createdAt,
    })),
    ratings: {
      average: avgRating,
      count: ratings.length,
      list: ratings.map((r) => ({
        id: r.id,
        commuterName: r.commuterName,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
    },
  });
});

export default router;
