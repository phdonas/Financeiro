
import React, { useState } from 'react';
import { TipoTransacao, CategoriaContabil, ContaItem } from '../types';

interface AccountsProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  categorias: CategoriaContabil[];
  setCategorias: React.Dispatch<React.SetStateAction<CategoriaContabil[]>>;
}

const Accounts: React.FC<AccountsProps> = ({ viewMode, categorias, setCategorias }) => {
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [newCat, setNewCat] = useState({ nome: '', tipo: TipoTransacao.DESPESA });
  const [newItem, setNewItem] = useState<Partial<ContaItem>>({ nome: '', fornecedor_padrao: '', codigo_pais: 'PT', observacao: '' });

  const handleSaveCategoria = () => {
    if (!newCat.nome) return;
    if (editingCatId) {
      setCategorias(categorias.map(c => c.id === editingCatId ? { ...c, nome: newCat.nome, tipo: newCat.tipo } : c));
    } else {
      const cat: CategoriaContabil = {
        id: Math.random().toString(36).substr(2, 9),
        nome: newCat.nome,
        tipo: newCat.tipo,
        contas: []
      };
      setCategorias([...categorias, cat]);
    }
    closeCatModal();
  };

  const closeCatModal = () => {
    setIsCatModalOpen(false);
    setEditingCatId(null);
    setNewCat({ nome: '', tipo: TipoTransacao.DESPESA });
  };

  const handleEditCat = (cat: CategoriaContabil) => {
    setNewCat({ nome: cat.nome, tipo: cat.tipo });
    setEditingCatId(cat.id);
    setIsCatModalOpen(true);
  };

  const handleSaveItem = () => {
    if (!newItem.nome || !selectedCatId) return;
    const finalItem: ContaItem = {
      id: editingItemId || Math.random().toString(36).substr(2, 9),
      nome: newItem.nome!,
      fornecedor_padrao: newItem.fornecedor_padrao || '',
      codigo_pais: (newItem.codigo_pais as 'PT' | 'BR') || 'PT',
      observacao: newItem.observacao || ''
    };

    if (editingItemId) {
      setCategorias(categorias.map(c => 
        c.id === selectedCatId 
          ? { ...c, contas: c.contas.map(i => i.id === editingItemId ? finalItem : i) } 
          : c
      ));
    } else {
      setCategorias(categorias.map(c => c.id === selectedCatId ? { ...c, contas: [...c.contas, finalItem] } : c));
    }
    closeItemModal();
  };

  const closeItemModal = () => {
    setIsItemModalOpen(false);
    setEditingItemId(null);
    setSelectedCatId(null);
    setNewItem({ nome: '', fornecedor_padrao: '', codigo_pais: 'PT', observacao: '' });
  };

  const handleEditItem = (catId: string, item: ContaItem) => {
    setSelectedCatId(catId);
    setEditingItemId(item.id);
    setNewItem({ 
      nome: item.nome, 
      fornecedor_padrao: item.fornecedor_padrao || '', 
      codigo_pais: item.codigo_pais,
      observacao: item.observacao || ''
    });
    setIsItemModalOpen(true);
  };

  const deleteItem = (catId: string, itemId: string) => {
    if (confirm('Deseja excluir esta conta?')) {
      setCategorias(categorias.map(c => 
        c.id === catId ? { ...c, contas: c.contas.filter(i => i.id !== itemId) } : c
      ));
    }
  };

  const deleteCat = (catId: string) => {
    if (confirm('Deseja excluir a categoria e todas as suas contas?')) {
      setCategorias(categorias.filter(c => c.id !== catId));
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
        <div>
          <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter">Plano de Contas</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 italic">Gestão Multipaís de Categorias e Itens</p>
        </div>
        <button 
          onClick={() => setIsCatModalOpen(true)}
          className="bg-bb-blue text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform"
        >
          + Nova Categoria
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {[TipoTransacao.DESPESA, TipoTransacao.RECEITA].map(tipo => (
          <div key={tipo} className="space-y-6">
            <div className={`flex items-center gap-3 border-b-4 pb-3 ${tipo === TipoTransacao.DESPESA ? 'border-red-500' : 'border-emerald-500'}`}>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-sm ${tipo === TipoTransacao.DESPESA ? 'bg-red-50' : 'bg-emerald-50'}`}>
                {tipo === TipoTransacao.DESPESA ? '💸' : '💰'}
              </div>
              <div>
                <h4 className="text-sm font-black text-bb-blue uppercase italic leading-tight">
                  {tipo === TipoTransacao.DESPESA ? 'Gestão de Saídas' : 'Gestão de Entradas'}
                </h4>
                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                  {categorias.filter(c => c.tipo === tipo).length} Categorias Cadastradas
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              {categorias.filter(c => c.tipo === tipo).map(cat => (
                <div key={cat.id} className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="bg-gray-50/80 px-8 py-5 flex justify-between items-center border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <span className="font-black text-bb-blue uppercase text-xs tracking-tighter">{cat.nome}</span>
                      <button 
                        onClick={() => handleEditCat(cat)} 
                        className="p-1.5 bg-white rounded-lg text-[8px] text-gray-400 hover:text-bb-blue transition-colors shadow-sm"
                      >
                        ✏️
                      </button>
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => { setSelectedCatId(cat.id); setIsItemModalOpen(true); }} 
                        className="bg-bb-blue text-white px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-sm hover:bg-bb-blue/90"
                      >
                        + Novo Item
                      </button>
                      <button 
                        onClick={() => deleteCat(cat.id)} 
                        className="p-1.5 bg-red-50 text-red-500 rounded-lg text-[8px] hover:bg-red-500 hover:text-white transition-all"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {cat.contas.length === 0 ? (
                      <div className="col-span-full py-6 text-center">
                        <p className="text-[9px] text-gray-300 font-black uppercase italic tracking-widest">Nenhum item vinculado</p>
                      </div>
                    ) : (
                      cat.contas.map(item => (
                        <div key={item.id} className="flex justify-between items-center bg-gray-50/50 p-4 rounded-[1.5rem] group border border-transparent hover:border-bb-blue/10 hover:bg-white transition-all">
                          <div className="flex items-center gap-3">
                            <span className="text-sm grayscale group-hover:grayscale-0 transition-all">
                              {item.codigo_pais === 'PT' ? '🇵🇹' : '🇧🇷'}
                            </span>
                            <div>
                              <p className="text-[10px] font-black text-gray-700 uppercase leading-none mb-1">{item.nome}</p>
                              <p className="text-[7px] text-gray-400 uppercase font-bold italic tracking-tighter">
                                {item.fornecedor_padrao || 'Sem fornecedor'}
                              </p>
                              {item.observacao && (
                                <p className="text-[7px] text-bb-blue font-bold truncate max-w-[120px] mt-1">📝 {item.observacao}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={() => handleEditItem(cat.id, item)} 
                              className="w-7 h-7 bg-white shadow-sm flex items-center justify-center rounded-lg text-[8px] text-bb-blue"
                            >
                              ✏️
                            </button>
                            <button 
                              onClick={() => deleteItem(cat.id, item.id)} 
                              className="w-7 h-7 bg-white shadow-sm flex items-center justify-center rounded-lg text-[8px] text-red-400"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Categoria */}
      {isCatModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-10 w-full max-w-sm space-y-6 animate-in zoom-in duration-200 shadow-2xl">
            <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter border-b pb-4">
              {editingCatId ? 'Editar Categoria' : 'Nova Categoria'}
            </h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-400 italic">Nome da Categoria</label>
                <input className="w-full bg-gray-50 p-4 rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue" placeholder="Ex: Habitação, Lazer..." value={newCat.nome} onChange={e => setNewCat({...newCat, nome: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-400 italic">Tipo de Fluxo</label>
                <div className="flex gap-3">
                  <button onClick={() => setNewCat({...newCat, tipo: TipoTransacao.DESPESA})} className={`flex-1 py-4 rounded-2xl text-[9px] font-black uppercase border-2 transition-all ${newCat.tipo === TipoTransacao.DESPESA ? 'bg-red-50 text-red-600 border-red-500 shadow-sm' : 'bg-gray-50 text-gray-400 border-transparent hover:border-gray-200'}`}>Saída 💸</button>
                  <button onClick={() => setNewCat({...newCat, tipo: TipoTransacao.RECEITA})} className={`flex-1 py-4 rounded-2xl text-[9px] font-black uppercase border-2 transition-all ${newCat.tipo === TipoTransacao.RECEITA ? 'bg-emerald-50 text-emerald-600 border-emerald-500 shadow-sm' : 'bg-gray-50 text-gray-400 border-transparent hover:border-gray-200'}`}>Entrada 💰</button>
                </div>
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={closeCatModal} className="flex-1 py-4 text-[10px] font-black uppercase text-gray-400 hover:text-red-500 transition-colors">Sair</button>
              <button onClick={handleSaveCategoria} className="flex-[2] bg-bb-blue text-white py-4 rounded-2xl text-[10px] font-black uppercase shadow-xl tracking-widest hover:scale-[1.02] transition-transform">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Item */}
      {isItemModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-10 w-full max-w-sm space-y-6 animate-in zoom-in duration-200 shadow-2xl">
            <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter border-b pb-4">
              {editingItemId ? 'Editar Item' : 'Novo Item de Conta'}
            </h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-400 italic">País de Atuação</label>
                <div className="flex gap-3">
                  <button onClick={() => setNewItem({...newItem, codigo_pais: 'PT'})} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border-2 transition-all flex items-center justify-center gap-2 ${newItem.codigo_pais === 'PT' ? 'bg-bb-blue text-white border-bb-blue' : 'bg-gray-50 text-gray-400 border-transparent'}`}>
                    <span>🇵🇹</span> Portugal
                  </button>
                  <button onClick={() => setNewItem({...newItem, codigo_pais: 'BR'})} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border-2 transition-all flex items-center justify-center gap-2 ${newItem.codigo_pais === 'BR' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-50 text-gray-400 border-transparent'}`}>
                    <span>🇧🇷</span> Brasil
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-400 italic">Nome do Item</label>
                <input className="w-full bg-gray-50 p-4 rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue" placeholder="Ex: Aluguel Lisboa, Uber BR..." value={newItem.nome} onChange={e => setNewItem({...newItem, nome: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-400 italic">Fornecedor Padrão (Opcional)</label>
                <input className="w-full bg-gray-50 p-4 rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue" placeholder="Ex: EDP, Google, etc." value={newItem.fornecedor_padrao} onChange={e => setNewItem({...newItem, fornecedor_padrao: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-400 italic">Observação Padrão</label>
                <textarea className="w-full bg-gray-50 p-4 rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue" placeholder="Ex: Enviar leitura até dia 5..." value={newItem.observacao} onChange={e => setNewItem({...newItem, observacao: e.target.value})} rows={2} />
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={closeItemModal} className="flex-1 py-4 text-[10px] font-black uppercase text-gray-400 hover:text-red-500 transition-colors">Voltar</button>
              <button onClick={handleSaveItem} className="flex-[2] bg-bb-blue text-white py-4 rounded-2xl text-[10px] font-black uppercase shadow-xl tracking-widest hover:scale-[1.02] transition-transform">Salvar Item</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounts;
