
import React, { useState, useMemo } from 'react';
import Accounts from './Accounts';
import { CategoriaContabil, FormaPagamento, Orcamento, Fornecedor, TipoTransacao, InssYearlyConfig } from '../types';

interface SettingsProps {
  categorias: CategoriaContabil[];
  onSaveCat: (c: CategoriaContabil) => void;
  onDeleteCat: (id: string) => void;
  formasPagamento: FormaPagamento[];
  onSaveFP: (f: FormaPagamento) => void;
  onDeleteFP: (id: string) => void;
  orcamentos: Orcamento[];
  onSaveOrc: (o: Orcamento) => void;
  onDeleteOrc: (id: string) => void;
  fornecedores: Fornecedor[];
  onSaveSup: (s: Fornecedor) => void;
  onDeleteSup: (id: string) => void;
  inssConfigs: InssYearlyConfig[];
  onSaveInss: (i: InssYearlyConfig) => void;
  onDeleteInss: (ano: string) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
  categorias, onSaveCat, onDeleteCat,
  formasPagamento, onSaveFP, onDeleteFP,
  orcamentos, onSaveOrc, onDeleteOrc,
  fornecedores, onSaveSup, onDeleteSup,
  inssConfigs, onSaveInss, onDeleteInss
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'PLANO' | 'PAGAMENTO' | 'ORCAMENTO' | 'FORNECEDORES' | 'INSS'>('PLANO');
  
  // States CRUD Fornecedores
  const [isSupModalOpen, setIsSupModalOpen] = useState(false);
  const [editingSupId, setEditingSupId] = useState<string | null>(null);
  const [newSup, setNewSup] = useState<Partial<Fornecedor>>({ nome: '', pais: 'PT', descricao: '', flag_calcula_premiacao: false });

  // States CRUD Formas Pagamento
  const [isFPModalOpen, setIsFPModalOpen] = useState(false);
  const [editingFPId, setEditingFPId] = useState<string | null>(null);
  const [newFP, setNewFP] = useState<Partial<FormaPagamento>>({ nome: '', categoria: 'BANCO' });

  // States CRUD Orçamentos
  const [isOrcModalOpen, setIsOrcModalOpen] = useState(false);
  const [newOrc, setNewOrc] = useState<Partial<Orcamento & { recorrente?: boolean }>>({ categoria_id: '', ano: new Date().getFullYear(), mes: new Date().getMonth(), valor_meta: 0, codigo_pais: 'PT', recorrente: false });
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [budgetFilterCountry, setBudgetFilterCountry] = useState<'PT' | 'BR'>('PT');

  // States CRUD INSS Params
  const [isInssModalOpen, setIsInssModalOpen] = useState(false);
  const [editingInssYear, setEditingInssYear] = useState<number | null>(null);
  const [inssFormData, setInssFormData] = useState<InssYearlyConfig>({
    ano: 2025, salario_base: 7700, percentual_inss: 11,
    paulo: { nit: '', total_parcelas: 0, data_aposentadoria: '' },
    debora: { nit: '', total_parcelas: 0, data_aposentadoria: '' }
  });

  const meses_nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const handleSaveSup = () => {
    if (!newSup.nome) return;
    onSaveSup({ ...newSup, id: editingSupId || Math.random().toString(36).substr(2, 9) } as Fornecedor);
    setIsSupModalOpen(false); setEditingSupId(null);
  };

  const handleSaveFP = () => {
    if (!newFP.nome) return;
    onSaveFP({ ...newFP, id: editingFPId || Math.random().toString(36).substr(2, 9) } as FormaPagamento);
    setIsFPModalOpen(false); setEditingFPId(null);
  };

  const handleSaveOrcamento = () => {
    if (!newOrc.categoria_id) return;
    const startMonth = newOrc.mes!;
    const endMonth = newOrc.recorrente ? 11 : startMonth;
    for (let m = startMonth; m <= endMonth; m++) {
      onSaveOrc({
        id: Math.random().toString(36).substr(2, 9),
        categoria_id: newOrc.categoria_id!,
        ano: newOrc.ano!,
        mes: m,
        valor_meta: newOrc.valor_meta!,
        codigo_pais: newOrc.codigo_pais as 'PT' | 'BR'
      });
    }
    setIsOrcModalOpen(false);
  };

  const filteredOrcamentos = useMemo(() => {
    return orcamentos.filter(o => o.ano === filterYear && o.codigo_pais === budgetFilterCountry).sort((a, b) => a.mes - b.mes);
  }, [orcamentos, filterYear, budgetFilterCountry]);

  return (
    <div className="p-8 space-y-8 pb-20">
      <div className="flex gap-4 border-b">
        {['PLANO', 'PAGAMENTO', 'ORCAMENTO', 'FORNECEDORES', 'INSS'].map(tab => (
          <button key={tab} onClick={() => setActiveSubTab(tab as any)} className={`pb-4 px-2 text-xs font-black uppercase tracking-widest ${activeSubTab === tab ? 'border-b-4 border-bb-blue text-bb-blue' : 'text-gray-400'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeSubTab === 'PLANO' && <Accounts viewMode="GLOBAL" categorias={categorias} setCategorias={(updated) => {
        // Adaptador para o componente Accounts antigo que esperava setCategorias local
        if (typeof updated === 'function') {
           const res = updated(categorias);
           res.forEach((c: any) => onSaveCat(c));
        } else {
           updated.forEach((c: any) => onSaveCat(c));
        }
      }} />}

      {activeSubTab === 'PAGAMENTO' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-black text-bb-blue uppercase italic">Formas de Pagamento</h3>
            <button onClick={() => { setNewFP({nome:'', categoria:'BANCO'}); setEditingFPId(null); setIsFPModalOpen(true); }} className="bg-bb-blue text-white px-6 py-2 rounded-xl text-[10px] font-black shadow-lg">+ Adicionar</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['BANCO', 'CARTAO', 'DINHEIRO'].map(cat => (
              <div key={cat} className="bg-white p-6 rounded-[2rem] border shadow-sm">
                <h4 className="text-[10px] font-black text-bb-blue uppercase mb-4 border-b pb-2">{cat}</h4>
                <div className="space-y-2">
                  {formasPagamento.filter(f => f.categoria === cat).map(f => (
                    <div key={f.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl group">
                      <span className="text-xs font-bold text-gray-700">{f.nome}</span>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100"><button onClick={() => { setEditingFPId(f.id); setNewFP(f); setIsFPModalOpen(true); }} className="text-[8px] uppercase font-black text-bb-blue underline">Edit</button><button onClick={() => onDeleteFP(f.id)} className="text-[8px] uppercase font-black text-red-500 underline">X</button></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'ORCAMENTO' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border shadow-sm flex-wrap gap-4">
            <h3 className="text-xl font-black text-bb-blue uppercase italic">Gestão de Metas Nuvem</h3>
            <div className="flex gap-4 items-center">
              <select className="bg-gray-50 border-none p-2 rounded-xl text-xs font-bold" value={budgetFilterCountry} onChange={e => setBudgetFilterCountry(e.target.value as any)}><option value="PT">🇵🇹 PT</option><option value="BR">🇧🇷 BR</option></select>
              <button onClick={() => { setNewOrc({categoria_id:'', ano: filterYear, mes: 0, valor_meta: 0, recorrente: false, codigo_pais: budgetFilterCountry}); setIsOrcModalOpen(true); }} className="bg-bb-blue text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase shadow-xl">+ Definir Meta</button>
            </div>
          </div>
          <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
             <table className="w-full text-[11px]"><thead className="bg-gray-50 text-bb-blue font-black uppercase italic"><tr><th className="px-6 py-4">Mês</th><th className="px-6 py-4">Categoria</th><th className="px-6 py-4 text-right">Valor Meta</th><th className="px-6 py-4 text-center">X</th></tr></thead>
               <tbody className="divide-y">{filteredOrcamentos.map(o => (<tr key={o.id} className="hover:bg-gray-50 group"><td className="px-6 py-4 font-bold">{meses_nomes[o.mes]}</td><td className="px-6 py-4 font-black text-bb-blue uppercase">{categorias.find(c => c.id === o.categoria_id)?.nome || '---'}</td><td className="px-6 py-4 text-right font-black">{o.codigo_pais === 'PT' ? '€' : 'R$'} {o.valor_meta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td className="px-6 py-4 text-center"><button onClick={() => onDeleteOrc(o.id)} className="text-red-400 font-black text-[8px] opacity-0 group-hover:opacity-100">REMOVER</button></td></tr>))}</tbody>
             </table>
          </div>
        </div>
      )}

      {/* Fornecedores and INSS follow same prop patterns */}
      {/* ... keeping simplified for Step 2 completion ... */}

      {isSupModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-sm space-y-4 animate-in zoom-in">
            <h3 className="text-lg font-black text-bb-blue italic uppercase tracking-tighter">Fornecedor</h3>
            <input className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border-none" placeholder="Nome" value={newSup.nome} onChange={e => setNewSup({...newSup, nome: e.target.value})} />
            <div className="flex gap-3 pt-4"><button onClick={() => setIsSupModalOpen(false)} className="flex-1 text-xs font-black uppercase text-gray-400">Sair</button><button onClick={handleSaveSup} className="flex-2 bg-bb-blue text-white py-3 px-8 rounded-xl text-xs font-black shadow-lg">Salvar</button></div>
          </div>
        </div>
      )}

      {isOrcModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm space-y-4 animate-in zoom-in">
            <h3 className="text-lg font-black text-bb-blue uppercase italic">Definir Meta</h3>
            <select className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border-none" value={newOrc.categoria_id} onChange={e => setNewOrc({...newOrc, categoria_id: e.target.value})}><option value="">Selecione...</option>{categorias.filter(c => c.tipo === TipoTransacao.DESPESA).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            <input type="number" step="0.01" className="w-full bg-gray-50 p-4 rounded-xl text-sm font-black" placeholder="Valor Meta" value={newOrc.valor_meta || ''} onChange={e => setNewOrc({...newOrc, valor_meta: Number(e.target.value)})} />
            <label className="flex items-center gap-2 text-[9px] font-black uppercase italic text-bb-blue"><input type="checkbox" checked={newOrc.recorrente} onChange={e => setNewOrc({...newOrc, recorrente: e.target.checked})} /> Replicar para todo o ano</label>
            <div className="flex gap-3 pt-4"><button onClick={() => setIsOrcModalOpen(false)} className="flex-1 text-xs font-black uppercase text-gray-400">Sair</button><button onClick={handleSaveOrcamento} className="flex-2 bg-bb-blue text-white py-3 px-8 rounded-xl text-xs font-black uppercase shadow-lg">Confirmar</button></div>
          </div>
        </div>
      )}

      {activeSubTab === 'FORNECEDORES' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-black text-bb-blue uppercase italic">Fornecedores</h3>
            <button onClick={() => { setNewSup({nome:'', pais:'PT'}); setEditingSupId(null); setIsSupModalOpen(true); }} className="bg-bb-blue text-white px-6 py-2 rounded-xl text-[10px] font-black shadow-lg">+ Novo Fornecedor</button>
          </div>
          <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
            <table className="w-full text-left text-[11px]"><thead className="bg-gray-50 text-bb-blue uppercase font-black italic"><tr><th className="px-6 py-4">País</th><th className="px-6 py-4">Nome</th><th className="px-6 py-4 text-center">Ações</th></tr></thead>
              <tbody className="divide-y">{fornecedores.map(s => (<tr key={s.id} className="hover:bg-gray-50 group"><td className="px-6 py-4">{s.pais}</td><td className="px-6 py-4 font-black">{s.nome}</td><td className="px-6 py-4 text-center"><button onClick={() => { setEditingSupId(s.id); setNewSup(s); setIsSupModalOpen(true); }} className="text-bb-blue font-black uppercase text-[8px] mr-2">Edit</button><button onClick={() => onDeleteSup(s.id)} className="text-red-400 font-black uppercase text-[8px]">Delete</button></td></tr>))}</tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'INSS' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-black text-bb-blue uppercase italic">Parâmetros INSS</h3>
            <button onClick={() => { setInssFormData({ano: 2025, salario_base: 7700, percentual_inss: 11, paulo: { nit: '', total_parcelas: 0, data_aposentadoria: '' }, debora: { nit: '', total_parcelas: 0, data_aposentadoria: '' }}); setEditingInssYear(null); setIsInssModalOpen(true); }} className="bg-bb-blue text-white px-6 py-2 rounded-xl text-[10px] font-black shadow-lg">+ Novo Ano</button>
          </div>
          <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
             <table className="w-full text-[11px]"><thead className="bg-gray-50 text-bb-blue font-black italic"><tr><th className="px-6 py-4">Ano</th><th className="px-6 py-4">Base</th><th className="px-6 py-4 text-center">Alíquota</th><th className="px-6 py-4 text-center">Ações</th></tr></thead>
               <tbody className="divide-y">{inssConfigs.map(config => (<tr key={config.ano} className="hover:bg-gray-50 group"><td className="px-6 py-4 font-black">{config.ano}</td><td className="px-6 py-4">R$ {config.salario_base.toLocaleString('pt-BR')}</td><td className="px-6 py-4 text-center">{config.percentual_inss}%</td><td className="px-6 py-4 text-center"><button onClick={() => { setEditingInssYear(config.ano); setInssFormData(config); setIsInssModalOpen(true); }} className="text-bb-blue text-[8px] font-black uppercase mr-2">Edit</button><button onClick={() => onDeleteInss(config.ano.toString())} className="text-red-400 text-[8px] font-black uppercase">Del</button></td></tr>))}</tbody>
             </table>
          </div>
        </div>
      )}

      {isInssModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-md space-y-4">
            <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter">Parâmetros INSS</h3>
            <input type="number" className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold" value={inssFormData.ano} onChange={e => setInssFormData({...inssFormData, ano: Number(e.target.value)})} placeholder="Ano Fiscal" />
            <input type="number" className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold" value={inssFormData.salario_base} onChange={e => setInssFormData({...inssFormData, salario_base: Number(e.target.value)})} placeholder="Salário Base" />
            <input type="number" className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold" value={inssFormData.percentual_inss} onChange={e => setInssFormData({...inssFormData, percentual_inss: Number(e.target.value)})} placeholder="Alíquota %" />
            <div className="flex gap-3 pt-4"><button onClick={() => setIsInssModalOpen(false)} className="flex-1 text-xs font-black uppercase text-gray-400">Sair</button><button onClick={() => { onSaveInss(inssFormData); setIsInssModalOpen(false); }} className="flex-2 bg-bb-blue text-white py-3 rounded-xl text-xs font-black uppercase">Salvar Nuvem</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
