import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, Alert, Animated,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import MapWebView, { MapWebViewRef } from "@/components/MapWebView";
import { FareRecord, FARE_RATES } from "@/types";

type CapacityStatus = "available" | "full";

export default function DriverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const mapRef = useRef<MapWebViewRef>(null);

  const [tracking, setTracking] = useState(false);
  const [capacity, setCapacity] = useState<CapacityStatus>("available");
  const [fares, setFares] = useState<FareRecord[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const totalPassengers = fares.length;
  const totalEarnings = fares.reduce((s, f) => s + f.amount, 0);

  useEffect(() => {
    if (tracking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [tracking]);

  const startTracking = useCallback(async () => {
    if (Platform.OS !== "web") {
      const [fgPerm] = await Location.requestForegroundPermissionsAsync();
      if (!fgPerm.granted) {
        Alert.alert("Permission needed", "Location access is required for tracking.");
        return;
      }
      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (loc) => {
          const { latitude: lat, longitude: lng } = loc.coords;
          setCoords({ lat, lng });
          mapRef.current?.setUserLocation({ lat, lng }, true);
          socket?.emit("driver:location", {
            driverId: user!.id,
            driverName: user!.name,
            lat, lng,
            status: capacity,
            route: "Route 1",
            passengerCount: fares.length,
            totalFare: fares.reduce((s, f) => s + f.amount, 0),
            lastUpdated: Date.now(),
          });
        }
      );
    } else {
      if (!navigator.geolocation) { Alert.alert("GPS not available"); return; }
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          setCoords({ lat, lng });
          mapRef.current?.setUserLocation({ lat, lng }, true);
          socket?.emit("driver:location", {
            driverId: user!.id, driverName: user!.name,
            lat, lng, status: capacity, route: "Route 1",
            passengerCount: fares.length,
            totalFare: fares.reduce((s, f) => s + f.amount, 0),
            lastUpdated: Date.now(),
          });
        },
        (err) => console.warn("GPS error", err),
        { enableHighAccuracy: true, maximumAge: 3000 }
      );
      (locationSub.current as any) = { _webId: watchId };
    }
    setTracking(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [socket, capacity, user, fares]);

  const stopTracking = useCallback(() => {
    if (Platform.OS !== "web") {
      locationSub.current?.remove();
    } else {
      const id = (locationSub.current as any)?._webId;
      if (id != null) navigator.geolocation.clearWatch(id);
    }
    locationSub.current = null;
    socket?.emit("driver:offline", { driverId: user!.id });
    setTracking(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [socket, user]);

  function addFare(type: "regular" | "student" | "senior") {
    const record: FareRecord = {
      id: Date.now().toString(),
      type, amount: FARE_RATES[type], timestamp: Date.now(),
    };
    const next = [...fares, record];
    setFares(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    socket?.emit("driver:fare", {
      driverId: user!.id,
      passengerCount: next.length,
      totalFare: next.reduce((s, f) => s + f.amount, 0),
    });
  }

  function removeLast() {
    if (!fares.length) return;
    const next = fares.slice(0, -1);
    setFares(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    socket?.emit("driver:fare", {
      driverId: user!.id,
      passengerCount: next.length,
      totalFare: next.reduce((s, f) => s + f.amount, 0),
    });
  }

  function toggleCapacity() {
    const next = capacity === "available" ? "full" : "available";
    setCapacity(next);
    Haptics.selectionAsync();
    socket?.emit("driver:status", { driverId: user!.id, status: next });
  }

  function handleLogout() {
    stopTracking();
    logout();
    router.replace("/");
  }

  const s = makeStyles(colors);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[s.root, { paddingTop: topPad, paddingBottom: bottomPad }]}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{user?.name?.[0]?.toUpperCase() ?? "D"}</Text>
          </View>
          <View>
            <Text style={s.headerName}>{user?.name}</Text>
            <View style={s.statusRow}>
              <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.mutedForeground }]} />
              <Text style={s.statusText}>{connected ? "Connected" : "Offline"}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
          <Feather name="log-out" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={s.mapWrap}>
        <MapWebView ref={mapRef} style={s.map} />
        <View style={s.mapOverlay}>
          {coords && (
            <View style={s.coordBadge}>
              <Feather name="navigation" size={12} color={colors.primary} />
              <Text style={s.coordText}>
                {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView style={s.panel} contentContainerStyle={s.panelContent} showsVerticalScrollIndicator={false}>
        <View style={s.controls}>
          <TouchableOpacity
            style={[s.trackBtn, tracking ? s.trackBtnStop : s.trackBtnStart]}
            onPress={tracking ? stopTracking : startTracking}
            activeOpacity={0.8}
          >
            <Animated.View style={{ transform: [{ scale: tracking ? pulseAnim : 1 }] }}>
              <Feather name={tracking ? "pause-circle" : "play-circle"} size={22} color="#fff" />
            </Animated.View>
            <Text style={s.trackBtnText}>{tracking ? "Stop Tracking" : "Start Tracking"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.capBtn, capacity === "full" ? s.capFull : s.capAvail]}
            onPress={toggleCapacity}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name={capacity === "full" ? "seat-passenger" : "seat"}
              size={22}
              color={capacity === "full" ? "#fff" : colors.primary}
            />
            <Text style={[s.capBtnText, { color: capacity === "full" ? "#fff" : colors.primary }]}>
              {capacity === "full" ? "Full" : "Available"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={s.statsRow}>
          <View style={s.stat}>
            <MaterialCommunityIcons name="account-group" size={22} color={colors.primary} />
            <Text style={s.statNum}>{totalPassengers}</Text>
            <Text style={s.statLabel}>Passengers</Text>
          </View>
          <View style={s.statDiv} />
          <View style={s.stat}>
            <MaterialCommunityIcons name="cash" size={22} color={colors.success} />
            <Text style={[s.statNum, { color: colors.success }]}>₱{totalEarnings}</Text>
            <Text style={s.statLabel}>Earnings</Text>
          </View>
          <View style={s.statDiv} />
          <View style={s.stat}>
            <Feather name="clock" size={22} color={colors.mutedForeground} />
            <Text style={s.statNum}>{new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</Text>
            <Text style={s.statLabel}>Time</Text>
          </View>
        </View>

        <Text style={s.fareTitle}>Add Passenger</Text>
        <View style={s.fareRow}>
          {(["regular", "student", "senior"] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={s.fareBtn}
              onPress={() => addFare(type)}
              activeOpacity={0.75}
            >
              <Text style={s.fareBtnAmt}>₱{FARE_RATES[type]}</Text>
              <Text style={s.fareBtnLabel}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {fares.length > 0 && (
          <TouchableOpacity style={s.undoBtn} onPress={removeLast} activeOpacity={0.7}>
            <Feather name="rotate-ccw" size={16} color={colors.destructive} />
            <Text style={s.undoBtnText}>Undo Last</Text>
          </TouchableOpacity>
        )}

        <View style={s.fareBreakdown}>
          {(["regular", "student", "senior"] as const).map((type) => {
            const count = fares.filter((f) => f.type === type).length;
            if (!count) return null;
            return (
              <View key={type} style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>
                  {type.charAt(0).toUpperCase() + type.slice(1)} x{count}
                </Text>
                <Text style={s.breakdownAmt}>₱{count * FARE_RATES[type]}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
    },
    avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
    headerName: { fontSize: 16, fontWeight: "700", color: c.foreground },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12, color: c.mutedForeground },
    logoutBtn: { padding: 8 },
    mapWrap: { height: 220, position: "relative" },
    map: { flex: 1 },
    mapOverlay: { position: "absolute", bottom: 10, left: 10 },
    coordBadge: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 5,
    },
    coordText: { fontSize: 11, color: c.foreground, fontWeight: "600" },
    panel: { flex: 1 },
    panelContent: { padding: 20, gap: 16 },
    controls: { flexDirection: "row", gap: 12 },
    trackBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      height: 50, borderRadius: 14, gap: 8,
    },
    trackBtnStart: { backgroundColor: c.primary },
    trackBtnStop: { backgroundColor: "#EF4444" },
    trackBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    capBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      height: 50, borderRadius: 14, gap: 8, borderWidth: 2, borderColor: c.primary,
    },
    capAvail: { backgroundColor: c.secondary },
    capFull: { backgroundColor: "#EF4444", borderColor: "#EF4444" },
    capBtnText: { fontWeight: "700", fontSize: 15 },
    statsRow: {
      flexDirection: "row", backgroundColor: c.card,
      borderRadius: 16, padding: 16, alignItems: "center",
    },
    stat: { flex: 1, alignItems: "center", gap: 4 },
    statNum: { fontSize: 20, fontWeight: "800", color: c.foreground },
    statLabel: { fontSize: 11, color: c.mutedForeground, fontWeight: "500" },
    statDiv: { width: 1, height: 40, backgroundColor: c.border },
    fareTitle: { fontSize: 14, fontWeight: "700", color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    fareRow: { flexDirection: "row", gap: 10 },
    fareBtn: {
      flex: 1, height: 72, borderRadius: 16,
      backgroundColor: c.secondary, alignItems: "center",
      justifyContent: "center", borderWidth: 2, borderColor: c.primary,
    },
    fareBtnAmt: { fontSize: 22, fontWeight: "800", color: c.primary },
    fareBtnLabel: { fontSize: 12, color: c.secondaryForeground, marginTop: 2 },
    undoBtn: {
      flexDirection: "row", alignItems: "center", gap: 8,
      alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16,
      borderRadius: 20, borderWidth: 1, borderColor: c.destructive,
    },
    undoBtnText: { color: c.destructive, fontSize: 14, fontWeight: "600" },
    fareBreakdown: { backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 8 },
    breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
    breakdownLabel: { fontSize: 14, color: c.foreground },
    breakdownAmt: { fontSize: 14, fontWeight: "700", color: c.foreground },
  });
}
