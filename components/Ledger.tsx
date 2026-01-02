
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

const Ledger: React.FC<LedgerProps> = ({
  viewMode,
  transacoes = [],
  categorias = [],
  formasPagamento = [],
  onSave,
  onDelete,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>('');

  const initialForm: Partial<Transacao> = {
    description: '', 
    observacao: '',
    valor: 0, 
    codigo_pais: viewMode === 'GLOBAL' ? 'PT' : viewMode,
    tipo: TipoTransacao.DESPESA, 
    data_competencia: new Date().toISOString().split('T')[0],
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
    recorrencia: { ativo: false, tipo_frequencia: 'MESES', vezes_por_ano: 1, quantidade_anos: 1, meses_selecionados: [] }
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
    return transacoes.filter(t => {
      const matchCountry = viewMode === 'GLOBAL' || t.codigo_pais === viewMode;
      const matchCat = !catFilter || t.categoria_id === catFilter;
      return matchCountry && matchCat;
    }).sort((a, b) => b.data_prevista_pagamento.localeCompare(a.data_prevista_pagamento));
  }, [transacoes, viewMode, catFilter]);

  const stats = useMemo(() => {
    return filteredTxs.reduce((acc, t) => {
      const val = t.valor || 0;
      if (t.tipo === TipoTransacao.RECEITA) acc.entradas += val;
      else acc.saidas += val;
      return acc;
    }, { entradas: 0, saidas: 0 });
  }, [filteredTxs]);

  const getStatusStyle = (status: StatusTransacao) => {
    switch (status) {
      case 'PAGO': return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      case 'ATRASADO': return 'bg-red-100 text-red-700 border border-red-200';
      case 'PLANEJADO': return 'bg-blue-50 text-blue-600 border border-blue-100';
      default: return 'bg-orange-50 text-orange-600 border border-orange-100';
    }
  };

  return (
    <div className="p-6 space-y-6 pb-24 animate-in fade-in duration-500">
      {/* Resumo Rápido PHD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <p className="text-[9px] font-black text-emerald-600 uppercase italic tracking-widest mb-1">Total Entradas (Filtrado)</p>
          <p className="text-2xl font-black text-bb-blue italic">{viewMode === 'PT' ? '€' : 'R$'} {stats.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <p className="text-[9px] font-black text-red-500 uppercase italic tracking-widest mb-1">Total Saídas (Filtrado)</p>
          <p className="text-2xl font-black text-bb-blue italic">{viewMode === 'PT' ? '€' : 'R$'} {stats.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-bb-blue p-6 rounded-[2rem] shadow-xl">
          <p className="text-[9px] font-black text-blue-200 uppercase italic tracking-widest mb-1">Saldo do Período</p>
          <p className="text-2xl font-black text-white italic">{viewMode === 'PT' ? '€' : 'R$'} {(stats.entradas - stats.saidas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-6">
           <div>
              <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Extrato PHD</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 italic tracking-widest">Auditoria e Conciliação</p>
           </div>
           <select 
             className="bg-gray-50 p-3 rounded-xl text-[10px] font-black uppercase border-none outline-none focus:ring-1 focus:ring-bb-blue/20"
             value={catFilter}
             onChange={e => setCatFilter(e.target.value)}
           >
             <option value="">Todas Categorias</option>
             {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
           </select>
        </div>
        <button onClick={() => { setFormData(initialForm); setEditingTxId(null); setIsModalOpen(true); }} className="bg-bb-blue text-white px-8 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg hover:scale-105 active:scale-95 transition-all">➕ Novo Lançamento</button>
      </div>

      <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-gray-50 text-bb-blue uppercase font-black italic border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Datas (Comp/Pag)</th>
                <th className="px-6 py-4">Categoria / Banco</th>
                <th className="px-6 py-4">Descrição</th>
                <th className="px-6 py-4 text-right">Valor</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTxs.map((t) => (
                <tr key={t.id} className={`hover:bg-gray-50 transition-colors group ${t.status === 'ATRASADO' ? 'bg-red-50/20' : ''}`}>
                  <td className="px-6 py-4">
                    <p className="text-gray-400 font-bold italic">{t.data_competencia?.split('-').reverse().join('/') || t.data_prevista_pagamento.split('-').reverse().join('/')}</p>
                    <p className="text-[9px] text-bb-blue font-black uppercase tracking-tighter opacity-40">Pago: {t.data_prevista_pagamento.split('-').reverse().join('/')}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-bb-blue font-black uppercase text-[10px] block mb-0.5 leading-none">{categorias.find(c => c.id === t.categoria_id)?.nome}</span>
                    <span className="text-gray-400 text-[9px] uppercase italic font-bold leading-none">
                      🏦 {formasPagamento.find(f => f.id === t.forma_pagamento_id)?.nome || 'Sem Banco'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-black text-gray-700 uppercase italic leading-none text-[12px]">{t.description}</p>
                      {t.recorrencia?.ativo && <span title="Recorrente" className="text-[10px]">🔁</span>}
                    </div>
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
          <form onSubmit={handleSave} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl p-10 space-y-8 animate-in zoom-in duration-300 overflow-y-auto max-h-[95vh] scrollbar-hide">
             <div className="flex justify-between items-start border-b border-gray-100 pb-6">
               <div>
                 <h3 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Registro de Fluxo PHD</h3>
                 <p className="text-[10px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">Mapeamento Contábil e Recorrência</p>
               </div>
               <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-50 w-10 h-10 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 transition-all border border-gray-100">✕</button>
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-7 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Data Competência</label>
                          <input type="date" required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.data_competencia} onChange={e => setFormData({...formData, data_competencia: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Data Pagamento</label>
                          <input type="date" required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.data_prevista_pagamento} onChange={e => setFormData({...formData, data_prevista_pagamento: e.target.value})} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Tipo de Fluxo</label>
                          <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                             <button type="button" onClick={() => setFormData({...formData, tipo: TipoTransacao.DESPESA})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.tipo === TipoTransacao.DESPESA ? 'bg-white text-red-500 shadow-sm border border-gray-100' : 'text-gray-400'}`}>Saída</button>
                             <button type="button" onClick={() => setFormData({...formData, tipo: TipoTransacao.RECEITA})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.tipo === TipoTransacao.RECEITA ? 'bg-white text-emerald-600 shadow-sm border border-gray-100' : 'text-gray-400'}`}>Entrada</button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Banco / Conta</label>
                          <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.forma_pagamento_id} onChange={e => setFormData({...formData, forma_pagamento_id: e.target.value})}><option value="">Selecione banco...</option>{formasPagamento.map(fp => <option key={fp.id} value={fp.id}>{fp.nome}</option>)}</select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Categoria</label>
                          <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.categoria_id} onChange={e => setFormData({...formData, categoria_id: e.target.value, conta_contabil_id: ''})}><option value="">Selecione...</option>{categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Item Específico</label>
                          <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.conta_contabil_id} onChange={e => setFormData({...formData, conta_contabil_id: e.target.value})}><option value="">Selecione...</option>{categorias.find(c => c.id === formData.categoria_id)?.contas.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Identificador (Descrição)</label>
                      <input required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Ex: Aluguel Fevereiro..." />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Valor da Operação</label>
                      <div className="relative">
                         <input type="number" step="0.01" required className="w-full bg-bb-blue/5 p-5 rounded-xl text-2xl font-black text-bb-blue border border-bb-blue/10 outline-none focus:ring-4 focus:ring-bb-blue/10 pl-12" value={formData.valor || ''} onChange={e => setFormData({...formData, valor: Number(e.target.value)})} placeholder="0,00" />
                         <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-bb-blue opacity-30 italic">{formData.codigo_pais === 'PT' ? '€' : 'R$'}</span>
                      </div>
                    </div>
                </div>
                
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-gray-50/50 p-6 rounded-[1.5rem] border border-gray-100 space-y-6">
                        <div className="flex justify-between items-center border-b border-gray-200 pb-3">
                           <h4 className="text-[11px] font-black text-bb-blue uppercase italic tracking-widest">Recorrência & Parcelas</h4>
                           <button type="button" onClick={() => setFormData({...formData, recorrencia: { ...formData.recorrencia!, ativo: !formData.recorrencia?.ativo }})} className={`w-10 h-5 rounded-full relative transition-all ${formData.recorrencia?.ativo ? 'bg-bb-blue' : 'bg-gray-300'}`}>
                              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${formData.recorrencia?.ativo ? 'right-0.5' : 'left-0.5'}`}></div>
                           </button>
                        </div>
                        
                        {formData.recorrencia?.ativo && (
                          <div className="space-y-4 animate-in slide-in-from-top-2">
                             <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                   <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Frequência</label>
                                   <select className="w-full bg-white p-3 rounded-xl text-xs font-black border border-gray-100" value={formData.recorrencia?.tipo_frequencia} onChange={e => setFormData({...formData, recorrencia: {...formData.recorrencia!, tipo_frequencia: e.target.value as any}})}>
                                      <option value="MESES">Mensal</option>
                                      <option value="DIAS">Dias</option>
                                   </select>
                                </div>
                                <div className="space-y-1.5">
                                   <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Repetições</label>
                                   <input type="number" className="w-full bg-white p-3 rounded-xl text-xs font-black border border-gray-100" value={formData.recorrencia?.vezes_por_ano} onChange={e => setFormData({...formData, recorrencia: {...formData.recorrencia!, vezes_por_ano: Number(e.target.value)}})} />
                                </div>
                             </div>
                             <p className="text-[8px] text-gray-400 italic font-bold">O sistema criará lançamentos futuros baseados nesta configuração para sua agenda.</p>
                          </div>
                        )}

                        <h4 className="text-[11px] font-black text-bb-blue uppercase italic tracking-widest border-b border-gray-200 pb-3">Observações Adicionais</h4>
                        <textarea className="w-full bg-white p-3 rounded-xl text-[10px] font-bold border border-gray-100 outline-none h-24" value={formData.observacao} onChange={e => setFormData({...formData, observacao: e.target.value})} placeholder="Detalhes técnicos, links ou notas de auditoria..."></textarea>
                    </div>
                </div>
             </div>
             
             <div className="flex flex-wrap justify-between items-center bg-gray-50 p-6 rounded-[1.5rem] border border-gray-100 gap-6">
                <div className="flex-1 min-w-[300px]">
                   <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2 mb-2 block">Estágio Financeiro Atual</label>
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
