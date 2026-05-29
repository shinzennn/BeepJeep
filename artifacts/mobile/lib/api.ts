import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await AsyncStorage.getItem("bj_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

export async function apiJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await apiFetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`);
  return data as T;
}
