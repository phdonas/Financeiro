import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Transacao, InvestmentAsset, Receipt } from '../types';

interface AIAdvisorProps {
  transacoes: Transacao[];
  investimentos: InvestmentAsset[];
  recibos: Receipt[];
}

const AIAdvisor: React.FC<AIAdvisorProps> = ({ transacoes, investimentos, recibos }) => {
  const [insight, setInsight] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const analyzeFinances = async () => {
    setLoading(true);
    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined;
      const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

      
      const safeTransacoes = Array.isArray(transacoes) ? transacoes : [];
      const safeInvestments = Array.isArray(investments) ? investments : [];
      
      const summary = {
        totalGasto: safeTransacoes
          .filter((t) => t.tipo === "DESPESA")
          .reduce((acc, t) => acc + Number(t.valor ?? 0), 0),
      
        totalRecebido: safeTransacoes
          .filter((t) => t.tipo === "RECEITA")
          .reduce((acc, t) => acc + Number(t.valor ?? 0), 0),
      
        patrimonio: safeInvestments.reduce(
          (acc, a) => acc + Number((a as any).current_value ?? 0),
          0
        ),
      
        paises: Array.from(new Set(safeTransacoes.map((t) => (t as any).codigo_pais).filter(Boolean))),
      };


      const prompt = `Como um consultor financeiro sênior especializado em residentes fiscais em Portugal e no Brasil, analise os seguintes dados do meu gerenciador local:
      - Receitas Totais: ${summary.totalRecebido}
      - Despesas Totais: ${summary.totalGasto}
      - Patrimônio em Ativos: ${summary.patrimonio}
      - Contexto Geográfico: ${summary.paises.join(', ')}
      
      Forneça 3 estratégias de otimização de fluxo de caixa e gestão de impostos (IVA/IRS/IRPF). Seja técnico, use markdown e mantenha um tom executivo.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }],
      });

      setInsight(response.text || 'Análise indisponível no momento.');
    } catch (error) {
      console.error('Erro na IA:', error);
      setInsight('Erro ao conectar com a IA. Verifique sua chave de API ou conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-700 pb-24">
      <div className="bg-bb-blue p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="max-w-lg">
            <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none mb-4">Estrategista Local IA</h2>
            <p className="text-blue-100 text-sm font-medium opacity-80">
              Análise inteligente processada localmente para otimizar seus ativos globais.
            </p>
          </div>
          <button 
            onClick={analyzeFinances}
            disabled={loading}
            className="bg-bb-yellow text-bb-blue px-10 py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-3"
          >
            {loading ? <div className="loader !border-bb-blue !w-4 !h-4"></div> : '🤖 Processar Insights'}
          </button>
        </div>
      </div>

      {insight && (
        <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100 animate-in slide-in-from-bottom-5 duration-500">
          <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
            <span className="text-2xl">💡</span>
            <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter">Relatório de Inteligência</h3>
          </div>
          <div className="prose prose-blue max-w-none text-gray-700 leading-relaxed text-sm">
            {insight.split('\n').map((line, i) => (
              <p key={i} className="mb-2">{line}</p>
            ))}
          </div>
        </div>
      )}

      {!insight && !loading && (
        <div className="py-20 flex flex-col items-center justify-center opacity-30 grayscale">
          <span className="text-6xl mb-4">🧠</span>
          <p className="text-xs font-black uppercase text-bb-blue italic tracking-widest">Inicie a análise para gerar o relatório estratégico</p>
        </div>
      )}
    </div>
  );
};

export default AIAdvisor;
