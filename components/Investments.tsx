
import React, { useState, useMemo } from 'react';
import { InvestmentAsset, InvestmentTransaction, InvestmentTransactionType } from '../types';

interface InvestmentsProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  initialAssets: InvestmentAsset[];
  onSave: (a: InvestmentAsset) => void;
  onDelete: (id: string) => void;
}

const Investments: React.FC<InvestmentsProps> = ({ viewMode, initialAssets, onSave, onDelete }) => {
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const [assetForm, setAssetForm] = useState<Partial<InvestmentAsset>>({
    name: '', institution: '', type: 'FIXED', country_code: 'PT', initial_balance: 0, current_value: 0, history: []
  });

  const [txForm, setTxForm] = useState<Partial<InvestmentTransaction>>({
    date: new Date().toISOString().split('T')[0], type: 'YIELD', value: 0, description: ''
  });

  const portfolioStats = useMemo(() => {
    const totalPT = initialAssets.filter(a => a.country_code === 'PT').reduce((acc, a) => acc + a.current_value, 0);
    const totalBR = initialAssets.filter(a => a.country_code === 'BR').reduce((acc, a) => acc + a.current_value, 0);
    return { totalPT, totalBR };
  }, [initialAssets]);

  const handleSaveAsset = (e: React.FormEvent) => {
    e.preventDefault();
    const finalAsset: InvestmentAsset = {
      ...assetForm as InvestmentAsset,
      id: editingAssetId || Math.random().toString(36).substr(2, 9),
      current_value: assetForm.initial_balance || 0
    };
    onSave(finalAsset);
    setIsAssetModalOpen(false);
    setEditingAssetId(null);
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetId) return;

    const asset = initialAssets.find(a => a.id === selectedAssetId);
    if (!asset) return;

    const newTx: InvestmentTransaction = {
      ...txForm as InvestmentTransaction,
      id: Math.random().toString(36).substr(2, 9)
    };

    const newHistory = [...(asset.history || []), newTx];
    
    // Calcula novo valor atual
    let newValue = asset.initial_balance;
    newHistory.forEach(tx => {
      if (tx.type === 'BUY' || tx.type === 'YIELD' || tx.type === 'REVALUATION') newValue += tx.value;
      if (tx.type === 'SELL') newValue -= tx.value;
    });

    onSave({ ...asset, history: newHistory, current_value: newValue });
    setIsTxModalOpen(false);
    setTxForm({ date: new Date().toISOString().split('T')[0], type: 'YIELD', value: 0, description: '' });
  };

  return (
    <div className="p-6 space-y-8 pb-24 animate-in fade-in duration-700">
      {/* Resumo de Portfólio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-bb-blue p-8 rounded-[2rem] shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
          <p className="text-[10px] font-black text-blue-200 uppercase tracking-[0.2em] mb-2 italic">Patrimônio Euro (PT)</p>
          <h2 className="text-4xl font-black text-white italic tracking-tighter">€ {portfolioStats.totalPT.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
          <div className="mt-6 flex gap-4">
            <div className="bg-white/10 px-3 py-1 rounded-full text-[8px] font-black text-white uppercase tracking-widest">Global S3 Auditado</div>
          </div>
        </div>
        <div className="bg-emerald-600 p-8 rounded-[2rem] shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
          <p className="text-[10px] font-black text-emerald-100 uppercase tracking-[0.2em] mb-2 italic">Patrimônio Real (BR)</p>
          <h2 className="text-4xl font-black text-white italic tracking-tighter">R$ {portfolioStats.totalBR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
          <div className="mt-6 flex gap-4">
             <div className="bg-white/10 px-3 py-1 rounded-full text-[8px] font-black text-white uppercase tracking-widest">B3/CDI Sincronizado</div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100 flex justify-between items-center">
        <div>
           <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Meus Ativos</h3>
           <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 italic tracking-widest">Gestão de Alocação e Performance</p>
        </div>
        <button onClick={() => { setAssetForm({name: '', institution: '', type: 'FIXED', country_code: 'PT', initial_balance: 0, current_value: 0, history: []}); setEditingAssetId(null); setIsAssetModalOpen(true); }} className="bg-bb-blue text-white px-8 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all">➕ Adicionar Ativo</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {initialAssets.length === 0 ? (
          <div className="col-span-3 py-20 bg-white rounded-[2rem] border-2 border-dashed border-gray-100 flex flex-col items-center justify-center opacity-40 grayscale">
            <span className="text-5xl mb-4">📉</span>
            <p className="text-xs font-black uppercase text-bb-blue italic tracking-widest">Nenhum ativo custodiado na nuvem</p>
          </div>
        ) : (
          initialAssets.map(asset => (
            <div key={asset.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden flex flex-col border-b-4 border-b-transparent hover:border-b-bb-blue">
               <div className="p-8 space-y-4 flex-1">
                  <div className="flex justify-between items-start">
                     <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${asset.type === 'VARIABLE' ? 'bg-orange-50 text-orange-600' : asset.type === 'CRYPTO' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>{asset.type}</span>
                     <span className="text-xs">{asset.country_code === 'PT' ? '🇵🇹' : '🇧🇷'}</span>
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-bb-blue italic uppercase tracking-tighter leading-none mb-1">{asset.name}</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{asset.institution}</p>
                  </div>
                  <div className="pt-4 border-t border-gray-50">
                    <p className="text-[9px] font-black text-gray-300 uppercase italic mb-1">Saldo Atualizado</p>
                    <p className="text-2xl font-black text-bb-blue italic">{asset.country_code === 'PT' ? '€' : 'R$'} {asset.current_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
               </div>
               
               <div className="bg-gray-50/50 p-6 flex justify-between items-center">
                  <button onClick={() => { setSelectedAssetId(asset.id); setIsTxModalOpen(true); }} className="text-[10px] font-black uppercase text-bb-blue italic hover:underline">Histórico / Transação</button>
                  <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-all">
                     <button onClick={() => { setAssetForm(asset); setEditingAssetId(asset.id); setIsAssetModalOpen(true); }} className="text-bb-blue text-xs">✏️</button>
                     <button onClick={() => onDelete(asset.id)} className="text-red-500 text-xs">✕</button>
                  </div>
               </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Ativo */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveAsset} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-10 space-y-6 animate-in zoom-in duration-300">
            <div className="border-b border-gray-100 pb-4">
              <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Cadastro de Custódia</h3>
              <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 italic">Mapeamento de Ativo Técnico</p>
            </div>
            
            <div className="space-y-4">
               <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setAssetForm({...assetForm, country_code: 'PT'})} className={`py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${assetForm.country_code === 'PT' ? 'bg-bb-blue text-white border-bb-blue' : 'bg-gray-50 text-gray-400 border-transparent'}`}>Portugal</button>
                  <button type="button" onClick={() => setAssetForm({...assetForm, country_code: 'BR'})} className={`py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${assetForm.country_code === 'BR' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-50 text-gray-400 border-transparent'}`}>Brasil</button>
               </div>
               <input required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100" placeholder="Nome do Ativo" value={assetForm.name} onChange={e => setAssetForm({...assetForm, name: e.target.value})} />
               <input required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100" placeholder="Instituição Financeira" value={assetForm.institution} onChange={e => setAssetForm({...assetForm, institution: e.target.value})} />
               <select className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100" value={assetForm.type} onChange={e => setAssetForm({...assetForm, type: e.target.value as any})}>
                  <option value="FIXED">Renda Fixa</option>
                  <option value="VARIABLE">Renda Variável</option>
                  <option value="CRYPTO">Criptoativos</option>
               </select>
               <input type="number" step="0.01" className="w-full bg-bb-blue/5 p-4 rounded-xl text-lg font-black text-bb-blue border border-bb-blue/10" placeholder="Aporte Inicial" value={assetForm.initial_balance || ''} onChange={e => setAssetForm({...assetForm, initial_balance: Number(e.target.value)})} />
            </div>

            <div className="flex gap-4 pt-4">
               <button type="button" onClick={() => setIsAssetModalOpen(false)} className="flex-1 text-[10px] font-black uppercase text-gray-400 italic">Sair</button>
               <button type="submit" className="flex-[2] bg-bb-blue text-white py-4 rounded-xl text-[10px] font-black uppercase shadow-xl tracking-widest">Sincronizar</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Transação */}
      {isTxModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl p-10 flex flex-col md:flex-row gap-10 animate-in zoom-in duration-300">
             <div className="md:w-1/2 space-y-6">
                <div className="border-b border-gray-100 pb-4">
                  <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Nova Operação</h3>
                  <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 italic">Movimentação Técnica de Custódia</p>
                </div>
                
                <form onSubmit={handleAddTransaction} className="space-y-4">
                   <div className="grid grid-cols-2 gap-3">
                      <input type="date" required className="bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100" value={txForm.date} onChange={e => setTxForm({...txForm, date: e.target.value})} />
                      <select className="bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100" value={txForm.type} onChange={e => setTxForm({...txForm, type: e.target.value as any})}>
                         <option value="BUY">Compra / Aporte (+)</option>
                         <option value="SELL">Venda / Resgate (-)</option>
                         <option value="YIELD">Proventos / Juros (+)</option>
                         <option value="REVALUATION">Revalorização (+)</option>
                      </select>
                   </div>
                   <input type="number" step="0.01" required className="w-full bg-bb-blue/5 p-4 rounded-xl text-xl font-black text-bb-blue" placeholder="Valor Operação" value={txForm.value || ''} onChange={e => setTxForm({...txForm, value: Number(e.target.value)})} />
                   <input className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100" placeholder="Descrição (Ex: JCP, Compra de cotas...)" value={txForm.description} onChange={e => setTxForm({...txForm, description: e.target.value})} />
                   
                   <div className="flex gap-4 pt-6">
                      <button type="button" onClick={() => setIsTxModalOpen(false)} className="flex-1 text-[10px] font-black uppercase text-gray-400 italic">Voltar</button>
                      <button type="submit" className="flex-[2] bg-bb-blue text-white py-4 rounded-xl text-[10px] font-black uppercase shadow-xl tracking-widest">Registrar Operação</button>
                   </div>
                </form>
             </div>

             <div className="md:w-1/2 flex flex-col bg-gray-50 p-8 rounded-[2rem] border border-gray-100 max-h-[500px]">
                <h4 className="text-[10px] font-black text-bb-blue uppercase italic tracking-widest mb-6 border-b border-gray-200 pb-3">Últimas Movimentações</h4>
                <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide pr-2">
                   {(initialAssets.find(a => a.id === selectedAssetId)?.history || [])
                     .sort((a,b) => b.date.localeCompare(a.date))
                     .map(tx => (
                      <div key={tx.id} className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center group">
                         <div>
                            <p className="text-[8px] text-gray-400 font-bold mb-1">{tx.date.split('-').reverse().join('/')}</p>
                            <p className="text-[10px] font-black text-gray-700 uppercase leading-none">{tx.description || tx.type}</p>
                         </div>
                         <div className={`text-[11px] font-black italic ${tx.type === 'SELL' ? 'text-red-500' : 'text-emerald-600'}`}>
                            {tx.type === 'SELL' ? '-' : '+'} {tx.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                         </div>
                      </div>
                   ))}
                   {(initialAssets.find(a => a.id === selectedAssetId)?.history?.length === 0) && (
                     <div className="flex-1 flex flex-col items-center justify-center py-20 opacity-30 italic">
                        <span className="text-3xl mb-2">📜</span>
                        <p className="text-[9px] font-black uppercase">Sem histórico registrado</p>
                     </div>
                   )}
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Investments;
