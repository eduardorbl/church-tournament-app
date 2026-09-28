// src/auth/AuthProvider.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext({
  session: null,
  user: null,
  isAdmin: false,
  adminChecked: false,
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
  // true só depois que o is_admin() respondeu para o usuário atual
  const [adminChecked, setAdminChecked] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(true);
  const lastCheckId = useRef(0);
  const currentUserId = useRef(null);

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
          resetAdmin(null);
          setAdminChecked(true);
        }
      } catch (e) {
        console.error("Auth init error:", e);
        if (!mountedRef.current) return;
        setSession(null);
        resetAdmin(null);
        setAdminChecked(true);
        setNeedsPasswordSetup(false);
        setReady(true);
        setLoading(false);
      }
    })();

    // Reage a QUALQUER mudança de auth
    const { data: subscriptionWrapper } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mountedRef.current) return;
        setSession(newSession ?? null);

        // não trava a UI; checa admin/flags em paralelo
        if (newSession?.user) {
          // Link de recuperação de senha: sempre pedir a nova senha
          setNeedsPasswordSetup(
            event === "PASSWORD_RECOVERY" || !hasPassword(newSession.user)
          );
          if (newSession.user.id) {
            void checkAdmin(newSession);
          } else {
            resetAdmin(null);
            setAdminChecked(true);
          }
        } else {
          resetAdmin(null);
          setAdminChecked(true);
          setNeedsPasswordSetup(false);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      subscriptionWrapper?.subscription?.unsubscribe?.();
    };
  }, []);

  // Troca de usuário: nunca herdar o isAdmin do usuário anterior
  function resetAdmin(userId) {
    if (currentUserId.current !== userId) {
      currentUserId.current = userId;
      setIsAdmin(false);
      setAdminChecked(false);
    }
  }

  // Checagem resiliente de admin (não lança erro na UI; em erro, nega acesso)
  const checkAdmin = async (sess) => {
    const checkId = ++lastCheckId.current;
    const userId = sess?.user?.id ?? null;
    resetAdmin(userId);

    try {
      if (!userId) {
        if (mountedRef.current && checkId === lastCheckId.current) {
          setIsAdmin(false);
          setAdminChecked(true);
        }
        return;
      }

      const { data, error } = await supabase.rpc("is_admin");
      if (error) console.error("is_admin error:", error.message);

      if (mountedRef.current && checkId === lastCheckId.current) {
        setIsAdmin(Boolean(data) && !error);
        setAdminChecked(true);
      }
    } catch (e) {
      console.error("checkAdmin error:", e);
      if (mountedRef.current && checkId === lastCheckId.current) {
        setIsAdmin(false);
        setAdminChecked(true);
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

  // Logout: limpa o estado local mesmo se a chamada ao servidor falhar
  const signOut = async () => {
    let error = null;
    try {
      ({ error } = await supabase.auth.signOut());
    } catch (e) {
      error = e;
    }
    if (error) {
      // garante que a sessão local também saia
      try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignora */ }
    }
    setSession(null);
    resetAdmin(null);
    setAdminChecked(true);
    setNeedsPasswordSetup(false);
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
      resetAdmin(null);
      setAdminChecked(true);
      setNeedsPasswordSetup(false);
    }
  };

  const value = {
    session,
    user: session?.user ?? null,
    isAdmin,
    adminChecked,
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
