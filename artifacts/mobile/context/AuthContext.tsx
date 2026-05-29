import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiJson, API_BASE } from "@/lib/api";

export type UserRole = "admin" | "fleet_driver" | "independent_driver" | "commuter";

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  fleetId: number | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, name: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("bj_token");
        if (stored) {
          const data = await apiJson<{ user: AuthUser }>("/auth/me");
          setUser(data.user);
          setToken(stored);
        }
      } catch {
        await AsyncStorage.removeItem("bj_token");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(username: string, password: string) {
    const data = await apiJson<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    await AsyncStorage.setItem("bj_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function register(username: string, password: string, name: string, role: UserRole) {
    const data = await apiJson<{ token: string; user: AuthUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, name, role }),
    });
    await AsyncStorage.setItem("bj_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function logout() {
    await AsyncStorage.removeItem("bj_token");
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
