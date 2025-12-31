
import React, { useMemo, useState, useEffect } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, ComposedChart, Line, Area
} from 'recharts';
import { Transacao, Orcamento, CategoriaContabil, TipoTransacao, InvestmentAsset } from '../types';

interface DashboardProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  transacoes: Transacao[];
  orcamentos: Orcamento[];
  categorias: CategoriaContabil[];
  investments: InvestmentAsset[];
}

const COLORS = ['#0038a8', '#f8d117', '#10b981', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899'];

const Dashboard: React.FC<DashboardProps> = ({ viewMode, transacoes, orcamentos, categorias, investments }) => {
  const [activeAnalysis, setActiveAnalysis] = useState<'COMPOSICAO' | 'EVOLUCAO' | 'INSIGHTS'>('COMPOSICAO');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [exchangeRate, setExchangeRate] = useState<number>(6.15); 
  
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const response = await fetch('https://economia.awesomeapi.com.br/last/EUR-BRL');
        const data = await response.json();
        if (data && data.EURBRL && data.EURBRL.bid) {
          const rate = parseFloat(data.EURBRL.bid);
          if (!isNaN(rate) && rate > 0) setExchangeRate(rate);
        }
      } catch (err) { console.error("Erro câmbio:", err); }
    };
    fetchRate();
  }, []);

  const formatCur = (val: number) => {
    const symbol = viewMode === 'PT' ? '€' : 'R$';
    return `${symbol} ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getVal = (v: number, pais: string) => {
    let val = v;
    if (viewMode === 'GLOBAL' && pais === 'PT') val *= exchangeRate;
    if (viewMode === 'PT' && pais === 'BR') val /= exchangeRate;
    return val;
  };

  const statsConsolidada = useMemo(() => {
    const saldoLedger = transacoes.reduce((acc, t) => {
      if (t.status !== 'PAGO') return acc;
      const val = getVal(t.valor, t.codigo_pais);
      return t.tipo === TipoTransacao.RECEITA ? acc + val : acc - val;
    }, 0);

    const capitalInvestido = investments.reduce((acc, a) => acc + getVal(a.current_value, a.country_code), 0);

    const gastosMes = transacoes
      .filter(t => {
        const d = new Date(t.data_prevista_pagamento + 'T12:00:00');
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear && t.tipo === TipoTransacao.DESPESA;
      })
      .reduce((acc, t) => acc + getVal(t.valor, t.codigo_pais), 0);

    return { total: saldoLedger + capitalInvestido, liquid: saldoLedger, invested: capitalInvestido, monthlyBurn: gastosMes };
  }, [transacoes, investments, viewMode, exchangeRate, selectedMonth, selectedYear]);

  const compositionData = useMemo(() => {
    const filtered = transacoes.filter(t => {
      const dt = new Date(t.data_prevista_pagamento + 'T12:00:00');
      const periodMatch = dt.getMonth() === selectedMonth && dt.getFullYear() === selectedYear;
      return periodMatch && t.tipo === TipoTransacao.DESPESA;
    });
    const total = filtered.reduce((acc, t) => acc + getVal(t.valor, t.codigo_pais), 0);
    const data = categorias.filter(c => c.tipo === TipoTransacao.DESPESA).map(cat => {
      const val = filtered.filter(t => t.categoria_id === cat.id).reduce((acc, t) => acc + getVal(t.valor, t.codigo_pais), 0);
      return { id: cat.id, name: cat.nome, value: val, percent: total > 0 ? (val / total) * 100 : 0 };
    }).filter(c => c.value > 0).sort((a, b) => b.value - a.value);
    return { data, total };
  }, [transacoes, categorias, selectedMonth, selectedYear, viewMode, exchangeRate]);

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-700 pb-24">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <div className="md:col-span-2 bg-bb-blue p-8 rounded-[2rem] shadow-xl relative overflow-hidden group border border-blue-400/20">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
            <p className="text-[10px] font-black text-blue-200 uppercase tracking-[0.2em] mb-2 italic">Patrimônio Líquido Consolidado</p>
            <h2 className="text-4xl font-black text-white italic tracking-tighter">{formatCur(statsConsolidada.total)}</h2>
            <div className="mt-6 flex gap-3">
               <div className="bg-white/10 px-3 py-1 rounded-lg text-[8px] font-black text-white uppercase tracking-widest border border-white/10">Cash: {formatCur(statsConsolidada.liquid)}</div>
               <div className="bg-bb-yellow/20 px-3 py-1 rounded-lg text-[8px] font-black text-bb-yellow uppercase tracking-widest border border-bb-yellow/20">Inv: {formatCur(statsConsolidada.invested)}</div>
            </div>
         </div>
         <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 italic">Burn Rate Mensal</p>
            <h4 className="text-2xl font-black text-bb-blue italic">{formatCur(statsConsolidada.monthlyBurn)}</h4>
            <div className="mt-4 flex items-center gap-2">
               <div className="w-full h-1.5 bg-gray-50 rounded-full overflow-hidden">
                  <div className="h-full bg-bb-blue" style={{ width: `${Math.min((statsConsolidada.monthlyBurn / (statsConsolidada.liquid || 1)) * 100, 100)}%` }}></div>
               </div>
               <span className="text-[8px] font-black text-gray-300">{(statsConsolidada.monthlyBurn / (statsConsolidada.liquid || 1) * 100).toFixed(0)}%</span>
            </div>
         </div>
         <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col justify-between">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest italic">Câmbio Live (EUR/BRL)</p>
            <div className="flex items-end justify-between">
               <span className="text-xl font-black text-bb-blue italic">R$ {exchangeRate.toFixed(2)}</span>
               <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-tighter">AwesomeAPI</span>
            </div>
            <div className="mt-2 text-[8px] text-gray-300 font-bold uppercase italic tracking-widest">Atualizado agora</div>
         </div>
      </div>

      <div className="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100 shadow-inner">
           {[
             { id: 'COMPOSICAO', label: 'Composição', icon: '📊' },
             { id: 'EVOLUCAO', label: 'Evolução', icon: '📈' },
             { id: 'INSIGHTS', label: 'Insights', icon: '🔍' }
           ].map(tab => (
             <button 
               key={tab.id}
               onClick={() => setActiveAnalysis(tab.id as any)}
               className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${activeAnalysis === tab.id ? 'bg-bb-blue text-white shadow-md' : 'text-gray-400 hover:text-bb-blue'}`}
             >
               <span>{tab.icon}</span> {tab.label}
             </button>
           ))}
        </div>

        <div className="flex gap-2">
            <select className="bg-gray-50 p-2 rounded-lg text-[10px] font-black uppercase outline-none shadow-inner border border-gray-100" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="bg-gray-50 p-2 rounded-lg text-[10px] font-black uppercase outline-none shadow-inner border border-gray-100" value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
              {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
        </div>
      </div>

      {activeAnalysis === 'COMPOSICAO' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           <div className="bg-white p-8 rounded-[1.5rem] border border-gray-100 shadow-sm flex flex-col items-center">
             <h4 className="text-[11px] font-black text-bb-blue uppercase italic tracking-widest mb-6">Composição de Gastos Mensais</h4>
             <div className="h-[250px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie data={compositionData.data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {compositionData.data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCur(v)} contentStyle={{borderRadius: '10px', border:'none', boxShadow:'0 5px 15px rgba(0,0,0,0.1)', fontSize:'10px'}} />
                 </PieChart>
               </ResponsiveContainer>
             </div>
             <div className="mt-4 text-center">
                <p className="text-[10px] font-black text-gray-400 uppercase italic">Total Competência</p>
                <p className="text-2xl font-black text-bb-blue italic">{formatCur(compositionData.total)}</p>
             </div>
           </div>

           <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm space-y-3">
              <h4 className="text-[10px] font-black text-bb-blue uppercase italic tracking-widest mb-2">Detalhamento por Categoria</h4>
              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 scrollbar-hide">
                {compositionData.data.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-xl hover:bg-bb-blue/5 transition-all group">
                    <div className="flex items-center gap-3">
                       <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: COLORS[i % COLORS.length]}}></div>
                       <span className="text-[10px] font-black uppercase text-gray-700 italic">{c.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-bb-blue">{formatCur(c.value)}</p>
                      <p className="text-[9px] font-bold text-gray-300 uppercase italic">{c.percent.toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
