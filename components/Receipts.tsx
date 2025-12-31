
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
        tax1Label: 'Retenção IRS', tax2Label: 'IVA Liquidado', symbol: '€'
      };
    }
    const inss = (base * (formData.inss_rate || 0)) / 100;
    const irpf = (base * (formData.irpf_rate || 0)) / 100;
    return { 
      tax1: inss, tax2: irpf, net: base - inss - irpf, received: base - inss - irpf,
      tax1Label: 'INSS', tax2Label: 'IRPF', symbol: 'R$'
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
    <div className="p-6 space-y-6 pb-24 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h3 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Gestão Fiscal PHD</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 italic tracking-widest">Emissões Brasil & Portugal</p>
        </div>
        <button onClick={() => { setFormData(initialForm); setEditingId(null); setIsModalOpen(true); }} className="bg-bb-blue text-white px-8 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg hover:scale-105 transition-all">📜 Novo Recibo</button>
      </div>

      <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-gray-50 text-bb-blue uppercase font-black italic border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">ID / Data</th>
                <th className="px-6 py-4">Entidade</th>
                <th className="px-6 py-4">Vínculo</th>
                <th className="px-6 py-4 text-right">Bruto</th>
                <th className="px-6 py-4 text-right">Líquido</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {receipts.length === 0 ? (
                <tr><td colSpan={7} className="py-20 text-center text-gray-300 font-black uppercase italic opacity-30">Vazio na nuvem</td></tr>
              ) : (
                receipts.map(r => (
                  <tr key={r.internal_id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-3">
                      <span className="font-black block text-bb-blue text-[11px] leading-none mb-1 italic">#{r.id}</span>
                      <span className="text-[9px] text-gray-400 font-bold">{r.issue_date.split('-').reverse().join('/')}</span>
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-black text-gray-700 uppercase leading-none mb-1">
                        {r.flag_calcula_premiacao && <span className="mr-1">⭐</span>}
                        {fornecedores.find(s => s.id === r.fornecedor_id)?.nome || 'N/A'}
                      </p>
                      <p className="text-[8px] text-gray-400 uppercase font-bold italic">{r.country_code === 'PT' ? '🇵🇹 PT' : '🇧🇷 BR'}</p>
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-bold text-bb-blue uppercase text-[9px] mb-0.5 leading-none">{categorias.find(c => c.id === r.categoria_id)?.nome}</p>
                      <p className="text-[7px] text-gray-400 uppercase italic leading-none">{categorias.find(c => c.id === r.categoria_id)?.contas.find(i => i.id === r.conta_contabil_id)?.nome}</p>
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-gray-400 italic">{r.country_code === 'PT' ? '€' : 'R$'} {r.base_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-3 text-right font-black text-bb-blue text-[12px] italic">{r.country_code === 'PT' ? '€' : 'R$'} {r.received_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-3 text-center">
                      <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest ${r.is_paid ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
                        {r.is_paid ? 'PAGO' : 'PENDENTE'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <div className="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-all">
                        {r.document_url && <a href={r.document_url} target="_blank" rel="noreferrer" className="w-8 h-8 bg-gray-50 text-gray-400 rounded-lg flex items-center justify-center border border-gray-100 hover:bg-bb-blue hover:text-white transition-all">🔗</a>}
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
                  <h2 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Registro de Emissão Fiscal</h2>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">Fidelidade técnica BR/PT</p>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-50 w-10 h-10 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 transition-all border border-gray-100">✕</button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-8">
                   <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Nº Recibo/NF</label>
                        <input required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} placeholder="NF-001" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Data Emissão</label>
                        <input type="date" required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none" value={formData.issue_date} onChange={e => setFormData({...formData, issue_date: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Regime</label>
                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                           <button type="button" onClick={() => setFormData({...formData, country_code: 'PT'})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.country_code === 'PT' ? 'bg-white text-bb-blue shadow-sm' : 'text-gray-400'}`}>🇵🇹 PT</button>
                           <button type="button" onClick={() => setFormData({...formData, country_code: 'BR'})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.country_code === 'BR' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}>🇧🇷 BR</button>
                        </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Entidade Pagadora</label>
                        <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.fornecedor_id} onChange={e => setFormData({...formData, fornecedor_id: e.target.value})}><option value="">Selecione...</option>{fornecedores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Vínculo Contábil (Receita)</label>
                        <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.categoria_id} onChange={e => setFormData({...formData, categoria_id: e.target.value, conta_contabil_id: ''})}><option value="">Selecione...</option>{categorias.filter(c => c.tipo === TipoTransacao.RECEITA).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                      </div>
                   </div>

                   <div className="space-y-6">
                      <h4 className="text-[10px] font-black text-bb-blue uppercase italic tracking-widest border-b border-gray-100 pb-2">Esteira de Fluxo Financeiro</h4>
                      <div className="flex flex-wrap items-center gap-4 bg-gray-50/50 p-6 rounded-[1.5rem] border border-gray-100">
                        <div className="flex-1 min-w-[150px] space-y-1.5">
                           <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Valor Bruto</label>
                           <div className="relative">
                              <input type="number" step="0.01" className="w-full bg-white p-4 rounded-xl text-xl font-black text-bb-blue border border-gray-100" value={formData.base_amount || ''} onChange={e => setFormData({...formData, base_amount: Number(e.target.value)})} />
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs opacity-30 italic">{calcs.symbol}</span>
                           </div>
                        </div>
                        <div className="text-gray-300 font-black text-xl">➔</div>
                        <div className="flex-1 min-w-[150px] space-y-1.5">
                           <label className="text-[9px] font-black text-red-400 uppercase ml-1">{calcs.tax1Label} (%)</label>
                           <input type="number" step="0.1" className="w-full bg-white p-4 rounded-xl text-xl font-black text-red-500 border border-gray-100" value={formData.country_code === 'PT' ? formData.irs_rate : formData.inss_rate} onChange={e => setFormData({...formData, [formData.country_code === 'PT' ? 'irs_rate' : 'inss_rate']: Number(e.target.value)})} />
                        </div>
                        <div className="text-gray-300 font-black text-xl">{formData.country_code === 'PT' ? '➔' : '➔'}</div>
                        <div className="flex-1 min-w-[150px] space-y-1.5">
                           <label className={`text-[9px] font-black uppercase ml-1 ${formData.country_code === 'PT' ? 'text-emerald-500' : 'text-red-400'}`}>{calcs.tax2Label} (%)</label>
                           <input type="number" step="0.1" className={`w-full bg-white p-4 rounded-xl text-xl font-black border border-gray-100 ${formData.country_code === 'PT' ? 'text-emerald-600' : 'text-red-500'}`} value={formData.country_code === 'PT' ? formData.iva_rate : formData.irpf_rate} onChange={e => setFormData({...formData, [formData.country_code === 'PT' ? 'iva_rate' : 'irpf_rate']: Number(e.target.value)})} />
                        </div>
                      </div>
                      
                      <div className="bg-bb-blue p-8 rounded-[1.5rem] shadow-xl flex justify-between items-center group">
                         <div>
                            <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest leading-none mb-1">Disponibilidade Líquida Final</p>
                            <p className="text-3xl font-black text-white italic leading-none">{calcs.symbol} {calcs.received.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-[9px] font-black text-blue-200 uppercase opacity-60">Impostos Totais</p>
                            <p className="text-sm font-black text-bb-yellow italic leading-none">{calcs.symbol} {(calcs.tax1 + (formData.country_code === 'BR' ? calcs.tax2 : -calcs.tax2)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                   <div className="bg-gray-50/50 p-6 rounded-[1.5rem] border border-gray-100 space-y-6">
                      <h4 className="text-[11px] font-black text-bb-blue uppercase italic tracking-widest border-b border-gray-200 pb-3">Auditoria e Gestão</h4>
                      
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Link do Documento (PDF/Anexo)</label>
                        <input className="w-full bg-white p-3 rounded-xl text-[10px] font-black border border-gray-100" value={formData.document_url || ''} onChange={e => setFormData({...formData, document_url: e.target.value})} placeholder="https://cloud.com/recibo.pdf" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Descrição do Serviço</label>
                        <textarea className="w-full bg-white p-3 rounded-xl text-[10px] font-bold border border-gray-100 outline-none h-20" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Detalhamento técnico do faturamento..."></textarea>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Conta de Depósito</label>
                        <select required className="w-full bg-white p-3 rounded-xl text-xs font-black border border-gray-100" value={formData.forma_pagamento_id} onChange={e => setFormData({...formData, forma_pagamento_id: e.target.value})}><option value="">Banco destino...</option>{formasPagamento.map(fp => <option key={fp.id} value={fp.id}>{fp.nome}</option>)}</select>
                      </div>

                      <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100">
                         <span className="text-[10px] font-black uppercase text-bb-blue italic">Premiação Fornecedor?</span>
                         <button type="button" onClick={() => setFormData({...formData, flag_calcula_premiacao: !formData.flag_calcula_premiacao})} className={`w-12 h-6 rounded-full transition-all relative ${formData.flag_calcula_premiacao ? 'bg-bb-blue' : 'bg-gray-200'}`}>
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.flag_calcula_premiacao ? 'right-1' : 'left-1'}`}></div>
                         </button>
                      </div>

                      <button type="button" onClick={() => setFormData({...formData, is_paid: !formData.is_paid})} className={`w-full py-4 rounded-xl text-[10px] font-black uppercase transition-all shadow-md ${formData.is_paid ? 'bg-emerald-500 text-white' : 'bg-white text-orange-500 border border-orange-200 hover:bg-orange-50'}`}>
                        {formData.is_paid ? '✓ LIQUIDADO' : 'AGUARDANDO PAGAMENTO'}
                      </button>
                   </div>
                </div>
             </div>

             <div className="flex flex-wrap justify-between items-center bg-gray-50 p-6 rounded-[1.5rem] border border-gray-100 gap-6">
                <div className="text-[10px] font-black text-bb-blue italic opacity-60">Sincronia Firebase Real-Time</div>
                <div className="flex gap-6 items-center">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="text-[11px] font-black uppercase text-gray-400 hover:text-red-500 italic transition-all">Descartar</button>
                   <button type="submit" className="bg-bb-blue text-white px-12 py-4 rounded-xl text-[12px] font-black uppercase shadow-lg tracking-[0.1em] hover:scale-105 active:scale-95 transition-all">Sincronizar Nuvem PHD</button>
                </div>
             </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Receipts;
