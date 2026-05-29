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

interface CommuterLocation {
  commuterId: string;
  commuterName: string;
  lat: number;
  lng: number;
  announcedAt: number;
}

const activeDrivers = new Map<string, DriverData>();
const activeCommuters = new Map<string, CommuterLocation>();
const commuterTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function clearCommuterTimeout(commuterId: string) {
  const t = commuterTimeouts.get(commuterId);
  if (t) {
    clearTimeout(t);
    commuterTimeouts.delete(commuterId);
  }
}

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
      (data: { driverId: string; passengerCount: number; totalFare: number }) => {
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

    // Commuter announces their position — auto-expires after 120s
    socket.on("commuter:location", (data: CommuterLocation) => {
      const updated = { ...data, announcedAt: Date.now() };
      activeCommuters.set(data.commuterId, updated);
      io.emit("commuter:location", updated);

      // Cancel any existing expiry for this commuter and set a fresh one
      clearCommuterTimeout(data.commuterId);
      const t = setTimeout(() => {
        activeCommuters.delete(data.commuterId);
        commuterTimeouts.delete(data.commuterId);
        io.emit("commuter:removed", { commuterId: data.commuterId });
      }, 120000);
      commuterTimeouts.set(data.commuterId, t);
    });

    // Commuter explicitly stops sharing their position
    socket.on("commuter:remove", (data: { commuterId: string }) => {
      clearCommuterTimeout(data.commuterId);
      activeCommuters.delete(data.commuterId);
      io.emit("commuter:removed", { commuterId: data.commuterId });
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Client disconnected");
    });
  });

  return io;
}
