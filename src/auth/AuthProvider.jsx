// src/auth/AuthProvider.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext({
  session: null,
  user: null,
  isAdmin: false,
  needsPasswordSetup: false,
  ready: false,
  loading: false,
  signIn: async () => ({ data: null, error: null }),
  signOut: async () => ({ error: null }),
  updatePassword: async () => ({ data: null, error: null }),
  refreshAuth: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(true);
  const lastCheckId = useRef(0);

  const hasPassword = (user) => user?.user_metadata?.password_set === true;

  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        setLoading(true);

        // 1) Pega a sessão atual
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const initial = data?.session ?? null;
        if (!mountedRef.current) return;

        // 2) Aplica sessão e LIBERA a UI imediatamente
        setSession(initial);
        setNeedsPasswordSetup(initial?.user ? !hasPassword(initial.user) : false);
        setReady(true);
        setLoading(false);

        // 3) Checa admin/flags de forma assíncrona (não bloqueia a UI)
        if (initial?.user?.id) {
          void checkAdmin(initial);
        } else {
          setIsAdmin(false);
        }
      } catch (e) {
        console.error("Auth init error:", e);
        if (!mountedRef.current) return;
        setSession(null);
        setIsAdmin(false);
        setNeedsPasswordSetup(false);
        setReady(true);
        setLoading(false);
      }
    })();

    // Reage a QUALQUER mudança de auth
    const { data: subscriptionWrapper } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mountedRef.current) return;
        setSession(newSession ?? null);

        // não trava a UI; checa admin/flags em paralelo
        if (newSession?.user) {
          setNeedsPasswordSetup(!hasPassword(newSession.user));
          if (newSession.user.id) {
            void checkAdmin(newSession);
          } else {
            setIsAdmin(false);
          }
        } else {
          setIsAdmin(false);
          setNeedsPasswordSetup(false);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      subscriptionWrapper?.subscription?.unsubscribe?.();
    };
  }, []);

  // Checagem resiliente de admin (não lança erro na UI)
  const checkAdmin = async (sess) => {
    const checkId = ++lastCheckId.current;

    try {
      const userId = sess?.user?.id;
      if (!userId) {
        if (mountedRef.current && checkId === lastCheckId.current) {
          setIsAdmin(false);
        }
        return;
      }

      const { data, error } = await supabase.rpc("is_admin");

      if (mountedRef.current && checkId === lastCheckId.current) {
        setIsAdmin(Boolean(data) && !error);
      }
    } catch (e) {
      console.error("checkAdmin error:", e);
      if (mountedRef.current && checkId === lastCheckId.current) {
        setIsAdmin(false);
      }
    }
  };

  // Login: atualiza sessão e checa admin/flags em seguida (sem bloquear UI)
  const signIn = async (email, password) => {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.data?.session?.user?.id && !result.error) {
      setSession(result.data.session);
      setNeedsPasswordSetup(!hasPassword(result.data.session.user));
      void checkAdmin(result.data.session);
    }
    return result;
  };

  // Logout
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setSession(null);
      setIsAdmin(false);
      setNeedsPasswordSetup(false);
    }
    return { error };
  };

  // Atualizar senha e marcar flag diretamente no user_metadata
  const updatePassword = async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { password_set: true },
    });

    if (!error) {
      setNeedsPasswordSetup(false);
      const { data: refreshed } = await supabase.auth.getSession();
      setSession(refreshed?.session ?? null);
    }

    return { data, error };
  };

  // Forçar rechecagem manual (se precisar em algum fluxo)
  const refreshAuth = async () => {
    const { data } = await supabase.auth.getSession();
    const s = data?.session ?? null;
    setSession(s);
    if (s?.user?.id) {
      setNeedsPasswordSetup(!hasPassword(s.user));
      void checkAdmin(s);
    } else {
      setIsAdmin(false);
      setNeedsPasswordSetup(false);
    }
  };

  const value = {
    session,
    user: session?.user ?? null,
    isAdmin,
    needsPasswordSetup,
    ready,
    loading,
    signIn,
    signOut,
    updatePassword,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
