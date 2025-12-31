
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
  const [foiPago, setFoiPago] = useState(false);

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
    saldo_devedor_restante: 0,
    recorrencia: { ativo: false, tipo_frequencia: 'MESES', vezes_por_ano: 12, quantidade_anos: 1, meses_selecionados: [] }
  };

  const [formData, setFormData] = useState<Partial<Transacao>>(initialForm);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const todayStr = new Date().toISOString().split('T')[0];
    const statusBase = foiPago ? 'PAGO' : (formData.data_prevista_pagamento! < todayStr ? 'ATRASADO' : 'PENDENTE');
    
    const baseTx = {
      ...formData,
      workspace_id: 'fam_01',
      origem: 'MANUAL',
      status: statusBase,
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

  return (
    <div className="p-8 space-y-8 pb-24 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[4rem] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-6">
        <div>
           <h3 className="text-3xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Extrato Premium PHD</h3>
           <p className="text-[10px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">Sincronização em tempo real com o Firebase</p>
        </div>
        <button onClick={() => { setFormData(initialForm); setEditingTxId(null); setIsModalOpen(true); }} className="bg-bb-blue text-white px-12 py-5 rounded-[2.5rem] text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-105 active:scale-95 transition-all">➕ Novo Lançamento</button>
      </div>

      <div className="bg-white rounded-[4.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-gray-50 text-bb-blue uppercase font-black italic border-b border-gray-100">
              <tr>
                <th className="px-10 py-7">Data</th>
                <th className="px-10 py-7">Categoria / Item</th>
                <th className="px-10 py-7">Descrição</th>
                <th className="px-10 py-7 text-right">Valor</th>
                <th className="px-10 py-7 text-center">Status</th>
                <th className="px-10 py-7 text-center">Gestão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTxs.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-10 py-6 text-gray-400 font-bold italic">{t.data_prevista_pagamento.split('-').reverse().join('/')}</td>
                  <td className="px-10 py-6">
                    <span className="text-bb-blue font-black uppercase text-[9px] block mb-1">{categorias.find(c => c.id === t.categoria_id)?.nome}</span>
                    <span className="text-gray-400 text-[8px] uppercase italic font-bold">{categorias.find(c => c.id === t.categoria_id)?.contas.find(i => i.id === t.conta_contabil_id)?.nome}</span>
                  </td>
                  <td className="px-10 py-6">
                    <p className="font-black text-gray-700 uppercase italic leading-none mb-1">{t.description}</p>
                    {t.observacao && <p className="text-[7px] text-bb-blue font-bold italic truncate max-w-[150px]">📝 {t.observacao}</p>}
                  </td>
                  <td className={`px-10 py-6 text-right font-black text-xs italic ${t.tipo === TipoTransacao.RECEITA ? 'text-emerald-600' : 'text-bb-blue'}`}>
                    {t.codigo_pais === 'PT' ? '€' : 'R$'} {t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-10 py-6 text-center">
                    <span className={`px-5 py-2 rounded-full text-[8px] font-black uppercase tracking-widest ${t.status === 'PAGO' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>{t.status}</span>
                  </td>
                  <td className="px-10 py-6 text-center">
                    <div className="flex gap-3 justify-center opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100">
                      <button onClick={() => { setFormData(t); setEditingTxId(t.id); setFoiPago(t.status === 'PAGO'); setIsModalOpen(true); }} className="w-8 h-8 bg-bb-blue text-white rounded-xl flex items-center justify-center shadow-lg">✏️</button>
                      <button onClick={() => onDelete(t.id)} className="w-8 h-8 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/80 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="bg-white rounded-[5rem] shadow-2xl w-full max-w-6xl p-16 space-y-12 animate-in zoom-in duration-500 overflow-y-auto max-h-[95vh] scrollbar-hide border border-white/20">
             <div className="flex justify-between items-start border-b border-gray-50 pb-10">
               <div>
                 <h3 className="text-4xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Edição de Fluxo Premium</h3>
                 <p className="text-[11px] text-gray-400 font-bold uppercase mt-3 italic tracking-widest">Controle de Extrato & Gestão de Habitação</p>
               </div>
               <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-50 w-14 h-14 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 transition-all shadow-inner">✕</button>
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                <div className="lg:col-span-7 space-y-10">
                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Data de Referência</label>
                          <input type="date" required className="w-full bg-gray-50 p-7 rounded-[2.5rem] text-sm font-black border-none outline-none focus:ring-4 focus:ring-bb-blue/10 shadow-inner" value={formData.data_prevista_pagamento} onChange={e => setFormData({...formData, data_prevista_pagamento: e.target.value})} />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Tipo de Lançamento</label>
                          <div className="flex bg-gray-50 p-2 rounded-[2.5rem] shadow-inner">
                             <button type="button" onClick={() => setFormData({...formData, tipo: TipoTransacao.DESPESA})} className={`flex-1 py-5 rounded-[2rem] text-[11px] font-black uppercase transition-all ${formData.tipo === TipoTransacao.DESPESA ? 'bg-white text-red-500 shadow-md' : 'text-gray-400'}`}>Saída 💸</button>
                             <button type="button" onClick={() => setFormData({...formData, tipo: TipoTransacao.RECEITA})} className={`flex-1 py-5 rounded-[2rem] text-[11px] font-black uppercase transition-all ${formData.tipo === TipoTransacao.RECEITA ? 'bg-white text-emerald-600 shadow-md' : 'text-gray-400'}`}>Entrada 💰</button>
                          </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Categoria</label>
                          <select required className="w-full bg-gray-50 p-7 rounded-[2.5rem] text-sm font-black border-none outline-none focus:ring-4 focus:ring-bb-blue/10 shadow-inner" value={formData.categoria_id} onChange={e => setFormData({...formData, categoria_id: e.target.value, conta_contabil_id: ''})}><option value="">Selecione...</option>{categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Item Específico</label>
                          <select required className="w-full bg-gray-50 p-7 rounded-[2.5rem] text-sm font-black border-none outline-none focus:ring-4 focus:ring-bb-blue/10 shadow-inner" value={formData.conta_contabil_id} onChange={e => setFormData({...formData, conta_contabil_id: e.target.value})}><option value="">Selecione...</option>{categorias.find(c => c.id === formData.categoria_id)?.contas.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select>
                        </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Descrição do Lançamento</label>
                      <input required className="w-full bg-gray-50 p-7 rounded-[2.5rem] text-sm font-black border-none outline-none focus:ring-4 focus:ring-bb-blue/10 shadow-inner" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Ex: Supermercado Continente..." />
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Valor Nominal</label>
                          <div className="relative">
                             <input type="number" step="0.01" required className="w-full bg-bb-blue/5 p-9 rounded-[3.5rem] text-4xl font-black text-bb-blue border-none outline-none focus:ring-4 focus:ring-bb-blue/10 pl-16 shadow-inner" value={formData.valor || ''} onChange={e => setFormData({...formData, valor: Number(e.target.value)})} placeholder="0,00" />
                             <span className="absolute left-8 top-1/2 -translate-y-1/2 text-2xl font-black text-bb-blue opacity-30 italic">{formData.codigo_pais === 'PT' ? '€' : 'R$'}</span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Conta / Origem</label>
                          <select required className="w-full bg-gray-50 p-7 rounded-[2.5rem] text-sm font-black border-none outline-none focus:ring-4 focus:ring-bb-blue/10 shadow-inner" value={formData.forma_pagamento_id} onChange={e => setFormData({...formData, forma_pagamento_id: e.target.value})}><option value="">Selecione o banco...</option>{formasPagamento.map(fp => <option key={fp.id} value={fp.id}>{fp.nome}</option>)}</select>
                        </div>
                    </div>
                </div>
                
                <div className="lg:col-span-5 space-y-12">
                    <div className="bg-gray-50/80 p-12 rounded-[5rem] border border-gray-100 flex flex-col justify-between shadow-sm min-h-full">
                        <div className="space-y-10">
                           <h4 className="text-[13px] font-black text-bb-blue uppercase italic tracking-[0.4em] border-b border-gray-100 pb-8">Amortização de Habitação</h4>
                           
                           <div className="space-y-8">
                              <div className="space-y-4">
                                 <label className="text-[11px] font-black uppercase text-gray-400 italic ml-4">Saldo Devedor Restante</label>
                                 <div className="relative">
                                    <input type="number" className="w-full bg-white p-7 rounded-[2.5rem] text-2xl font-black text-bb-blue border-none outline-none shadow-inner pl-14" value={formData.saldo_devedor_restante || ''} onChange={e => setFormData({...formData, saldo_devedor_restante: Number(e.target.value)})} />
                                    <span className="absolute left-7 top-1/2 -translate-y-1/2 text-bb-blue opacity-30 font-black italic">€</span>
                                 </div>
                              </div>
                              <div className="space-y-4">
                                 <label className="text-[11px] font-black uppercase text-gray-400 italic ml-4">Observações Técnicas</label>
                                 <textarea className="w-full bg-white p-6 rounded-[2.5rem] text-xs font-bold border-none outline-none shadow-inner h-32 scrollbar-hide" value={formData.observacao} onChange={e => setFormData({...formData, observacao: e.target.value})} placeholder="Lembretes, detalhes de parcelas ou auditoria..."></textarea>
                              </div>
                           </div>
                        </div>

                        <div className="mt-12 space-y-6">
                           <button type="button" onClick={() => setFoiPago(!foiPago)} className={`w-full py-8 rounded-[3.5rem] text-[13px] font-black uppercase tracking-[0.3em] shadow-2xl transition-all ${foiPago ? 'bg-emerald-500 text-white hover:scale-105' : 'bg-white text-gray-400 border-2 border-dashed border-gray-200 hover:border-bb-blue hover:text-bb-blue'}`}>
                             {foiPago ? '✓ LANÇAMENTO LIQUIDADO' : 'PENDENTE DE PAGAMENTO'}
                           </button>
                        </div>
                    </div>
                </div>
             </div>
             
             <div className="flex flex-wrap justify-between items-center bg-gray-50 p-12 rounded-[4rem] border border-gray-100 gap-10">
                <div className="flex gap-12 items-center ml-auto">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="text-[13px] font-black uppercase text-gray-300 hover:text-red-500 italic transition-all tracking-[0.2em]">Descartar Alterações</button>
                   <button type="submit" className="bg-bb-blue text-white px-28 py-8 rounded-[3.5rem] text-[14px] font-black uppercase shadow-2xl tracking-[0.4em] hover:scale-105 active:scale-95 transition-all">Sincronizar Nuvem Premium</button>
                </div>
             </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Ledger;
