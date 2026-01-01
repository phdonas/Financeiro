import React, { useState, useMemo } from 'react';
import { Receipt, Fornecedor, CategoriaContabil, TipoTransacao, FormaPagamento, Transacao } from '../types';

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
    flag_calcula_premiacao: false,
    document_url: ''
  };

  const [formData, setFormData] = useState<Partial<Receipt>>(initialForm);

  const calcs = useMemo(() => {
    const base = formData.base_amount || 0;
    if (formData.country_code === 'PT') {
      const irs = (base * (formData.irs_rate || 0)) / 100;
      const iva = (base * (formData.iva_rate || 0)) / 100;
      return { 
        tax1: irs, tax2: iva, net: base - irs, received: (base - irs) + iva,
        tax1Label: 'IRS (-)', tax2Label: 'IVA (+)', symbol: '€'
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
        description: `${finalReceipt.description || 'Faturamento'} (#${finalReceipt.id})`,
        valor: finalReceipt.received_amount,
        status: finalReceipt.is_paid ? 'PAGO' : 'PENDENTE',
        origem: 'IMPORTACAO',
        receipt_id: internalId
      } as Transacao);
    }

    setIsModalOpen(false); setEditingId(null); setFormData(initialForm);
  };

  return (
    <div className="p-6 space-y-6 pb-24 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h3 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Gestão de Emissões</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 italic tracking-widest">Controle de Impostos e Retenções BR/PT</p>
        </div>
        <button onClick={() => { setFormData(initialForm); setEditingId(null); setIsModalOpen(true); }} className="bg-bb-blue text-white px-8 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg hover:scale-105 active:scale-95 transition-all">🧾 Nova Emissão</button>
      </div>

      <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-gray-50 text-bb-blue uppercase font-black italic border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Data / ID</th>
                <th className="px-6 py-4">Fornecedor</th>
                <th className="px-6 py-4">Vínculo</th>
                <th className="px-6 py-4 text-right">Bruto</th>
                <th className="px-6 py-4 text-right">Líquido</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {receipts.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-300 font-black uppercase italic opacity-30">Sem registros locais</td></tr>
              ) : (
                receipts.map(r => (
                  <tr key={r.internal_id} className="hover:bg-gray-50/40 transition-colors group">
                    <td className="px-6 py-3">
                      <span className="text-[10px] text-gray-400 font-bold block">{r.issue_date.split('-').reverse().join('/')}</span>
                      <span className="font-black text-bb-blue text-[9px] italic">#{r.id}</span>
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-black text-gray-700 uppercase leading-none mb-1 flex items-center gap-1">
                        {r.flag_calcula_premiacao && <span title="Fornecedor com Premiação">⭐</span>}
                        {fornecedores.find(s => s.id === r.fornecedor_id)?.nome || 'Entidade Indeterminada'}
                      </p>
                      <p className="text-[8px] text-gray-400 uppercase font-bold italic tracking-tighter">{r.country_code === 'PT' ? '🇵🇹 Regime Portugal' : '🇧🇷 Regime Brasil'}</p>
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-black text-bb-blue uppercase text-[9px] leading-none mb-0.5">{categorias.find(c => c.id === r.categoria_id)?.nome}</p>
                      <p className="text-[7px] text-gray-400 uppercase italic leading-none">{categorias.find(c => c.id === r.categoria_id)?.contas.find(i => i.id === r.conta_contabil_id)?.nome}</p>
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-gray-400 italic">
                      {r.country_code === 'PT' ? '€' : 'R$'} {r.base_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right font-black text-bb-blue text-[12px] italic">
                      {r.country_code === 'PT' ? '€' : 'R$'} {r.received_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`px-4 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${r.is_paid ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
                        {r.is_paid ? 'LIQUIDADO' : 'PENDENTE'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <div className="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-all">
                        {r.document_url && (
                          <a href={r.document_url} target="_blank" rel="noreferrer" className="w-8 h-8 bg-gray-50 text-gray-400 rounded-lg flex items-center justify-center border border-gray-100 hover:bg-bb-blue hover:text-white transition-all">🔗</a>
                        )}
                        <button onClick={() => { setEditingId(r.internal_id); setFormData(r); setIsModalOpen(true); }} className="w-8 h-8 bg-bb-blue text-white rounded-lg flex items-center justify-center shadow-md">✏️</button>
                        <button onClick={() => onDelete(r.internal_id)} className="w-8 h-8 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white border border-red-100 transition-all">✕</button>
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
        <div className="fixed inset-0 bg-bb-blue/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl p-10 space-y-8 animate-in zoom-in duration-300 overflow-y-auto max-h-[95vh] scrollbar-hide">
             <div className="flex justify-between items-start border-b border-gray-100 pb-6">
                <div>
                  <h2 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Emissão Fiscal Técnica</h2>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">Apuramento de Base e Liquidez</p>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-50 w-10 h-10 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 transition-all border border-gray-100">✕</button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-8">
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Nº Recibo/Fatura</label>
                        <input required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} placeholder="Ref. 2025/001" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Data Emissão</label>
                        <input type="date" required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none" value={formData.issue_date} onChange={e => setFormData({...formData, issue_date: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Regime Fiscal</label>
                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                           <button type="button" onClick={() => setFormData({...formData, country_code: 'PT'})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.country_code === 'PT' ? 'bg-white text-bb-blue shadow-sm border border-gray-100' : 'text-gray-400'}`}>🇵🇹 PT</button>
                           <button type="button" onClick={() => setFormData({...formData, country_code: 'BR'})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.country_code === 'BR' ? 'bg-white text-emerald-600 shadow-sm border border-gray-100' : 'text-gray-400'}`}>🇧🇷 BR</button>
                        </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Fornecedor / Pagadora</label>
                        <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.fornecedor_id} onChange={e => setFormData({...formData, fornecedor_id: e.target.value})}><option value="">Selecione o Fornecedor...</option>{fornecedores.filter(s => s.pais === formData.country_code).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Vínculo Contábil</label>
                        <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.categoria_id} onChange={e => setFormData({...formData, categoria_id: e.target.value, conta_contabil_id: ''})}><option value="">Selecione Categoria...</option>{categorias.filter(c => c.tipo === TipoTransacao.RECEITA).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                      </div>
                   </div>

                   <div className="space-y-6">
                      <h4 className="text-[10px] font-black text-bb-blue uppercase italic tracking-widest border-b border-gray-100 pb-2">Esteira de Cálculo de Faturamento</h4>
                      <div className="flex flex-wrap items-center gap-4 bg-gray-50/50 p-6 rounded-[1.5rem] border border-gray-100">
                        <div className="flex-1 min-w-[140px] space-y-1.5">
                           <label className="text-[9px] font-black text-gray-400 uppercase ml-1 italic">Bruto Nominal</label>
                           <div className="relative">
                              <input type="number" step="0.01" className="w-full bg-white p-4 rounded-xl text-xl font-black text-bb-blue border border-gray-100 outline-none focus:ring-2 focus:ring-bb-blue/20" value={formData.base_amount || ''} onChange={e => setFormData({...formData, base_amount: Number(e.target.value)})} />
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs opacity-30 italic">{calcs.symbol}</span>
                           </div>
                        </div>
                        <div className="text-gray-200 font-black text-xl select-none">➔</div>
                        <div className="flex-1 min-w-[140px] space-y-1.5">
                           <label className="text-[9px] font-black text-red-400 uppercase ml-1 italic">{calcs.tax1Label} %</label>
                           <input type="number" step="0.1" className="w-full bg-white p-4 rounded-xl text-xl font-black text-red-500 border border-gray-100 outline-none" value={formData.country_code === 'PT' ? formData.irs_rate : formData.inss_rate} onChange={e => setFormData({...formData, [formData.country_code === 'PT' ? 'irs_rate' : 'inss_rate']: Number(e.target.value)})} />
                        </div>
                        <div className="text-gray-200 font-black text-xl select-none">➔</div>
                        <div className="flex-1 min-w-[140px] space-y-1.5">
                           <label className={`text-[9px] font-black uppercase ml-1 italic ${formData.country_code === 'PT' ? 'text-emerald-500' : 'text-red-400'}`}>{calcs.tax2Label} %</label>
                           <input type="number" step="0.1" className={`w-full bg-white p-4 rounded-xl text-xl font-black border border-gray-100 outline-none ${formData.country_code === 'PT' ? 'text-emerald-600' : 'text-red-500'}`} value={formData.country_code === 'PT' ? formData.iva_rate : formData.irpf_rate} onChange={e => setFormData({...formData, [formData.country_code === 'PT' ? 'iva_rate' : 'irpf_rate']: Number(e.target.value)})} />
                        </div>
                      </div>
                      
                      <div className="bg-bb-blue p-8 rounded-[1.5rem] shadow-xl flex justify-between items-center group relative overflow-hidden">
                         <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-white/10 transition-all"></div>
                         <div>
                            <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest leading-none mb-1 opacity-80 italic">Disponibilidade de Caixa (Líquido)</p>
                            <p className="text-4xl font-black text-white italic leading-none">{calcs.symbol} {calcs.received.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-[9px] font-black text-blue-200 uppercase opacity-60 italic">Custo Tributário Estimado</p>
                            <p className="text-lg font-black text-bb-yellow italic leading-none">{calcs.symbol} {(Math.abs(calcs.tax1) + (formData.country_code === 'BR' ? Math.abs(calcs.tax2) : 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                   <div className="bg-gray-50/50 p-6 rounded-[1.5rem] border border-gray-100 space-y-6">
                      <h4 className="text-[11px] font-black text-bb-blue uppercase italic tracking-widest border-b border-gray-200 pb-3">Auditoria Local</h4>
                      
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-1 italic">Link do Documento (Anexo Local/Nuvem)</label>
                        <input className="w-full bg-white p-3 rounded-xl text-[10px] font-black border border-gray-100 outline-none focus:ring-1 focus:ring-bb-blue/30" value={formData.document_url || ''} onChange={e => setFormData({...formData, document_url: e.target.value})} placeholder="https://link.com/fatura.pdf" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-1 italic">Detalhamento do Faturamento</label>
                        <textarea className="w-full bg-white p-3 rounded-xl text-[10px] font-bold border border-gray-100 outline-none h-20" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Descrição técnica do serviço prestado..."></textarea>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-1 italic">Banco de Destino</label>
                        <select required className="w-full bg-white p-3 rounded-xl text-xs font-black border border-gray-100" value={formData.forma_pagamento_id} onChange={e => setFormData({...formData, forma_pagamento_id: e.target.value})}><option value="">Selecione Banco...</option>{formasPagamento.map(fp => <option key={fp.id} value={fp.id}>{fp.nome}</option>)}</select>
                      </div>

                      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100">
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase text-bb-blue italic leading-none">Bonificação Fornecedor</span>
                            <span className="text-[8px] font-bold text-gray-400 uppercase italic">⭐ Ativar Destaque Visual</span>
                         </div>
                         <button type="button" onClick={() => setFormData({...formData, flag_calcula_premiacao: !formData.flag_calcula_premiacao})} className={`w-12 h-6 rounded-full transition-all relative ${formData.flag_calcula_premiacao ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${formData.flag_calcula_premiacao ? 'right-1' : 'left-1'}`}></div>
                         </button>
                      </div>

                      <button type="button" onClick={() => setFormData({...formData, is_paid: !formData.is_paid})} className={`w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all shadow-lg ${formData.is_paid ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-white text-orange-500 border border-orange-200 hover:bg-orange-50'}`}>
                        {formData.is_paid ? '✓ LIQUIDADO NO BANCO' : 'AGUARDANDO LIQUIDAÇÃO'}
                      </button>
                   </div>
                </div>
             </div>

             <div className="flex flex-wrap justify-between items-center bg-gray-50 p-6 rounded-[1.5rem] border border-gray-100 gap-6">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                   <span className="text-[10px] font-black text-bb-blue italic opacity-60 uppercase tracking-widest">Armazenamento Local Seguro</span>
                </div>
                <div className="flex gap-6 items-center">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="text-[11px] font-black uppercase text-gray-400 hover:text-red-500 italic transition-all">Descartar</button>
                   <button type="submit" className="bg-bb-blue text-white px-12 py-4 rounded-xl text-[12px] font-black uppercase shadow-xl tracking-[0.1em] hover:scale-105 active:scale-95 transition-all">Confirmar Emissão</button>
                </div>
             </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Receipts;