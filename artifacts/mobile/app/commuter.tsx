import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, Animated, ScrollView,
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
import { DriverData, UserCoords, calcDistance, PROXIMITY_THRESHOLD_METERS } from "@/types";

export default function CommuterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { drivers, connected } = useSocket();
  const mapRef = useRef<MapWebViewRef>(null);

  const [userCoords, setUserCoords] = useState<UserCoords | null>(null);
  const [nearbyDriver, setNearbyDriver] = useState<DriverData | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<DriverData | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const alertAnim = useRef(new Animated.Value(0)).current;
  const locationSub = useRef<any>(null);

  useEffect(() => {
    if (mapReady) {
      mapRef.current?.setDrivers(drivers);
    }
  }, [mapReady, drivers]);

  useEffect(() => {
    startLocationWatch();
    return () => stopLocationWatch();
  }, []);

  useEffect(() => {
    if (!userCoords) return;
    const close = drivers.find(
      (d) => d.status !== "offline" && calcDistance(userCoords.lat, userCoords.lng, d.lat, d.lng) <= PROXIMITY_THRESHOLD_METERS
    );
    if (close && close.driverId !== nearbyDriver?.driverId) {
      setNearbyDriver(close);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Animated.sequence([
        Animated.timing(alertAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(4000),
        Animated.timing(alertAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setNearbyDriver(null));
    }
  }, [drivers, userCoords]);

  const startLocationWatch = useCallback(async () => {
    if (Platform.OS !== "web") {
      const [perm] = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (loc) => {
          const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setUserCoords(coords);
          mapRef.current?.setUserLocation(coords);
        }
      );
    } else {
      if (!navigator.geolocation) return;
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserCoords(coords);
          mapRef.current?.setUserLocation(coords);
        },
        undefined,
        { enableHighAccuracy: true }
      );
      locationSub.current = { _webId: id };
    }
  }, []);

  const stopLocationWatch = useCallback(() => {
    if (Platform.OS !== "web") {
      locationSub.current?.remove();
    } else {
      const id = locationSub.current?._webId;
      if (id != null) navigator.geolocation.clearWatch(id);
    }
    locationSub.current = null;
  }, []);

  function focusDriver(d: DriverData) {
    setSelectedDriver(d);
    mapRef.current?.panTo(d.lat, d.lng, 17);
    Haptics.selectionAsync();
  }

  const s = makeStyles(colors);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const availableDrivers = drivers.filter((d) => d.status !== "offline");

  return (
    <View style={[s.root]}>
      <View style={[s.header, { paddingTop: topPad + 8 }]}>
        <View style={s.headerLeft}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{user?.name?.[0]?.toUpperCase() ?? "C"}</Text>
          </View>
          <View>
            <Text style={s.headerTitle}>Live Tracking</Text>
            <View style={s.statusRow}>
              <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.mutedForeground }]} />
              <Text style={s.statusText}>{availableDrivers.length} jeepney{availableDrivers.length !== 1 ? "s" : ""} nearby</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={() => { logout(); router.replace("/"); }} style={s.logoutBtn}>
          <Feather name="log-out" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={s.mapContainer}>
        <MapWebView
          ref={mapRef}
          style={s.map}
          onMapReady={() => setMapReady(true)}
        />

        {nearbyDriver && (
          <Animated.View style={[s.proximityAlert, { opacity: alertAnim, transform: [{ scale: alertAnim }] }]}>
            <MaterialCommunityIcons name="bus-alert" size={24} color="#fff" />
            <View style={s.alertText}>
              <Text style={s.alertTitle}>Jeepney Approaching!</Text>
              <Text style={s.alertSub}>{nearbyDriver.driverName} is within 100m</Text>
            </View>
          </Animated.View>
        )}
      </View>

      <View style={[s.bottomPanel, { paddingBottom: bottomPad + 8 }]}>
        <Text style={s.panelTitle}>Nearby Jeepneys</Text>
        {availableDrivers.length === 0 ? (
          <View style={s.emptyState}>
            <MaterialCommunityIcons name="bus-clock" size={32} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No active jeepneys yet</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.driverList}>
            {availableDrivers.map((d) => {
              const dist = userCoords ? calcDistance(userCoords.lat, userCoords.lng, d.lat, d.lng) : null;
              const isSelected = selectedDriver?.driverId === d.driverId;
              return (
                <TouchableOpacity
                  key={d.driverId}
                  style={[s.driverCard, isSelected && s.driverCardSelected]}
                  onPress={() => focusDriver(d)}
                  activeOpacity={0.75}
                >
                  <View style={[s.driverDot, { backgroundColor: d.status === "available" ? colors.success : "#EF4444" }]} />
                  <Text style={s.driverName}>{d.driverName}</Text>
                  <Text style={s.driverRoute}>{d.route}</Text>
                  <View style={s.driverMeta}>
                    <MaterialCommunityIcons name="account-group" size={13} color={colors.mutedForeground} />
                    <Text style={s.driverMetaText}>{d.passengerCount}</Text>
                    {dist !== null && (
                      <>
                        <Feather name="navigation" size={11} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
                        <Text style={s.driverMetaText}>
                          {dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`}
                        </Text>
                      </>
                    )}
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: d.status === "available" ? colors.secondary : "#FEE2E2" }]}>
                    <Text style={[s.statusBadgeText, { color: d.status === "available" ? colors.primary : "#EF4444" }]}>
                      {d.status === "available" ? "Available" : "Full"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    header: {
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingBottom: 12,
      backgroundColor: c.primary,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center",
    },
    avatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    headerTitle: { fontSize: 16, fontWeight: "800", color: "#fff" },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12, color: "rgba(255,255,255,0.85)" },
    logoutBtn: { padding: 8 },
    mapContainer: { flex: 1, marginTop: Platform.OS === "web" ? 100 : 100 },
    map: { flex: 1 },
    proximityAlert: {
      position: "absolute", top: 12, left: 16, right: 16,
      backgroundColor: c.warning, borderRadius: 16, padding: 14,
      flexDirection: "row", alignItems: "center", gap: 12,
      shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
    },
    alertText: { flex: 1 },
    alertTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
    alertSub: { color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 2 },
    bottomPanel: {
      backgroundColor: c.background,
      paddingTop: 16, paddingHorizontal: 20,
      borderTopWidth: 1, borderTopColor: c.border,
      minHeight: 130,
    },
    panelTitle: { fontSize: 13, fontWeight: "700", color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
    emptyState: { alignItems: "center", gap: 8, paddingVertical: 12 },
    emptyText: { color: c.mutedForeground, fontSize: 14 },
    driverList: { flexDirection: "row" },
    driverCard: {
      width: 140, backgroundColor: c.card, borderRadius: 14,
      padding: 12, marginRight: 10, borderWidth: 2, borderColor: "transparent",
    },
    driverCardSelected: { borderColor: c.primary },
    driverDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
    driverName: { fontSize: 14, fontWeight: "700", color: c.foreground },
    driverRoute: { fontSize: 12, color: c.mutedForeground, marginTop: 2 },
    driverMeta: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 3 },
    driverMetaText: { fontSize: 12, color: c.mutedForeground },
    statusBadge: { marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: "flex-start" },
    statusBadgeText: { fontSize: 11, fontWeight: "700" },
  });
}
