import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);

  useEffect(() => {
    let sub;
    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      const sess = data.session ?? null;
      setSession(sess);

      if (sess?.user?.id) {
        await refreshRole(sess.user.id);
        
        // Verifica se é um usuário que veio via invite/link mágico
        // Usuários criados via invite não têm password_set ou é false
        const passwordSet = sess.user.user_metadata?.password_set;
        if (passwordSet === undefined || passwordSet === false) {
          setNeedsPasswordSetup(true);
        }
      } else {
        setIsAdmin(false);
      }

      setReady(true);

      sub = supabase.auth.onAuthStateChange(async (event, newSession) => {
        setSession(newSession ?? null);
        
        if (newSession?.user?.id) {
          await refreshRole(newSession.user.id);
          
          // Verifica eventos específicos que indicam primeiro login
          if (event === 'SIGNED_IN') {
            const passwordSet = newSession.user.user_metadata?.password_set;
            if (passwordSet === undefined || passwordSet === false) {
              setNeedsPasswordSetup(true);
            }
          }
        } else {
          setIsAdmin(false);
        }
        
        if (event === 'SIGNED_OUT') {
          setNeedsPasswordSetup(false);
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
    setNeedsPasswordSetup(false);
  };

  return (
    <AuthContext.Provider value={{ 
      session, 
      isAdmin, 
      ready, 
      signOut,
      needsPasswordSetup,
      setNeedsPasswordSetup,
      user: session?.user ?? null,
      loading: !ready
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}