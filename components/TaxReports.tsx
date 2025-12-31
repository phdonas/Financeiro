
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
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterQuarter, setFilterQuarter] = useState<number>(1);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [launchData, setLaunchData] = useState({ data_pagamento: new Date().toISOString().split('T')[0], forma_pagamento_id: '', description: '' });

  const filteredReceipts = useMemo(() => {
    return receipts.filter(r => {
      if (r.country_code !== 'PT') return false;
      const date = new Date(r.issue_date + 'T12:00:00');
      const month = date.getMonth();
      const q = Math.floor(month / 3) + 1;
      return date.getFullYear() === filterYear && q === filterQuarter;
    });
  }, [receipts, filterYear, filterQuarter]);

  const totalIva = useMemo(() => filteredReceipts.reduce((acc, r) => acc + (r.iva_amount || 0), 0), [filteredReceipts]);

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!launchData.forma_pagamento_id) return;
    // Removed data_pagamento property which is not present in Transacao interface
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
      description: launchData.description || `IVA ${filterQuarter}T ${filterYear}`, 
      valor: totalIva, 
      status: 'PAGO', 
      origem: 'MANUAL'
    };
    onSaveTx(novaTx);
    setIsLaunchModalOpen(false);
  };

  return (
    <div className="p-8 space-y-8 pb-20">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex justify-between items-center">
        <div><h3 className="text-xl font-black text-bb-blue italic uppercase">Apuramento de IVA</h3><p className="text-[10px] text-gray-400 font-bold uppercase italic">Cálculo de Guia para Portugal</p></div>
        <div className="flex gap-4">
          <select className="bg-gray-50 p-4 rounded-2xl text-xs font-black" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>{[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}</select>
          <select className="bg-gray-50 p-4 rounded-2xl text-xs font-black" value={filterQuarter} onChange={e => setFilterQuarter(Number(e.target.value))}>{[1,2,3,4].map(q => <option key={q} value={q}>{q}T</option>)}</select>
        </div>
      </div>

      <div className="bg-bb-blue text-white p-10 rounded-[3rem] shadow-2xl flex justify-between items-center">
        <div><p className="text-blue-200 text-[10px] font-black uppercase mb-2">Total Apurado no Trimestre</p><h2 className="text-4xl font-black italic">€ {totalIva.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2></div>
        <button onClick={() => setIsLaunchModalOpen(true)} disabled={totalIva <= 0} className="bg-bb-yellow text-bb-blue px-10 py-4 rounded-2xl text-[10px] font-black uppercase shadow-xl hover:scale-105 disabled:opacity-30">Lançar Guia no Ledger</button>
      </div>

      {isLaunchModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleLaunch} className="bg-white rounded-[3rem] p-8 w-full max-w-sm space-y-6 animate-in zoom-in">
             <h3 className="text-lg font-black text-bb-blue italic uppercase tracking-tighter">Confirmar Lançamento</h3>
             <input type="date" required className="w-full bg-gray-50 p-4 rounded-2xl text-xs font-bold" value={launchData.data_pagamento} onChange={e => setLaunchData({...launchData, data_pagamento: e.target.value})} />
             <select required className="w-full bg-gray-50 p-4 rounded-2xl text-xs font-bold" value={launchData.forma_pagamento_id} onChange={e => setLaunchData({...launchData, forma_pagamento_id: e.target.value})}><option value="">Conta...</option>{formasPagamento.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
             <div className="flex gap-4 pt-4"><button type="button" onClick={() => setIsLaunchModalOpen(false)} className="flex-1 text-[10px] font-black uppercase text-gray-400">Voltar</button><button type="submit" className="flex-[2] bg-bb-blue text-white py-4 rounded-2xl text-[10px] font-black uppercase">Confirmar</button></div>
          </form>
        </div>
      )}
    </div>
  );
};

export default TaxReports;
