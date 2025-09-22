// src/auth/AuthProvider.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let sub;
    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      const sess = data.session ?? null;
      setSession(sess);

      if (sess?.user?.id) {
        await refreshRole(sess.user.id);
      } else {
        setIsAdmin(false);
      }

      setReady(true);

      sub = supabase.auth.onAuthStateChange((_ev, newSession) => {
        setSession(newSession ?? null);
        if (newSession?.user?.id) {
          refreshRole(newSession.user.id);
        } else {
          setIsAdmin(false);
        }
      }).data.subscription;
    };

    bootstrap();
    return () => sub?.unsubscribe();
  }, []);

  const refreshRole = async () => {
    const { data, error } = await supabase.rpc('is_admin');
    if (error) {
      console.error('is_admin RPC error', error);
    }
    setIsAdmin(!error && !!data);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ session, isAdmin, ready, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
