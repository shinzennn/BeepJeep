export type UserRole = "admin" | "driver" | "commuter";

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface DriverData {
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

export interface FareRecord {
  id: string;
  type: "regular" | "student" | "senior";
  amount: number;
  timestamp: number;
}

export interface UserCoords {
  lat: number;
  lng: number;
}

export const FARE_RATES = {
  regular: 13,
  student: 10,
  senior: 10,
} as const;

export const PROXIMITY_THRESHOLD_METERS = 100;

export function calcDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
