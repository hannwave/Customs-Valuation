"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { acceptsDemoCredentials, readDemoSession, writeDemoSession } from "./demo-session";
import { setSessionAccessToken } from "./session";

type DemoSession = {
  ready: boolean;
  signedIn: boolean;
  signIn: (identifier: string, password: string) => boolean;
  signOut: () => void;
};
const Context = createContext<DemoSession | null>(null);

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    try { setSignedIn(readDemoSession(window.sessionStorage)); }
    catch { /* Storage may be unavailable; in-memory demo access still works. */ }
    setReady(true);
  }, []);

  function signIn(identifier: string, password: string) {
    if (!acceptsDemoCredentials(identifier, password)) return false;
    try { writeDemoSession(window.sessionStorage, true); } catch { /* In-memory fallback. */ }
    setSignedIn(true);
    return true;
  }

  function signOut() {
    try { writeDemoSession(window.sessionStorage, false); } catch { /* In-memory fallback. */ }
    setSessionAccessToken(null);
    setSignedIn(false);
  }

  return <Context.Provider value={{ ready, signedIn, signIn, signOut }}>{children}</Context.Provider>;
}

export function useDemoSession() {
  const session = useContext(Context);
  if (!session) throw new Error("DemoSessionProvider is required");
  return session;
}
