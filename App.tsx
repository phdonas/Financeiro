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

import { signInWithGoogle, signOutUser } from "./lib/auth";
import { getStorageMode, listDocs, upsertDoc, deleteDocById } from "./lib/cloudStore";

type StorageMode = "local" | "cloud";

type Categoria = { id: string; nome: string };
type FormaPagamento = { id: string; nome: string };
type Fornecedor = { id: string; nome: string };
type Orcamento = { id: string; categoriaId: string; mes: string; valor: number };

type InssConfig = { id: string; pessoa: string; competencia: string; vencimento: string; valor: number; pago?: boolean };
type InssRecord = { id: string; pessoa: string; competencia: string; pagoEm?: string; valor: number };

type Transacao = {
  id: string;
  date: string;
  tipo: "receita" | "despesa";
  categoriaId: string;
  pagamentoId: string;
  fornecedorId?: string;
  descricao?: string;
  valor: number;
};

type Receipt = { id: string; date: string; fornecedorId: string; valor: number; descricao?: string };
type Investment = { id: string; date: string; tipo: string; valor: number; descricao?: string };

const STORAGE_KEY = "PHD_FINANCEIRO_DATA_V1";

// Mapeamento: nome "local" (estado/UI) -> nome da coleção no Firestore (subcoleção dentro do household)
// Observação: formasPagamento virou "paymentMethods" na nuvem para manter o padrão do app.
const CLOUD_MAP: Record<string, string> = {
  categorias: "categorias",
  formasPagamento: "paymentMethods",
  fornecedores: "fornecedores",
  orcamentos: "orcamentos",
  inssConfigs: "inssConfigs",
  inssRecords: "inssRecords",
  transacoes: "transacoes",
  receipts: "receipts",
  investments: "investments",
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>("local");

  const [activePage, setActivePage] = useState<string>("dashboard");

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);

  const [inssConfigs, setInssConfigs] = useState<InssConfig[]>([]);
  const [inssRecords, setInssRecords] = useState<InssRecord[]>([]);

  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);

  // 1) AUTH
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // 2) Carrega do localStorage no boot (apenas para modo local / fallback)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      setCategorias(parsed.categorias || []);
      setFormasPagamento(parsed.formasPagamento || []);
      setFornecedores(parsed.fornecedores || []);
      setOrcamentos(parsed.orcamentos || []);

      setInssConfigs(parsed.inssConfigs || []);
      setInssRecords(parsed.inssRecords || []);

      setTransacoes(parsed.transacoes || []);
      setReceipts(parsed.receipts || []);
      setInvestments(parsed.investments || []);
    } catch (e) {
      console.error("Falha ao carregar localStorage:", e);
    }
  }, []);

  // 3) Descobre o modo (cloud/local) a partir do Firestore
  useEffect(() => {
    if (!user) return;

    getStorageMode()
      .then((mode) => {
        setStorageMode(mode);
      })
      .catch((err) => {
        console.error("Falha ao ler storageMode (assumindo local):", err);
        setStorageMode("local");
      });
  }, [user]);

  // 4) Se cloud: carrega tudo do Firestore
  useEffect(() => {
    if (!user) return;

    if (storageMode === "cloud") {
      (async () => {
        try {
          const [
            categoriasCloud,
            formasPagamentoCloud,
            fornecedoresCloud,
            orcamentosCloud,
            inssConfigsCloud,
            inssRecordsCloud,
            transacoesCloud,
            receiptsCloud,
            investmentsCloud,
          ] = await Promise.all([
            listDocs<any>(CLOUD_MAP.categorias),
            listDocs<any>(CLOUD_MAP.formasPagamento),
            listDocs<any>(CLOUD_MAP.fornecedores),
            listDocs<any>(CLOUD_MAP.orcamentos),
            listDocs<any>(CLOUD_MAP.inssConfigs),
            listDocs<any>(CLOUD_MAP.inssRecords),
            listDocs<any>(CLOUD_MAP.transacoes),
            listDocs<any>(CLOUD_MAP.receipts),
            listDocs<any>(CLOUD_MAP.investments),
          ]);

          setCategorias(categoriasCloud);
          setFormasPagamento(formasPagamentoCloud);
          setFornecedores(fornecedoresCloud);
          setOrcamentos(orcamentosCloud);

          setInssConfigs(inssConfigsCloud);
          setInssRecords(inssRecordsCloud);

          setTransacoes(transacoesCloud);
          setReceipts(receiptsCloud);
          setInvestments(investmentsCloud);
        } catch (err) {
          console.error("Falha ao carregar dados da nuvem:", err);
        }
      })();
      return;
    }
  }, [storageMode, user]);

  // 5) Persistência local (somente no modo local)
  useEffect(() => {
    if (storageMode !== "local") return;

    try {
      const payload = {
        categorias,
        formasPagamento,
        fornecedores,
        orcamentos,
        inssConfigs,
        inssRecords,
        transacoes,
        receipts,
        investments,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error("Falha ao salvar no localStorage:", e);
    }
  }, [
    storageMode,
    categorias,
    formasPagamento,
    fornecedores,
    orcamentos,
    inssConfigs,
    inssRecords,
    transacoes,
    receipts,
    investments,
  ]);

  const dbSave = async (collectionName: string, item: any) => {
    // Segurança mínima: todo item salvo precisa ter id
    if (!item?.id) {
      console.error(`dbSave: item sem id para coleção "${collectionName}"`, item);
      return;
    }

    // Helper: aplica upsert no estado local (para a UI refletir imediatamente)
    const applyUpsert = (setter: React.Dispatch<React.SetStateAction<any[]>>) => {
      setter((prev) => {
        const idx = prev.findIndex((x: any) => x.id === item.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = item;
          return copy;
        }
        return [...prev, item];
      });
    };

    // 1) CLOUD MODE
    if (storageMode === "cloud") {
      const cloudCollection = CLOUD_MAP[collectionName];
      if (!cloudCollection) {
        console.warn(`Coleção "${collectionName}" não mapeada para nuvem. Salvando apenas local.`);
      } else {
        try {
          await upsertDoc(cloudCollection, item);
        } catch (err) {
          console.error(`Falha ao salvar na nuvem (${cloudCollection}). Mantendo UI sem persistir:`, err);
          return;
        }
      }

      // Atualiza o estado local para refletir na tela (mesmo em cloud)
      switch (collectionName) {
        case "categorias": applyUpsert(setCategorias); break;
        case "formasPagamento": applyUpsert(setFormasPagamento); break;
        case "fornecedores": applyUpsert(setFornecedores); break;
        case "orcamentos": applyUpsert(setOrcamentos); break;
        case "inssConfigs": applyUpsert(setInssConfigs); break;
        case "inssRecords": applyUpsert(setInssRecords); break;
        case "transacoes": applyUpsert(setTransacoes); break;
        case "receipts": applyUpsert(setReceipts); break;
        case "investments": applyUpsert(setInvestments); break;
        default:
          console.warn(`dbSave: coleção desconhecida "${collectionName}" (cloud).`);
      }
      return;
    }

    // 2) LOCAL MODE
    switch (collectionName) {
      case "categorias": applyUpsert(setCategorias); break;
      case "formasPagamento": applyUpsert(setFormasPagamento); break;
      case "fornecedores": applyUpsert(setFornecedores); break;
      case "orcamentos": applyUpsert(setOrcamentos); break;
      case "inssConfigs": applyUpsert(setInssConfigs); break;
      case "inssRecords": applyUpsert(setInssRecords); break;
      case "transacoes": applyUpsert(setTransacoes); break;
      case "receipts": applyUpsert(setReceipts); break;
      case "investments": applyUpsert(setInvestments); break;
      default:
        console.warn(`dbSave: coleção desconhecida "${collectionName}" (local).`);
    }
  };

  const dbDelete = async (collectionName: string, id: string) => {
    if (!id) return;

    const applyDelete = (setter: React.Dispatch<React.SetStateAction<any[]>>) => {
      setter((prev) => prev.filter((x: any) => x.id !== id));
    };

    // 1) CLOUD MODE
    if (storageMode === "cloud") {
      const cloudCollection = CLOUD_MAP[collectionName];
      if (!cloudCollection) {
        console.warn(`Coleção "${collectionName}" não mapeada para nuvem. Removendo apenas local.`);
      } else {
        try {
          await deleteDocById(cloudCollection, id);
        } catch (err) {
          console.error(`Falha ao remover na nuvem (${cloudCollection}). Mantendo UI sem persistir:`, err);
          return;
        }
      }

      switch (collectionName) {
        case "categorias": applyDelete(setCategorias); break;
        case "formasPagamento": applyDelete(setFormasPagamento); break;
        case "fornecedores": applyDelete(setFornecedores); break;
        case "orcamentos": applyDelete(setOrcamentos); break;
        case "inssConfigs": applyDelete(setInssConfigs); break;
        case "inssRecords": applyDelete(setInssRecords); break;
        case "transacoes": applyDelete(setTransacoes); break;
        case "receipts": applyDelete(setReceipts); break;
        case "investments": applyDelete(setInvestments); break;
        default:
          console.warn(`dbDelete: coleção desconhecida "${collectionName}" (cloud).`);
      }
      return;
    }

    // 2) LOCAL MODE
    switch (collectionName) {
      case "categorias": applyDelete(setCategorias); break;
      case "formasPagamento": applyDelete(setFormasPagamento); break;
      case "fornecedores": applyDelete(setFornecedores); break;
      case "orcamentos": applyDelete(setOrcamentos); break;
      case "inssConfigs": applyDelete(setInssConfigs); break;
      case "inssRecords": applyDelete(setInssRecords); break;
      case "transacoes": applyDelete(setTransacoes); break;
      case "receipts": applyDelete(setReceipts); break;
      case "investments": applyDelete(setInvestments); break;
      default:
        console.warn(`dbDelete: coleção desconhecida "${collectionName}" (local).`);
    }
  };

  const handleLogin = async () => {
    await signInWithGoogle();
  };

  const handleLogout = async () => {
    await signOutUser();
  };

  const renderPage = () => {
    if (activePage === "dashboard") {
      return <Dashboard transacoes={transacoes} categorias={categorias} />;
    }
    if (activePage === "ledger") {
      return (
        <Ledger
          transacoes={transacoes}
          categorias={categorias}
          formasPagamento={formasPagamento}
          fornecedores={fornecedores}
          onSave={(t: Transacao) => dbSave("transacoes", t)}
          onDelete={(id: string) => dbDelete("transacoes", id)}
        />
      );
    }
    if (activePage === "receipts") {
      return (
        <Receipts
          receipts={receipts}
          fornecedores={fornecedores}
          onSave={(r: Receipt) => dbSave("receipts", r)}
          onDelete={(id: string) => dbDelete("receipts", id)}
        />
      );
    }
    if (activePage === "import") {
      return <ImportSection />;
    }
    if (activePage === "calendar") {
      return <Calendar transacoes={transacoes} />;
    }
    if (activePage === "settings") {
      return (
        <Settings
          storageMode={storageMode}
          categorias={categorias}
          formasPagamento={formasPagamento}
          fornecedores={fornecedores}
          orcamentos={orcamentos}
          onSaveCategoria={(c: Categoria) => dbSave("categorias", c)}
          onDeleteCategoria={(id: string) => dbDelete("categorias", id)}
          onSaveFormaPagamento={(fp: FormaPagamento) => dbSave("formasPagamento", fp)}
          onDeleteFormaPagamento={(id: string) => dbDelete("formasPagamento", id)}
          onSaveFornecedor={(f: Fornecedor) => dbSave("fornecedores", f)}
          onDeleteFornecedor={(id: string) => dbDelete("fornecedores", id)}
        />
      );
    }
    if (activePage === "investments") {
      return (
        <Investments
          investments={investments}
          onSave={(i: Investment) => dbSave("investments", i)}
          onDelete={(id: string) => dbDelete("investments", id)}
        />
      );
    }
    if (activePage === "tax") {
      return <TaxReports transacoes={transacoes} />;
    }
    if (activePage === "inss") {
      return (
        <InssBrasil
          configs={inssConfigs}
          records={inssRecords}
          onSaveConfig={(c: InssConfig) => dbSave("inssConfigs", c)}
          onDeleteConfig={(id: string) => dbDelete("inssConfigs", id)}
          onSaveRecord={(r: InssRecord) => dbSave("inssRecords", r)}
          onDeleteRecord={(id: string) => dbDelete("inssRecords", id)}
        />
      );
    }

    return <Dashboard transacoes={transacoes} categorias={categorias} />;
  };

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <div className="app-main">
        <Header
          user={user}
          storageMode={storageMode}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />

        <div className="app-content">{renderPage()}</div>
      </div>
    </div>
  );
}
