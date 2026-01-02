import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";

import { auth } from "./lib/firebase";
import { signInWithGoogle, signOutUser } from "./lib/auth";
import { getStorageMode, listDocs, upsertDoc, deleteDocById } from "./lib/cloudStore";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import Ledger from "./components/Ledger";
import Calendar from "./components/Calendar";
import AIAdvisor from "./components/AIAdvisor";
import InssBrasil from "./components/InssBrasil";
import Receipts from "./components/Receipts";
import Investments from "./components/Investments";
import TaxReports from "./components/TaxReports";
import ImportSection from "./components/ImportData";
import Settings from "./components/Settings";

type ViewMode = "BR" | "PT" | "GLOBAL";
type StorageMode = "local" | "cloud";

// ---- Local storage ----
const STORAGE_KEY = "PHD_FINANCEIRO_DATA_V1";

type WithId = { id: string; [k: string]: any };

type LocalState = {
  version: 1;
  viewMode: ViewMode;
  baseCurrency: string;
  storageMode: StorageMode;

  categorias: WithId[];
  formasPagamento: WithId[];
  fornecedores: WithId[];
  orcamentos: WithId[];

  transacoes: WithId[];
  receipts: WithId[];
  investments: WithId[];

  inssConfigs: WithId[];
  inssRecords: WithId[];

  updatedAt: string;
};

// ErrorBoundary simples para não ficar “tela branca” se algum componente falhar
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: err?.message || String(err) };
  }
  componentDidCatch(err: any) {
    console.error("UI crashed:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
            <div className="font-bold text-red-800 mb-2">Erro na interface</div>
            <div className="text-red-700 whitespace-pre-wrap">
              {this.state.message}
            </div>
            <div className="text-red-700 mt-3">
              Se isso aparecer, o app não fica mais “em branco”: você enxerga o erro.
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  const [activePage, setActivePage] = useState<string>("dashboard");
  const [viewMode, setViewMode] = useState<ViewMode>("BR");
  const [baseCurrency, setBaseCurrency] = useState<string>("EUR");

  const [storageMode, setStorageMode] = useState<StorageMode>("local");
  const [cloudError, setCloudError] = useState<string>("");

  // Dados
  const [categorias, setCategorias] = useState<WithId[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<WithId[]>([]);
  const [fornecedores, setFornecedores] = useState<WithId[]>([]);
  const [orcamentos, setOrcamentos] = useState<WithId[]>([]);

  const [transacoes, setTransacoes] = useState<WithId[]>([]);
  const [receipts, setReceipts] = useState<WithId[]>([]);
  const [investments, setInvestments] = useState<WithId[]>([]);

  const [inssConfigs, setInssConfigs] = useState<WithId[]>([]);
  const [inssRecords, setInssRecords] = useState<WithId[]>([]);

  // ---- Helpers: local load/save ----
  const loadLocal = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const s = JSON.parse(raw) as Partial<LocalState>;

      setViewMode((s.viewMode as ViewMode) || "BR");
      setBaseCurrency((s.baseCurrency as string) || "EUR");
      setStorageMode((s.storageMode as StorageMode) || "local");

      setCategorias(Array.isArray(s.categorias) ? s.categorias : []);
      setFormasPagamento(Array.isArray(s.formasPagamento) ? s.formasPagamento : []);
      setFornecedores(Array.isArray(s.fornecedores) ? s.fornecedores : []);
      setOrcamentos(Array.isArray(s.orcamentos) ? s.orcamentos : []);

      setTransacoes(Array.isArray(s.transacoes) ? s.transacoes : []);
      setReceipts(Array.isArray(s.receipts) ? s.receipts : []);
      setInvestments(Array.isArray(s.investments) ? s.investments : []);

      setInssConfigs(Array.isArray(s.inssConfigs) ? s.inssConfigs : []);
      setInssRecords(Array.isArray(s.inssRecords) ? s.inssRecords : []);
    } catch (e: any) {
      console.error("Falha ao carregar localStorage:", e);
    }
  };

  const persistLocal = () => {
    try {
      const payload: LocalState = {
        version: 1,
        viewMode,
        baseCurrency,
        storageMode,

        categorias,
        formasPagamento,
        fornecedores,
        orcamentos,

        transacoes,
        receipts,
        investments,

        inssConfigs,
        inssRecords,

        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e: any) {
      console.error("Falha ao salvar localStorage:", e);
    }
  };

  // 1) Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // 2) Carrega Local ao iniciar (para não abrir vazio)
  useEffect(() => {
    loadLocal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3) Decide storageMode (cloud/local) com base no Firestore
  useEffect(() => {
    let alive = true;

    (async () => {
      setCloudError("");

      // sem user => fica local
      if (!user) {
        if (!alive) return;
        setStorageMode("local");
        return;
      }

      try {
        const mode = await getStorageMode();
        if (!alive) return;
        setStorageMode(mode);
      } catch (e: any) {
        console.error("Falha ao ler storageMode do Firestore:", e);
        if (!alive) return;
        setStorageMode("local");
        setCloudError(e?.message || String(e));
      }
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  // 4) Se cloud: carrega coleções do Firestore (todas com fallback seguro)
  useEffect(() => {
    let alive = true;

    (async () => {
      if (storageMode !== "cloud" || !user) return;

      try {
        const [
          _categorias,
          _formas,
          _fornecedores,
          _orcamentos,
          _transacoes,
          _receipts,
          _investments,
          _inssConfigs,
          _inssRecords,
        ] = await Promise.all([
          listDocs<WithId>("categorias"),
          listDocs<WithId>("formasPagamento"),
          listDocs<WithId>("fornecedores"),
          listDocs<WithId>("orcamentos"),
          listDocs<WithId>("transacoes"),
          listDocs<WithId>("receipts"),
          listDocs<WithId>("investments"),
          listDocs<WithId>("inssConfigs"),
          listDocs<WithId>("inssRecords"),
        ]);

        if (!alive) return;

        setCategorias(Array.isArray(_categorias) ? _categorias : []);
        setFormasPagamento(Array.isArray(_formas) ? _formas : []);
        setFornecedores(Array.isArray(_fornecedores) ? _fornecedores : []);
        setOrcamentos(Array.isArray(_orcamentos) ? _orcamentos : []);

        setTransacoes(Array.isArray(_transacoes) ? _transacoes : []);
        setReceipts(Array.isArray(_receipts) ? _receipts : []);
        setInvestments(Array.isArray(_investments) ? _investments : []);

        setInssConfigs(Array.isArray(_inssConfigs) ? _inssConfigs : []);
        setInssRecords(Array.isArray(_inssRecords) ? _inssRecords : []);
      } catch (e: any) {
        console.error("Falha ao carregar dados do Firestore:", e);
        setCloudError(e?.message || String(e));
      }
    })();

    return () => {
      alive = false;
    };
  }, [storageMode, user]);

  // 5) Persistência local contínua (mesmo em cloud, mantém cache)
  useEffect(() => {
    persistLocal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewMode,
    baseCurrency,
    storageMode,
    categorias,
    formasPagamento,
    fornecedores,
    orcamentos,
    transacoes,
    receipts,
    investments,
    inssConfigs,
    inssRecords,
  ]);

  // ---- CRUD genérico ----
  const upsertLocal = (arr: WithId[], item: WithId) => {
    const idx = arr.findIndex((x) => x.id === item.id);
    if (idx >= 0) {
      const next = [...arr];
      next[idx] = { ...next[idx], ...item };
      return next;
    }
    return [...arr, item];
  };

  const addOrUpdateItem =
    (collectionName: string) =>
    async (item: WithId) => {
      if (!item?.id) {
        throw new Error(`Item sem "id" em ${collectionName}`);
      }

      // atualiza estado local (UI instantânea)
      const apply = (setter: React.Dispatch<React.SetStateAction<WithId[]>>) => {
        setter((prev) => upsertLocal(prev, item));
      };

      switch (collectionName) {
        case "categorias":
          apply(setCategorias);
          break;
        case "formasPagamento":
          apply(setFormasPagamento);
          break;
        case "fornecedores":
          apply(setFornecedores);
          break;
        case "orcamentos":
          apply(setOrcamentos);
          break;
        case "transacoes":
          apply(setTransacoes);
          break;
        case "receipts":
          apply(setReceipts);
          break;
        case "investments":
          apply(setInvestments);
          break;
        case "inssConfigs":
          apply(setInssConfigs);
          break;
        case "inssRecords":
          apply(setInssRecords);
          break;
        default:
          console.warn("Coleção não mapeada:", collectionName);
      }

      // se cloud, grava no Firestore também
      if (storageMode === "cloud" && user) {
        await upsertDoc(collectionName, item);
      }
    };

  const deleteItem =
    (collectionName: string) =>
    async (id: string) => {
      const apply = (setter: React.Dispatch<React.SetStateAction<WithId[]>>) => {
        setter((prev) => prev.filter((x) => x.id !== id));
      };

      switch (collectionName) {
        case "categorias":
          apply(setCategorias);
          break;
        case "formasPagamento":
          apply(setFormasPagamento);
          break;
        case "fornecedores":
          apply(setFornecedores);
          break;
        case "orcamentos":
          apply(setOrcamentos);
          break;
        case "transacoes":
          apply(setTransacoes);
          break;
        case "receipts":
          apply(setReceipts);
          break;
        case "investments":
          apply(setInvestments);
          break;
        case "inssConfigs":
          apply(setInssConfigs);
          break;
        case "inssRecords":
          apply(setInssRecords);
          break;
        default:
          console.warn("Coleção não mapeada:", collectionName);
      }

      if (storageMode === "cloud" && user) {
        await deleteDocById(collectionName, id);
      }
    };

  // ---- Login/Logout ----
  const onLogin = async () => {
    await signInWithGoogle();
  };
  const onLogout = async () => {
    await signOutUser();
  };

  // ---- UI labels ----
  const userLabel = useMemo(() => {
    if (!user) return "Usuário Local";
    return (user.displayName || user.email || "Usuário").slice(0, 22);
  }, [user]);

  const modeLabel = useMemo(() => {
    if (storageMode === "cloud") return "Modo Cloud";
    return "Modo Offline";
  }, [storageMode]);

  // ---- Render page ----
  const renderPage = () => {
    if (activePage === "dashboard") {
      return (
        <Dashboard
          transacoes={transacoes}
          orcamentos={orcamentos}
          viewMode={viewMode}
          investimentos={investments}
        />
      );
    }

    if (activePage === "ai_advisor") {
      return <AIAdvisor transacoes={transacoes} investimentos={investments} />;
    }

    if (activePage === "ledger") {
      return (
        <Ledger
          transacoes={transacoes}
          categorias={categorias}
          formasPagamento={formasPagamento}
          fornecedores={fornecedores}
          viewMode={viewMode}
          onSave={addOrUpdateItem("transacoes")}
          onDelete={deleteItem("transacoes")}
        />
      );
    }

    if (activePage === "calendar") {
      return (
        <Calendar
          viewMode={viewMode}
          transacoes={transacoes}
          categorias={categorias}
        />
      );
    }

    if (activePage === "inss") {
      return (
        <InssBrasil
          configs={inssConfigs}
          records={inssRecords}
          onSaveConfig={addOrUpdateItem("inssConfigs")}
          onDeleteConfig={deleteItem("inssConfigs")}
          onSaveRecord={addOrUpdateItem("inssRecords")}
          onDeleteRecord={deleteItem("inssRecords")}
        />
      );
    }

    if (activePage === "receipts") {
      return (
        <Receipts
          recibos={receipts}
          addOrUpdateRecibo={addOrUpdateItem("receipts")}
          deleteRecibo={deleteItem("receipts")}
        />
      );
    }

    if (activePage === "investments") {
      return (
        <Investments
          investments={investments}
          onSaveInvestment={addOrUpdateItem("investments")}
          onDeleteInvestment={deleteItem("investments")}
          viewMode={viewMode}
        />
      );
    }

    if (activePage === "taxes") {
      return <TaxReports transacoes={transacoes} viewMode={viewMode} />;
    }

    if (activePage === "import") {
      return (
        <ImportSection
          onImportTransacoes={async (items: WithId[]) => {
            for (const it of items) await addOrUpdateItem("transacoes")(it);
          }}
        />
      );
    }

    if (activePage === "settings") {
      return (
        <Settings
          viewMode={viewMode}
          baseCurrency={baseCurrency}
          storageMode={storageMode}
          user={user}
          categorias={categorias}
          formasPagamento={formasPagamento}
          fornecedores={fornecedores}
          onSetViewMode={(m: ViewMode) => setViewMode(m)}
          onSetBaseCurrency={(c: string) => setBaseCurrency(c)}
          onSetStorageMode={(m: StorageMode) => setStorageMode(m)}
          onSaveCategoria={addOrUpdateItem("categorias")}
          onDeleteCategoria={deleteItem("categorias")}
          onSaveFormaPagamento={addOrUpdateItem("formasPagamento")}
          onDeleteFormaPagamento={deleteItem("formasPagamento")}
          onSaveFornecedor={addOrUpdateItem("fornecedores")}
          onDeleteFornecedor={deleteItem("fornecedores")}
        />
      );
    }

    return (
      <div className="p-6 text-sm text-slate-600">
        Selecione uma opção no menu.
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-white">
      <Sidebar activePage={activePage} onNavigate={setActivePage} userLabel={userLabel} modeLabel={modeLabel} />

      <div className="flex-1 min-w-0 flex flex-col">
        <Header user={user} storageMode={storageMode} onLogin={onLogin} onLogout={onLogout} />

        {cloudError ? (
          <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-bold mb-1">Aviso: Cloud indisponível (caiu para local)</div>
            <div className="whitespace-pre-wrap">{cloudError}</div>
            <div className="mt-2">
              Se isso persistir, o problema é regra/permissão do Firestore ou member doc.
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          <ErrorBoundary>{renderPage()}</ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
