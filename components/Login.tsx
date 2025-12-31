import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from "firebase/auth";

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError('Acesso negado. Verifique suas credenciais.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bb-blue flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-bb-yellow/5 rounded-full blur-3xl"></div>

      <div className="bg-white w-full max-w-md rounded-[3.5rem] p-10 shadow-2xl relative z-10 animate-in zoom-in duration-500">
        <div className="text-center space-y-4 mb-10">
          <div className="w-20 h-20 bg-bb-yellow rounded-[2rem] flex items-center justify-center mx-auto shadow-lg shadow-bb-yellow/20">
             <span className="text-bb-blue font-black text-2xl italic">FF</span>
          </div>
          <h1 className="text-2xl font-black text-bb-blue italic tracking-tighter uppercase">FinanceFamily</h1>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em]">Gestão Patrimonial Segura</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-bb-blue italic ml-4">E-mail de Acesso</label>
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
            <label className="text-[9px] font-black uppercase text-bb-blue italic ml-4">Senha</label>
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
            <div className="bg-red-50 text-red-500 p-4 rounded-xl text-[10px] font-black uppercase text-center animate-bounce">
              ⚠️ {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-bb-blue text-white py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Validando Acesso...' : 'Entrar no Sistema'}
          </button>
        </form>

        <div className="mt-10 text-center">
          <p className="text-[8px] text-gray-300 font-bold uppercase italic leading-relaxed">
            Acesso exclusivo para administradores.<br/>
            Criptografia de ponta-a-ponta ativada.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;