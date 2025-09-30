import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Função SUPER simplificada para inicializar auth
    const initAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        setSession(initialSession);
        
        // Se tem sessão, verificar admin de forma simples
        if (initialSession?.user?.id) {
          try {
            const { data: adminData } = await supabase.rpc('is_admin');
            if (mounted) {
              setIsAdmin(Boolean(adminData));
              setNeedsPasswordSetup(false); // Simplificando - sempre false após login
            }
          } catch (error) {
            console.error('Error checking admin:', error);
            if (mounted) {
              setIsAdmin(false);
              setNeedsPasswordSetup(false);
            }
          }
        } else {
          if (mounted) {
            setIsAdmin(false);
            setNeedsPasswordSetup(false);
          }
        }

        if (mounted) {
          setReady(true);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) {
          setSession(null);
          setIsAdmin(false);
          setNeedsPasswordSetup(false);
          setReady(true);
        }
      }
    };

    // Executar inicialização apenas uma vez
    initAuth();

    // Listener MUITO simplificado - apenas para logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;
        
        console.log('Auth change:', event);
        
        // Apenas atualiza sessão e reseta estados
        setSession(newSession);
        
        if (!newSession) {
          // Logout - limpa tudo
          setIsAdmin(false);
          setNeedsPasswordSetup(false);
        }
        // Para login, mantém os estados atuais para evitar loops
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []); // Array vazio - executa apenas UMA vez

  // Funções simplificadas
  const signIn = async (email, password) => {
    const result = await supabase.auth.signInWithPassword({ email, password });
    
    // Após login bem-sucedido, atualiza admin status
    if (result.data?.session?.user?.id && !result.error) {
      try {
        const { data: adminData } = await supabase.rpc('is_admin');
        setIsAdmin(Boolean(adminData));
        setNeedsPasswordSetup(false);
      } catch (error) {
        console.error('Error checking admin after login:', error);
        setIsAdmin(false);
        setNeedsPasswordSetup(false);
      }
    }
    
    return result;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setSession(null);
      setIsAdmin(false);
      setNeedsPasswordSetup(false);
    }
    return { error };
  };

  const updatePassword = async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    
    if (!error && session?.user) {
      try {
        await supabase
          .from('user_profiles')
          .upsert({
            user_id: session.user.id,
            needs_password_setup: false
          });
        setNeedsPasswordSetup(false);
      } catch (err) {
        console.error('Error updating profile:', err);
      }
    }

    return { data, error };
  };

  const value = {
    session,
    isAdmin,
    needsPasswordSetup,
    ready,
    loading: false, // Sempre false para simplicidade
    signIn,
    signOut,
    updatePassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}