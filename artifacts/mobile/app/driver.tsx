import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  Animated,
  Modal,
  TextInput,
  ActivityIndicator,
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
import { apiJson } from "@/lib/api";
import { FARE_RATES } from "@/types";

type CapacityStatus = "available" | "full";

interface LocalFare {
  id: string;
  type: "regular" | "student" | "senior";
  amount: number;
  timestamp: number;
}

interface FareRates {
  regularFare: number;
  studentFare: number;
  seniorFare: number;
}

const DEFAULT_RATES: FareRates = {
  regularFare: FARE_RATES.regular,
  studentFare: FARE_RATES.student,
  seniorFare: FARE_RATES.senior,
};

export default function DriverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const mapRef = useRef<MapWebViewRef>(null);

  const isFleetDriver = user?.role === "fleet_driver";
  const roleLabel = isFleetDriver ? "Fleet Driver" : "Independent Driver";

  const [tracking, setTracking] = useState(false);
  const [capacity, setCapacity] = useState<CapacityStatus>("available");
  const [fares, setFares] = useState<LocalFare[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showFareEdit, setShowFareEdit] = useState(false);
  const [fareRates, setFareRates] = useState<FareRates>(DEFAULT_RATES);
  const [editRates, setEditRates] = useState<{ regular: string; student: string; senior: string }>({ regular: "", student: "", senior: "" });
  const [savingFares, setSavingFares] = useState(false);

  const locationSub = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mapHeight = useRef(new Animated.Value(200)).current;

  const totalPassengers = fares.length;
  const totalEarnings = fares.reduce((s, f) => s + f.amount, 0);

  useEffect(() => {
    loadFareSettings();
  }, []);

  useEffect(() => {
    if (tracking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [tracking]);

  async function loadFareSettings() {
    try {
      const data = await apiJson<FareRates>("/fare-settings");
      setFareRates(data);
    } catch {}
  }

  function toggleMap() {
    const next = !mapExpanded;
    setMapExpanded(next);
    Animated.spring(mapHeight, {
      toValue: next ? 420 : 200,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
    Haptics.selectionAsync();
  }

  const broadcastLocation = useCallback(
    (lat: number, lng: number, cap: CapacityStatus, fareCount: number, fareTotal: number) => {
      socket?.emit("driver:location", {
        driverId: String(user!.id),
        driverName: user!.name,
        lat, lng,
        status: cap,
        route: "Route 1",
        passengerCount: fareCount,
        totalFare: fareTotal,
        lastUpdated: Date.now(),
      });
    },
    [socket, user],
  );

  const startTracking = useCallback(async () => {
    if (Platform.OS !== "web") {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        Alert.alert("Permission needed", "Location access is required for tracking.");
        return;
      }
      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (loc) => {
          const { latitude: lat, longitude: lng } = loc.coords;
          setCoords({ lat, lng });
          mapRef.current?.setUserLocation({ lat, lng }, true);
          setFares((f) => {
            broadcastLocation(lat, lng, capacity, f.length, f.reduce((s, x) => s + x.amount, 0));
            return f;
          });
        },
      );
    } else {
      if (!navigator.geolocation) { Alert.alert("GPS not available"); return; }
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          setCoords({ lat, lng });
          mapRef.current?.setUserLocation({ lat, lng }, true);
          setFares((f) => {
            broadcastLocation(lat, lng, capacity, f.length, f.reduce((s, x) => s + x.amount, 0));
            return f;
          });
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 3000 },
      );
      locationSub.current = { _webId: id };
    }
    setTracking(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [capacity, broadcastLocation]);

  const stopTracking = useCallback(() => {
    if (Platform.OS !== "web") {
      locationSub.current?.remove();
    } else {
      const id = locationSub.current?._webId;
      if (id != null) navigator.geolocation.clearWatch(id);
    }
    locationSub.current = null;
    socket?.emit("driver:offline", { driverId: String(user!.id) });
    setTracking(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [socket, user]);

  async function addFare(type: "regular" | "student" | "senior") {
    const amt = type === "regular" ? fareRates.regularFare : type === "student" ? fareRates.studentFare : fareRates.seniorFare;
    const record: LocalFare = { id: Date.now().toString(), type, amount: amt, timestamp: Date.now() };
    setFares((prev) => {
      const next = [...prev, record];
      socket?.emit("driver:fare", {
        driverId: String(user!.id),
        passengerCount: next.length,
        totalFare: next.reduce((s, f) => s + f.amount, 0),
      });
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await apiJson("/fares", {
        method: "POST",
        body: JSON.stringify({ passengerType: type, amount: amt }),
      });
    } catch {}
  }

  function unboardPassenger() {
    setFares((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice(0, -1);
      socket?.emit("driver:fare", {
        driverId: String(user!.id),
        passengerCount: next.length,
        totalFare: next.reduce((s, f) => s + f.amount, 0),
      });
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function toggleCapacity() {
    const next: CapacityStatus = capacity === "available" ? "full" : "available";
    setCapacity(next);
    Haptics.selectionAsync();
    socket?.emit("driver:status", { driverId: String(user!.id), status: next });
  }

  function handleLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          stopTracking();
          await logout();
          router.replace("/");
        },
      },
    ]);
  }

  function openFareEdit() {
    setEditRates({
      regular: String(fareRates.regularFare),
      student: String(fareRates.studentFare),
      senior: String(fareRates.seniorFare),
    });
    setShowFareEdit(true);
  }

  async function saveFareSettings() {
    const regular = parseFloat(editRates.regular);
    const student = parseFloat(editRates.student);
    const senior = parseFloat(editRates.senior);
    if (isNaN(regular) || isNaN(student) || isNaN(senior) || regular <= 0 || student <= 0 || senior <= 0) {
      Alert.alert("Invalid", "Please enter valid positive fare amounts.");
      return;
    }
    setSavingFares(true);
    try {
      const data = await apiJson<FareRates>("/fare-settings", {
        method: "PUT",
        body: JSON.stringify({ regularFare: regular, studentFare: student, seniorFare: senior }),
      });
      setFareRates({ regularFare: regular, studentFare: student, seniorFare: senior });
      setShowFareEdit(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not save fare settings.");
    } finally {
      setSavingFares(false);
    }
  }

  const s = makeStyles(colors);
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const bottomPad = Platform.OS === "web" ? 0 : insets.bottom;

  return (
    <View style={[s.root, { paddingTop: topPad, paddingBottom: bottomPad }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.headerLeft} onPress={() => setShowProfile(true)} activeOpacity={0.8}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{user?.name?.[0]?.toUpperCase() ?? "D"}</Text>
          </View>
          <View>
            <Text style={s.headerName}>{user?.name}</Text>
            <View style={s.statusRow}>
              <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.mutedForeground }]} />
              <Text style={s.statusText}>{roleLabel}</Text>
            </View>
          </View>
        </TouchableOpacity>
        <View style={s.headerRight}>
          {isFleetDriver && (
            <View style={s.fleetBadge}>
              <MaterialCommunityIcons name="bus-multiple" size={12} color={colors.primary} />
              <Text style={s.fleetBadgeText}>Fleet</Text>
            </View>
          )}
          <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
            <Feather name="log-out" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View style={[s.mapWrap, { height: mapHeight }]}>
        <MapWebView ref={mapRef} style={s.map} />
        {coords && (
          <View style={s.coordBadge}>
            <Feather name="navigation" size={12} color={colors.primary} />
            <Text style={s.coordText}>{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</Text>
          </View>
        )}
        <TouchableOpacity style={s.mapExpandBtn} onPress={toggleMap} activeOpacity={0.8}>
          <Feather name={mapExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView style={s.panel} contentContainerStyle={s.panelContent} showsVerticalScrollIndicator={false}>
        <View style={s.controls}>
          <TouchableOpacity
            style={[s.trackBtn, tracking ? s.trackStop : s.trackStart]}
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
            <Text style={s.statLabel}>Session</Text>
          </View>
        </View>

        <Text style={s.fareTitle}>Add Passenger</Text>
        <View style={s.fareRow}>
          {(["regular", "student", "senior"] as const).map((type) => {
            const amt = type === "regular" ? fareRates.regularFare : type === "student" ? fareRates.studentFare : fareRates.seniorFare;
            return (
              <TouchableOpacity
                key={type}
                style={s.fareBtn}
                onPress={() => addFare(type)}
                activeOpacity={0.75}
              >
                <Text style={s.fareBtnAmt}>₱{amt}</Text>
                <Text style={s.fareBtnLabel}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[s.unboardBtn, fares.length === 0 && s.btnDisabled]}
          onPress={unboardPassenger}
          disabled={fares.length === 0}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons name="account-minus" size={20} color="#fff" />
          <Text style={s.unboardBtnText}>Passenger Unboard</Text>
        </TouchableOpacity>

        {fares.length > 0 && (
          <View style={s.breakdown}>
            {(["regular", "student", "senior"] as const).map((type) => {
              const count = fares.filter((f) => f.type === type).length;
              if (!count) return null;
              const amt = type === "regular" ? fareRates.regularFare : type === "student" ? fareRates.studentFare : fareRates.seniorFare;
              return (
                <View key={type} style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>{type.charAt(0).toUpperCase() + type.slice(1)} ×{count}</Text>
                  <Text style={s.breakdownAmt}>₱{count * amt}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* PROFILE MODAL */}
      <Modal visible={showProfile} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <View style={s.profileHeader}>
              <View style={[s.profileAvatar, { backgroundColor: colors.primary }]}>
                <Text style={s.profileAvatarText}>{user?.name?.[0]?.toUpperCase() ?? "D"}</Text>
              </View>
              <Text style={s.profileName}>{user?.name}</Text>
              <Text style={s.profileUsername}>@{user?.username}</Text>
              <View style={s.roleBadge}>
                <MaterialCommunityIcons name="bus" size={13} color={colors.primary} />
                <Text style={s.roleBadgeText}>{roleLabel}</Text>
              </View>
            </View>

            {!isFleetDriver && (
              <View style={s.fareSection}>
                <View style={s.fareSectionHeader}>
                  <Text style={s.fareSectionTitle}>Fare Settings</Text>
                  <TouchableOpacity onPress={openFareEdit} style={s.editFareBtn}>
                    <Feather name="edit-2" size={14} color={colors.primary} />
                    <Text style={s.editFareBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.fareRatesRow}>
                  <View style={s.fareRateItem}>
                    <Text style={s.fareRateLabel}>Regular</Text>
                    <Text style={s.fareRateValue}>₱{fareRates.regularFare}</Text>
                  </View>
                  <View style={s.fareRateItem}>
                    <Text style={s.fareRateLabel}>Student</Text>
                    <Text style={s.fareRateValue}>₱{fareRates.studentFare}</Text>
                  </View>
                  <View style={s.fareRateItem}>
                    <Text style={s.fareRateLabel}>Senior</Text>
                    <Text style={s.fareRateValue}>₱{fareRates.seniorFare}</Text>
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity style={s.modalClose} onPress={() => setShowProfile(false)}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* EDIT FARE MODAL (independent driver) */}
      <Modal visible={showFareEdit} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Edit Fare Rates</Text>
            <Text style={s.modalSub}>Set your own fare pricing</Text>
            {[
              { label: "Regular Fare (₱)", key: "regular" as const },
              { label: "Student Fare (₱)", key: "student" as const },
              { label: "Senior Fare (₱)", key: "senior" as const },
            ].map(({ label, key }) => (
              <View key={key} style={s.fareInputRow}>
                <Text style={s.fareInputLabel}>{label}</Text>
                <TextInput
                  style={s.fareInput}
                  value={editRates[key]}
                  onChangeText={(v) => setEditRates((p) => ({ ...p, [key]: v }))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            ))}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowFareEdit(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, savingFares && s.btnDisabled]}
                onPress={saveFareSettings}
                disabled={savingFares}
              >
                {savingFares
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.modalConfirmText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
    avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
    headerName: { fontSize: 16, fontWeight: "700", color: c.foreground },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12, color: c.mutedForeground },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    fleetBadge: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: c.secondary, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
    },
    fleetBadgeText: { fontSize: 11, fontWeight: "700", color: c.primary },
    logoutBtn: { padding: 8 },
    mapWrap: { position: "relative" },
    map: { flex: 1 },
    coordBadge: {
      position: "absolute", bottom: 8, left: 10,
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 20,
      paddingHorizontal: 10, paddingVertical: 4,
    },
    coordText: { fontSize: 11, color: c.foreground, fontWeight: "600" },
    mapExpandBtn: {
      position: "absolute", top: 8, right: 10,
      backgroundColor: "#fff", borderRadius: 20, padding: 6,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
    },
    panel: { flex: 1 },
    panelContent: { padding: 20, gap: 16 },
    controls: { flexDirection: "row", gap: 12 },
    trackBtn: {
      flex: 1, flexDirection: "row", alignItems: "center",
      justifyContent: "center", height: 50, borderRadius: 14, gap: 8,
    },
    trackStart: { backgroundColor: c.primary },
    trackStop: { backgroundColor: "#EF4444" },
    trackBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    capBtn: {
      flex: 1, flexDirection: "row", alignItems: "center",
      justifyContent: "center", height: 50, borderRadius: 14, gap: 8,
      borderWidth: 2, borderColor: c.primary,
    },
    capAvail: { backgroundColor: c.secondary },
    capFull: { backgroundColor: "#EF4444", borderColor: "#EF4444" },
    capBtnText: { fontWeight: "700", fontSize: 15 },
    statsRow: {
      flexDirection: "row", backgroundColor: c.card, borderRadius: 16,
      padding: 16, alignItems: "center",
    },
    stat: { flex: 1, alignItems: "center", gap: 4 },
    statNum: { fontSize: 20, fontWeight: "800", color: c.foreground },
    statLabel: { fontSize: 11, color: c.mutedForeground, fontWeight: "500" },
    statDiv: { width: 1, height: 40, backgroundColor: c.border },
    fareTitle: {
      fontSize: 13, fontWeight: "700", color: c.mutedForeground,
      textTransform: "uppercase", letterSpacing: 0.5,
    },
    fareRow: { flexDirection: "row", gap: 10 },
    fareBtn: {
      flex: 1, height: 72, borderRadius: 16, backgroundColor: c.secondary,
      alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: c.primary,
    },
    fareBtnAmt: { fontSize: 22, fontWeight: "800", color: c.primary },
    fareBtnLabel: { fontSize: 12, color: c.secondaryForeground, marginTop: 2 },
    unboardBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, height: 48, borderRadius: 14, backgroundColor: "#EF4444",
    },
    unboardBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    breakdown: { backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 8 },
    breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
    breakdownLabel: { fontSize: 14, color: c.foreground },
    breakdownAmt: { fontSize: 14, fontWeight: "700", color: c.foreground },
    btnDisabled: { opacity: 0.4 },
    modalOverlay: {
      flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center", justifyContent: "flex-end",
    },
    modal: {
      width: "100%", backgroundColor: c.card,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 24, paddingBottom: 40,
    },
    profileHeader: { alignItems: "center", gap: 8, marginBottom: 20 },
    profileAvatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
    profileAvatarText: { color: "#fff", fontWeight: "800", fontSize: 28 },
    profileName: { fontSize: 20, fontWeight: "800", color: c.foreground },
    profileUsername: { fontSize: 14, color: c.mutedForeground },
    roleBadge: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: c.secondary, borderRadius: 12,
      paddingHorizontal: 10, paddingVertical: 5, marginTop: 4,
    },
    roleBadgeText: { fontSize: 12, fontWeight: "700", color: c.primary },
    fareSection: {
      backgroundColor: c.background, borderRadius: 16, padding: 16, marginBottom: 16,
    },
    fareSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    fareSectionTitle: { fontSize: 13, fontWeight: "700", color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    editFareBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    editFareBtnText: { fontSize: 13, color: c.primary, fontWeight: "600" },
    fareRatesRow: { flexDirection: "row", gap: 8 },
    fareRateItem: {
      flex: 1, backgroundColor: c.card, borderRadius: 12, padding: 10, alignItems: "center",
    },
    fareRateLabel: { fontSize: 11, color: c.mutedForeground, fontWeight: "600" },
    fareRateValue: { fontSize: 18, fontWeight: "800", color: c.primary, marginTop: 4 },
    modalClose: { backgroundColor: c.secondary, borderRadius: 14, padding: 14, alignItems: "center" },
    modalCloseText: { color: c.primary, fontWeight: "700", fontSize: 15 },
    modalTitle: { fontSize: 18, fontWeight: "800", color: c.foreground, marginBottom: 4 },
    modalSub: { fontSize: 14, color: c.mutedForeground, marginBottom: 16 },
    fareInputRow: { marginBottom: 12 },
    fareInputLabel: { fontSize: 13, fontWeight: "600", color: c.mutedForeground, marginBottom: 6 },
    fareInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 12,
      padding: 12, color: c.foreground, fontSize: 16, fontWeight: "700",
      backgroundColor: c.background,
    },
    modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
    modalCancel: { flex: 1, backgroundColor: c.secondary, borderRadius: 14, padding: 14, alignItems: "center" },
    modalCancelText: { color: c.mutedForeground, fontWeight: "700", fontSize: 15 },
    modalConfirm: { flex: 1, backgroundColor: c.primary, borderRadius: 14, padding: 14, alignItems: "center" },
    modalConfirmText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
}
