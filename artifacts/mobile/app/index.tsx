import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const topPad = Platform.OS === "web" ? 40 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  async function handleLogin() {
    if (!username.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message ?? "Login failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  const s = makeStyles(colors);

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: topPad, paddingBottom: bottomPad }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.brand}>
          <View style={s.logo}>
            <MaterialCommunityIcons name="bus-multiple" size={36} color="#fff" />
          </View>
          <Text style={s.appName}>BeepJeep</Text>
          <Text style={s.tagline}>Real-time jeepney tracking</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Welcome back</Text>
          <Text style={s.cardSub}>Sign in to continue</Text>

          {!!error && (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={15} color={colors.destructive} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={s.field}>
            <Text style={s.label}>Username</Text>
            <View style={s.inputWrap}>
              <Feather name="user" size={18} color={colors.mutedForeground} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="Enter username"
                placeholderTextColor={colors.mutedForeground}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
          </View>

          <View style={s.field}>
            <Text style={s.label}>Password</Text>
            <View style={s.inputWrap}>
              <Feather name="lock" size={18} color={colors.mutedForeground} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="Enter password"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPw((v) => !v)} style={s.eyeBtn}>
                <Feather name={showPw ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[s.loginBtn, (!username.trim() || !password || loading) && s.btnDisabled]}
            onPress={handleLogin}
            activeOpacity={0.8}
            disabled={!username.trim() || !password || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={s.loginBtnText}>Sign In</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          <View style={s.dividerRow}>
            <View style={s.divider} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.divider} />
          </View>

          <TouchableOpacity
            style={s.signupBtn}
            onPress={() => router.push("/signup")}
            activeOpacity={0.8}
          >
            <Text style={s.signupBtnText}>Create an account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.primary },
    scroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
    brand: { alignItems: "center", marginBottom: 28 },
    logo: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: "rgba(255,255,255,0.25)",
      alignItems: "center", justifyContent: "center", marginBottom: 12,
    },
    appName: { fontSize: 32, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
    tagline: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 4 },
    card: {
      backgroundColor: colors.background, borderRadius: 20, padding: 24,
      shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12, shadowRadius: 24, elevation: 12,
    },
    cardTitle: { fontSize: 22, fontWeight: "800", color: colors.foreground },
    cardSub: { fontSize: 14, color: colors.mutedForeground, marginTop: 4, marginBottom: 20 },
    errorBox: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 16,
    },
    errorText: { fontSize: 14, color: colors.destructive, flex: 1 },
    field: { marginBottom: 16 },
    label: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
    inputWrap: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.muted, borderRadius: 12, paddingHorizontal: 14, height: 50,
    },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 16, color: colors.foreground },
    eyeBtn: { padding: 4 },
    loginBtn: {
      height: 54, borderRadius: 14, backgroundColor: colors.primary,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4,
    },
    btnDisabled: { opacity: 0.45 },
    loginBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
    dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 20 },
    divider: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { fontSize: 13, color: colors.mutedForeground },
    signupBtn: {
      height: 50, borderRadius: 14, borderWidth: 2, borderColor: colors.primary,
      alignItems: "center", justifyContent: "center",
    },
    signupBtnText: { fontSize: 16, fontWeight: "700", color: colors.primary },
  });
}
