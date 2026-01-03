import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: unknown };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Mantemos log no console para facilitar debug sem “tela branca”
    console.error("ErrorBoundary capturou um erro de runtime:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200">
          <div className="font-bold text-red-900 mb-1">Ocorreu um erro nesta tela</div>
          <div className="text-sm text-red-800 mb-3">
            O aplicativo evitou uma tela branca e registrou detalhes no Console (DevTools).
            Você pode recarregar a página para tentar novamente.
          </div>
          <button
            className="px-4 py-2 rounded-lg bg-red-700 text-white font-bold hover:opacity-90 transition"
            onClick={() => window.location.reload()}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children as any;
  }
}
