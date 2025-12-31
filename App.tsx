
import React, { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from "firebase/auth";
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where,
  limit
} from "firebase/firestore";

import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Ledger from './components/Ledger';
import Receipts from './components/Receipts';
import ImportSection from './components/ImportSection';
import Calendar from './components/Calendar';
import Header from './components/Header';
import Settings from './components/Settings';
import Investments from './components/Investments';
import TaxReports from './components/TaxReports';
import InssBrasil from './components/InssBrasil';
import Login from './components/Login';
import { 
  Transacao, CategoriaContabil, TipoTransacao, FormaPagamento, 
  Orcamento, Fornecedor, Receipt, InvestmentAsset, 
  InssRecord, InssYearlyConfig 
} from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState<'BR' | 'PT' | 'GLOBAL'>('GLOBAL');
  
  const [categorias, setCategorias] = useState<CategoriaContabil[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [inssConfigs, setInssConfigs] = useState<InssYearlyConfig[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [investments, setInvestments] = useState<InvestmentAsset[]>([]);
  const [inssRecords, setInssRecords] = useState<InssRecord[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const sync = (coll: string, setter: Function, sortField?: string) => {
      const q = query(
        collection(db, coll), 
        where("user_uid", "==", user.uid),
        limit(1000)
      );
        
      return onSnapshot(q, (snap) => {
        let data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        
        if (sortField) {
          data = data.sort((a: any, b: any) => {
            const valA = a[sortField] || '';
            const valB = b[sortField] || '';
            return valB.toString().localeCompare(valA.toString());
          });
        }
        
        setter(data);
      }, (error) => {
        console.error(`Erro crítico na coleção ${coll}:`, error.message);
      });
    };

    const unsubs = [
      sync('categorias', setCategorias, 'nome'),
      sync('formasPagamento', setFormasPagamento, 'nome'),
      sync('fornecedores', setFornecedores, 'nome'),
      sync('orcamentos', setOrcamentos),
      sync('inssConfigs', setInssConfigs, 'ano'),
      sync('transacoes', setTransacoes, 'data_prevista_pagamento'),
      sync('receipts', setReceipts, 'issue_date'),
      sync('investments', setInvestments, 'name'),
      sync('inssRecords', setInssRecords, 'vencimento')
    ];

    return () => unsubs.forEach(un => un());
  }, [user]);

  const dbSave = async (coll: string, id: string | undefined, data: any) => {
    if (!user) return;
    try {
      const docId = id || Math.random().toString(36).substr(2, 9);
      const cleanData = JSON.parse(JSON.stringify(data)); 
      
      await setDoc(doc(db, coll, docId), { 
        ...cleanData, 
        id: docId,
        user_uid: user.uid,
        updated_at: new Date().toISOString()
      }, { merge: true });
    } catch (e) { 
      console.error(`Erro ao salvar ${coll}:`, e);
    }
  };

  const dbDelete = async (coll: string, id: string) => {
    if (!user || !id) return;
    if (!confirm('Deseja excluir permanentemente este registro da nuvem?')) return;
    try {
      await deleteDoc(doc(db, coll, id));
    } catch (e) { 
      console.error(`Erro ao deletar de ${coll}:`, e); 
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch (e) { console.error("Erro logout:", e); }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bb-blue flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="loader"></div>
          <p className="text-white text-[10px] font-black uppercase tracking-[0.3em] opacity-50 italic text-center animate-pulse">
            Sincronizando com a Nuvem PHD...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard viewMode={viewMode} transacoes={transacoes} orcamentos={orcamentos} categorias={categorias} investments={investments} />;
      case 'ledger': return <Ledger viewMode={viewMode} transacoes={transacoes} categorias={categorias} formasPagamento={formasPagamento} onSave={(t) => dbSave('transacoes', t.id, t)} onDelete={(id) => dbDelete('transacoes', id)} />;
      case 'inss': return <InssBrasil records={inssRecords} configs={inssConfigs} onSave={(r) => dbSave('inssRecords', r.id, r)} onDelete={(id) => dbDelete('inssRecords', id)} />;
      case 'receipts': return <Receipts viewMode={viewMode} receipts={receipts} fornecedores={fornecedores} categorias={categorias} formasPagamento={formasPagamento} onSave={(r) => dbSave('receipts', r.internal_id, r)} onDelete={(id) => dbDelete('receipts', id)} onSaveTx={(t) => dbSave('transacoes', t.id, t)} />;
      case 'investments': return <Investments viewMode={viewMode} initialAssets={investments} onSave={(a) => dbSave('investments', a.id, a)} onDelete={(id) => dbDelete('investments', id)} />;
      case 'calendar': return <Calendar viewMode={viewMode} transacoes={transacoes} />;
      case 'taxes': return <TaxReports viewMode={viewMode} receipts={receipts} fornecedores={fornecedores} formasPagamento={formasPagamento} onSaveTx={(t) => dbSave('transacoes', t.id, t)} />;
      case 'import': return <ImportSection categorias={categorias} formasPagamento={formasPagamento} fornecedores={fornecedores} onSaveTx={(t) => dbSave('transacoes', t.id, t)} onSaveReceipt={(r) => dbSave('receipts', r.internal_id, r)} />;
      case 'settings': 
        return (
          <Settings 
            categorias={categorias} onSaveCat={(c) => dbSave('categorias', c.id, c)} onDeleteCat={(id) => dbDelete('categorias', id)}
            formasPagamento={formasPagamento} onSaveFP={(f) => dbSave('formasPagamento', f.id, f)} onDeleteFP={(id) => dbDelete('formasPagamento', id)}
            orcamentos={orcamentos} onSaveOrc={(o) => dbSave('orcamentos', o.id, o)} onDeleteOrc={(id) => dbDelete('orcamentos', id)}
            fornecedores={fornecedores} onSaveSup={(s) => dbSave('fornecedores', s.id, s)} onDeleteSup={(id) => dbDelete('fornecedores', id)}
            inssConfigs={inssConfigs} onSaveInss={(i) => dbSave('inssConfigs', i.ano.toString(), i)} onDeleteInss={(ano) => dbDelete('inssConfigs', ano.toString())}
          />
        );
      default: return <Dashboard viewMode={viewMode} transacoes={transacoes} orcamentos={orcamentos} categorias={categorias} investments={investments} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f4f7fa]">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header viewMode={viewMode} setViewMode={setViewMode} title={activeTab} />
        <main className="flex-1 overflow-y-auto bg-gray-50/30">{renderContent()}</main>
        <button onClick={handleLogout} className="fixed bottom-6 right-6 w-12 h-12 bg-white text-gray-300 hover:text-red-500 rounded-full shadow-2xl flex items-center justify-center transition-all z-50 border border-gray-100 hover:scale-110 active:scale-95 group" title="Encerrar Sessão">
          <span className="text-xl group-hover:rotate-12 transition-transform">🚪</span>
        </button>
      </div>
    </div>
  );
};

export default App;
