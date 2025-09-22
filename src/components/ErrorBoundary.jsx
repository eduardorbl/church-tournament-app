import React from 'react';
import { Link } from 'react-router-dom';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    // Atualiza o state para mostrar a UI de erro
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log do erro para debugging
    console.error('ErrorBoundary capturou um erro:', error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Aqui você poderia enviar o erro para um serviço de monitoramento
    // como Sentry, LogRocket, etc.
  }

  handleReload = () => {
    // Recarrega a página para tentar recuperar do erro
    window.location.reload();
  };

  handleReset = () => {
    // Reset o estado do error boundary
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null 
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                <span className="text-2xl text-red-600">⚠️</span>
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Oops! Algo deu errado
              </h2>
              
              <p className="text-gray-600 mb-6">
                Ocorreu um erro inesperado na aplicação. Você pode tentar recarregar a página ou voltar ao início.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={this.handleReload}
                className="w-full bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
              >
                Recarregar Página
              </button>
              
              <button
                onClick={this.handleReset}
                className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Tentar Novamente
              </button>
              
              <Link 
                to="/"
                className="block w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                onClick={this.handleReset}
              >
                Voltar ao Início
              </Link>
            </div>

            {/* Detalhes do erro em modo desenvolvimento */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Detalhes técnicos (dev)
                </summary>
                <div className="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-700 overflow-auto">
                  <div className="mb-2">
                    <strong>Erro:</strong>
                    <pre className="whitespace-pre-wrap">{this.state.error.toString()}</pre>
                  </div>
                  {this.state.errorInfo && (
                    <div>
                      <strong>Stack trace:</strong>
                      <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;