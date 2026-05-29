import React, { useRef, useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import MapWebView, { MapWebViewRef } from "@/components/MapWebView";
import { DriverData } from "@/types";

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { drivers, connected } = useSocket();
  const mapRef = useRef<MapWebViewRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverData | null>(null);

  useEffect(() => {
    if (mapReady) mapRef.current?.setDrivers(drivers);
  }, [mapReady, drivers]);

  const active = drivers.filter((d) => d.status !== "offline");
  const full = drivers.filter((d) => d.status === "full");
  const totalPassengers = drivers.reduce((s, d) => s + (d.passengerCount || 0), 0);
  const totalFares = drivers.reduce((s, d) => s + (d.totalFare || 0), 0);

  function focusDriver(d: DriverData) {
    setSelectedDriver(d);
    mapRef.current?.panTo(d.lat, d.lng, 17);
  }

  const s = makeStyles(colors);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[s.root, { paddingTop: topPad, paddingBottom: bottomPad }]}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.avatar}>
            <MaterialCommunityIcons name="shield-account" size={20} color="#fff" />
          </View>
          <View>
            <Text style={s.headerTitle}>Fleet Control</Text>
            <View style={s.statusRow}>
              <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.mutedForeground }]} />
              <Text style={s.statusText}>{connected ? "Live" : "Disconnected"}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={() => { logout(); router.replace("/"); }} style={s.logoutBtn}>
          <Feather name="log-out" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={s.mapWrap}>
        <MapWebView ref={mapRef} style={s.map} onMapReady={() => setMapReady(true)} />
        <View style={s.mapLegend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={s.legendText}>Available</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#EF4444" }]} />
            <Text style={s.legendText}>Full</Text>
          </View>
        </View>
      </View>

      <ScrollView style={s.panel} contentContainerStyle={s.panelContent} showsVerticalScrollIndicator={false}>
        <View style={s.statsGrid}>
          <View style={[s.statCard, { flex: 1 }]}>
            <MaterialCommunityIcons name="bus" size={24} color={colors.primary} />
            <Text style={s.statNum}>{active.length}</Text>
            <Text style={s.statLabel}>Active</Text>
          </View>
          <View style={[s.statCard, { flex: 1 }]}>
            <MaterialCommunityIcons name="seat-passenger" size={24} color="#EF4444" />
            <Text style={s.statNum}>{full.length}</Text>
            <Text style={s.statLabel}>Full</Text>
          </View>
          <View style={[s.statCard, { flex: 1 }]}>
            <MaterialCommunityIcons name="account-group" size={24} color={colors.success} />
            <Text style={s.statNum}>{totalPassengers}</Text>
            <Text style={s.statLabel}>Riders</Text>
          </View>
          <View style={[s.statCard, { flex: 1 }]}>
            <MaterialCommunityIcons name="cash" size={24} color={colors.warning} />
            <Text style={[s.statNum, { fontSize: 16 }]}>₱{totalFares}</Text>
            <Text style={s.statLabel}>Collected</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Active Drivers</Text>

        {active.length === 0 ? (
          <View style={s.emptyState}>
            <MaterialCommunityIcons name="bus-clock" size={36} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No active drivers on the road</Text>
          </View>
        ) : (
          active.map((d) => {
            const isSelected = selectedDriver?.driverId === d.driverId;
            return (
              <TouchableOpacity
                key={d.driverId}
                style={[s.driverRow, isSelected && s.driverRowSelected]}
                onPress={() => focusDriver(d)}
                activeOpacity={0.75}
              >
                <View style={[s.driverAvatar, { backgroundColor: d.status === "available" ? colors.secondary : "#FEE2E2" }]}>
                  <MaterialCommunityIcons
                    name="bus"
                    size={20}
                    color={d.status === "available" ? colors.primary : "#EF4444"}
                  />
                </View>
                <View style={s.driverInfo}>
                  <Text style={s.driverName}>{d.driverName}</Text>
                  <Text style={s.driverRoute}>{d.route}</Text>
                </View>
                <View style={s.driverStats}>
                  <View style={s.driverStatItem}>
                    <MaterialCommunityIcons name="account-group" size={14} color={colors.mutedForeground} />
                    <Text style={s.driverStatText}>{d.passengerCount}</Text>
                  </View>
                  <View style={s.driverStatItem}>
                    <MaterialCommunityIcons name="cash" size={14} color={colors.success} />
                    <Text style={[s.driverStatText, { color: colors.success }]}>₱{d.totalFare}</Text>
                  </View>
                </View>
                <View style={[s.statusBadge, { backgroundColor: d.status === "available" ? colors.secondary : "#FEE2E2" }]}>
                  <Text style={[s.statusBadgeText, { color: d.status === "available" ? colors.primary : "#EF4444" }]}>
                    {d.status === "available" ? "Available" : "Full"}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: c.foreground },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12, color: c.mutedForeground },
    logoutBtn: { padding: 8 },
    mapWrap: { height: 230, position: "relative" },
    map: { flex: 1 },
    mapLegend: {
      position: "absolute", bottom: 10, right: 10,
      backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 12,
      padding: 8, gap: 6,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 11, color: c.foreground, fontWeight: "600" },
    panel: { flex: 1 },
    panelContent: { padding: 20, gap: 16 },
    statsGrid: { flexDirection: "row", gap: 10 },
    statCard: {
      backgroundColor: c.card, borderRadius: 14,
      padding: 14, alignItems: "center", gap: 6,
    },
    statNum: { fontSize: 22, fontWeight: "800", color: c.foreground },
    statLabel: { fontSize: 11, color: c.mutedForeground, fontWeight: "500" },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    emptyState: { alignItems: "center", gap: 10, paddingVertical: 24 },
    emptyText: { color: c.mutedForeground, fontSize: 14 },
    driverRow: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: c.card, borderRadius: 14,
      padding: 14, gap: 12, borderWidth: 2, borderColor: "transparent",
    },
    driverRowSelected: { borderColor: c.primary },
    driverAvatar: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: "center", justifyContent: "center",
    },
    driverInfo: { flex: 1 },
    driverName: { fontSize: 15, fontWeight: "700", color: c.foreground },
    driverRoute: { fontSize: 12, color: c.mutedForeground, marginTop: 2 },
    driverStats: { gap: 4 },
    driverStatItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    driverStatText: { fontSize: 12, color: c.mutedForeground, fontWeight: "600" },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
    statusBadgeText: { fontSize: 11, fontWeight: "700" },
  });
}
