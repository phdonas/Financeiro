import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";

import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import AIAdvisor from "./components/AIAdvisor";
import Ledger from "./components/Ledger";
import Calendar from "./components/Calendar";
import Receipts from "./components/Receipts";
import Investments from "./components/Investments";
import TaxReports from "./components/TaxReports";
import ImportSection from "./components/ImportSection";
import Settings from "./components/Settings";

import { auth } from "./lib/firebase";
import {
  DEFAULT_HOUSEHOLD_ID,
  StorageMode,
  ensureHouseholdMember,
  getStorageMode,
  setStorageMode as setStorageModeCloud,
  listHouseholdItems,
  upsertHouseholdItem,
  deleteHouseholdItem,
} from "./lib/cloudStore";

import type {
  CategoriaContabil,
  FormaPagamento,
  Fornecedor,
  Orcamento,
  Transacao,
  Receipt,
  InvestmentAsset,
} from "./types";

type ViewMode = "PT" | "BR" | "GLOBAL";

const LS_PREFIX = `ff_${DEFAULT_HOUSEHOLD_ID}_`;
const lsKey = (k: string) => `${LS_PREFIX}${k}`;

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function newId(): string {
  // @ts-expect-error crypto pode não existir em alguns ambientes
  return typeof crypto !== "undefined" && crypto.randomUUID
    // @ts-expect-error randomUUID existe em browsers modernos
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const householdId = DEFAULT_HOUSEHOLD_ID;

  // -------------------- AUTH --------------------
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        try {
          await ensureHouseholdMember(u.uid, householdId, {
            email: u.email ?? null,
            name: u.displayName ?? null,
          });
        } catch (e) {
          console.error("Falha ao garantir membership:", e);
        }
      }
    });
    return () => unsub();
  }, [householdId]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // -------------------- VIEW MODE --------------------
  const [viewMode, setViewMode] = useState<ViewMode>("GLOBAL");

  // -------------------- STORAGE MODE --------------------
  const [storageMode, setStorageMode] = useState<StorageMode>(() => {
    return safeJsonParse<StorageMode>(
      localStorage.getItem(lsKey("storageMode")),
      "local"
    );
  });

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      setStorageMode("local");
      localStorage.setItem(lsKey("storageMode"), JSON.stringify("local"));
      return;
    }

    (async () => {
      try {
        const mode = await getStorageMode(householdId);
        setStorageMode(mode);
        localStorage.setItem(lsKey("storageMode"), JSON.stringify(mode));
      } catch (e) {
        console.error("Falha ao ler storageMode (assumindo local):", e);
        setStorageMode("local");
        localStorage.setItem(lsKey("storageMode"), JSON.stringify("local"));
      }
    })();
  }, [authReady, user, householdId]);

  const isCloud = storageMode === "cloud" && !!user;

  const setStorageModeSafe = useCallback(
    async (mode: StorageMode) => {
      setStorageMode(mode);
      localStorage.setItem(lsKey("storageMode"), JSON.stringify(mode));

      if (user) {
        try {
          await setStorageModeCloud(mode, householdId);
        } catch (e) {
          console.error("Falha ao salvar storageMode no Firestore:", e);
        }
      }
    },
    [user, householdId]
  );

  // -------------------- DATA --------------------
  const [categorias, setCategorias] = useState<CategoriaContabil[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [investments, setInvestments] = useState<InvestmentAsset[]>([]);
  const [exchangeRates, setExchangeRates] = useState<
    Record<"PT" | "BR", number>
  >({ PT: 1, BR: 1 });

  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (storageMode === "cloud" && !user) return;

    (async () => {
      setLoadingData(true);
      try {
        if (storageMode === "local") {
          setCategorias(
            safeJsonParse(localStorage.getItem(lsKey("categorias")), [])
          );
          setFormasPagamento(
            safeJsonParse(localStorage.getItem(lsKey("formasPagamento")), [])
          );
          setFornecedores(
            safeJsonParse(localStorage.getItem(lsKey("fornecedores")), [])
          );
          setOrcamentos(
            safeJsonParse(localStorage.getItem(lsKey("orcamentos")), [])
          );
          setTransacoes(
            safeJsonParse(localStorage.getItem(lsKey("transacoes")), [])
          );
          setReceipts(
            safeJsonParse(localStorage.getItem(lsKey("receipts")), [])
          );
          setInvestments(
            safeJsonParse(localStorage.getItem(lsKey("investments")), [])
          );
          setExchangeRates(
            safeJsonParse(localStorage.getItem(lsKey("exchangeRates")), {
              PT: 1,
              BR: 1,
            })
          );
        } else {
          const [
            categoriasCloud,
            formasCloud,
            fornecedoresCloud,
            orcamentosCloud,
            transacoesCloud,
            receiptsCloud,
            investmentsCloud,
          ] = await Promise.all([
            listHouseholdItems<CategoriaContabil>("categorias", householdId),
            listHouseholdItems<FormaPagamento>(
              "formasPagamento",
              householdId
            ),
            listHouseholdItems<Fornecedor>("fornecedores", householdId),
            listHouseholdItems<Orcamento>("orcamentos", householdId),
            listHouseholdItems<Transacao>("transacoes", householdId),
            listHouseholdItems<Receipt>("receipts", householdId),
            listHouseholdItems<InvestmentAsset>("investments", householdId),
          ]);

          setCategorias(categoriasCloud);
          setFormasPagamento(formasCloud);
          setFornecedores(fornecedoresCloud);
          setOrcamentos(orcamentosCloud);
          setTransacoes(transacoesCloud);
          setReceipts(receiptsCloud);
          setInvestments(investmentsCloud);

          setExchangeRates(
            safeJsonParse(localStorage.getItem(lsKey("exchangeRates")), {
              PT: 1,
              BR: 1,
            })
          );
        }
      } catch (e) {
        console.error("Falha ao carregar dados:", e);
        setCategorias([]);
        setFormasPagamento([]);
        setFornecedores([]);
        setOrcamentos([]);
        setTransacoes([]);
        setReceipts([]);
        setInvestments([]);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [authReady, user, storageMode, householdId]);

  // fallback local (sempre grava)
  useEffect(() => {
    localStorage.setItem(lsKey("categorias"), JSON.stringify(categorias));
  }, [categorias]);
  useEffect(() => {
    localStorage.setItem(
      lsKey("formasPagamento"),
      JSON.stringify(formasPagamento)
    );
  }, [formasPagamento]);
  useEffect(() => {
    localStorage.setItem(lsKey("fornecedores"), JSON.stringify(fornecedores));
  }, [fornecedores]);
  useEffect(() => {
    localStorage.setItem(lsKey("orcamentos"), JSON.stringify(orcamentos));
  }, [orcamentos]);
  useEffect(() => {
    localStorage.setItem(lsKey("transacoes"), JSON.stringify(transacoes));
  }, [transacoes]);
  useEffect(() => {
    localStorage.setItem(lsKey("receipts"), JSON.stringify(receipts));
  }, [receipts]);
  useEffect(() => {
    localStorage.setItem(lsKey("investments"), JSON.stringify(investments));
  }, [investments]);
  useEffect(() => {
    localStorage.setItem(lsKey("exchangeRates"), JSON.stringify(exchangeRates));
  }, [exchangeRates]);

  // -------------------- CRUD HELPERS --------------------
  const upsertLocal = useCallback(<T extends { id?: string }>(
    list: T[],
    item: T
  ): T[] => {
    const id = item.id ?? newId();
    const next = { ...item, id } as T;
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      const copy = list.slice();
      copy[idx] = next;
      return copy;
    }
    return [next, ...list];
  }, []);

  const deleteLocal = useCallback(<T extends { id: string }>(
    list: T[],
    id: string
  ): T[] => list.filter((x) => x.id !== id), []);

  const upsertCloud = useCallback(
    async <T extends { id?: string }>(sub: string, item: T): Promise<T> => {
      const id = await upsertHouseholdItem(sub, item, householdId);
      return { ...item, id } as T;
    },
    [householdId]
  );

  const deleteCloud = useCallback(
    async (sub: string, id: string) => {
      await deleteHouseholdItem(sub, id, householdId);
    },
    [householdId]
  );

  // -------------------- HANDLERS --------------------
  const onSaveTransacao = useCallback(
    async (t: Transacao) => {
      if (isCloud) {
        const saved = await upsertCloud<Transacao>("transacoes", t);
        setTransacoes((prev) => upsertLocal(prev, saved));
      } else {
        setTransacoes((prev) => upsertLocal(prev, t));
      }
    },
    [isCloud, upsertCloud, upsertLocal]
  );

  const onDeleteTransacao = useCallback(
    async (id: string) => {
      if (isCloud) await deleteCloud("transacoes", id);
      setTransacoes((prev) => deleteLocal(prev, id));
    },
    [isCloud, deleteCloud, deleteLocal]
  );

  const onSaveCategoria = useCallback(
    async (c: CategoriaContabil) => {
      if (isCloud) {
        const saved = await upsertCloud<CategoriaContabil>("categorias", c);
        setCategorias((prev) => upsertLocal(prev, saved));
      } else {
        setCategorias((prev) => upsertLocal(prev, c));
      }
    },
    [isCloud, upsertCloud, upsertLocal]
  );

  const onDeleteCategoria = useCallback(
    async (id: string) => {
      if (isCloud) await deleteCloud("categorias", id);
      setCategorias((prev) => deleteLocal(prev, id));
    },
    [isCloud, deleteCloud, deleteLocal]
  );

  const onSaveFormaPagamento = useCallback(
    async (f: FormaPagamento) => {
      if (isCloud) {
        const saved = await upsertCloud<FormaPagamento>("formasPagamento", f);
        setFormasPagamento((prev) => upsertLocal(prev, saved));
      } else {
        setFormasPagamento((prev) => upsertLocal(prev, f));
      }
    },
    [isCloud, upsertCloud, upsertLocal]
  );

  const onDeleteFormaPagamento = useCallback(
    async (id: string) => {
      if (isCloud) await deleteCloud("formasPagamento", id);
      setFormasPagamento((prev) => deleteLocal(prev, id));
    },
    [isCloud, deleteCloud, deleteLocal]
  );

  const onSaveFornecedor = useCallback(
    async (f: Fornecedor) => {
      if (isCloud) {
        const saved = await upsertCloud<Fornecedor>("fornecedores", f);
        setFornecedores((prev) => upsertLocal(prev, saved));
      } else {
        setFornecedores((prev) => upsertLocal(prev, f));
      }
    },
    [isCloud, upsertCloud, upsertLocal]
  );

  const onDeleteFornecedor = useCallback(
    async (id: string) => {
      if (isCloud) await deleteCloud("fornecedores", id);
      setFornecedores((prev) => deleteLocal(prev, id));
    },
    [isCloud, deleteCloud, deleteLocal]
  );

  const onSaveOrcamento = useCallback(
    async (o: Orcamento) => {
      if (isCloud) {
        const saved = await upsertCloud<Orcamento>("orcamentos", o);
        setOrcamentos((prev) => upsertLocal(prev, saved));
      } else {
        setOrcamentos((prev) => upsertLocal(prev, o));
      }
    },
    [isCloud, upsertCloud, upsertLocal]
  );

  const onDeleteOrcamento = useCallback(
    async (id: string) => {
      if (isCloud) await deleteCloud("orcamentos", id);
      setOrcamentos((prev) => deleteLocal(prev, id));
    },
    [isCloud, deleteCloud, deleteLocal]
  );

  const onSaveReceipt = useCallback(
    async (r: Receipt) => {
      if (isCloud) {
        const saved = await upsertCloud<Receipt>("receipts", r);
        setReceipts((prev) => upsertLocal(prev, saved));
      } else {
        setReceipts((prev) => upsertLocal(prev, r));
      }
    },
    [isCloud, upsertCloud, upsertLocal]
  );

  const onDeleteReceipt = useCallback(
    async (id: string) => {
      if (isCloud) await deleteCloud("receipts", id);
      setReceipts((prev) => deleteLocal(prev, id));
    },
    [isCloud, deleteCloud, deleteLocal]
  );

  const onSaveInvestment = useCallback(
    async (a: InvestmentAsset) => {
      if (isCloud) {
        const saved = await upsertCloud<InvestmentAsset>("investments", a);
        setInvestments((prev) => upsertLocal(prev, saved));
      } else {
        setInvestments((prev) => upsertLocal(prev, a));
      }
    },
    [isCloud, upsertCloud, upsertLocal]
  );

  const onDeleteInvestment = useCallback(
    async (id: string) => {
      if (isCloud) await deleteCloud("investments", id);
      setInvestments((prev) => deleteLocal(prev, id));
    },
    [isCloud, deleteCloud, deleteLocal]
  );

  const onImportComplete = useCallback(
    async (data: {
      transacoes: Transacao[];
      categorias: CategoriaContabil[];
      formasPagamento: FormaPagamento[];
      fornecedores: Fornecedor[];
      receipts: Receipt[];
    }) => {
      setTransacoes(Array.isArray(data.transacoes) ? data.transacoes : []);
      setCategorias(Array.isArray(data.categorias) ? data.categorias : []);
      setFormasPagamento(
        Array.isArray(data.formasPagamento) ? data.formasPagamento : []
      );
      setFornecedores(
        Array.isArray(data.fornecedores) ? data.fornecedores : []
      );
      setReceipts(Array.isArray(data.receipts) ? data.receipts : []);

      if (isCloud) {
        try {
          for (const c of data.categorias ?? [])
            await upsertCloud("categorias", c);
          for (const f of data.formasPagamento ?? [])
            await upsertCloud("formasPagamento", f);
          for (const f of data.fornecedores ?? [])
            await upsertCloud("fornecedores", f);
          for (const t of data.transacoes ?? [])
            await upsertCloud("transacoes", t);
          for (const r of data.receipts ?? [])
            await upsertCloud("receipts", r);
        } catch (e) {
          console.error("Falha ao persistir importação na nuvem:", e);
        }
      }
    },
    [isCloud, upsertCloud]
  );

  // -------------------- NAV --------------------
  const [activeTab, setActiveTab] = useState("dashboard");

  const contentTitle = useMemo(() => {
    const map: Record<string, string> = {
      dashboard: "Painel Geral",
      ai_advisor: "Consultor IA",
      ledger: "Lançamentos",
      calendar: "Agenda Financeira",
      inss: "INSS Brasil",
      receipts: "Meus Recibos",
      investments: "Investimentos",
      taxes: "Cálculo de IVA",
      import: "Importar Dados",
      settings: "Configurações",
    };
    return map[activeTab] ?? "FinanceFamily";
  }, [activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <Dashboard
            viewMode={viewMode}
            transacoes={transacoes}
            categorias={categorias}
            investments={investments}
            exchangeRates={exchangeRates}
            storageMode={storageMode}
            setStorageMode={setStorageModeSafe}
          />
        );
      case "ai_advisor":
        return (
          <AIAdvisor
            transacoes={transacoes}
            investments={investments}
            viewMode={viewMode}
          />
        );
      case "ledger":
        return (
          <Ledger
            viewMode={viewMode}
            transacoes={transacoes}
            categorias={categorias}
            formasPagamento={formasPagamento}
            onSave={onSaveTransacao}
            onDelete={onDeleteTransacao}
          />
        );
      case "calendar":
        return <Calendar transacoes={transacoes} />;
      case "inss":
        return <div className="p-6">Módulo INSS (em breve)</div>;
      case "receipts":
        return (
          <Receipts
            receipts={receipts}
            categorias={categorias}
            fornecedores={fornecedores}
            formasPagamento={formasPagamento}
            onSaveReceipt={onSaveReceipt}
            onDeleteReceipt={onDeleteReceipt}
          />
        );
      case "investments":
        return (
          <Investments
            viewMode={viewMode}
            initialAssets={investments}
            onSave={onSaveInvestment}
            onDelete={onDeleteInvestment}
          />
        );
      case "taxes":
        return <TaxReports receipts={receipts} viewMode={viewMode} />;
      case "import":
        return (
          <ImportSection
            categorias={categorias}
            formasPagamento={formasPagamento}
            fornecedores={fornecedores}
            onImportComplete={onImportComplete}
          />
        );
      case "settings":
        return (
          <Settings
            categorias={categorias}
            formasPagamento={formasPagamento}
            fornecedores={fornecedores}
            orcamentos={orcamentos}
            onSaveCategoria={onSaveCategoria}
            onDeleteCategoria={onDeleteCategoria}
            onSaveFormaPagamento={onSaveFormaPagamento}
            onDeleteFormaPagamento={onDeleteFormaPagamento}
            onSaveFornecedor={onSaveFornecedor}
            onDeleteFornecedor={onDeleteFornecedor}
            onSaveOrcamento={onSaveOrcamento}
            onDeleteOrcamento={onDeleteOrcamento}
          />
        );
      default:
        return <div className="p-6">Selecione uma opção no menu.</div>;
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-600">Carregando…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md">
          <h1 className="text-xl font-black mb-2">FinanceFamily</h1>
          <p className="text-sm text-gray-600 mb-6">
            Entre com sua conta Google para acessar os dados na nuvem. Se
            preferir, você pode usar o modo local após o login.
          </p>
          <button
            onClick={handleLogin}
            className="w-full rounded-xl bg-black text-white py-3 font-bold hover:opacity-90 transition"
          >
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`text-[10px] font-black px-3 py-1 rounded-full tracking-widest ${
                storageMode === "cloud"
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {storageMode === "cloud" ? "MODO NUVEM ATIVO" : "MODO LOCAL ATIVO"}
            </span>

            <span className="text-sm text-gray-700">
              Household: <strong>{householdId}</strong>
            </span>

            <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
              {(["BR", "PT", "GLOBAL"] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                    viewMode === m
                      ? "bg-white shadow"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
              {(["local", "cloud"] as StorageMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setStorageModeSafe(m)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                    storageMode === m
                      ? "bg-white shadow"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  {m === "cloud" ? "NUVEM" : "LOCAL"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700 truncate max-w-[280px]">
              {user.email}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-xl bg-black text-white px-4 py-2 text-sm font-bold hover:opacity-90 transition"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="px-6 py-6">
            <h1 className="text-2xl font-black mb-4">{contentTitle}</h1>
            {loadingData ? (
              <div className="text-sm text-gray-600">Carregando dados…</div>
            ) : (
              renderContent()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
