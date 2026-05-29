import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  ScrollView,
  Modal,
  TextInput,
  Alert,
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
import {
  DriverData,
  UserCoords,
  calcDistance,
  PROXIMITY_THRESHOLD_METERS,
} from "@/types";

export default function CommuterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { socket, drivers, connected } = useSocket();
  const mapRef = useRef<MapWebViewRef>(null);

  const [userCoords, setUserCoords] = useState<UserCoords | null>(null);
  const [nearbyDriver, setNearbyDriver] = useState<DriverData | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<DriverData | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [ratingDriver, setRatingDriver] = useState<DriverData | null>(null);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [announcingPosition, setAnnouncingPosition] = useState(false);

  const alertAnim = useRef(new Animated.Value(0)).current;
  const panelHeight = useRef(new Animated.Value(160)).current;
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
      (d) =>
        d.status !== "offline" &&
        calcDistance(userCoords.lat, userCoords.lng, d.lat, d.lng) <=
          PROXIMITY_THRESHOLD_METERS,
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

  function toggleMap() {
    const expanded = !mapExpanded;
    setMapExpanded(expanded);
    Animated.spring(panelHeight, {
      toValue: expanded ? 0 : 160,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
    Haptics.selectionAsync();
  }

  const startLocationWatch = useCallback(async () => {
    if (Platform.OS !== "web") {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;
      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (loc) => {
          const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setUserCoords(coords);
          mapRef.current?.setUserLocation(coords);
        },
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
        { enableHighAccuracy: true },
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

  function announcePosition() {
    if (!userCoords || !socket) {
      Alert.alert("Location unavailable", "Wait for GPS to be ready.");
      return;
    }
    setAnnouncingPosition(true);
    socket.emit("commuter:location", {
      commuterId: String(user!.id),
      commuterName: user!.name,
      lat: userCoords.lat,
      lng: userCoords.lng,
      announcedAt: Date.now(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setAnnouncingPosition(false), 3000);
  }

  function openRateDriver(d: DriverData) {
    if (!d.driverId) return;
    setRatingDriver(d);
    setSelectedRating(0);
    setRatingComment("");
    setShowRateModal(true);
  }

  async function submitRating() {
    if (!ratingDriver || selectedRating === 0) return;
    setSubmittingRating(true);
    try {
      await apiJson("/ratings", {
        method: "POST",
        body: JSON.stringify({
          driverId: parseInt(ratingDriver.driverId),
          rating: selectedRating,
          comment: ratingComment || undefined,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRateModal(false);
      Alert.alert("Thank you!", "Your rating has been submitted.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not submit rating.");
    } finally {
      setSubmittingRating(false);
    }
  }

  function handleLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/");
        },
      },
    ]);
  }

  const s = makeStyles(colors);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const availableDrivers = drivers.filter((d) => d.status !== "offline");

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={s.headerLeft} onPress={() => setShowProfile(true)} activeOpacity={0.8}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{user?.name?.[0]?.toUpperCase() ?? "C"}</Text>
          </View>
          <View>
            <Text style={s.headerTitle}>Live Tracking</Text>
            <View style={s.statusRow}>
              <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.mutedForeground }]} />
              <Text style={s.statusText}>
                {availableDrivers.length} jeepney{availableDrivers.length !== 1 ? "s" : ""} nearby
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
          <Feather name="log-out" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={s.mapContainer}>
        <MapWebView ref={mapRef} style={s.map} onMapReady={() => setMapReady(true)} />

        {nearbyDriver && (
          <Animated.View
            style={[s.proximityAlert, { opacity: alertAnim, transform: [{ scale: alertAnim }] }]}
          >
            <MaterialCommunityIcons name="bus-alert" size={24} color="#fff" />
            <View style={s.alertText}>
              <Text style={s.alertTitle}>Jeepney Approaching!</Text>
              <Text style={s.alertSub}>{nearbyDriver.driverName} is within 100m</Text>
            </View>
          </Animated.View>
        )}

        <TouchableOpacity style={s.expandBtn} onPress={toggleMap} activeOpacity={0.8}>
          <Feather name={mapExpanded ? "chevron-down" : "chevron-up"} size={18} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.announceBtn, announcingPosition && s.announceBtnActive]}
          onPress={announcePosition}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name={announcingPosition ? "map-marker-check" : "map-marker-radius"}
            size={22}
            color="#fff"
          />
          <Text style={s.announceBtnText}>
            {announcingPosition ? "Announced!" : "Announce Position"}
          </Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[s.bottomPanel, { minHeight: panelHeight, paddingBottom: bottomPad + 8 }]}>
        <View style={s.panelHandle} />
        <Text style={s.panelTitle}>Nearby Jeepneys</Text>
        {availableDrivers.length === 0 ? (
          <View style={s.emptyState}>
            <MaterialCommunityIcons name="bus-clock" size={32} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No active jeepneys yet</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.driverList}>
            {availableDrivers.map((d) => {
              const dist = userCoords
                ? calcDistance(userCoords.lat, userCoords.lng, d.lat, d.lng)
                : null;
              const isSelected = selectedDriver?.driverId === d.driverId;
              const isFleetDriver = !!d.driverId && d.driverName;
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
                  <TouchableOpacity
                    style={s.rateBtn}
                    onPress={() => openRateDriver(d)}
                    activeOpacity={0.8}
                  >
                    <Feather name="star" size={11} color={colors.primary} />
                    <Text style={s.rateBtnText}>Rate</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </Animated.View>

      {/* PROFILE MODAL */}
      <Modal visible={showProfile} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <View style={s.profileHeader}>
              <View style={s.profileAvatar}>
                <Text style={s.profileAvatarText}>{user?.name?.[0]?.toUpperCase() ?? "C"}</Text>
              </View>
              <Text style={s.profileName}>{user?.name}</Text>
              <Text style={s.profileUsername}>@{user?.username}</Text>
              <View style={s.roleBadge}>
                <MaterialCommunityIcons name="account" size={13} color={colors.primary} />
                <Text style={s.roleBadgeText}>Commuter</Text>
              </View>
            </View>
            <TouchableOpacity style={s.modalClose} onPress={() => setShowProfile(false)}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* RATE DRIVER MODAL */}
      <Modal visible={showRateModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Rate Driver</Text>
            <Text style={s.modalSub}>{ratingDriver?.driverName}</Text>
            <View style={s.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setSelectedRating(star)} style={s.starBtn}>
                  <Feather
                    name="star"
                    size={32}
                    color={star <= selectedRating ? "#F59E0B" : colors.border}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={s.commentInput}
              placeholder="Add a comment (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={ratingComment}
              onChangeText={setRatingComment}
              multiline
              numberOfLines={3}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity
                style={s.modalCancel}
                onPress={() => setShowRateModal(false)}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, (selectedRating === 0 || submittingRating) && s.btnDisabled]}
                onPress={submitRating}
                disabled={selectedRating === 0 || submittingRating}
              >
                <Text style={s.modalConfirmText}>Submit</Text>
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
      position: "absolute",
      top: 0, left: 0, right: 0,
      zIndex: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: c.primary,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.25)",
      alignItems: "center", justifyContent: "center",
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
      backgroundColor: c.warning,
      borderRadius: 16, padding: 14,
      flexDirection: "row", alignItems: "center", gap: 12,
      shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
    },
    alertText: { flex: 1 },
    alertTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
    alertSub: { color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 2 },
    expandBtn: {
      position: "absolute", top: 10, right: 10,
      backgroundColor: "#fff",
      borderRadius: 20, padding: 8,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
    },
    announceBtn: {
      position: "absolute", bottom: 12, right: 12,
      backgroundColor: c.primary,
      borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10,
      flexDirection: "row", alignItems: "center", gap: 8,
      shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
    },
    announceBtnActive: { backgroundColor: c.success },
    announceBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    bottomPanel: {
      backgroundColor: c.background,
      paddingTop: 8,
      paddingHorizontal: 20,
      borderTopWidth: 1,
      borderTopColor: c.border,
      overflow: "hidden",
    },
    panelHandle: {
      width: 40, height: 4, borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: "center", marginBottom: 10,
    },
    panelTitle: {
      fontSize: 13, fontWeight: "700", color: c.mutedForeground,
      textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10,
    },
    emptyState: { alignItems: "center", gap: 8, paddingVertical: 12 },
    emptyText: { color: c.mutedForeground, fontSize: 14 },
    driverList: { flexDirection: "row" },
    driverCard: {
      width: 148, backgroundColor: c.card, borderRadius: 14,
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
    rateBtn: {
      flexDirection: "row", alignItems: "center", gap: 4,
      marginTop: 6, alignSelf: "flex-start",
    },
    rateBtnText: { fontSize: 11, color: c.primary, fontWeight: "600" },
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
    profileAvatar: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
    },
    profileAvatarText: { color: "#fff", fontWeight: "800", fontSize: 28 },
    profileName: { fontSize: 20, fontWeight: "800", color: c.foreground },
    profileUsername: { fontSize: 14, color: c.mutedForeground },
    roleBadge: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: c.secondary, borderRadius: 12,
      paddingHorizontal: 10, paddingVertical: 5, marginTop: 4,
    },
    roleBadgeText: { fontSize: 12, fontWeight: "700", color: c.primary },
    modalClose: {
      backgroundColor: c.secondary, borderRadius: 14, padding: 14,
      alignItems: "center",
    },
    modalCloseText: { color: c.primary, fontWeight: "700", fontSize: 15 },
    modalTitle: { fontSize: 18, fontWeight: "800", color: c.foreground, marginBottom: 4 },
    modalSub: { fontSize: 14, color: c.mutedForeground, marginBottom: 16 },
    starsRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 16 },
    starBtn: { padding: 4 },
    commentInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 12,
      padding: 12, color: c.foreground, fontSize: 14,
      minHeight: 80, textAlignVertical: "top", marginBottom: 16,
      backgroundColor: c.background,
    },
    modalBtns: { flexDirection: "row", gap: 12 },
    modalCancel: {
      flex: 1, backgroundColor: c.secondary, borderRadius: 14,
      padding: 14, alignItems: "center",
    },
    modalCancelText: { color: c.mutedForeground, fontWeight: "700", fontSize: 15 },
    modalConfirm: {
      flex: 1, backgroundColor: c.primary, borderRadius: 14,
      padding: 14, alignItems: "center",
    },
    modalConfirmText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    btnDisabled: { opacity: 0.4 },
  });
}
