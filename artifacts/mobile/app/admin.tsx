import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, TextInput, ActivityIndicator, Modal, Alert, Linking, Animated,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import MapWebView, { MapWebViewRef } from "@/components/MapWebView";
import { apiJson, API_BASE } from "@/lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

type AdminTab = "map" | "fleet" | "reports";

interface Fleet {
  id: number;
  name: string;
  driverCount: number;
  createdAt: string;
}

interface FleetDriver {
  id: number;
  name: string;
  username: string;
  vehicleNumber: string | null;
  route: string | null;
}

interface Summary {
  totalFareToday: number;
  totalPassengersToday: number;
  regularCount: number;
  studentCount: number;
  seniorCount: number;
  totalDrivers: number;
  totalFleetDrivers: number;
  totalFleets: number;
}

interface DriverRatings {
  ratings: { id: number; commuterName: string; rating: number; comment: string | null; createdAt: string }[];
  average: number;
  count: number;
}

interface FareRates {
  regularFare: number;
  studentFare: number;
  seniorFare: number;
}

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { drivers, connected } = useSocket();
  const mapRef = useRef<MapWebViewRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [tab, setTab] = useState<AdminTab>("map");
  const [mapStatsVisible, setMapStatsVisible] = useState(true);
  const statsAnim = useRef(new Animated.Value(1)).current;
  const [showProfile, setShowProfile] = useState(false);

  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [fleetsLoading, setFleetsLoading] = useState(false);
  const [expandedFleet, setExpandedFleet] = useState<number | null>(null);
  const [fleetDrivers, setFleetDrivers] = useState<Record<number, FleetDriver[]>>({});
  // IDs of all drivers belonging to this admin's fleets (for map filtering)
  const [fleetDriverIds, setFleetDriverIds] = useState<Set<number>>(new Set());
  const [showCreateFleet, setShowCreateFleet] = useState(false);
  const [newFleetName, setNewFleetName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [addDriverFleetId, setAddDriverFleetId] = useState<number | null>(null);
  const [driverForm, setDriverForm] = useState({ name: "", username: "", password: "", vehicleNumber: "", route: "" });
  const [addingDriver, setAddingDriver] = useState(false);

  const [driverRatings, setDriverRatings] = useState<Record<number, DriverRatings>>({});
  const [ratingsFleetDriverId, setRatingsFleetDriverId] = useState<number | null>(null);
  const [showRatings, setShowRatings] = useState(false);

  const [showFareSettings, setShowFareSettings] = useState(false);
  const [fareFleetId, setFareFleetId] = useState<number | null>(null);
  const [fareRates, setFareRates] = useState<FareRates>({ regularFare: 13, studentFare: 10, seniorFare: 10 });
  const [editFares, setEditFares] = useState({ regular: "", student: "", senior: "" });
  const [savingFares, setSavingFares] = useState(false);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const bottomPad = Platform.OS === "web" ? 0 : insets.bottom;

  // Only show this admin's fleet drivers on the map
  const fleetOnlyDrivers = fleetDriverIds.size > 0
    ? drivers.filter((d) => fleetDriverIds.has(parseInt(d.driverId)))
    : [];

  useEffect(() => {
    if (mapReady) mapRef.current?.setDrivers(fleetOnlyDrivers);
  }, [mapReady, fleetOnlyDrivers]);

  // Always load fleet driver IDs on mount so the map tab can filter correctly
  useEffect(() => {
    loadFleets();
  }, []);

  useEffect(() => {
    if (tab === "reports") loadSummary();
  }, [tab]);

  async function loadFleets() {
    setFleetsLoading(true);
    try {
      const data = await apiJson<Fleet[]>("/fleets");
      setFleets(data);
      // Load all fleet driver IDs for map filtering
      const allIds = new Set<number>();
      await Promise.all(
        data.map(async (fleet) => {
          try {
            const driversData = await apiJson<FleetDriver[]>(`/fleets/${fleet.id}/drivers`);
            driversData.forEach((d) => allIds.add(d.id));
            setFleetDrivers((prev) => ({ ...prev, [fleet.id]: driversData }));
          } catch {}
        })
      );
      setFleetDriverIds(allIds);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setFleetsLoading(false);
    }
  }

  async function loadFleetDrivers(fleetId: number) {
    try {
      const data = await apiJson<FleetDriver[]>(`/fleets/${fleetId}/drivers`);
      setFleetDrivers((prev) => ({ ...prev, [fleetId]: data }));
    } catch {}
  }

  function toggleFleet(fleetId: number) {
    if (expandedFleet === fleetId) {
      setExpandedFleet(null);
    } else {
      setExpandedFleet(fleetId);
      if (!fleetDrivers[fleetId]) loadFleetDrivers(fleetId);
    }
    Haptics.selectionAsync();
  }

  async function createFleet() {
    if (!newFleetName.trim()) return;
    setCreating(true);
    try {
      await apiJson("/fleets", { method: "POST", body: JSON.stringify({ name: newFleetName.trim() }) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewFleetName("");
      setShowCreateFleet(false);
      loadFleets();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setCreating(false);
    }
  }

  async function addDriver() {
    if (!driverForm.name || !driverForm.username || !driverForm.password || !addDriverFleetId) return;
    setAddingDriver(true);
    try {
      await apiJson(`/fleets/${addDriverFleetId}/drivers`, {
        method: "POST",
        body: JSON.stringify(driverForm),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAddDriver(false);
      setDriverForm({ name: "", username: "", password: "", vehicleNumber: "", route: "" });
      loadFleetDrivers(addDriverFleetId);
      loadFleets();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAddingDriver(false);
    }
  }

  async function removeDriver(fleetId: number, driverId: number, driverName: string) {
    Alert.alert("Remove Driver", `Remove ${driverName} from fleet?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          try {
            await apiJson(`/fleets/${fleetId}/drivers/${driverId}`, { method: "DELETE" });
            loadFleetDrivers(fleetId);
            loadFleets();
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  }

  async function viewDriverRatings(driverId: number) {
    if (driverRatings[driverId]) {
      setRatingsFleetDriverId(driverId);
      setShowRatings(true);
      return;
    }
    try {
      const data = await apiJson<DriverRatings>(`/ratings/driver/${driverId}`);
      setDriverRatings((prev) => ({ ...prev, [driverId]: data }));
      setRatingsFleetDriverId(driverId);
      setShowRatings(true);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not load ratings.");
    }
  }

  async function openFareSettings(fleetId: number) {
    setFareFleetId(fleetId);
    try {
      const data = await apiJson<FareRates>(`/fare-settings?fleetId=${fleetId}`);
      setFareRates(data);
      setEditFares({ regular: String(data.regularFare), student: String(data.studentFare), senior: String(data.seniorFare) });
    } catch {
      setEditFares({ regular: "13", student: "10", senior: "10" });
    }
    setShowFareSettings(true);
  }

  async function saveFareSettings() {
    if (!fareFleetId) return;
    const regular = parseFloat(editFares.regular);
    const student = parseFloat(editFares.student);
    const senior = parseFloat(editFares.senior);
    if (isNaN(regular) || isNaN(student) || isNaN(senior) || regular <= 0 || student <= 0 || senior <= 0) {
      Alert.alert("Invalid", "Please enter valid positive fare amounts.");
      return;
    }
    setSavingFares(true);
    try {
      await apiJson("/fare-settings", {
        method: "PUT",
        body: JSON.stringify({ regularFare: regular, studentFare: student, seniorFare: senior, fleetId: fareFleetId }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowFareSettings(false);
      Alert.alert("Saved", "Fare settings updated for this fleet.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not save fare settings.");
    } finally {
      setSavingFares(false);
    }
  }

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const data = await apiJson<Summary>("/reports/summary");
      setSummary(data);
    } catch {}
    finally { setSummaryLoading(false); }
  }

  async function exportReport(format: "xlsx" | "csv") {
    setExporting(format);
    try {
      const t = await AsyncStorage.getItem("bj_token");
      const url = `${API_BASE}/reports/export?format=${format}&token=${t}&days=30`;
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert("Export failed", e.message);
    } finally {
      setExporting(null);
    }
  }

  function toggleMapStats() {
    const next = !mapStatsVisible;
    setMapStatsVisible(next);
    Animated.spring(statsAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
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
  const activeDrivers = fleetOnlyDrivers.filter((d) => d.status !== "offline");
  const currentRatings = ratingsFleetDriverId ? driverRatings[ratingsFleetDriverId] : null;

  return (
    <View style={[s.root, { paddingTop: topPad, paddingBottom: bottomPad }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerLeft} onPress={() => setShowProfile(true)} activeOpacity={0.8}>
          <View style={s.avatar}>
            <MaterialCommunityIcons name="shield-account" size={20} color="#fff" />
          </View>
          <View>
            <Text style={s.headerTitle}>{user?.name ?? "Admin"}</Text>
            <View style={s.statusRow}>
              <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.mutedForeground }]} />
              <Text style={s.statusText}>{activeDrivers.length} active driver{activeDrivers.length !== 1 ? "s" : ""}</Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
          <Feather name="log-out" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {(["map", "fleet", "reports"] as AdminTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabItem, tab === t && s.tabItemActive]}
            onPress={() => setTab(t)}
          >
            <MaterialCommunityIcons
              name={t === "map" ? "map" : t === "fleet" ? "bus-multiple" : "file-chart"}
              size={18}
              color={tab === t ? colors.primary : colors.mutedForeground}
            />
            <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
              {t === "map" ? "Live Map" : t === "fleet" ? "Fleet" : "Reports"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* MAP TAB */}
      {tab === "map" && (
        <View style={s.mapContainer}>
          <MapWebView ref={mapRef} style={{ flex: 1 }} onMapReady={() => setMapReady(true)} />
          <View style={s.mapLegend}>
            <View style={s.legendItem}><View style={[s.ldot, { backgroundColor: colors.primary }]} /><Text style={s.legendText}>Available</Text></View>
            <View style={s.legendItem}><View style={[s.ldot, { backgroundColor: "#EF4444" }]} /><Text style={s.legendText}>Full</Text></View>
          </View>
          <TouchableOpacity style={s.mapToggleBtn} onPress={toggleMapStats} activeOpacity={0.8}>
            <Feather name={mapStatsVisible ? "chevron-down" : "chevron-up"} size={16} color={colors.primary} />
          </TouchableOpacity>
          <Animated.View
            style={[s.mapStats, {
              opacity: statsAnim,
              transform: [{ translateY: statsAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }]
            }]}
            pointerEvents={mapStatsVisible ? "auto" : "none"}
          >
            {[
              { label: "Active", value: activeDrivers.length, color: colors.primary },
              { label: "Full", value: drivers.filter(d => d.status === "full").length, color: "#EF4444" },
              { label: "Riders", value: drivers.reduce((s, d) => s + (d.passengerCount || 0), 0), color: colors.success },
            ].map(({ label, value, color }) => (
              <View key={label} style={s.mapStat}>
                <Text style={[s.mapStatNum, { color }]}>{value}</Text>
                <Text style={s.mapStatLabel}>{label}</Text>
              </View>
            ))}
          </Animated.View>
        </View>
      )}

      {/* FLEET TAB */}
      {tab === "fleet" && (
        <ScrollView style={s.tabContent} contentContainerStyle={s.tabPadding}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>My Fleets</Text>
            <TouchableOpacity style={s.addBtn} onPress={() => setShowCreateFleet(true)}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={s.addBtnText}>New Fleet</Text>
            </TouchableOpacity>
          </View>

          {fleetsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : fleets.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name="bus-multiple" size={40} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No fleets yet</Text>
              <Text style={s.emptySubtext}>Create a fleet to start managing drivers</Text>
            </View>
          ) : (
            fleets.map((fleet) => (
              <View key={fleet.id} style={s.fleetCard}>
                <TouchableOpacity style={s.fleetHeader} onPress={() => toggleFleet(fleet.id)}>
                  <View style={s.fleetIcon}>
                    <MaterialCommunityIcons name="bus-multiple" size={20} color={colors.primary} />
                  </View>
                  <View style={s.fleetInfo}>
                    <Text style={s.fleetName}>{fleet.name}</Text>
                    <Text style={s.fleetMeta}>{fleet.driverCount} driver{fleet.driverCount !== 1 ? "s" : ""}</Text>
                  </View>
                  <TouchableOpacity style={s.fareSettingsBtn} onPress={() => openFareSettings(fleet.id)}>
                    <MaterialCommunityIcons name="cash-edit" size={16} color={colors.primary} />
                    <Text style={s.fareSettingsBtnText}>Fares</Text>
                  </TouchableOpacity>
                  <Feather name={expandedFleet === fleet.id ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
                </TouchableOpacity>

                {expandedFleet === fleet.id && (
                  <View style={s.fleetBody}>
                    <TouchableOpacity
                      style={s.addDriverBtn}
                      onPress={() => { setAddDriverFleetId(fleet.id); setShowAddDriver(true); }}
                    >
                      <Feather name="user-plus" size={16} color={colors.primary} />
                      <Text style={s.addDriverBtnText}>Add Driver</Text>
                    </TouchableOpacity>

                    {fleetDrivers[fleet.id]?.length === 0 && (
                      <Text style={s.noDrivers}>No drivers in this fleet</Text>
                    )}
                    {fleetDrivers[fleet.id]?.map((d) => (
                      <View key={d.id} style={s.driverRow}>
                        <View style={s.driverAvatar}>
                          <MaterialCommunityIcons name="bus" size={16} color={colors.primary} />
                        </View>
                        <View style={s.driverInfo}>
                          <Text style={s.driverName}>{d.name}</Text>
                          <Text style={s.driverMeta}>@{d.username}{d.vehicleNumber ? ` · ${d.vehicleNumber}` : ""}{d.route ? ` · ${d.route}` : ""}</Text>
                        </View>
                        <TouchableOpacity onPress={() => viewDriverRatings(d.id)} style={s.ratingsBtn}>
                          <Feather name="star" size={14} color="#F59E0B" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeDriver(fleet.id, d.id, d.name)} style={s.removeBtn}>
                          <Feather name="trash-2" size={16} color={colors.destructive} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* REPORTS TAB */}
      {tab === "reports" && (
        <ScrollView style={s.tabContent} contentContainerStyle={s.tabPadding}>
          <Text style={s.sectionTitle}>Fleet Summary — Today</Text>

          {summaryLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : summary && (
            <>
              <View style={s.statsGrid}>
                <StatCard icon="cash" label="Total Fare" value={`₱${summary.totalFareToday.toFixed(2)}`} color={colors.success} colors={colors} />
                <StatCard icon="account-group" label="Passengers" value={String(summary.totalPassengersToday)} color={colors.primary} colors={colors} />
              </View>
              <View style={s.statsGrid}>
                <StatCard icon="bus-multiple" label="My Fleets" value={String(summary.totalFleets ?? 0)} color={colors.warning} colors={colors} />
                <StatCard icon="bus" label="Fleet Drivers" value={String(summary.totalFleetDrivers)} color="#8B5CF6" colors={colors} />
              </View>

              <View style={s.breakdown}>
                <Text style={s.breakdownTitle}>Passenger Breakdown</Text>
                {[
                  { label: "Regular", count: summary.regularCount, color: colors.primary },
                  { label: "Student", count: summary.studentCount, color: colors.success },
                  { label: "Senior", count: summary.seniorCount, color: colors.warning },
                ].map(({ label, count, color }) => (
                  <View key={label} style={s.breakdownRow}>
                    <View style={[s.breakdownDot, { backgroundColor: color }]} />
                    <Text style={s.breakdownLabel}>{label}</Text>
                    <View style={s.progressTrack}>
                      <View style={[s.progressBar, { backgroundColor: color, flex: summary.totalPassengersToday ? count / summary.totalPassengersToday : 0 }]} />
                    </View>
                    <Text style={s.breakdownCount}>{count}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={[s.sectionTitle, { marginTop: 20 }]}>Export Fleet Reports</Text>
          <Text style={s.exportNote}>Exports last 30 days of fare records for your fleets</Text>

          <View style={s.exportRow}>
            <TouchableOpacity style={[s.exportBtn, s.exportXlsx]} onPress={() => exportReport("xlsx")} disabled={!!exporting} activeOpacity={0.8}>
              {exporting === "xlsx" ? <ActivityIndicator color="#fff" size="small" /> : <MaterialCommunityIcons name="microsoft-excel" size={22} color="#fff" />}
              <Text style={s.exportBtnText}>Excel (.xlsx)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.exportBtn, s.exportCsv]} onPress={() => exportReport("csv")} disabled={!!exporting} activeOpacity={0.8}>
              {exporting === "csv" ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="file-text" size={22} color="#fff" />}
              <Text style={s.exportBtnText}>CSV (.csv)</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.refreshBtn} onPress={loadSummary}>
            <Feather name="refresh-cw" size={16} color={colors.primary} />
            <Text style={s.refreshBtnText}>Refresh Summary</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* CREATE FLEET MODAL */}
      <Modal visible={showCreateFleet} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Create Fleet</Text>
            <TextInput
              style={s.modalInput} placeholder="Fleet name (e.g. Route 1 Fleet)"
              placeholderTextColor={colors.mutedForeground}
              value={newFleetName} onChangeText={setNewFleetName} autoFocus
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setShowCreateFleet(false); setNewFleetName(""); }}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, (!newFleetName.trim() || creating) && s.btnDisabled]}
                onPress={createFleet} disabled={!newFleetName.trim() || creating}
              >
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalConfirmText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADD DRIVER MODAL */}
      <Modal visible={showAddDriver} transparent animationType="slide">
        <ScrollView contentContainerStyle={s.modalOverlay} keyboardShouldPersistTaps="handled">
          <View style={[s.modal, { paddingBottom: 24 }]}>
            <Text style={s.modalTitle}>Add Fleet Driver</Text>
            <Text style={s.modalSub}>Provide login credentials for the driver</Text>
            {[
              { key: "name", placeholder: "Driver name", autoCapitalize: "words" },
              { key: "username", placeholder: "Username (for login)", autoCapitalize: "none" },
              { key: "password", placeholder: "Password (min 6 chars)", secure: true },
              { key: "vehicleNumber", placeholder: "Vehicle number (optional)", autoCapitalize: "characters" },
              { key: "route", placeholder: "Route (optional)" },
            ].map(({ key, placeholder, autoCapitalize, secure }) => (
              <TextInput
                key={key}
                style={s.modalInput}
                placeholder={placeholder}
                placeholderTextColor={colors.mutedForeground}
                value={(driverForm as any)[key]}
                onChangeText={(v) => setDriverForm((f) => ({ ...f, [key]: v }))}
                autoCapitalize={(autoCapitalize as any) ?? "words"}
                secureTextEntry={secure}
                autoCorrect={false}
              />
            ))}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setShowAddDriver(false); setDriverForm({ name: "", username: "", password: "", vehicleNumber: "", route: "" }); }}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, (!driverForm.name || !driverForm.username || driverForm.password.length < 6 || addingDriver) && s.btnDisabled]}
                onPress={addDriver}
                disabled={!driverForm.name || !driverForm.username || driverForm.password.length < 6 || addingDriver}
              >
                {addingDriver ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalConfirmText}>Add Driver</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </Modal>

      {/* DRIVER RATINGS MODAL */}
      <Modal visible={showRatings} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modal, { maxHeight: "80%" }]}>
            <Text style={s.modalTitle}>Driver Ratings</Text>
            {currentRatings ? (
              <>
                <View style={s.ratingsSummary}>
                  <Text style={s.ratingsAvg}>{currentRatings.average.toFixed(1)}</Text>
                  <View style={s.ratingsStars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Feather
                        key={star}
                        name="star"
                        size={18}
                        color={star <= Math.round(currentRatings.average) ? "#F59E0B" : colors.border}
                      />
                    ))}
                  </View>
                  <Text style={s.ratingsCount}>{currentRatings.count} review{currentRatings.count !== 1 ? "s" : ""}</Text>
                </View>
                <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                  {currentRatings.ratings.length === 0 ? (
                    <Text style={s.noRatingsText}>No ratings yet</Text>
                  ) : (
                    currentRatings.ratings.map((r) => (
                      <View key={r.id} style={s.ratingItem}>
                        <View style={s.ratingItemHeader}>
                          <Text style={s.ratingCommuterName}>{r.commuterName}</Text>
                          <View style={s.ratingStarsSmall}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Feather key={star} name="star" size={12} color={star <= r.rating ? "#F59E0B" : colors.border} />
                            ))}
                          </View>
                        </View>
                        {r.comment && <Text style={s.ratingComment}>{r.comment}</Text>}
                      </View>
                    ))
                  )}
                </ScrollView>
              </>
            ) : (
              <ActivityIndicator color={colors.primary} />
            )}
            <TouchableOpacity style={[s.modalClose, { marginTop: 16 }]} onPress={() => setShowRatings(false)}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FARE SETTINGS MODAL */}
      <Modal visible={showFareSettings} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Fleet Fare Settings</Text>
            <Text style={s.modalSub}>Set fare rates for all drivers in this fleet</Text>
            {[
              { label: "Regular Fare (₱)", key: "regular" as const },
              { label: "Student Fare (₱)", key: "student" as const },
              { label: "Senior Fare (₱)", key: "senior" as const },
            ].map(({ label, key }) => (
              <View key={key} style={s.fareInputRow}>
                <Text style={s.fareInputLabel}>{label}</Text>
                <TextInput
                  style={s.fareInput}
                  value={editFares[key]}
                  onChangeText={(v) => setEditFares((p) => ({ ...p, [key]: v }))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            ))}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowFareSettings(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, savingFares && s.btnDisabled]}
                onPress={saveFareSettings}
                disabled={savingFares}
              >
                {savingFares ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalConfirmText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PROFILE MODAL */}
      <Modal visible={showProfile} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <View style={s.profileHeader}>
              <View style={s.profileAvatar}>
                <MaterialCommunityIcons name="shield-account" size={36} color="#fff" />
              </View>
              <Text style={s.profileName}>{user?.name ?? "Admin"}</Text>
              <Text style={s.profileUsername}>@{user?.username}</Text>
              <View style={s.roleBadge}>
                <MaterialCommunityIcons name="shield-account" size={13} color={colors.primary} />
                <Text style={s.roleBadgeText}>Administrator</Text>
              </View>
            </View>
            <TouchableOpacity style={s.modalClose} onPress={() => setShowProfile(false)}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatCard({ icon, label, value, color, colors }: any) {
  const s = makeStyles(colors);
  return (
    <View style={[s.statCard, { flex: 1 }]}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
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
    headerTitle: { fontSize: 16, fontWeight: "800", color: c.foreground },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12, color: c.mutedForeground },
    logoutBtn: { padding: 8 },
    tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border },
    tabItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
    tabItemActive: { borderBottomWidth: 2, borderBottomColor: c.primary },
    tabLabel: { fontSize: 13, fontWeight: "600", color: c.mutedForeground },
    tabLabelActive: { color: c.primary },
    mapContainer: { flex: 1, position: "relative" },
    mapLegend: {
      position: "absolute", top: 10, right: 10,
      backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 10, padding: 8, gap: 5,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    ldot: { width: 9, height: 9, borderRadius: 5 },
    legendText: { fontSize: 11, color: c.foreground, fontWeight: "600" },
    mapToggleBtn: {
      position: "absolute", top: 10, left: 10,
      backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 20, padding: 8,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
    },
    mapStats: {
      position: "absolute", bottom: 16, left: 16, right: 16,
      backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 16,
      flexDirection: "row", padding: 12,
    },
    mapStat: { flex: 1, alignItems: "center" },
    mapStatNum: { fontSize: 20, fontWeight: "800" },
    mapStatLabel: { fontSize: 11, color: c.mutedForeground, marginTop: 2 },
    tabContent: { flex: 1 },
    tabPadding: { padding: 20, paddingBottom: 40 },
    sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
    addBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
    empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
    emptyText: { fontSize: 16, fontWeight: "700", color: c.mutedForeground },
    emptySubtext: { fontSize: 13, color: c.mutedForeground, textAlign: "center" },
    fleetCard: { backgroundColor: c.card, borderRadius: 16, marginBottom: 12, overflow: "hidden", borderWidth: 1, borderColor: c.border },
    fleetHeader: { flexDirection: "row", alignItems: "center", padding: 16 },
    fleetIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
    fleetInfo: { flex: 1 },
    fleetName: { fontSize: 15, fontWeight: "700", color: c.foreground },
    fleetMeta: { fontSize: 12, color: c.mutedForeground, marginTop: 2 },
    fareSettingsBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.secondary, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, marginRight: 8 },
    fareSettingsBtnText: { fontSize: 11, fontWeight: "700", color: c.primary },
    fleetBody: { padding: 16, paddingTop: 0, gap: 8 },
    addDriverBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: c.primary, alignSelf: "flex-start", marginBottom: 8 },
    addDriverBtnText: { fontSize: 13, fontWeight: "600", color: c.primary },
    noDrivers: { fontSize: 13, color: c.mutedForeground, paddingVertical: 8 },
    driverRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border },
    driverAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" },
    driverInfo: { flex: 1 },
    driverName: { fontSize: 14, fontWeight: "700", color: c.foreground },
    driverMeta: { fontSize: 12, color: c.mutedForeground, marginTop: 1 },
    ratingsBtn: { padding: 6 },
    removeBtn: { padding: 6 },
    statsGrid: { flexDirection: "row", gap: 12, marginBottom: 12 },
    statCard: { backgroundColor: c.card, borderRadius: 16, padding: 16, alignItems: "center", gap: 4, borderWidth: 1, borderColor: c.border },
    statValue: { fontSize: 22, fontWeight: "800" },
    statLabel: { fontSize: 12, color: c.mutedForeground },
    breakdown: { backgroundColor: c.card, borderRadius: 16, padding: 16, gap: 10, marginTop: 4, borderWidth: 1, borderColor: c.border },
    breakdownTitle: { fontSize: 13, fontWeight: "700", color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
    breakdownRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    breakdownDot: { width: 8, height: 8, borderRadius: 4 },
    breakdownLabel: { fontSize: 13, color: c.foreground, width: 54 },
    progressTrack: { flex: 1, height: 6, backgroundColor: c.secondary, borderRadius: 3, flexDirection: "row", overflow: "hidden" },
    progressBar: { borderRadius: 3 },
    breakdownCount: { fontSize: 13, fontWeight: "700", color: c.foreground, width: 28, textAlign: "right" },
    exportNote: { fontSize: 12, color: c.mutedForeground, marginBottom: 12 },
    exportRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
    exportBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14 },
    exportXlsx: { backgroundColor: "#217346" },
    exportCsv: { backgroundColor: "#0369A1" },
    exportBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    refreshBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border },
    refreshBtnText: { fontSize: 14, fontWeight: "600", color: c.primary },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "flex-end" },
    modal: { width: "100%", backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontWeight: "800", color: c.foreground, marginBottom: 4 },
    modalSub: { fontSize: 13, color: c.mutedForeground, marginBottom: 16 },
    modalInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 12,
      padding: 12, fontSize: 14, color: c.foreground,
      backgroundColor: c.background, marginBottom: 10,
    },
    modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
    modalCancel: { flex: 1, backgroundColor: c.secondary, borderRadius: 14, padding: 14, alignItems: "center" },
    modalCancelText: { color: c.mutedForeground, fontWeight: "700", fontSize: 15 },
    modalConfirm: { flex: 1, backgroundColor: c.primary, borderRadius: 14, padding: 14, alignItems: "center" },
    modalConfirmText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    btnDisabled: { opacity: 0.4 },
    profileHeader: { alignItems: "center", gap: 8, marginBottom: 20 },
    profileAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
    profileName: { fontSize: 20, fontWeight: "800", color: c.foreground },
    profileUsername: { fontSize: 14, color: c.mutedForeground },
    roleBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.secondary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginTop: 4 },
    roleBadgeText: { fontSize: 12, fontWeight: "700", color: c.primary },
    modalClose: { backgroundColor: c.secondary, borderRadius: 14, padding: 14, alignItems: "center" },
    modalCloseText: { color: c.primary, fontWeight: "700", fontSize: 15 },
    ratingsSummary: { alignItems: "center", gap: 4, marginBottom: 16 },
    ratingsAvg: { fontSize: 40, fontWeight: "800", color: "#F59E0B" },
    ratingsStars: { flexDirection: "row", gap: 4 },
    ratingsCount: { fontSize: 13, color: c.mutedForeground },
    noRatingsText: { textAlign: "center", color: c.mutedForeground, paddingVertical: 20 },
    ratingItem: { borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 10, gap: 4 },
    ratingItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    ratingCommuterName: { fontSize: 13, fontWeight: "700", color: c.foreground },
    ratingStarsSmall: { flexDirection: "row", gap: 2 },
    ratingComment: { fontSize: 12, color: c.mutedForeground },
    fareInputRow: { marginBottom: 12 },
    fareInputLabel: { fontSize: 13, fontWeight: "600", color: c.mutedForeground, marginBottom: 6 },
    fareInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 12,
      padding: 12, color: c.foreground, fontSize: 16, fontWeight: "700",
      backgroundColor: c.background,
    },
  });
}
