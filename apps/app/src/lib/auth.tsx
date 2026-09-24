import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { accounts, session } from "./api";
import { startLive } from "./live";

interface AuthState {
  status: "loading" | "signed-out" | "signed-in";
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");

  useEffect(() => {
    session.onUnauthorized(() => {
      void session.save(null);
      setStatus("signed-out");
    });
    void session.load().then((token) => setStatus(token ? "signed-in" : "signed-out"));
  }, []);

  // The live stream runs for as long as someone is signed in.
  useEffect(() => (status === "signed-in" ? startLive() : undefined), [status]);

  const signIn = useCallback(async (email: string, password: string) => {
    await accounts.signIn(email, password);
    setStatus("signed-in");
  }, []);
  const signUp = useCallback(async (name: string, email: string, password: string) => {
    await accounts.signUp(name, email, password);
    setStatus("signed-in");
  }, []);
  const signOut = useCallback(async () => {
    await accounts.signOut();
    setStatus("signed-out");
  }, []);

  return (
    <AuthContext.Provider value={{ status, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
