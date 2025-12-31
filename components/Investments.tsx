
import React, { useState, useMemo } from 'react';
import { InvestmentAsset, InvestmentTransaction, InvestmentTransactionType } from '../types';

interface InvestmentsProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  initialAssets: InvestmentAsset[];
  onSave: (a: InvestmentAsset) => void;
  onDelete: (id: string) => void;
}

const Investments: React.FC<InvestmentsProps> = ({ viewMode, initialAssets, onSave, onDelete }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<InvestmentAsset>>({ name: '', institution: '', type: 'FIXED', country_code: 'PT', initial_balance: 0, yield_target_monthly: 0, history: [] });

  const calculateBalance = (asset: InvestmentAsset) => {
    return (asset.initial_balance || 0) + (asset.history || []).reduce((acc, tx) => {
      if (tx.type === 'BUY' || tx.type === 'YIELD' || tx.type === 'REVALUATION') return acc + tx.value;
      if (tx.type === 'SELL') return acc - tx.value;
      return acc;
    }, 0);
  };

  const handleSaveAsset = (e: React.FormEvent) => {
    e.preventDefault();
    const assetData: InvestmentAsset = {
      ...formData as InvestmentAsset,
      id: editingId || Math.random().toString(36).substr(2, 9),
      current_value: calculateBalance(formData as InvestmentAsset)
    };
    onSave(assetData);
    setIsModalOpen(false); setEditingId(null);
  };

  return (
    <div className="p-8 space-y-8 pb-24">
      <div className="flex justify-between items-center bg-white p-6 rounded-[2.5rem] border shadow-sm">
        <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter">Patrimônio na Nuvem</h3>
        <button onClick={() => { setFormData({name:'', institution:'', type:'FIXED', country_code:'PT', initial_balance:0, yield_target_monthly:0, history:[]}); setEditingId(null); setIsModalOpen(true); }} className="bg-bb-blue text-white px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase shadow-xl">+ Novo Ativo</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {initialAssets.map(asset => (
          <div key={asset.id} className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-2xl transition-all group relative border-b-8 border-b-transparent hover:border-b-bb-blue">
            <h4 className="font-black text-bb-blue italic uppercase text-[11px] mb-1 truncate">{asset.name}</h4>
            <p className="text-[9px] font-black text-gray-300 uppercase mb-4">{asset.institution}</p>
            <p className="text-xl font-black text-bb-blue">{asset.country_code === 'PT' ? '€' : 'R$'} {calculateBalance(asset).toLocaleString('pt-BR')}</p>
            <div className="flex gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => { setFormData(asset); setEditingId(asset.id); setIsModalOpen(true); }} className="text-[8px] font-black uppercase text-bb-blue underline">Edit</button>
              <button onClick={() => onDelete(asset.id)} className="text-[8px] font-black uppercase text-red-500 underline">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveAsset} className="bg-white rounded-[3rem] shadow-2xl w-full max-w-sm p-10 space-y-5 animate-in zoom-in">
            <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter border-b pb-5">Ativo de Investimento</h3>
            <input required className="w-full bg-gray-50 p-4 rounded-2xl text-xs font-bold border-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Identificação" />
            <input required className="w-full bg-gray-50 p-4 rounded-2xl text-xs font-bold border-none" value={formData.institution} onChange={e => setFormData({...formData, institution: e.target.value})} placeholder="Instituição" />
            <input type="number" step="0.01" className="w-full bg-bb-blue/5 p-4 rounded-2xl text-sm font-black text-bb-blue" value={formData.initial_balance || ''} onChange={e => setFormData({...formData, initial_balance: Number(e.target.value)})} placeholder="Saldo Inicial" />
            <div className="flex gap-4 pt-4"><button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 text-[10px] font-black uppercase text-gray-400">Sair</button><button type="submit" className="flex-[2] bg-bb-blue text-white py-4 rounded-2xl text-[10px] font-black uppercase shadow-xl tracking-widest">Salvar</button></div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Investments;
