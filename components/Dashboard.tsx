
import React, { useMemo, useState, useEffect } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, ComposedChart, Line, Area
} from 'recharts';
import { Transacao, Orcamento, CategoriaContabil, TipoTransacao } from '../types';

interface DashboardProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  transacoes: Transacao[];
  orcamentos: Orcamento[];
  categorias: CategoriaContabil[];
}

const COLORS = ['#0038a8', '#f8d117', '#10b981', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899'];

const Dashboard: React.FC<DashboardProps> = ({ viewMode, transacoes, orcamentos, categorias }) => {
  const [activeAnalysis, setActiveAnalysis] = useState<'COMPOSICAO' | 'EVOLUCAO' | 'INSIGHTS'>('COMPOSICAO');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [exchangeRate, setExchangeRate] = useState<number>(6.15); 
  
  const [compRange, setCompRange] = useState<'YTD' | 'YoY' | 'CUSTOM'>('YTD');
  const [compCatId, setCompCatId] = useState<string>('ALL');
  const [showBudget, setShowBudget] = useState<boolean>(true);
  const [customStart, setCustomStart] = useState<string>(`${new Date().getFullYear()}-01-01`);
  const [customEnd, setCustomEnd] = useState<string>(new Date().toISOString().split('T')[0]);

  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  // --- PASSO 3: Câmbio Automático ---
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const response = await fetch('https://economia.awesomeapi.com.br/last/EUR-BRL');
        const data = await response.json();
        if (data && data.EURBRL && data.EURBRL.bid) {
          const rate = parseFloat(data.EURBRL.bid);
          if (!isNaN(rate) && rate > 0) {
            setExchangeRate(rate);
          }
        }
      } catch (err) {
        console.error("Erro ao buscar cotação atualizada:", err);
      }
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
    return val;
  };

  // --- 1. DADOS DE COMPOSIÇÃO ---
  const compositionData = useMemo(() => {
    const filtered = transacoes.filter(t => {
      const dt = new Date(t.data_prevista_pagamento + 'T12:00:00');
      const periodMatch = dt.getMonth() === selectedMonth && dt.getFullYear() === selectedYear;
      const modeMatch = viewMode === 'GLOBAL' || t.codigo_pais === viewMode;
      // Neutralização: Ignora PAGAMENTO_FATURA na análise de composição de gastos por categoria
      return periodMatch && modeMatch && t.tipo === TipoTransacao.DESPESA;
    });
    const total = filtered.reduce((acc, t) => acc + getVal(t.valor, t.codigo_pais), 0);
    const data = categorias.filter(c => c.tipo === TipoTransacao.DESPESA).map(cat => {
      const val = filtered.filter(t => t.categoria_id === cat.id).reduce((acc, t) => acc + getVal(t.valor, t.codigo_pais), 0);
      return { id: cat.id, name: cat.nome, value: val, percent: total > 0 ? (val / total) * 100 : 0 };
    }).filter(c => c.value > 0).sort((a, b) => b.value - a.value);
    return { data, total };
  }, [transacoes, categorias, selectedMonth, selectedYear, viewMode, exchangeRate]);

  // --- 2. DADOS DE INSIGHTS (DESVIOS E VARIAÇÕES) ---
  const insightsData = useMemo(() => {
    // Mes anterior para comparação de itens
    let prevM = selectedMonth - 1;
    let prevY = selectedYear;
    if (prevM < 0) { prevM = 11; prevY--; }

    const budgetVsActual = categorias.map(cat => {
      const actual = transacoes.filter(t => {
        const dt = new Date(t.data_prevista_pagamento + 'T12:00:00');
        const modeMatch = viewMode === 'GLOBAL' || t.codigo_pais === viewMode;
        // Neutralização: Ignora PAGAMENTO_FATURA para não inflar o realizado contra o orçamento
        return dt.getMonth() === selectedMonth && dt.getFullYear() === selectedYear && t.categoria_id === cat.id && t.tipo !== TipoTransacao.PAGAMENTO_FATURA;
      }).reduce((acc, t) => acc + getVal(t.valor, t.codigo_pais), 0);

      const budget = orcamentos.filter(o => {
        const modeMatch = viewMode === 'GLOBAL' || o.codigo_pais === viewMode;
        return o.ano === selectedYear && o.mes === selectedMonth && o.categoria_id === cat.id && modeMatch;
      }).reduce((acc, o) => acc + getVal(o.valor_meta, o.codigo_pais), 0);

      const diffPerc = budget > 0 ? ((actual / budget) - 1) * 100 : 0;
      
      return { id: cat.id, name: cat.nome, tipo: cat.tipo, actual, budget, diffPerc };
    }).filter(i => i.actual > 0 || i.budget > 0);

    const itemGrowth = categorias.flatMap(cat => {
      return cat.contas.map(item => {
        const currentVal = transacoes.filter(t => {
          const dt = new Date(t.data_prevista_pagamento + 'T12:00:00');
          const modeMatch = viewMode === 'GLOBAL' || t.codigo_pais === viewMode;
          // Neutralização aplicada aqui também
          return dt.getMonth() === selectedMonth && dt.getFullYear() === selectedYear && t.conta_contabil_id === item.id && t.tipo !== TipoTransacao.PAGAMENTO_FATURA;
        }).reduce((acc, t) => acc + getVal(t.valor, t.codigo_pais), 0);

        const prevVal = transacoes.filter(t => {
          const dt = new Date(t.data_prevista_pagamento + 'T12:00:00');
          const modeMatch = viewMode === 'GLOBAL' || t.codigo_pais === viewMode;
          return dt.getMonth() === prevM && dt.getFullYear() === prevY && t.conta_contabil_id === item.id && t.tipo !== TipoTransacao.PAGAMENTO_FATURA;
        }).reduce((acc, t) => acc + getVal(t.valor, t.codigo_pais), 0);

        const growthPerc = prevVal > 0 ? ((currentVal / prevVal) - 1) * 100 : (currentVal > 0 ? 100 : 0);

        return { id: item.id, name: item.nome, catName: cat.nome, tipo: cat.tipo, currentVal, prevVal, growthPerc };
      });
    }).filter(i => i.currentVal > 0 || i.prevVal > 0);

    return { budgetVsActual, itemGrowth };
  }, [transacoes, orcamentos, categorias, selectedMonth, selectedYear, viewMode, exchangeRate]);

  // --- 3. DADOS COMPARATIVOS DE LINHAS ---
  const comparisonLineData = useMemo(() => {
    let start: Date, end: Date;
    const now = new Date();
    if (compRange === 'YTD') { start = new Date(now.getFullYear(), 0, 1); end = now; }
    else if (compRange === 'YoY') { start = new Date(now.getFullYear() - 1, now.getMonth(), 1); end = now; }
    else { start = new Date(customStart + 'T12:00:00'); end = new Date(customEnd + 'T12:00:00'); }

    const points: any[] = [];
    let curr = new Date(start.getFullYear(), start.getMonth(), 1);
    while (curr <= end) {
      const m = curr.getMonth();
      const y = curr.getFullYear();
      const point: any = { label: `${months[m]}/${y.toString().slice(2)}`, month: m, year: y };
      if (compCatId === 'ALL') {
        categorias.filter(c => c.tipo === TipoTransacao.DESPESA).forEach(cat => {
          point[`act_${cat.id}`] = transacoes.filter(t => {
            const dt = new Date(t.data_prevista_pagamento + 'T12:00:00');
            const modeMatch = viewMode === 'GLOBAL' || t.codigo_pais === viewMode;
            // Neutralização aplicada nas séries temporais de despesa
            return dt.getMonth() === m && dt.getFullYear() === y && t.categoria_id === cat.id && modeMatch && t.tipo !== TipoTransacao.PAGAMENTO_FATURA;
          }).reduce((acc, t) => acc + getVal(t.valor, t.codigo_pais), 0);
          if (showBudget) {
            point[`bud_${cat.id}`] = orcamentos.filter(o => {
              const modeMatch = viewMode === 'GLOBAL' || o.codigo_pais === viewMode;
              return o.ano === y && o.mes === m && o.categoria_id === cat.id && modeMatch;
            }).reduce((acc, o) => acc + getVal(o.valor_meta, o.codigo_pais), 0);
          }
        });
      } else {
        const cat = categorias.find(c => c.id === compCatId);
        if (cat) {
          let totalAct = 0;
          cat.contas.forEach(item => {
            const val = transacoes.filter(t => {
              const dt = new Date(t.data_prevista_pagamento + 'T12:00:00');
              const modeMatch = viewMode === 'GLOBAL' || t.codigo_pais === viewMode;
              // Neutralização aplicada
              return dt.getMonth() === m && dt.getFullYear() === y && t.conta_contabil_id === item.id && modeMatch && t.tipo !== TipoTransacao.PAGAMENTO_FATURA;
            }).reduce((acc, t) => acc + getVal(t.valor, t.codigo_pais), 0);
            point[`act_${item.id}`] = val; totalAct += val;
          });
          point[`act_total`] = totalAct;
          if (showBudget) point[`bud_total`] = orcamentos.filter(o => {
            const modeMatch = viewMode === 'GLOBAL' || o.codigo_pais === viewMode;
            return o.ano === y && o.mes === m && o.categoria_id === cat.id && modeMatch;
          }).reduce((acc, o) => acc + getVal(o.valor_meta, o.codigo_pais), 0);
        }
      }
      points.push(point);
      curr.setMonth(curr.getMonth() + 1);
    }
    return points;
  }, [transacoes, orcamentos, categorias, compRange, compCatId, showBudget, customStart, customEnd, viewMode, exchangeRate]);

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500 pb-24">
      {/* HEADER ANALÍTICO */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-6">
        <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-100 shadow-inner">
           {[
             { id: 'COMPOSICAO', label: 'Resumo Mensal', icon: '📊' },
             { id: 'EVOLUCAO', label: 'Evolução', icon: '📈' },
             { id: 'INSIGHTS', label: 'Desvios & Insights', icon: '🔍' }
           ].map(tab => (
             <button 
               key={tab.id}
               onClick={() => setActiveAnalysis(tab.id as any)}
               className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${activeAnalysis === tab.id ? 'bg-bb-blue text-white shadow-lg' : 'text-gray-400 hover:text-bb-blue'}`}
             >
               <span>{tab.icon}</span> {tab.label}
             </button>
           ))}
        </div>

        <div className="flex gap-4 items-center">
          {viewMode === 'GLOBAL' && (
            <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 flex items-center gap-2">
              <span className="text-[10px] font-black text-emerald-600 uppercase italic">Câmbio do dia:</span>
              <span className="text-xs font-black text-emerald-700 italic">R$ {exchangeRate.toFixed(2)}</span>
            </div>
          )}
          <div className="flex gap-2">
            <select className="bg-gray-50 p-2.5 rounded-xl text-[10px] font-black uppercase outline-none shadow-inner border-none" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="bg-gray-50 p-2.5 rounded-xl text-[10px] font-black uppercase outline-none shadow-inner border-none" value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
              {["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {activeAnalysis === 'INSIGHTS' && (
        <div className="space-y-10 animate-in slide-in-from-bottom-10 duration-700">
           {/* PAINEL DE DESTAQUES */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* DESVIOS DE ORÇAMENTO */}
              <div className="bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-xl space-y-6">
                 <div>
                    <h4 className="text-[11px] font-black text-bb-blue uppercase italic tracking-widest">Alerta de Orçamento</h4>
                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 italic">Categorias com maior desvio (Real vs Orçado)</p>
                 </div>
                 <div className="space-y-4">
                    {insightsData.budgetVsActual
                      .sort((a, b) => Math.abs(b.diffPerc) - Math.abs(a.diffPerc))
                      .slice(0, 4)
                      .map(item => (
                        <div key={item.id} className="flex items-center justify-between p-5 bg-gray-50 rounded-3xl border border-transparent hover:border-bb-blue/10 transition-all">
                           <div className="flex flex-col">
                              <span className="text-[10px] font-black uppercase text-bb-blue italic">{item.name}</span>
                              <span className="text-[8px] font-bold text-gray-400 uppercase">Orçado: {formatCur(item.budget)}</span>
                           </div>
                           <div className="text-right">
                              <span className={`text-[11px] font-black italic block ${
                                item.tipo === TipoTransacao.DESPESA 
                                ? (item.diffPerc > 0 ? 'text-red-500' : 'text-emerald-500')
                                : (item.diffPerc >= 0 ? 'text-emerald-600' : 'text-red-500')
                              }`}>
                                {item.diffPerc >= 0 ? '+' : ''}{item.diffPerc.toFixed(1)}%
                              </span>
                              <span className="text-[8px] font-bold text-gray-400 uppercase">Real: {formatCur(item.actual)}</span>
                           </div>
                        </div>
                    ))}
                 </div>
              </div>

              {/* VARIAÇÕES DE ITENS */}
              <div className="bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-xl space-y-6">
                 <div>
                    <h4 className="text-[11px] font-black text-emerald-600 uppercase italic tracking-widest">Evolução de Itens</h4>
                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 italic">Maior variação contra o mês anterior</p>
                 </div>
                 <div className="space-y-4">
                    {insightsData.itemGrowth
                      .sort((a, b) => Math.abs(b.growthPerc) - Math.abs(a.growthPerc))
                      .slice(0, 4)
                      .map(item => (
                        <div key={item.id} className="flex items-center justify-between p-5 bg-gray-50 rounded-3xl border border-transparent hover:border-emerald-600/10 transition-all">
                           <div className="flex flex-col">
                              <span className="text-[10px] font-black uppercase text-gray-700">{item.name}</span>
                              <span className="text-[8px] font-bold text-gray-400 uppercase italic">{item.catName}</span>
                           </div>
                           <div className="text-right">
                              <span className={`text-[11px] font-black italic block ${item.growthPerc > 0 ? 'text-orange-500' : 'text-emerald-500'}`}>
                                {item.growthPerc >= 0 ? '↑' : '↓'} {Math.abs(item.growthPerc).toFixed(1)}%
                              </span>
                              <span className="text-[8px] font-bold text-gray-400 uppercase">Anterior: {formatCur(item.prevVal)}</span>
                           </div>
                        </div>
                    ))}
                 </div>
              </div>
           </div>

           {/* TABELA COMPLETA DE PERFORMANCE */}
           <div className="bg-white rounded-[4rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-10 border-b border-gray-50">
                 <h4 className="text-[12px] font-black text-bb-blue uppercase italic tracking-[0.2em]">Matriz de Performance Financeira</h4>
                 <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Visão completa de desvios e crescimentos por categoria</p>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left text-[11px]">
                    <thead className="bg-gray-50 text-bb-blue font-black uppercase italic">
                       <tr>
                          <th className="px-8 py-6">Categoria</th>
                          <th className="px-8 py-6 text-right">Orçado</th>
                          <th className="px-8 py-6 text-right">Realizado</th>
                          <th className="px-8 py-6 text-center">Aderência (%)</th>
                          <th className="px-8 py-6 text-right">Variação Nominal</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                       {insightsData.budgetVsActual.map(row => (
                         <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-8 py-6 font-black uppercase italic text-gray-700">{row.name}</td>
                            <td className="px-8 py-6 text-right text-gray-400 font-bold">{formatCur(row.budget)}</td>
                            <td className="px-8 py-6 text-right text-bb-blue font-black">{formatCur(row.actual)}</td>
                            <td className="px-8 py-6 text-center">
                               <div className="flex items-center justify-center gap-3">
                                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                     <div className={`h-full rounded-full ${row.diffPerc > 0 ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(Math.abs(row.diffPerc), 100)}%` }}></div>
                                  </div>
                                  <span className={`font-black ${row.diffPerc > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{row.diffPerc.toFixed(1)}%</span>
                               </div>
                            </td>
                            <td className={`px-8 py-6 text-right font-black ${row.actual - row.budget > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                               {formatCur(row.actual - row.budget)}
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {activeAnalysis === 'COMPOSICAO' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm flex flex-col items-center">
             <h4 className="text-[11px] font-black text-bb-blue uppercase italic tracking-widest mb-8 text-center">Composição de Gastos</h4>
             <div className="h-[300px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie data={compositionData.data} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value">
                      {compositionData.data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCur(v)} contentStyle={{borderRadius: '20px', border:'none', boxShadow:'0 10px 20px rgba(0,0,0,0.1)', fontSize:'10px'}} />
                 </PieChart>
               </ResponsiveContainer>
             </div>
             <div className="mt-6 text-center">
                <p className="text-[10px] font-black text-gray-400 uppercase">Total do Mês</p>
                <p className="text-3xl font-black text-bb-blue italic">{formatCur(compositionData.total)}</p>
             </div>
           </div>

           <div className="bg-white p-8 rounded-[3.5rem] border border-gray-100 shadow-sm space-y-4">
              <h4 className="text-[10px] font-black text-bb-blue uppercase italic tracking-widest mb-4">Detalhamento Nominal</h4>
              {compositionData.data.map((c, i) => (
                <div key={c.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-bb-blue/5 transition-all group">
                  <div className="flex items-center gap-4">
                     <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[i % COLORS.length]}}></div>
                     <span className="text-[10px] font-black uppercase text-gray-700">{c.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-bb-blue">{formatCur(c.value)}</p>
                    <p className="text-[8px] font-bold text-gray-400 uppercase">{c.percent.toFixed(1)}%</p>
                  </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {activeAnalysis === 'EVOLUCAO' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
          <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-bb-blue uppercase italic tracking-widest">Período</label>
              <div className="flex bg-gray-100 p-1 rounded-xl">
                 {['YTD', 'YoY', 'CUSTOM'].map(r => (
                   <button key={r} onClick={() => setCompRange(r as any)} className={`flex-1 py-2 rounded-lg text-[9px] font-black transition-all ${compRange === r ? 'bg-bb-blue text-white shadow-md' : 'text-gray-400'}`}>{r}</button>
                 ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-bb-blue uppercase italic tracking-widest">Categoria</label>
              <select className="w-full bg-gray-50 p-3 rounded-xl text-[10px] font-black uppercase outline-none shadow-inner border-none" value={compCatId} onChange={e => setCompCatId(e.target.value)}>
                <option value="ALL">Todas</option>
                {categorias.filter(c => c.tipo === TipoTransacao.DESPESA).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-bb-blue uppercase italic tracking-widest">Opções</label>
              <button onClick={() => setShowBudget(!showBudget)} className={`w-full py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 border ${showBudget ? 'bg-bb-yellow/10 border-bb-yellow text-bb-blue' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                {showBudget ? '✅ Orçado On' : '⬜ Orçado Off'}
              </button>
            </div>
            {compRange === 'CUSTOM' && (
              <div className="space-y-2 flex gap-2">
                <input type="date" className="flex-1 bg-gray-50 p-2 rounded-lg text-[9px] font-bold" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                <input type="date" className="flex-1 bg-gray-50 p-2 rounded-lg text-[9px] font-bold" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            )}
          </div>

          <div className="bg-white p-12 rounded-[4rem] border border-gray-100 shadow-sm">
            <div className="h-[500px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={comparisonLineData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: '900', fill: '#0038a8' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: '700', fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: '25px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'black' }} formatter={(val: number) => formatCur(val)} />
                  <Legend iconType="circle" wrapperStyle={{paddingTop: '20px', fontSize: '10px', fontWeight: 'black', textTransform: 'uppercase'}} />
                  {compCatId === 'ALL' ? (
                    categorias.filter(c => c.tipo === TipoTransacao.DESPESA).map((cat, idx) => (
                      <React.Fragment key={cat.id}>
                        <Line type="monotone" dataKey={`act_${cat.id}`} stroke={COLORS[idx % COLORS.length]} name={cat.nome} strokeWidth={4} dot={{ r: 4 }} />
                        {showBudget && <Line type="monotone" dataKey={`bud_${cat.id}`} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} strokeDasharray="5 5" dot={false} name={`${cat.nome} (Meta)`} opacity={0.3} />}
                      </React.Fragment>
                    ))
                  ) : (
                    <>
                      <Area type="monotone" dataKey="act_total" fill="#0038a8" fillOpacity={0.05} stroke="#0038a8" strokeWidth={5} name="Total Real" />
                      {showBudget && <Line type="monotone" dataKey="bud_total" stroke="#0038a8" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Total Meta" opacity={0.5} />}
                      {categorias.find(c => c.id === compCatId)?.contas.map((item, idx) => (
                        <Line key={item.id} type="monotone" dataKey={`act_${item.id}`} stroke={COLORS[idx % COLORS.length]} name={item.nome} strokeWidth={2} dot={{ r: 3 }} />
                      ))}
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
