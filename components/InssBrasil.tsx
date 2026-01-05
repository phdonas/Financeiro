
import React, { useState, useMemo } from 'react';
import { InssRecord, InssYearlyConfig, StatusTransacao } from '../types';

interface InssBrasilProps {
  records: InssRecord[];
  configs: InssYearlyConfig[];
  onSave: (r: InssRecord) => void;
  onDelete: (id: string) => void;
}

const InssBrasil: React.FC<InssBrasilProps> = ({ records, configs, onSave, onDelete }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const initialForm: Partial<InssRecord> = {
    quem: 'Paulo',
    competencia: new Date().toISOString().substring(0, 7),
    status: 'PLANEJADO',
    numero_parcela: 1
  };

  const [formData, setFormData] = useState<Partial<InssRecord>>(initialForm);

  const vencimentoPreview = useMemo(() => {
    if (!formData.competencia) return '';
    const compDate = new Date(formData.competencia + "-01");
    const dueDate = new Date(compDate.getFullYear(), compDate.getMonth() + 1, 15);
    return dueDate.toISOString().split('T')[0];
  }, [formData.competencia]);


    const stats = useMemo(() => {
    const yearNow = new Date().getFullYear();
    const configSorted = [...configs].sort((a, b) => b.ano - a.ano);
    const config = configs.find(c => c.ano === yearNow) || configSorted[0] || {
      ano: yearNow,
      salario_base: 0,
      percentual_inss: 0,
      paulo: { total_parcelas: 0, nit: '', data_aposentadoria: '' },
      debora: { total_parcelas: 0, nit: '', data_aposentadoria: '' }
    };

    const pauloRecsYear = records.filter(r => r.quem === 'Paulo' && r.competencia?.startsWith(String(config.ano)));
    const deboraRecsYear = records.filter(r => r.quem === 'Débora' && r.competencia?.startsWith(String(config.ano)));

    const pauloPagas = pauloRecsYear.filter(r => r.status === 'PAGO').length;
    const deboraPagas = deboraRecsYear.filter(r => r.status === 'PAGO').length;

    const pauloTotal = config.paulo?.total_parcelas ?? 0;
    const deboraTotal = config.debora?.total_parcelas ?? 0;

    const pauloAPagar = Math.max(pauloTotal - pauloPagas, 0);
    const deboraAPagar = Math.max(deboraTotal - deboraPagas, 0);

    const total = pauloTotal + deboraTotal;
    const pagas = pauloPagas + deboraPagas;
    const a_pagar = Math.max(total - pagas, 0);

    return {
      ano: config.ano,
      paulo: {
        total: pauloTotal,
        pagas: pauloPagas,
        a_pagar: pauloAPagar,
        nit: config.paulo?.nit || 'N/A',
        aposentadoria: config.paulo?.data_aposentadoria || ''
      },
      debora: {
        total: deboraTotal,
        pagas: deboraPagas,
        a_pagar: deboraAPagar,
        nit: config.debora?.nit || 'N/A',
        aposentadoria: config.debora?.data_aposentadoria || ''
      },
      consolidado: { total, pagas, a_pagar }
    };
  }, [records, configs]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const compDate = new Date(formData.competencia + "-01");
    const dueDate = new Date(compDate.getFullYear(), compDate.getMonth() + 1, 15);
    const dueDateStr = dueDate.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    
    const config = configs.find(c => c.ano === compDate.getFullYear()) || configs[0];
    const valorPagar = config ? (config.salario_base * (config.percentual_inss / 100)) : 0;

    let finalStatus = formData.status as StatusTransacao;
    if (finalStatus !== 'PAGO' && dueDateStr < todayStr) finalStatus = 'ATRASADO';

    const record: InssRecord = {
      id: editingId || Math.random().toString(36).substr(2, 9),
      quem: formData.quem as 'Paulo' | 'Débora',
      competencia: formData.competencia!,
      vencimento: dueDateStr,
      numero_parcela: Number(formData.numero_parcela),
      status: finalStatus,
      valor: valorPagar,
      salario_base: config?.salario_base || 0
    };

    onSave(record);
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(initialForm);
  };

  return (
    <div className="p-6 space-y-8 pb-24 animate-in fade-in duration-700">
      {/* Cards de Progresso Auditoria */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-8 opacity-5 text-6xl group-hover:scale-110 transition-transform">🇧🇷</div>
           <div className="flex justify-between items-start mb-6">
              <div>
                 <h3 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Paulo S.</h3>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2 italic">NIT: {stats.paulo.nit}</p>
              </div>
              <div className="text-right">
                 <p className="text-[10px] font-black text-bb-blue uppercase tracking-widest mb-1 italic">Vínculo Previdenciário</p>
                 <span className="text-3xl font-black text-bb-blue italic tracking-tighter">{stats.paulo.pagas} / {stats.paulo.total}</span>
                 <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1 italic">A pagar: {stats.paulo.a_pagar}</p>
              </div>
           </div>
           
           <div className="space-y-4">
              <div className="w-full h-3 bg-gray-50 rounded-full overflow-hidden shadow-inner border border-gray-100">
                 <div className="h-full bg-bb-blue rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(0,56,168,0.3)]" style={{ width: `${(stats.paulo.pagas / stats.paulo.total) * 100}%` }}></div>
              </div>
              <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                 <span className="text-[9px] font-black text-bb-blue uppercase italic">Previsão Aposentadoria</span>
                 <span className="text-[11px] font-black text-bb-blue italic">{stats.paulo.aposentadoria ? new Date(stats.paulo.aposentadoria).toLocaleDateString('pt-BR') : 'Aguardando Cálculo'}</span>
              </div>
           </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-8 opacity-5 text-6xl group-hover:scale-110 transition-transform">🇧🇷</div>
           <div className="flex justify-between items-start mb-6">
              <div>
                 <h3 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Débora S.</h3>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2 italic">NIT: {stats.debora.nit}</p>
              </div>
              <div className="text-right">
                 <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1 italic">Vínculo Previdenciário</p>
                 <span className="text-3xl font-black text-emerald-600 italic tracking-tighter">{stats.debora.pagas} / {stats.debora.total}</span>
                 <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1 italic">A pagar: {stats.debora.a_pagar}</p>
              </div>
           </div>
           
           <div className="space-y-4">
              <div className="w-full h-3 bg-gray-50 rounded-full overflow-hidden shadow-inner border border-gray-100">
                 <div className="h-full bg-emerald-600 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(16,185,129,0.3)]" style={{ width: `${(stats.debora.pagas / stats.debora.total) * 100}%` }}></div>
              </div>
              <div className="flex justify-between items-center bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                 <span className="text-[9px] font-black text-emerald-600 uppercase italic">Previsão Aposentadoria</span>
                 <span className="text-[11px] font-black text-emerald-600 italic">{stats.debora.aposentadoria ? new Date(stats.debora.aposentadoria).toLocaleDateString('pt-BR') : 'Aguardando Cálculo'}</span>
              </div>
           </div>
        </div>

        <div className="bg-gradient-to-br from-bb-blue to-bb-blue/90 p-8 rounded-[2.5rem] border border-bb-blue/10 shadow-sm relative overflow-hidden group text-white">
           <div className="absolute top-0 right-0 p-8 opacity-10 text-6xl group-hover:scale-110 transition-transform">📅</div>
           <div className="flex justify-between items-start mb-6">
              <div>
                 <h3 className="text-2xl font-black italic uppercase tracking-tighter leading-none">Consolidado</h3>
                 <p className="text-[10px] opacity-80 font-bold uppercase tracking-widest mt-2 italic">Ano-base: {stats.ano}</p>
              </div>
              <div className="text-right">
                 <p className="text-[10px] font-black uppercase tracking-widest mb-1 italic opacity-80">Pagas / Total</p>
                 <span className="text-3xl font-black tracking-tighter">{stats.consolidado.pagas} / {stats.consolidado.total}</span>
              </div>
           </div>

           <div className="space-y-4">
              <div className="flex justify-between items-center">
                 <span className="text-[11px] font-black uppercase tracking-widest opacity-80 italic">A pagar</span>
                 <span className="text-[13px] font-black tracking-tight">{stats.consolidado.a_pagar}</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-white/90 rounded-full transition-all duration-700"
                  style={{ width: stats.consolidado.total > 0 ? `${Math.min((stats.consolidado.pagas / stats.consolidado.total) * 100, 100)}%` : '0%' }}
                />
              </div>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex flex-wrap justify-between items-center gap-4">
           <div>
              <h4 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Mapa de Contribuições</h4>
              <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 italic tracking-widest">Auditoria de Parcelas GPS/NIT</p>
           </div>
           <button onClick={() => { setEditingId(null); setFormData(initialForm); setIsModalOpen(true); }} className="bg-bb-blue text-white px-8 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all">📅 Lançar Guia GPS</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-gray-50 text-bb-blue uppercase font-black italic border-b border-gray-100">
              <tr>
                <th className="px-8 py-5">Parcela</th>
                <th className="px-8 py-5">Contribuinte</th>
                <th className="px-8 py-5">Competência</th>
                <th className="px-8 py-5 text-right">Valor Guia</th>
                <th className="px-8 py-5 text-center">Status Auditoria</th>
                <th className="px-8 py-5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.length === 0 ? (
                <tr><td colSpan={6} className="py-20 text-center text-gray-300 font-black uppercase italic opacity-30">Sem registros sincronizados com a nuvem</td></tr>
              ) : (
                records.sort((a,b) => b.competencia.localeCompare(a.competencia)).map(rec => (
                  <tr key={rec.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-8 py-4 font-black text-gray-400">#{rec.numero_parcela.toString().padStart(3, '0')}</td>
                    <td className="px-8 py-4">
                       <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${rec.quem === 'Paulo' ? 'bg-blue-50 text-bb-blue' : 'bg-emerald-50 text-emerald-600'}`}>{rec.quem}</span>
                    </td>
                    <td className="px-8 py-4">
                       <p className="font-bold text-gray-700 uppercase italic">{new Date(rec.competencia + "-02").toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                       <p className="text-[8px] text-gray-400 uppercase font-black mt-1">Venc: {new Date(rec.vencimento + "T12:00:00").toLocaleDateString('pt-BR')}</p>
                    </td>
                    <td className="px-8 py-4 text-right">
                       <p className="text-[12px] font-black text-bb-blue italic">R$ {rec.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                       <p className="text-[8px] text-gray-300 font-bold uppercase italic">Base: R$ {rec.salario_base.toLocaleString('pt-BR')}</p>
                    </td>
                    <td className="px-8 py-4 text-center">
                       <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest ${rec.status === 'PAGO' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>{rec.status}</span>
                    </td>
                    <td className="px-8 py-4 text-center">
                       <div className="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => { setEditingId(rec.id); setFormData(rec); setIsModalOpen(true); }} className="w-8 h-8 bg-bb-blue text-white rounded-lg flex items-center justify-center shadow-md">✏️</button>
                          <button onClick={() => onDelete(rec.id)} className="w-8 h-8 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all">✕</button>
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
          <form onSubmit={handleSave} className="bg-white rounded-[2.5rem] p-10 w-full max-w-sm space-y-6 animate-in zoom-in duration-300 shadow-2xl">
            <div className="border-b border-gray-100 pb-4">
              <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Lançamento de GPS</h3>
              <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 italic">Contribuição Técnica Previdenciária</p>
            </div>
            
            <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
               <button type="button" onClick={() => setFormData({...formData, quem: 'Paulo'})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.quem === 'Paulo' ? 'bg-white text-bb-blue shadow-sm' : 'text-gray-400'}`}>Paulo</button>
               <button type="button" onClick={() => setFormData({...formData, quem: 'Débora'})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.quem === 'Débora' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}>Débora</button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[9px] font-black text-bb-blue uppercase italic ml-1">Mês Ref.</label>
                  <input type="month" required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue" value={formData.competencia} onChange={e => setFormData({...formData, competencia: e.target.value})} />
                  <p className="text-[8px] text-gray-400 font-bold uppercase mt-1 ml-1 italic tracking-widest">
                    Vencimento padrão: {vencimentoPreview ? new Date(vencimentoPreview + "T12:00:00").toLocaleDateString('pt-BR') : '—'}
                  </p>
               </div>
               <div className="space-y-1">
                  <label className="text-[9px] font-black text-bb-blue uppercase italic ml-1">Parcela Nº</label>
                  <input type="number" required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue" value={formData.numero_parcela} onChange={e => setFormData({...formData, numero_parcela: Number(e.target.value)})} />
               </div>
            </div>

            <div className="space-y-1">
               <label className="text-[9px] font-black text-bb-blue uppercase italic ml-1">Estágio Financeiro</label>
               <select className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as StatusTransacao})}>
                  <option value="PLANEJADO">Planejado / Meta</option>
                  <option value="PENDENTE">Pendente Pagamento</option>
                  <option value="PAGO">Pago / Confirmado</option>
               </select>
            </div>

            <div className="flex gap-4 pt-4">
               <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 text-[10px] font-black uppercase text-gray-400 italic">Descartar</button>
               <button type="submit" className="flex-[2] bg-bb-blue text-white py-4 rounded-xl text-[10px] font-black uppercase shadow-xl tracking-widest">Sincronizar Nuvem</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default InssBrasil;
