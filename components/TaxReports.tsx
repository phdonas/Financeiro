
import React, { useState, useMemo } from 'react';
import { Receipt, Fornecedor, Transacao, TipoTransacao, FormaPagamento } from '../types';

interface TaxReportsProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  receipts: Receipt[];
  fornecedores: Fornecedor[];
  onSaveTx: (t: Transacao) => void;
  formasPagamento: FormaPagamento[];
}

const TaxReports: React.FC<TaxReportsProps> = ({ viewMode, receipts, fornecedores, onSaveTx, formasPagamento }) => {
  const [activeTab, setActiveTab] = useState<'IVA' | 'IRS'>('IVA');
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterQuarter, setFilterQuarter] = useState<number>(1);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [launchData, setLaunchData] = useState({ data_pagamento: new Date().toISOString().split('T')[0], forma_pagamento_id: '', description: '' });

  // Cálculos IVA
  const ivaStats = useMemo(() => {
    const filtered = receipts.filter(r => {
      if (r.country_code !== 'PT') return false;
      const date = new Date(r.issue_date + 'T12:00:00');
      const q = Math.floor(date.getMonth() / 3) + 1;
      return date.getFullYear() === filterYear && q === filterQuarter;
    });
    const total = filtered.reduce((acc, r) => acc + (r.iva_amount || 0), 0);
    return { total, count: filtered.length };
  }, [receipts, filterYear, filterQuarter]);

  // Cálculos IRS Anual (Portugal)
  const irsAnual = useMemo(() => {
    const filtered = receipts.filter(r => r.country_code === 'PT' && new Date(r.issue_date + 'T12:00:00').getFullYear() === filterYear);
    const bruto = filtered.reduce((acc, r) => acc + r.base_amount, 0);
    const retencao = filtered.reduce((acc, r) => acc + (r.irs_amount || 0), 0);
    const liquido = filtered.reduce((acc, r) => acc + r.received_amount, 0);
    return { bruto, retencao, liquido, count: filtered.length };
  }, [receipts, filterYear]);

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!launchData.forma_pagamento_id) return;
    const novaTx: Transacao = {
      id: Math.random().toString(36).substr(2, 9), 
      workspace_id: 'fam_01', 
      codigo_pais: 'PT', 
      categoria_id: 'cat_impostos', 
      conta_contabil_id: 'item_iva', 
      forma_pagamento_id: launchData.forma_pagamento_id, 
      tipo: TipoTransacao.DESPESA, 
      data_competencia: launchData.data_pagamento, 
      data_prevista_pagamento: launchData.data_pagamento, 
      description: launchData.description || `Liquidação IVA ${filterQuarter}T ${filterYear}`, 
      valor: ivaStats.total, 
      status: 'PAGO', 
      origem: 'MANUAL'
    };
    onSaveTx(novaTx);
    setIsLaunchModalOpen(false);
  };

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-700 pb-24">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-6">
        <div>
           <h3 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Centro Fiscal Nuvem</h3>
           <p className="text-[10px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">Apuramento de Auditoria BR/PT</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
           <button onClick={() => setActiveTab('IVA')} className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'IVA' ? 'bg-bb-blue text-white shadow-md' : 'text-gray-400'}`}>Auditoria IVA</button>
           <button onClick={() => setActiveTab('IRS')} className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'IRS' ? 'bg-bb-blue text-white shadow-md' : 'text-gray-400'}`}>Simulação IRS</button>
        </div>
      </div>

      {activeTab === 'IVA' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-700">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-4">
                 <p className="text-[10px] font-black text-bb-blue uppercase italic tracking-widest border-b pb-2">Período de Apuramento</p>
                 <div className="grid grid-cols-2 gap-4">
                    <select className="bg-gray-50 p-3 rounded-xl text-xs font-black" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>{[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}</select>
                    <select className="bg-gray-50 p-3 rounded-xl text-xs font-black" value={filterQuarter} onChange={e => setFilterQuarter(Number(e.target.value))}>{[1,2,3,4].map(q => <option key={q} value={q}>{q}º Trimestre</option>)}</select>
                 </div>
                 <p className="text-[9px] text-gray-300 font-bold uppercase italic">{ivaStats.count} Recibos Vinculados</p>
              </div>

              <div className="md:col-span-2 bg-bb-blue p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:scale-150 transition-all"></div>
                 <div>
                    <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1 italic">Dívida IVA Liquidado</p>
                    <h2 className="text-4xl font-black text-white italic tracking-tighter">€ {ivaStats.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
                 </div>
                 <button onClick={() => setIsLaunchModalOpen(true)} disabled={ivaStats.total <= 0} className="bg-bb-yellow text-bb-blue px-10 py-4 rounded-xl text-[10px] font-black uppercase shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale">Gerar Guia Pagamento</button>
              </div>
           </div>

           <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                 <h4 className="text-[11px] font-black text-bb-blue uppercase italic">Extrato Fiscal Trimestral</h4>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left text-[11px]">
                    <thead className="bg-gray-50 text-bb-blue font-black uppercase italic">
                       <tr>
                          <th className="px-6 py-4">Fatura</th>
                          <th className="px-6 py-4">Data</th>
                          <th className="px-6 py-4">Base Tributável</th>
                          <th className="px-6 py-4 text-right">IVA Apurado</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                       {receipts.filter(r => {
                          const d = new Date(r.issue_date + 'T12:00:00');
                          const q = Math.floor(d.getMonth() / 3) + 1;
                          return r.country_code === 'PT' && d.getFullYear() === filterYear && q === filterQuarter;
                       }).map(r => (
                         <tr key={r.internal_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-black text-bb-blue">#{r.id}</td>
                            <td className="px-6 py-4 text-gray-400 font-bold">{r.issue_date.split('-').reverse().join('/')}</td>
                            <td className="px-6 py-4 font-bold">€ {r.base_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="px-6 py-4 text-right font-black text-bb-blue italic">€ {r.iva_amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'IRS' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-700">
           <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="space-y-6">
                 <div>
                    <h4 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Mapa Anual IRS</h4>
                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">Base Freelancer (Portugal)</p>
                 </div>
                 <div className="space-y-2">
                    <p className="text-[9px] font-black text-gray-400 uppercase">Faturamento Bruto</p>
                    <p className="text-2xl font-black text-bb-blue italic">€ {irsAnual.bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                 </div>
              </div>
              
              <div className="bg-gray-50 p-8 rounded-[2rem] border border-gray-100 flex flex-col justify-center">
                 <p className="text-[10px] font-black text-red-500 uppercase italic tracking-widest mb-2">Retenção na Fonte (11.5%)</p>
                 <p className="text-3xl font-black text-red-500 italic leading-none">€ {irsAnual.retencao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                 <p className="text-[8px] text-gray-400 font-bold uppercase mt-4">Simulado em {irsAnual.count} recibos</p>
              </div>

              <div className="bg-emerald-500 p-8 rounded-[2rem] shadow-xl flex flex-col justify-center">
                 <p className="text-[10px] font-black text-emerald-100 uppercase italic tracking-widest mb-2">Disponibilidade Líquida</p>
                 <p className="text-3xl font-black text-white italic leading-none">€ {irsAnual.liquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
           </div>
        </div>
      )}

      {isLaunchModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleLaunch} className="bg-white rounded-[2.5rem] p-10 w-full max-w-sm space-y-6 animate-in zoom-in duration-300 shadow-2xl">
             <div className="border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Liquidação de IVA</h3>
               <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 italic">Conformidade Autoridade Tributária</p>
             </div>
             <div className="space-y-4">
                <div className="space-y-1">
                   <label className="text-[9px] font-black text-bb-blue uppercase italic ml-1">Data Pagamento</label>
                   <input type="date" required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue" value={launchData.data_pagamento} onChange={e => setLaunchData({...launchData, data_pagamento: e.target.value})} />
                </div>
                <div className="space-y-1">
                   <label className="text-[9px] font-black text-bb-blue uppercase italic ml-1">Banco de Saída</label>
                   <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue" value={launchData.forma_pagamento_id} onChange={e => setLaunchData({...launchData, forma_pagamento_id: e.target.value})}><option value="">Selecione Banco...</option>{formasPagamento.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
                </div>
             </div>
             <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsLaunchModalOpen(false)} className="flex-1 text-[10px] font-black uppercase text-gray-400 italic">Descartar</button>
                <button type="submit" className="flex-[2] bg-bb-blue text-white py-4 rounded-xl text-[10px] font-black uppercase shadow-xl tracking-widest">Sincronizar Ledger</button>
             </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default TaxReports;
