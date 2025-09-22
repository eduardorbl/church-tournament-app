import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function RouterGuard({ children }) {
  const location = useLocation();

  useEffect(() => {
    // Log da rota atual para debug
    console.log('Current route:', location.pathname);
    
    // Intercepta tentativas de reload problemáticas
    const handleBeforeUnload = (e) => {
      // Se estiver em uma rota específica, pode adicionar lógica aqui
      if (location.pathname.includes('/admin/')) {
        console.log('Admin route reload detected');
      }
    };

    // Intercepta popstate (botão voltar/avançar do navegador)
    const handlePopState = (e) => {
      console.log('Navigation detected:', location.pathname);
    };

    // Intercepta mudanças de hash
    const handleHashChange = (e) => {
      console.log('Hash change detected');
    };

    // Adiciona listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handleHashChange);

    // Garantir que o scroll volte ao topo ao navegar
    window.scrollTo(0, 0);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [location]);

  // Adiciona classe para identificar a rota atual no body
  useEffect(() => {
    const body = document.body;
    const routeClass = `route-${location.pathname.split('/').filter(Boolean).join('-') || 'home'}`;
    
    // Remove classes de rota anteriores
    body.className = body.className.replace(/route-\S+/g, '');
    
    // Adiciona nova classe de rota
    body.classList.add(routeClass);

    return () => {
      body.classList.remove(routeClass);
    };
  }, [location.pathname]);

  return children;
}