import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { DriverData } from "@/types";

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  drivers: DriverData[];
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  drivers: [],
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [drivers, setDrivers] = useState<DriverData[]>([]);

  useEffect(() => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const url = domain ? `https://${domain}` : "http://localhost:5000";

    const socket = io(url, {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("get:drivers");
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("drivers:all", (data: DriverData[]) => {
      setDrivers(data);
    });

    socket.on("driver:location", (data: DriverData) => {
      setDrivers((prev) => {
        const idx = prev.findIndex((d) => d.driverId === data.driverId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data;
          return next;
        }
        return [...prev, data];
      });
    });

    socket.on("driver:status", (data: { driverId: string; status: DriverData["status"] }) => {
      setDrivers((prev) =>
        prev.map((d) =>
          d.driverId === data.driverId ? { ...d, status: data.status } : d
        )
      );
    });

    socket.on("driver:fare", (data: { driverId: string; passengerCount: number; totalFare: number }) => {
      setDrivers((prev) =>
        prev.map((d) =>
          d.driverId === data.driverId
            ? { ...d, passengerCount: data.passengerCount, totalFare: data.totalFare }
            : d
        )
      );
    });

    socket.on("driver:offline", (data: { driverId: string }) => {
      setDrivers((prev) => prev.filter((d) => d.driverId !== data.driverId));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, drivers }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
