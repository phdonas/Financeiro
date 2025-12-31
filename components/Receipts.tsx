import React, { useState, useMemo } from 'react';
import { Receipt, Fornecedor, CategoriaContabil, TipoTransacao, FormaPagamento, Transacao, StatusTransacao } from '../types';

interface ReceiptsProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  receipts: Receipt[];
  fornecedores: Fornecedor[];
  categorias: CategoriaContabil[];
  formasPagamento: FormaPagamento[];
  onSave: (r: Receipt) => void;
  onDelete: (id: string) => void;
  onSaveTx?: (t: Transacao) => void; 
}

const Receipts: React.FC<ReceiptsProps> = ({ viewMode, receipts, fornecedores, categorias, formasPagamento, onSave, onDelete, onSaveTx }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const initialForm: Partial<Receipt> = {
    id: '', 
    country_code: (viewMode === 'GLOBAL' ? 'PT' : viewMode) as 'PT' | 'BR',
    issue_date: new Date().toISOString().split('T')[0],
    base_amount: 0, 
    irs_rate: 11.5, 
    iva_rate: 23, 
    inss_rate: 11, 
    irpf_rate: 27.5,
    description: '', 
    is_paid: false,
    fornecedor_id: '',
    categoria_id: '',
    conta_contabil_id: '',
    forma_pagamento_id: '',
    flag_calcula_premiacao: false
  };

  const [formData, setFormData] = useState<Partial<Receipt>>(initialForm);

  const calcs = useMemo(() => {
    const base = formData.base_amount || 0;
    if (formData.country_code === 'PT') {
      const irs = (base * (formData.irs_rate || 0)) / 100;
      const iva = (base * (formData.iva_rate || 0)) / 100;
      return { 
        tax1: irs, tax2: iva, net: base - irs, received: (base - irs) + iva,
        tax1Label: 'Retenção IRS (-)', tax2Label: 'IVA Liquidado (+)', symbol: '€'
      };
    }
    const inss = (base * (formData.inss_rate || 0)) / 100;
    const irpf = (base * (formData.irpf_rate || 0)) / 100;
    return { 
      tax1: inss, tax2: irpf, net: base - inss - irpf, received: base - inss - irpf,
      tax1Label: 'INSS (-)', tax2Label: 'IRPF (-)', symbol: 'R$'
    };
  }, [formData]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const internalId = editingId || Math.random().toString(36).substr(2, 9);
    
    const finalReceipt: Receipt = {
      ...formData as Receipt,
      internal_id: internalId,
      workspace_id: 'fam_01',
      net_amount: calcs.net,
      received_amount: calcs.received,
      ...(formData.country_code === 'PT' ? { irs_amount: calcs.tax1, iva_amount: calcs.tax2 } : { inss_amount: calcs.tax1, irpf_amount: calcs.tax2 })
    };

    onSave(finalReceipt);

    // Lógica Relacional Versão Base: Todo recibo deve constar no extrato bancário
    if (onSaveTx) {
      onSaveTx({
        id: `TX_${internalId}`,
        workspace_id: 'fam_01',
        codigo_pais: finalReceipt.country_code,
        categoria_id: finalReceipt.categoria_id,
        conta_contabil_id: finalReceipt.conta_contabil_id,
        forma_pagamento_id: finalReceipt.forma_pagamento_id,
        tipo: TipoTransacao.RECEITA,
        data_competencia: finalReceipt.issue_date,
        data_prevista_pagamento: finalReceipt.issue_date,
        description: `${finalReceipt.description || 'Receita Fiscal'} (Ref. #${finalReceipt.id})`,
        valor: finalReceipt.received_amount,
        status: finalReceipt.is_paid ? 'PAGO' : 'PENDENTE',
        origem: 'IMPORTACAO',
        receipt_id: internalId
      } as Transacao);
    }

    setIsModalOpen(false); setEditingId(null); setFormData(initialForm);
  };

  return (
    <div className="p-8 space-y-10 pb-24 animate-in fade-in duration-500">
      <div className="bg-white p-12 rounded-[4.5rem] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-6">
        <div>
          <h3 className="text-4xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Emissões Fiscais PHD</h3>
          <p className="text-[11px] text-gray-400 font-bold uppercase mt-2 italic tracking-[0.3em]">Gestão de Recibos Brasil & Portugal</p>
        </div>
        <button onClick={() => { setFormData(initialForm); setEditingId(null); setIsModalOpen(true); }} className="bg-bb-blue text-white px-14 py-6 rounded-[3rem] text-[12px] font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-105 transition-all">📜 Emitir Novo Recibo</button>
      </div>

      <div className="bg-white rounded-[4.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-bb-blue text-white uppercase font-black italic border-b border-bb-blue">
              <tr>
                <th className="px-12 py-8">ID / Data</th>
                <th className="px-12 py-8">Entidade</th>
                <th className="px-12 py-8">Vínculo Contábil</th>
                <th className="px-12 py-8 text-right">Bruto</th>
                <th className="px-12 py-8 text-right">Crédito Final</th>
                <th className="px-12 py-8 text-center">Status</th>
                <th className="px-12 py-8 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {receipts.length === 0 ? (
                <tr><td colSpan={7} className="py-32 text-center text-gray-300 font-black uppercase italic opacity-30">Nenhum recibo sincronizado na nuvem</td></tr>
              ) : (
                receipts.map(r => (
                  <tr key={r.internal_id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-12 py-7">
                      <span className="font-black block text-bb-blue italic text-xs leading-none mb-1">#{r.id}</span>
                      <span className="text-[8px] text-gray-400 uppercase italic font-bold">{r.issue_date.split('-').reverse().join('/')}</span>
                    </td>
                    <td className="px-12 py-7">
                      <p className="font-black text-gray-700 uppercase leading-none mb-1">{fornecedores.find(s => s.id === r.fornecedor_id)?.nome || 'Não Informado'}</p>
                      <p className="text-[8px] text-gray-400 uppercase italic font-bold">{r.country_code === 'PT' ? '🇵🇹 PORTUGAL' : '🇧🇷 BRASIL'}</p>
                    </td>
                    <td className="px-12 py-7">
                      <p className="font-bold text-bb-blue uppercase text-[9px] mb-1 leading-none">{categorias.find(c => c.id === r.categoria_id)?.nome}</p>
                      <p className="text-[7px] text-gray-400 uppercase italic">{categorias.find(c => c.id === r.categoria_id)?.contas.find(i => i.id === r.conta_contabil_id)?.nome}</p>
                    </td>
                    <td className="px-12 py-7 text-right font-bold text-gray-400 italic">{r.country_code === 'PT' ? '€' : 'R$'} {r.base_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-12 py-7 text-right font-black text-bb-blue text-xs italic">{r.country_code === 'PT' ? '€' : 'R$'} {r.received_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-12 py-7 text-center">
                      <span className={`px-5 py-2 rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm ${r.is_paid ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-600'}`}>
                        {r.is_paid ? 'Liquidado' : 'Aguardando'}
                      </span>
                    </td>
                    <td className="px-12 py-7 text-center">
                      <div className="flex gap-3 justify-center opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                        <button onClick={() => { setEditingId(r.internal_id); setFormData(r); setIsModalOpen(true); }} className="w-10 h-10 bg-bb-blue text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-110">✏️</button>
                        <button onClick={() => onDelete(r.internal_id)} className="w-10 h-10 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm">✕</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/90 backdrop-blur-3xl z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="bg-white rounded-[5rem] shadow-2xl w-full max-w-7xl p-16 space-y-12 animate-in zoom-in duration-500 overflow-y-auto max-h-[95vh] scrollbar-hide border border-white/20">
             <div className="flex justify-between items-start border-b border-gray-50 pb-12">
                <div>
                  <h2 className="text-5xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Formulário de Emissão Premium</h2>
                  <p className="text-[12px] text-gray-400 font-bold uppercase mt-4 italic tracking-[0.3em] opacity-60">Sincronia Relacional de Ledger Ativada</p>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 transition-all shadow-inner">✕</button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
                {/* Coluna Esquerda: Dados do Recibo */}
                <div className="lg:col-span-7 space-y-12">
                   <div className="grid grid-cols-2 gap-10">
                      <div className="space-y-4">
                        <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Identificador Fiscal</label>
                        <input required className="w-full bg-gray-50 p-7 rounded-[2.5rem] text-sm font-black border-none outline-none focus:ring-4 focus:ring-bb-blue/10 shadow-inner" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} placeholder="Ex: NF-2024-001" />
                      </div>
                      <div className="space-y-4">
                        <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Data Competência</label>
                        <input type="date" className="w-full bg-gray-50 p-7 rounded-[2.5rem] text-sm font-black border-none outline-none focus:ring-4 focus:ring-bb-blue/10 shadow-inner" value={formData.issue_date} onChange={e => setFormData({...formData, issue_date: e.target.value})} />
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-10">
                      <div className="space-y-4">
                        <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Entidade Pagadora</label>
                        <select required className="w-full bg-gray-50 p-7 rounded-[2.5rem] text-sm font-black border-none outline-none focus:ring-4 focus:ring-bb-blue/10 shadow-inner" value={formData.fornecedor_id} onChange={e => setFormData({...formData, fornecedor_id: e.target.value})}><option value="">Selecione...</option>{fornecedores.map(s => <option key={s.id} value={s.id}>{s.nome} ({s.pais})</option>)}</select>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Regime Tributário</label>
                        <div className="flex bg-gray-50 p-2 rounded-[2.5rem] shadow-inner">
                           <button type="button" onClick={() => setFormData({...formData, country_code: 'PT'})} className={`flex-1 py-5 rounded-[2rem] text-[11px] font-black uppercase transition-all ${formData.country_code === 'PT' ? 'bg-white text-bb-blue shadow-lg' : 'text-gray-400'}`}>🇵🇹 Portugal</button>
                           <button type="button" onClick={() => setFormData({...formData, country_code: 'BR'})} className={`flex-1 py-5 rounded-[2rem] text-[11px] font-black uppercase transition-all ${formData.country_code === 'BR' ? 'bg-white text-emerald-600 shadow-lg' : 'text-gray-400'}`}>🇧🇷 Brasil</button>
                        </div>
                      </div>
                   </div>

                   <div className="space-y-4">
                     <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Valor Bruto do Faturamento</label>
                     <div className="relative">
                        <input type="number" step="0.01" className="w-full bg-bb-blue/5 p-10 rounded-[4rem] text-5xl font-black text-bb-blue border-none outline-none focus:ring-4 focus:ring-bb-blue/10 pl-20 shadow-inner" value={formData.base_amount || ''} onChange={e => setFormData({...formData, base_amount: Number(e.target.value)})} placeholder="0,00" />
                        <span className="absolute left-10 top-1/2 -translate-y-1/2 text-3xl font-black text-bb-blue opacity-30 italic">{calcs.symbol}</span>
                     </div>
                   </div>

                   <div className="grid grid-cols-2 gap-10">
                      <div className="space-y-4">
                        <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Categoria de Receita</label>
                        <select required className="w-full bg-gray-50 p-7 rounded-[2.5rem] text-sm font-black border-none outline-none focus:ring-4 focus:ring-bb-blue/10 shadow-inner" value={formData.categoria_id} onChange={e => setFormData({...formData, categoria_id: e.target.value, conta_contabil_id: ''})}><option value="">Selecione...</option>{categorias.filter(c => c.tipo === TipoTransacao.RECEITA).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Item Específico</label>
                        <select required className="w-full bg-gray-50 p-7 rounded-[2.5rem] text-sm font-black border-none outline-none focus:ring-4 focus:ring-bb-blue/10 shadow-inner" value={formData.conta_contabil_id} onChange={e => setFormData({...formData, conta_contabil_id: e.target.value})}><option value="">Selecione...</option>{categorias.find(c => c.id === formData.categoria_id)?.contas.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select>
                      </div>
                   </div>
                </div>

                {/* Coluna Direita: Painel Analítico de Impostos */}
                <div className="lg:col-span-5 space-y-12">
                   <div className="bg-gray-50/80 p-12 rounded-[5rem] border border-gray-100 flex flex-col justify-between shadow-sm min-h-full">
                      <div className="space-y-12">
                         <h4 className="text-[13px] font-black text-bb-blue uppercase italic tracking-[0.4em] border-b border-gray-100 pb-8">Painel Analítico de Retenções</h4>
                         
                         <div className="grid grid-cols-2 gap-12">
                           <div className="space-y-4">
                              <p className="text-[11px] font-black text-gray-400 uppercase italic ml-4">{calcs.tax1Label}</p>
                              <div className="relative">
                                 <input type="number" step="0.1" className="w-full bg-white p-6 rounded-[2rem] text-sm font-black shadow-inner border-none outline-none" value={formData.country_code === 'PT' ? formData.irs_rate : formData.inss_rate} onChange={e => setFormData({...formData, [formData.country_code === 'PT' ? 'irs_rate' : 'inss_rate']: Number(e.target.value)})} />
                                 <span className="absolute right-6 top-1/2 -translate-y-1/2 text-sm font-black text-gray-300">%</span>
                              </div>
                              <p className="text-sm font-black text-red-500 italic ml-4">-{calcs.symbol} {calcs.tax1.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                           </div>
                           <div className="space-y-4">
                              <p className="text-[11px] font-black text-gray-400 uppercase italic ml-4">{calcs.tax2Label}</p>
                              <div className="relative">
                                 <input type="number" step="0.1" className="w-full bg-white p-6 rounded-[2rem] text-sm font-black shadow-inner border-none outline-none" value={formData.country_code === 'PT' ? formData.iva_rate : formData.irpf_rate} onChange={e => setFormData({...formData, [formData.country_code === 'PT' ? 'iva_rate' : 'irpf_rate']: Number(e.target.value)})} />
                                 <span className="absolute right-6 top-1/2 -translate-y-1/2 text-sm font-black text-gray-300">%</span>
                              </div>
                              <p className={`text-sm font-black italic ml-4 ${formData.country_code === 'PT' ? 'text-emerald-500' : 'text-red-500'}`}>{formData.country_code === 'PT' ? '+' : '-'} {calcs.symbol} {calcs.tax2.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                           </div>
                         </div>

                         <div className="pt-12 border-t border-gray-100 space-y-8">
                           <div className="bg-white p-10 rounded-[3.5rem] border-4 border-bb-blue/10 shadow-2xl space-y-2 group hover:border-bb-blue transition-all">
                              <p className="text-[12px] font-black text-bb-blue uppercase italic tracking-widest text-center opacity-60">Disponibilidade Líquida em Conta</p>
                              <p className="text-5xl font-black text-bb-blue italic text-center leading-none tabular-nums">{calcs.symbol} {calcs.received.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                           </div>
                         </div>
                      </div>

                      <div className="mt-12 space-y-6">
                        <label className="text-[11px] font-black uppercase text-bb-blue italic ml-6 tracking-widest">Conta Bancária Destino</label>
                        <select required className="w-full bg-white p-7 rounded-[2.5rem] text-sm font-black shadow-inner border-none outline-none focus:ring-4 focus:ring-bb-blue/10" value={formData.forma_pagamento_id} onChange={e => setFormData({...formData, forma_pagamento_id: e.target.value})}><option value="">Selecione o banco...</option>{formasPagamento.map(fp => <option key={fp.id} value={fp.id}>{fp.nome}</option>)}</select>
                        
                        <button type="button" onClick={() => setFormData({...formData, is_paid: !formData.is_paid})} className={`w-full py-8 rounded-[3.5rem] text-[13px] font-black uppercase tracking-[0.3em] shadow-2xl transition-all ${formData.is_paid ? 'bg-emerald-500 text-white hover:scale-105' : 'bg-white text-gray-400 border-2 border-dashed border-gray-200 hover:border-bb-blue hover:text-bb-blue'}`}>
                          {formData.is_paid ? '✓ RECIBO QUITADO' : 'AGUARDANDO PAGAMENTO'}
                        </button>
                      </div>
                   </div>
                </div>
             </div>

             <div className="flex flex-wrap justify-between items-center bg-gray-50 p-12 rounded-[4rem] border border-gray-100 gap-10">
                <div className="flex items-center gap-5 text-[11px] font-black text-bb-blue italic tracking-widest opacity-60">
                   <div className="w-4 h-4 bg-emerald-500 rounded-full animate-pulse"></div> Sincronia de Extrato Ativada
                </div>
                <div className="flex gap-12 items-center">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="text-[13px] font-black uppercase text-gray-300 hover:text-red-500 italic transition-all tracking-[0.2em]">Descartar</button>
                   <button type="submit" className="bg-bb-blue text-white px-28 py-8 rounded-[3.5rem] text-[14px] font-black uppercase shadow-2xl tracking-[0.4em] hover:scale-105 active:scale-95 transition-all">Sincronizar com Nuvem PHD</button>
                </div>
             </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Receipts;