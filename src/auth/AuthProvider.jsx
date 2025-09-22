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
      try {
        const { data } = await supabase.auth.getSession();
        const sess = data.session ?? null;
        setSession(sess);

        if (sess?.user?.id) {
          await refreshRole(sess.user.id);
          
          // Verifica se é um usuário que veio via invite/link mágico
          const passwordSet = sess.user.user_metadata?.password_set;
          if (passwordSet === undefined || passwordSet === false) {
            console.log('User needs password setup');
            setNeedsPasswordSetup(true);
          }
        } else {
          setIsAdmin(false);
        }

        setReady(true);

        sub = supabase.auth.onAuthStateChange(async (event, newSession) => {
          try {
            console.log('Auth state changed:', event, newSession?.user?.email);
            setSession(newSession ?? null);
            
            if (newSession?.user?.id) {
              // Só verificar admin se não está em setup de senha
              if (!needsPasswordSetup) {
                await refreshRole(newSession.user.id);
              }
              
              // Verifica se precisa setup apenas no SIGNED_IN
              if (event === 'SIGNED_IN') {
                const passwordSet = newSession.user.user_metadata?.password_set;
                if (passwordSet === undefined || passwordSet === false) {
                  console.log('Setting needsPasswordSetup to true');
                  setNeedsPasswordSetup(true);
                }
              }
            } else {
              setIsAdmin(false);
            }
            
            if (event === 'SIGNED_OUT') {
              setNeedsPasswordSetup(false);
              setIsAdmin(false);
            }
          } catch (error) {
            console.error('Error in auth state change:', error);
          }
        }).data.subscription;
      } catch (error) {
        console.error('Error in auth bootstrap:', error);
        setReady(true); // Mesmo com erro, marcar como pronto
      }
    };

    bootstrap();
    return () => sub?.unsubscribe();
  }, [needsPasswordSetup]);

  const refreshRole = async (userId) => {
    try {
      const { data, error } = await supabase.rpc('is_admin');
      if (error) {
        console.error('is_admin RPC error', error);
        setIsAdmin(false);
      } else {
        console.log('Admin check result:', data);
        setIsAdmin(!!data);
      }
    } catch (err) {
      console.error('Admin check failed:', err);
      setIsAdmin(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setIsAdmin(false);
      setNeedsPasswordSetup(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
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