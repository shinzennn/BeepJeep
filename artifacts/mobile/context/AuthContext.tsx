import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import { AuthUser, UserRole } from "@/types";

interface AuthContextType {
  user: AuthUser | null;
  login: (role: UserRole, name: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  function login(role: UserRole, name: string) {
    setUser({
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      name: name.trim() || (role === "driver" ? "Driver" : role === "admin" ? "Admin" : "Commuter"),
      role,
    });
  }

  function logout() {
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
