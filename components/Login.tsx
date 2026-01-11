import React, { useEffect, useState } from "react";
import { auth, googleProvider } from "../lib/firebase";
import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect
} from "firebase/auth";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Evita persistência longa e melhora previsibilidade em navegação privada/aba anônima
    setPersistence(auth, browserSessionPersistence).catch((err) => {
      console.warn('Falha ao configurar persistence do Auth:', err);
    });
  }, []);

  const mapAuthError = (err: any): string => {
    const code = String(err?.code ?? '');
    if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) return 'Acesso negado. Verifique e-mail e senha.';
    if (code.includes('auth/user-not-found')) return 'Usuário não encontrado. Verifique o e-mail.';
    if (code.includes('auth/too-many-requests')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    if (code.includes('auth/network-request-failed')) return 'Falha de rede. Verifique sua conexão e tente novamente.';
    if (code.includes('auth/operation-not-allowed')) return 'Método de login não habilitado no Firebase (operation-not-allowed).';
    return 'Não foi possível autenticar. Tente novamente.';
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error(err);
      const code = String(err?.code ?? "");
      // Em alguns browsers/aba anônima o popup é bloqueado: fallback para redirect
      if (code.includes("auth/popup") || code.includes("popup")) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (err2) {
          console.error(err2);
        }
      }
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error(err);
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bb-blue flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-bb-yellow/5 rounded-full blur-3xl"></div>

      <div className="bg-white w-full max-w-md rounded-[3.5rem] p-10 shadow-2xl relative z-10">
        <div className="text-center space-y-4 mb-8">
          <div className="w-20 h-20 bg-bb-yellow rounded-[2rem] flex items-center justify-center mx-auto shadow-lg shadow-bb-yellow/20">
            <span className="text-bb-blue font-black text-2xl italic">FF</span>
          </div>
          <h1 className="text-2xl font-black text-bb-blue italic tracking-tighter uppercase">
            FinanceFamily
          </h1>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em]">
            Gestão Patrimonial Segura
          </p>
        </div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full bg-white border border-gray-200 text-gray-700 py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-sm hover:bg-gray-50 transition-all disabled:opacity-50"
        >
          {loading ? "Aguarde..." : "Entrar com Google"}
        </button>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px bg-gray-100 flex-1"></div>
          <span className="text-[9px] font-black uppercase text-gray-300 tracking-widest">
            ou
          </span>
          <div className="h-px bg-gray-100 flex-1"></div>
        </div>

        <form onSubmit={handleEmail} className="space-y-5">
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-bb-blue italic ml-4">
              E-mail
            </label>
            <input
              type="email"
              required
              className="w-full bg-gray-50 p-5 rounded-2xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue shadow-inner"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-bb-blue italic ml-4">
              Senha
            </label>
            <input
              type="password"
              required
              className="w-full bg-gray-50 p-5 rounded-2xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue shadow-inner"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-xl text-[10px] font-black uppercase text-center">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-bb-blue text-white py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? "Validando..." : "Entrar com E-mail"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
