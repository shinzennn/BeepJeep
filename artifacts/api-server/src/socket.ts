import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "./lib/logger";

interface DriverData {
  driverId: string;
  driverName: string;
  lat: number;
  lng: number;
  status: "available" | "full" | "offline";
  route: string;
  passengerCount: number;
  totalFare: number;
  lastUpdated: number;
}

const activeDrivers = new Map<string, DriverData>();

export function initSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: "/api/socket.io",
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Client connected");

    socket.on("get:drivers", () => {
      socket.emit("drivers:all", Array.from(activeDrivers.values()));
    });

    socket.on("driver:location", (data: DriverData) => {
      const updated = { ...data, lastUpdated: Date.now() };
      activeDrivers.set(data.driverId, updated);
      io.emit("driver:location", updated);
    });

    socket.on(
      "driver:status",
      (data: { driverId: string; status: DriverData["status"] }) => {
        const driver = activeDrivers.get(data.driverId);
        if (driver) {
          driver.status = data.status;
          io.emit("driver:status", data);
        }
      }
    );

    socket.on(
      "driver:fare",
      (data: {
        driverId: string;
        passengerCount: number;
        totalFare: number;
      }) => {
        const driver = activeDrivers.get(data.driverId);
        if (driver) {
          driver.passengerCount = data.passengerCount;
          driver.totalFare = data.totalFare;
          io.emit("driver:fare", data);
        }
      }
    );

    socket.on("driver:offline", (data: { driverId: string }) => {
      activeDrivers.delete(data.driverId);
      io.emit("driver:offline", data);
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Client disconnected");
    });
  });

  return io;
}
