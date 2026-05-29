import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { UserRole } from "@/types";

const ROLES: { role: UserRole; label: string; desc: string; icon: string }[] = [
  { role: "driver", label: "Driver", desc: "Track & manage fare", icon: "bus" },
  { role: "commuter", label: "Commuter", desc: "Track your jeepney", icon: "map-marker-radius" },
  { role: "admin", label: "Admin", desc: "Fleet overview", icon: "shield-account" },
];

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  function handleLogin() {
    if (!selectedRole) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    login(selectedRole, name);
    router.replace(`/${selectedRole}` as "/driver" | "/commuter" | "/admin");
  }

  const s = makeStyles(colors);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: topPad, paddingBottom: bottomPad }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.brand}>
          <View style={s.logoWrap}>
            <MaterialCommunityIcons name="bus-multiple" size={36} color={colors.primaryForeground} />
          </View>
          <Text style={s.appName}>BeepJeep</Text>
          <Text style={s.tagline}>Real-time jeepney tracking</Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionLabel}>Your Name</Text>
          <View style={s.inputWrap}>
            <Feather name="user" size={18} color={colors.mutedForeground} style={s.inputIcon} />
            <TextInput
              style={s.input}
              placeholder="Enter your name"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              returnKeyType="done"
            />
          </View>

          <Text style={[s.sectionLabel, { marginTop: 20 }]}>Select Role</Text>
          <View style={s.roles}>
            {ROLES.map(({ role, label, desc, icon }) => {
              const active = selectedRole === role;
              return (
                <TouchableOpacity
                  key={role}
                  style={[s.roleBtn, active && s.roleBtnActive]}
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedRole(role);
                  }}
                >
                  <View style={[s.roleIcon, active && s.roleIconActive]}>
                    <MaterialCommunityIcons
                      name={icon as any}
                      size={22}
                      color={active ? colors.primaryForeground : colors.primary}
                    />
                  </View>
                  <View style={s.roleText}>
                    <Text style={[s.roleLabel, active && s.roleLabelActive]}>{label}</Text>
                    <Text style={s.roleDesc}>{desc}</Text>
                  </View>
                  {active && (
                    <Feather name="check-circle" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[s.loginBtn, !selectedRole && s.loginBtnDisabled]}
            activeOpacity={0.8}
            onPress={handleLogin}
            disabled={!selectedRole}
          >
            <Text style={s.loginBtnText}>Continue</Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.primary },
    scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 24 },
    brand: { alignItems: "center", marginBottom: 32 },
    logoWrap: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: "rgba(255,255,255,0.25)",
      alignItems: "center", justifyContent: "center",
      marginBottom: 12,
    },
    appName: { fontSize: 32, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
    tagline: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 4 },
    card: {
      backgroundColor: colors.background,
      borderRadius: 20,
      padding: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 12,
    },
    sectionLabel: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
    inputWrap: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.muted, borderRadius: 12,
      paddingHorizontal: 14, height: 50,
    },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 16, color: colors.foreground },
    roles: { gap: 10 },
    roleBtn: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.muted, borderRadius: 14,
      padding: 14, borderWidth: 2, borderColor: "transparent",
    },
    roleBtnActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
    roleIcon: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: colors.secondary,
      alignItems: "center", justifyContent: "center", marginRight: 14,
    },
    roleIconActive: { backgroundColor: colors.primary },
    roleText: { flex: 1 },
    roleLabel: { fontSize: 16, fontWeight: "700", color: colors.foreground },
    roleLabelActive: { color: colors.primary },
    roleDesc: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
    loginBtn: {
      marginTop: 24, height: 54, borderRadius: 14,
      backgroundColor: colors.primary,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    loginBtnDisabled: { opacity: 0.45 },
    loginBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
  });
}
