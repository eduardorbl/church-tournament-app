import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(true);
  
  // Refs para evitar race conditions
  const mountedRef = useRef(true);
  const adminCheckRef = useRef(null);

  // ✅ FUNÇÃO OTIMIZADA PARA VERIFICAR ADMIN
  const refreshRole = async (userId) => {
    if (!userId || !mountedRef.current) return false;
    
    // Cancela verificação anterior se ainda estiver rodando
    if (adminCheckRef.current) {
      adminCheckRef.current.cancelled = true;
    }
    
    const checkId = Date.now();
    adminCheckRef.current = { id: checkId, cancelled: false };
    
    try {
      const { data, error } = await supabase.rpc('is_admin');
      
      // Verifica se esta verificação ainda é válida
      if (adminCheckRef.current?.cancelled || adminCheckRef.current?.id !== checkId) {
        return false;
      }
      
      if (error) {
        console.error('is_admin RPC error:', error);
        if (mountedRef.current) setIsAdmin(false);
        return false;
      }
      
      const adminStatus = !!data;
      if (mountedRef.current) setIsAdmin(adminStatus);
      return adminStatus;
      
    } catch (err) {
      console.error('Admin check failed:', err);
      if (mountedRef.current) setIsAdmin(false);
      return false;
    }
  };

  // ✅ FUNÇÃO SIMPLIFICADA PARA VERIFICAR CONFIGURAÇÃO DE SENHA
  const checkPasswordSetup = (user) => {
    if (!user) return false;
    
    const passwordSet = user.user_metadata?.password_set;
    const needsSetup = passwordSet === undefined || passwordSet === false;
    
    if (mountedRef.current) {
      setNeedsPasswordSetup(needsSetup);
    }
    
    return needsSetup;
  };

  // ✅ BOOTSTRAP OTIMIZADO
  useEffect(() => {
    mountedRef.current = true;
    let authSubscription = null;

    const bootstrap = async () => {
      if (!mountedRef.current) return;
      
      setLoading(true);
      setInitializing(true);
      
      try {
        // 1. Obtém sessão atual
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Erro ao obter sessão:', sessionError);
          throw sessionError;
        }

        const currentSession = sessionData.session;
        
        if (!mountedRef.current) return;
        setSession(currentSession);

        // 2. Se há sessão, verifica admin e senha
        if (currentSession?.user) {
          const user = currentSession.user;
          
          // Verifica configuração de senha
          const needsSetup = checkPasswordSetup(user);
          
          // Se não precisa setup de senha, verifica admin
          if (!needsSetup) {
            await refreshRole(user.id);
          }
        } else {
          // Sem sessão, limpa estados
          if (mountedRef.current) {
            setIsAdmin(false);
            setNeedsPasswordSetup(false);
          }
        }

        // 3. Configura listener de mudanças de auth
        authSubscription = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (!mountedRef.current) return;
          
          console.log('🔐 Auth state changed:', event, newSession?.user?.email || 'no-user');
          
          setSession(newSession);
          
          if (newSession?.user) {
            const user = newSession.user;
            
            // Verifica setup de senha
            const needsSetup = checkPasswordSetup(user);
            
            // Para eventos de login, sempre verifica admin (exceto se precisa setup)
            if (event === 'SIGNED_IN' && !needsSetup) {
              await refreshRole(user.id);
            }
            // Para outros eventos, só verifica se já não precisa setup
            else if (event !== 'SIGNED_IN' && !needsSetup) {
              await refreshRole(user.id);
            }
          } else {
            // Logout ou sessão expirada
            if (mountedRef.current) {
              setIsAdmin(false);
              setNeedsPasswordSetup(false);
            }
          }
        }).data.subscription;

        // 4. Marca como pronto
        if (mountedRef.current) {
          setReady(true);
          setLoading(false);
          setInitializing(false);
        }

      } catch (error) {
        console.error('Erro no bootstrap de auth:', error);
        
        if (mountedRef.current) {
          setSession(null);
          setIsAdmin(false);
          setNeedsPasswordSetup(false);
          setReady(true);
          setLoading(false);
          setInitializing(false);
        }
      }
    };

    bootstrap();

    // Cleanup
    return () => {
      mountedRef.current = false;
      
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
      
      if (adminCheckRef.current) {
        adminCheckRef.current.cancelled = true;
      }
    };
  }, []); // ✅ Sem dependências para evitar loops

  // ✅ LOGOUT OTIMIZADO
  const signOut = async () => {
    if (!mountedRef.current) return;
    
    try {
      setLoading(true);
      
      // Cancela verificações de admin pendentes
      if (adminCheckRef.current) {
        adminCheckRef.current.cancelled = true;
      }
      
      await supabase.auth.signOut();
      
      if (mountedRef.current) {
        setSession(null);
        setIsAdmin(false);
        setNeedsPasswordSetup(false);
      }
      
    } catch (error) {
      console.error('Erro no logout:', error);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // ✅ FUNÇÃO PARA FORÇAR RECHECK DE ADMIN (para usar após login)
  const recheckAdmin = async () => {
    if (session?.user?.id && !needsPasswordSetup) {
      return await refreshRole(session.user.id);
    }
    return false;
  };

  // ✅ VALORES DO CONTEXTO
  const contextValue = {
    session,
    isAdmin,
    ready,
    loading,
    initializing,
    needsPasswordSetup,
    user: session?.user || null,
    signOut,
    setNeedsPasswordSetup,
    recheckAdmin, // Útil para revalidar após ações importantes
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}