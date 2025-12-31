
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

  const stats = useMemo(() => {
    const pauloRecs = records.filter(r => r.quem === 'Paulo');
    const deboraRecs = records.filter(r => r.quem === 'Débora');
    // Fix: Providing a complete fallback object to avoid property 'nit' and 'data_aposentadoria' missing errors
    const config = configs.find(c => c.ano === 2025) || configs[0] || { 
      paulo: { total_parcelas: 0, nit: '', data_aposentadoria: '' }, 
      debora: { total_parcelas: 0, nit: '', data_aposentadoria: '' } 
    };

    return {
      paulo: {
        total: config.paulo?.total_parcelas || 0,
        pagas: pauloRecs.filter(r => r.status === 'PAGO').length,
        nit: config.paulo?.nit || '---',
        aposentadoria: config.paulo?.data_aposentadoria || ''
      },
      debora: {
        total: config.debora?.total_parcelas || 0,
        pagas: deboraRecs.filter(r => r.status === 'PAGO').length,
        nit: config.debora?.nit || '---',
        aposentadoria: config.debora?.data_aposentadoria || ''
      }
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
    <div className="p-8 space-y-8 pb-24">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[3rem] border-l-8 border-bb-blue shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter">PAULO</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase">NIT: {stats.paulo.nit}</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-bb-blue italic">{stats.paulo.pagas}/{stats.paulo.total}</span>
              <p className="text-[9px] text-gray-300 font-bold uppercase tracking-widest">Pagas</p>
            </div>
          </div>
          <div className="w-full bg-gray-100 h-4 rounded-full overflow-hidden">
            <div className="bg-bb-blue h-full transition-all duration-1000" style={{ width: `${stats.paulo.total > 0 ? (stats.paulo.pagas / stats.paulo.total) * 100 : 0}%` }}></div>
          </div>
          <p className="text-[9px] font-black text-bb-blue uppercase italic">Previsão: {stats.paulo.aposentadoria ? new Date(stats.paulo.aposentadoria).toLocaleDateString('pt-BR') : '---'}</p>
        </div>

        <div className="bg-white p-8 rounded-[3rem] border-l-8 border-bb-yellow shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter">DÉBORA</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase">NIT: {stats.debora.nit}</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-bb-blue italic">{stats.debora.pagas}/{stats.debora.total}</span>
              <p className="text-[9px] text-gray-300 font-bold uppercase tracking-widest">Pagas</p>
            </div>
          </div>
          <div className="w-full bg-gray-100 h-4 rounded-full overflow-hidden">
            <div className="bg-bb-yellow h-full transition-all duration-1000" style={{ width: `${stats.debora.total > 0 ? (stats.debora.pagas / stats.debora.total) * 100 : 0}%` }}></div>
          </div>
          <p className="text-[9px] font-black text-bb-blue uppercase italic">Previsão: {stats.debora.aposentadoria ? new Date(stats.debora.aposentadoria).toLocaleDateString('pt-BR') : '---'}</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-gray-100 space-y-6">
        <div className="flex justify-between items-center">
          <h4 className="text-sm font-black text-bb-blue uppercase italic tracking-widest">Lançamentos na Nuvem</h4>
          <button onClick={() => { setEditingId(null); setFormData(initialForm); setIsModalOpen(true); }} className="bg-bb-blue text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase shadow-xl hover:scale-105 transition-transform">🗓️ Lançar Parcela</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-gray-50 text-bb-blue font-black uppercase italic">
              <tr>
                <th className="px-6 py-4">Parcela</th>
                <th className="px-6 py-4">Quem</th>
                <th className="px-6 py-4">Vencimento</th>
                <th className="px-6 py-4 text-right">Valor</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.map(rec => (
                <tr key={rec.id} className="hover:bg-gray-50/50 group">
                  <td className="px-6 py-4 font-black">#{rec.numero_parcela.toString().padStart(2, '0')}</td>
                  <td className="px-6 py-4 font-bold uppercase">{rec.quem}</td>
                  <td className="px-6 py-4 text-gray-400">{new Date(rec.vencimento + "T12:00:00").toLocaleDateString('pt-BR')}</td>
                  <td className="px-6 py-4 text-right font-black text-bb-blue">R$ {rec.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${rec.status === 'PAGO' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-600'}`}>{rec.status}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex gap-2 justify-center opacity-0 group-hover:opacity-100">
                      <button onClick={() => { setEditingId(rec.id); setFormData(rec); setIsModalOpen(true); }} className="text-bb-blue font-black uppercase text-[8px]">Edit</button>
                      <button onClick={() => onDelete(rec.id)} className="text-red-500 font-black uppercase text-[8px]">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="bg-white rounded-[3rem] p-10 w-full max-w-sm space-y-6 animate-in zoom-in shadow-2xl">
            <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter">Registrar Parcela</h3>
            <div className="flex gap-3">
              <button type="button" onClick={() => setFormData({...formData, quem: 'Paulo'})} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border-2 ${formData.quem === 'Paulo' ? 'bg-bb-blue text-white' : 'bg-gray-50 text-gray-400'}`}>Paulo</button>
              <button type="button" onClick={() => setFormData({...formData, quem: 'Débora'})} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border-2 ${formData.quem === 'Débora' ? 'bg-bb-yellow text-bb-blue border-bb-yellow' : 'bg-gray-50 text-gray-400'}`}>Débora</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input type="month" required className="w-full bg-gray-50 p-4 rounded-2xl text-xs font-bold" value={formData.competencia} onChange={e => setFormData({...formData, competencia: e.target.value})} />
              <input type="number" required className="w-full bg-gray-50 p-4 rounded-2xl text-xs font-bold" value={formData.numero_parcela} onChange={e => setFormData({...formData, numero_parcela: Number(e.target.value)})} />
            </div>
            <select className="w-full bg-gray-50 p-4 rounded-2xl text-xs font-bold" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as StatusTransacao})}>
              <option value="PLANEJADO">Planejado</option><option value="PAGO">Pago</option>
            </select>
            <div className="flex gap-4 pt-4"><button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 text-[10px] font-black uppercase text-gray-400">Sair</button><button type="submit" className="flex-[2] bg-bb-blue text-white py-4 rounded-2xl text-[10px] font-black uppercase shadow-xl tracking-widest">Salvar</button></div>
          </form>
        </div>
      )}
    </div>
  );
};

export default InssBrasil;
