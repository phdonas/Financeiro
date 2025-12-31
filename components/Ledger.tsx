
import React, { useState, useMemo } from 'react';
import { Transacao, TipoTransacao, StatusTransacao, CategoriaContabil, FormaPagamento } from '../types';

interface LedgerProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  transacoes: Transacao[];
  categorias: CategoriaContabil[];
  formasPagamento: FormaPagamento[];
  onSave: (t: Transacao) => void;
  onDelete: (id: string) => void;
}

const Ledger: React.FC<LedgerProps> = ({ viewMode, transacoes, categorias, formasPagamento, onSave, onDelete }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);

  const initialForm: Partial<Transacao> = {
    description: '', 
    observacao: '',
    valor: 0, 
    codigo_pais: viewMode === 'GLOBAL' ? 'PT' : viewMode,
    tipo: TipoTransacao.DESPESA, 
    data_prevista_pagamento: new Date().toISOString().split('T')[0],
    categoria_id: '', 
    conta_contabil_id: '', 
    forma_pagamento_id: '',
    status: 'PENDENTE',
    saldo_devedor_restante: 0,
    parcela_atual: 1,
    total_parcelas: 1,
    juros_pagos: 0,
    capital_amortizado: 0,
    recorrencia: { ativo: false, tipo_frequencia: 'MESES', vezes_por_ano: 12, quantidade_anos: 1, meses_selecionados: [] }
  };

  const [formData, setFormData] = useState<Partial<Transacao>>(initialForm);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    const baseTx = {
      ...formData,
      workspace_id: 'fam_01',
      origem: 'MANUAL',
      id: editingTxId || Math.random().toString(36).substr(2, 9)
    };

    onSave(baseTx as Transacao);
    setIsModalOpen(false);
    setEditingTxId(null);
    setFormData(initialForm);
  };

  const filteredTxs = useMemo(() => {
    return transacoes.filter(t => viewMode === 'GLOBAL' || t.codigo_pais === viewMode)
      .sort((a, b) => b.data_prevista_pagamento.localeCompare(a.data_prevista_pagamento));
  }, [transacoes, viewMode]);

  const getStatusStyle = (status: StatusTransacao) => {
    switch (status) {
      case 'PAGO': return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      case 'ATRASADO': return 'bg-red-100 text-red-700 border border-red-200';
      case 'PLANEJADO': return 'bg-blue-50 text-blue-600 border border-blue-100';
      default: return 'bg-orange-50 text-orange-600 border border-orange-100';
    }
  };

  const getRowBg = (status: StatusTransacao) => {
    if (status === 'ATRASADO') return 'bg-red-50/30';
    if (status === 'PAGO') return 'bg-emerald-50/10';
    return '';
  };

  return (
    <div className="p-6 space-y-6 pb-24 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-4">
        <div>
           <h3 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Extrato PHD</h3>
           <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 italic tracking-widest">Controle de Fluxo e Auditoria PHD</p>
        </div>
        <button onClick={() => { setFormData(initialForm); setEditingTxId(null); setIsModalOpen(true); }} className="bg-bb-blue text-white px-8 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg hover:scale-105 active:scale-95 transition-all">➕ Novo Lançamento</button>
      </div>

      <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-gray-50 text-bb-blue uppercase font-black italic border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Categoria / Item</th>
                <th className="px-6 py-4">Descrição</th>
                <th className="px-6 py-4 text-right">Valor</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTxs.map((t) => (
                <tr key={t.id} className={`hover:bg-gray-50 transition-colors group ${getRowBg(t.status)}`}>
                  <td className="px-6 py-4 text-gray-400 font-bold italic">{t.data_prevista_pagamento.split('-').reverse().join('/')}</td>
                  <td className="px-6 py-4">
                    <span className="text-bb-blue font-black uppercase text-[10px] block mb-0.5 leading-none">{categorias.find(c => c.id === t.categoria_id)?.nome}</span>
                    <span className="text-gray-400 text-[9px] uppercase italic font-bold leading-none">{categorias.find(c => c.id === t.categoria_id)?.contas.find(i => i.id === t.conta_contabil_id)?.nome}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-black text-gray-700 uppercase italic leading-none mb-1 text-[12px]">{t.description}</p>
                    {t.observacao && <p className="text-[9px] text-bb-blue font-bold italic truncate max-w-[200px]">📝 {t.observacao}</p>}
                  </td>
                  <td className={`px-6 py-4 text-right font-black text-[13px] italic ${t.tipo === TipoTransacao.RECEITA ? 'text-emerald-600' : 'text-bb-blue'}`}>
                    {t.codigo_pais === 'PT' ? '€' : 'R$'} {t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusStyle(t.status)}`}>{t.status}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => { setFormData(t); setEditingTxId(t.id); setIsModalOpen(true); }} className="w-8 h-8 bg-bb-blue text-white rounded-lg flex items-center justify-center shadow-md">✏️</button>
                      <button onClick={() => onDelete(t.id)} className="w-8 h-8 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white border border-red-100">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl p-10 space-y-8 animate-in zoom-in duration-300 overflow-y-auto max-h-[95vh] scrollbar-hide">
             <div className="flex justify-between items-start border-b border-gray-100 pb-6">
               <div>
                 <h3 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Registro de Fluxo</h3>
                 <p className="text-[10px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">Mapeamento de Extrato e Amortização</p>
               </div>
               <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-50 w-10 h-10 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 transition-all border border-gray-100">✕</button>
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-7 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Data Referência</label>
                          <input type="date" required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none focus:ring-2 focus:ring-bb-blue/20" value={formData.data_prevista_pagamento} onChange={e => setFormData({...formData, data_prevista_pagamento: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Tipo</label>
                          <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                             <button type="button" onClick={() => setFormData({...formData, tipo: TipoTransacao.DESPESA})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.tipo === TipoTransacao.DESPESA ? 'bg-white text-red-500 shadow-sm border border-gray-100' : 'text-gray-400'}`}>Saída</button>
                             <button type="button" onClick={() => setFormData({...formData, tipo: TipoTransacao.RECEITA})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.tipo === TipoTransacao.RECEITA ? 'bg-white text-emerald-600 shadow-sm border border-gray-100' : 'text-gray-400'}`}>Entrada</button>
                          </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Categoria</label>
                          <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none focus:ring-2 focus:ring-bb-blue/20" value={formData.categoria_id} onChange={e => setFormData({...formData, categoria_id: e.target.value, conta_contabil_id: ''})}><option value="">Selecione...</option>{categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Item</label>
                          <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none focus:ring-2 focus:ring-bb-blue/20" value={formData.conta_contabil_id} onChange={e => setFormData({...formData, conta_contabil_id: e.target.value})}><option value="">Selecione...</option>{categorias.find(c => c.id === formData.categoria_id)?.contas.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Descrição</label>
                      <input required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none focus:ring-2 focus:ring-bb-blue/20" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Identificador da transação..." />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Valor</label>
                          <div className="relative">
                             <input type="number" step="0.01" required className="w-full bg-bb-blue/5 p-5 rounded-xl text-2xl font-black text-bb-blue border border-bb-blue/10 outline-none focus:ring-4 focus:ring-bb-blue/10 pl-12" value={formData.valor || ''} onChange={e => setFormData({...formData, valor: Number(e.target.value)})} placeholder="0,00" />
                             <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-bb-blue opacity-30 italic">{formData.codigo_pais === 'PT' ? '€' : 'R$'}</span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Conta / Origem</label>
                          <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none" value={formData.forma_pagamento_id} onChange={e => setFormData({...formData, forma_pagamento_id: e.target.value})}><option value="">Selecione o banco...</option>{formasPagamento.map(fp => <option key={fp.id} value={fp.id}>{fp.nome}</option>)}</select>
                        </div>
                    </div>
                </div>
                
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-gray-50/50 p-6 rounded-[1.5rem] border border-gray-100 space-y-6">
                        <h4 className="text-[11px] font-black text-bb-blue uppercase italic tracking-widest border-b border-gray-200 pb-3">Gestão de Habitação</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Parcela Atual</label>
                            <input type="number" className="w-full bg-white p-3 rounded-xl text-xs font-black border border-gray-100" value={formData.parcela_atual || ''} onChange={e => setFormData({...formData, parcela_atual: Number(e.target.value)})} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Total Parcelas</label>
                            <input type="number" className="w-full bg-white p-3 rounded-xl text-xs font-black border border-gray-100" value={formData.total_parcelas || ''} onChange={e => setFormData({...formData, total_parcelas: Number(e.target.value)})} />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                           <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Saldo Devedor Restante</label>
                           <div className="relative">
                              <input type="number" className="w-full bg-white p-3 rounded-xl text-xs font-black border border-gray-100 pl-8" value={formData.saldo_devedor_restante || ''} onChange={e => setFormData({...formData, saldo_devedor_restante: Number(e.target.value)})} />
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black opacity-30">€</span>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Juros Pagos</label>
                            <input type="number" step="0.01" className="w-full bg-white p-3 rounded-xl text-xs font-black border border-gray-100" value={formData.juros_pagos || ''} onChange={e => setFormData({...formData, juros_pagos: Number(e.target.value)})} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Capital Amortizado</label>
                            <input type="number" step="0.01" className="w-full bg-white p-3 rounded-xl text-xs font-black border border-gray-100" value={formData.capital_amortizado || ''} onChange={e => setFormData({...formData, capital_amortizado: Number(e.target.value)})} />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Observações Técnicas</label>
                          <textarea className="w-full bg-white p-3 rounded-xl text-[10px] font-bold border border-gray-100 outline-none h-20" value={formData.observacao} onChange={e => setFormData({...formData, observacao: e.target.value})} placeholder="Detalhes de amortização ou taxas..."></textarea>
                        </div>
                    </div>
                </div>
             </div>
             
             <div className="flex flex-wrap justify-between items-center bg-gray-50 p-6 rounded-[1.5rem] border border-gray-100 gap-6">
                <div className="flex-1 min-w-[300px]">
                   <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2 mb-2 block">Estágio do Lançamento</label>
                   <div className="grid grid-cols-4 gap-2">
                      {['PLANEJADO', 'PENDENTE', 'PAGO', 'ATRASADO'].map((st) => (
                        <button 
                          key={st}
                          type="button"
                          onClick={() => setFormData({...formData, status: st as StatusTransacao})}
                          className={`py-3 rounded-xl text-[9px] font-black uppercase transition-all border ${formData.status === st ? 'bg-bb-blue text-white border-bb-blue shadow-md' : 'bg-white text-gray-400 border-gray-100 hover:border-bb-blue/20'}`}
                        >
                          {st}
                        </button>
                      ))}
                   </div>
                </div>
                <div className="flex gap-6 items-center sm:ml-auto">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="text-[11px] font-black uppercase text-gray-400 hover:text-red-500 italic transition-all">Descartar</button>
                   <button type="submit" className="bg-bb-blue text-white px-12 py-4 rounded-xl text-[12px] font-black uppercase shadow-lg tracking-[0.1em] hover:scale-105 active:scale-95 transition-all">Sincronizar Dados</button>
                </div>
             </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Ledger;
