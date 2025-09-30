// src/utils/loadingUtils.js
import { useEffect, useRef, useState } from 'react';

/**
 * Hook personalizado para gerenciar estados de carregamento
 * Garante que os dados sejam carregados corretamente na montagem do componente
 */
export function useAsyncLoad(loadFunction, dependencies = []) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const load = async () => {
    // Evita carregamentos duplicados
    if (loadingRef.current) return;
    
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await loadFunction();
      
      // Só atualiza se o componente ainda estiver montado
      if (mountedRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      console.error('Erro no carregamento:', err);
      if (mountedRef.current) {
        setError(err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load();

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return { loading, error, data, reload: load };
}

/**
 * Hook para gerenciar múltiplos carregamentos paralelos
 */
export function useParallelLoad(loadFunctions, dependencies = []) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const load = async () => {
    if (loadingRef.current) return;
    
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      await Promise.all(loadFunctions.map(fn => fn()));
      
      if (mountedRef.current) {
        setError(null);
      }
    } catch (err) {
      console.error('Erro no carregamento paralelo:', err);
      if (mountedRef.current) {
        setError(err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load();

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return { loading, error, reload: load };
}

/**
 * Wrapper para garantir carregamento seguro com retry
 */
export async function safeLoad(loadFunction, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await loadFunction();
    } catch (error) {
      lastError = error;
      console.warn(`Tentativa ${i + 1} falhou:`, error);
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
}