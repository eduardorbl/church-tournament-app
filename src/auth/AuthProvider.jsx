// src/auth/AuthProvider.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext({
  session: null,
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
        setReady(true);
        setLoading(false);

        // 3) Checa admin/flags de forma assíncrona (não bloqueia a UI)
        if (initial?.user?.id) {
          void checkAdminAndFlags(initial);
        } else {
          setIsAdmin(false);
          setNeedsPasswordSetup(false);
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
        if (newSession?.user?.id) {
          void checkAdminAndFlags(newSession);
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

  // Checagem resiliente de admin/flags (não lança erro na UI)
  const checkAdminAndFlags = async (sess) => {
    const checkId = ++lastCheckId.current;

    try {
      const userId = sess?.user?.id;
      if (!userId) {
        if (mountedRef.current && checkId === lastCheckId.current) {
          setIsAdmin(false);
          setNeedsPasswordSetup(false);
        }
        return;
      }

      // Roda em paralelo; se uma falhar, seguimos com a outra
      const [adminRes, profileRes] = await Promise.allSettled([
        supabase.rpc("is_admin"),
        supabase
          .from("user_profiles")
          .select("needs_password_setup")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      let admin = false;
      if (adminRes.status === "fulfilled") {
        admin = Boolean(adminRes.value?.data);
      } else {
        console.warn("is_admin RPC falhou:", adminRes.reason);
      }

      let nps = false;
      if (profileRes.status === "fulfilled") {
        nps = Boolean(profileRes.value?.data?.needs_password_setup);
      } else {
        // se sua tabela/coluna não existir ou RLS bloquear, apenas loga
        console.warn("Leitura de user_profiles falhou (ignorado):", profileRes.reason);
      }

      if (mountedRef.current && checkId === lastCheckId.current) {
        setIsAdmin(admin);
        setNeedsPasswordSetup(nps);
      }
    } catch (e) {
      console.error("checkAdminAndFlags error:", e);
      if (mountedRef.current && checkId === lastCheckId.current) {
        setIsAdmin(false);
        setNeedsPasswordSetup(false);
      }
    }
  };

  // Login: atualiza sessão e checa admin/flags em seguida (sem bloquear UI)
  const signIn = async (email, password) => {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.data?.session?.user?.id && !result.error) {
      setSession(result.data.session);
      void checkAdminAndFlags(result.data.session);
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

  // Atualizar senha e marcar flag no perfil (se existir a tabela/coluna)
  const updatePassword = async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });

    if (!error && session?.user?.id) {
      try {
        await supabase
          .from("user_profiles")
          .upsert({ user_id: session.user.id, needs_password_setup: false });
        setNeedsPasswordSetup(false);
      } catch (err) {
        console.warn("updatePassword: upsert user_profiles falhou (ignorado):", err);
      }
    }

    return { data, error };
  };

  // Forçar rechecagem manual (se precisar em algum fluxo)
  const refreshAuth = async () => {
    const { data } = await supabase.auth.getSession();
    const s = data?.session ?? null;
    setSession(s);
    if (s?.user?.id) {
      void checkAdminAndFlags(s);
    } else {
      setIsAdmin(false);
      setNeedsPasswordSetup(false);
    }
  };

  const value = {
    session,
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
