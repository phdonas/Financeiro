import React, { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./lib/firebase";

import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Ledger from "./components/Ledger";
import Receipts from "./components/Receipts";
import ImportSection from "./components/ImportSection";
import Calendar from "./components/Calendar";
import Header from "./components/Header";
import Settings from "./components/Settings";
import Investments from "./components/Investments";
import TaxReports from "./components/TaxReports";
import InssBrasil from "./components/InssBrasil";
import AIAdvisor from "./components/AIAdvisor";
import Login from "./components/Login";

import {
  Transacao,
  CategoriaContabil,
  FormaPagamento,
  Orcamento,
  Fornecedor,
  Receipt,
  InvestmentAsset,
  InssRecord,
  InssYearlyConfig
} from "./types";

const STORAGE_KEY = "PHD_FINANCEIRO_DATA_V1";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [viewMode, setViewMode] = useState<"BR" | "PT" | "GLOBAL">("GLOBAL");

  const [categorias, setCategorias] = useState<CategoriaContabil[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [inssConfigs, setInssConfigs] = useState<InssYearlyConfig[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [investments, setInvestments] = useState<InvestmentAsset[]>([]);
  const [inssRecords, setInssRecords] = useState<InssRecord[]>([]);

  // 1) Checar login
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  // 2) Carregar dados locais (por enquanto)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.categorias) setCategorias(data.categorias);
        if (data.formasPagamento) setFormasPagamento(data.formasPagamento);
        if (data.fornecedores) setFornecedores(data.fornecedores);
        if (data.orcamentos) setOrcamentos(data.orcamentos);
        if (data.inssConfigs) setInssConfigs(data.inssConfigs);
        if (data.transacoes) setTransacoes(data.transacoes);
        if (data.receipts) setReceipts(data.receipts);
        if (data.investments) setInvestments(data.investments);
        if (data.inssRecords) setInssRecords(data.inssRecords);
      } catch (e) {
        console.error("Erro ao carregar dados locais:", e);
      }
    }
  }, []);

  // 3) Salvar dados locais (por enquanto)
  useEffect(() => {
    const dataToSave = {
      categorias,
      formasPagamento,
      fornecedores,
      orcamentos,
      inssConfigs,
      transacoes,
      receipts,
      investments,
      inssRecords
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  }, [
    categorias,
    formasPagamento,
    fornecedores,
    orcamentos,
    inssConfigs,
    transacoes,
    receipts,
    investments,
    inssRecords
  ]);

  const dbSave = (collection: string, id: string | undefined, data: any) => {
    const docId = id || Math.random().toString(36).substr(2, 9);
    const finalData = { ...data, id: docId, updated_at: new Date().toISOString() };

    switch (collection) {
      case "categorias":
        setCategorias((prev) => [...prev.filter((i) => i.id !== docId), finalData]);
        break;
      case "formasPagamento":
        setFormasPagamento((prev) => [...prev.filter((i) => i.id !== docId), finalData]);
        break;
      case "fornecedores":
        setFornecedores((prev) => [...prev.filter((i) => i.id !== docId), finalData]);
        break;
      case "orcamentos":
        setOrcamentos((prev) => [...prev.filter((i) => i.id !== docId), finalData]);
        break;
      case "inssConfigs":
        setInssConfigs((prev) => [...prev.filter((i) => i.ano !== finalData.ano), finalData]);
        break;
      case "transacoes":
        setTransacoes((prev) => [...prev.filter((i) => i.id !== docId), finalData]);
        break;
      case "receipts":
        setReceipts((prev) => [...prev.filter((i) => i.internal_id !== docId), finalData]);
        break;
      case "investments":
        setInvestments((prev) => [...prev.filter((i) => i.id !== docId), finalData]);
        break;
      case "inssRecords":
        setInssRecords((prev) => [...prev.filter((i) => i.id !== docId), finalData]);
        break;
    }
  };

  const dbDelete = (collection: string, id: string) => {
    if (!confirm("Deseja excluir permanentemente este registro?")) return;
    switch (collection) {
      case "categorias":
        setCategorias((prev) => prev.filter((i) => i.id !== id));
        break;
      case "formasPagamento":
        setFormasPagamento((prev) => prev.filter((i) => i.id !== id));
        break;
      case "fornecedores":
        setFornecedores((prev) => prev.filter((i) => i.id !== id));
        break;
      case "orcamentos":
        setOrcamentos((prev) => prev.filter((i) => i.id !== id));
        break;
      case "inssConfigs":
        setInssConfigs((prev) => prev.filter((i) => i.ano.toString() !== id));
        break;
      case "transacoes":
        setTransacoes((prev) => prev.filter((i) => i.id !== id));
        break;
      case "receipts":
        setReceipts((prev) => prev.filter((i) => i.internal_id !== id));
        break;
      case "investments":
        setInvestments((prev) => prev.filter((i) => i.id !== id));
        break;
      case "inssRecords":
        setInssRecords((prev) => prev.filter((i) => i.id !== id));
        break;
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <Dashboard
            viewMode={viewMode}
            transacoes={transacoes}
            orcamentos={orcamentos}
            categorias={categorias}
            investments={investments}
          />
        );
      case "ai_advisor":
        return <AIAdvisor transacoes={transacoes} investimentos={investments} recibos={receipts} />;
      case "ledger":
        return (
          <Ledger
            viewMode={viewMode}
            transacoes={transacoes}
            categorias={categorias}
            formasPagamento={formasPagamento}
            onSave={(t) => dbSave("transacoes", t.id, t)}
            onDelete={(id) => dbDelete("transacoes", id)}
          />
        );
      case "inss":
        return (
          <InssBrasil
            records={inssRecords}
            configs={inssConfigs}
            onSave={(r) => dbSave("inssRecords", r.id, r)}
            onDelete={(id) => dbDelete("inssRecords", id)}
          />
        );
      case "receipts":
        return (
          <Receipts
            viewMode={viewMode}
            receipts={receipts}
            fornecedores={fornecedores}
            categorias={categorias}
            formasPagamento={formasPagamento}
            onSave={(r) => dbSave("receipts", r.internal_id, r)}
            onDelete={(id) => dbDelete("receipts", id)}
            onSaveTx={(t) => dbSave("transacoes", t.id, t)}
          />
        );
      case "investments":
        return (
          <Investments
            viewMode={viewMode}
            initialAssets={investments}
            onSave={(a) => dbSave("investments", a.id, a)}
            onDelete={(id) => dbDelete("investments", id)}
          />
        );
      case "calendar":
        return <Calendar viewMode={viewMode} transacoes={transacoes} />;
      case "taxes":
        return (
          <TaxReports
            viewMode={viewMode}
            receipts={receipts}
            fornecedores={fornecedores}
            formasPagamento={formasPagamento}
            onSaveTx={(t) => dbSave("transacoes", t.id, t)}
          />
        );
      case "import":
        return (
          <ImportSection
            categorias={categorias}
            formasPagamento={formasPagamento}
            fornecedores={fornecedores}
            onSaveTx={(t) => dbSave("transacoes", t.id, t)}
            onSaveReceipt={(r) => dbSave("receipts", r.internal_id, r)}
          />
        );
      case "settings":
        return (
          <Settings
            categorias={categorias}
            onSaveCat={(c) => dbSave("categorias", c.id, c)}
            onDeleteCat={(id) => dbDelete("categorias", id)}
            formasPagamento={formasPagamento}
            onSaveFP={(f) => dbSave("formasPagamento", f.id, f)}
            onDeleteFP={(id) => dbDelete("formasPagamento", id)}
            orcamentos={orcamentos}
            onSaveOrc={(o) => dbSave("orcamentos", o.id, o)}
            onDeleteOrc={(id) => dbDelete("orcamentos", id)}
            fornecedores={fornecedores}
            onSaveSup={(s) => dbSave("fornecedores", s.id, s)}
            onDeleteSup={(id) => dbDelete("fornecedores", id)}
            inssConfigs={inssConfigs}
            onSaveInss={(i) => dbSave("inssConfigs", i.ano.toString(), i)}
            onDeleteInss={(ano) => dbDelete("inssConfigs", ano.toString())}
          />
        );
      default:
        return (
          <Dashboard
            viewMode={viewMode}
            transacoes={transacoes}
            orcamentos={orcamentos}
            categorias={categorias}
            investments={investments}
          />
        );
    }
  };

  // Enquanto checa auth, evita "piscar"
  if (!authChecked) {
    return <div style={{ padding: 24, fontWeight: 700 }}>Carregando…</div>;
  }

  // Se não logou, mostra Login
  if (!user) {
    return <Login />;
  }

  // Logado = app abre
  return (
    <div className="flex min-h-screen bg-[#f4f7fa]">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header viewMode={viewMode} setViewMode={setViewMode} title={activeTab === "ai_advisor" ? "Consultor IA" : activeTab} />
        <main className="flex-1 overflow-y-auto bg-gray-50/30">{renderContent()}</main>

        <div className="fixed bottom-4 right-4 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full border border-gray-100 shadow-sm flex items-center gap-2 pointer-events-none z-50">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest italic">
            Login OK (próximo passo: sincronizar na nuvem)
          </span>
        </div>
      </div>
    </div>
  );
};

export default App;
