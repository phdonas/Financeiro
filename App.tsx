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
import { ErrorBoundary } from "./components/ErrorBoundary";
import Calendar from "./components/Calendar";
import Receipts from "./components/Receipts";
import Investments from "./components/Investments";
import TaxReports from "./components/TaxReports";
import ImportSection from "./components/ImportSection";
import Settings from "./components/Settings";

import { auth, db } from "./lib/firebase";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
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
import { TipoTransacao } from "./types";

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

function inferReceiptInternalIdFromTxId(txId: string): string {
  const id = (txId || "").trim();
  if (id.startsWith("TX_")) return id.slice(3);
  return "";
}


export default function App() {
  const householdId = DEFAULT_HOUSEHOLD_ID;

  // -------------------- AUTH --------------------
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [membershipReady, setMembershipReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      // "authReady" deve sinalizar que o bootstrap mínimo terminou.
      // Como as Rules podem depender do membership, garantimos membership ANTES
      // de liberar leituras em households/{...}.
      setAuthReady(false);
      setUser(u);

      if (!u) {
        setMembershipReady(false);
        setAuthReady(true);
        return;
      }

      setMembershipReady(false);
      try {
        await ensureHouseholdMember(u.uid, householdId, {
          email: u.email ?? null,
          name: u.displayName ?? null,
        });
      } catch (e) {
        console.error("Falha ao garantir membership:", e);
      } finally {
        setMembershipReady(true);
        setAuthReady(true);
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
      "cloud"
    );
  });

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      // App opera em modo nuvem; sem login, mostramos apenas a tela de entrada.
      setStorageMode("cloud");
      localStorage.setItem(lsKey("storageMode"), JSON.stringify("cloud"));
      return;
    }

    // ⚠️ Se as rules exigem membership para ler settings,
    // esperar o bootstrap (ensureHouseholdMember) evita "insufficient permissions".
    if (!membershipReady) return;

    (async () => {
      try {
        const mode = await getStorageMode(householdId);
        // Força cloud como fluxo padrão (mantém fallback interno para debug).
        if (mode !== "cloud") {
          await setStorageModeCloud("cloud", householdId);
          setStorageMode("cloud");
          localStorage.setItem(lsKey("storageMode"), JSON.stringify("cloud"));
        } else {
          setStorageMode("cloud");
          localStorage.setItem(lsKey("storageMode"), JSON.stringify("cloud"));
        }
      } catch (e) {
        console.error("Falha ao ler storageMode (assumindo cloud):", e);
        setStorageMode("cloud");
        localStorage.setItem(lsKey("storageMode"), JSON.stringify("cloud"));
      }
    })();
  }, [authReady, user, membershipReady, householdId]);

  const isCloud = storageMode === "cloud" && !!user && membershipReady;

  const setStorageModeSafe = useCallback(
    async (mode: StorageMode) => {
      setStorageMode(mode);
      localStorage.setItem(lsKey("storageMode"), JSON.stringify(mode));

      if (user && membershipReady) {
        try {
          await setStorageModeCloud(mode, householdId);
        } catch (e) {
          console.error("Falha ao salvar storageMode no Firestore:", e);
        }
      }
    },
    [user, membershipReady, householdId]
  );

  // -------------------- DATA --------------------
  const [categorias, setCategorias] = useState<CategoriaContabil[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [ledgerRefreshToken, setLedgerRefreshToken] = useState<number>(0);
  const [investments, setInvestments] = useState<InvestmentAsset[]>([]);
  const [exchangeRates, setExchangeRates] = useState<
    Record<"PT" | "BR", number>
  >({ PT: 1, BR: 1 });

  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (storageMode === "cloud" && (!user || !membershipReady)) return;

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
  }, [authReady, user, membershipReady, storageMode, householdId]);

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
      // Salva o Lançamento normalmente
      let savedTx: Transacao = t;

      if (isCloud) {
        savedTx = await upsertCloud<Transacao>("transacoes", t);
        setTransacoes((prev) => upsertLocal(prev, savedTx));
      } else {
        setTransacoes((prev) => upsertLocal(prev, t));
      }

      // Sprint 3.2+: Se este lançamento estiver vinculado a um Recibo, sincroniza de volta (bidirecional)
      const receiptId =
        ((savedTx as any)?.receipt_id || "").trim() ||
        inferReceiptInternalIdFromTxId(savedTx.id);

      if (!receiptId) return;

      const isPaid = (savedTx.status || "") === "PAGO";
      const payDate = (savedTx.data_prevista_pagamento || savedTx.data_competencia || "").trim();

      // Atualiza estado local de Recibos (sem mexer em valores/cálculos já existentes)
      setReceipts((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        const idx = arr.findIndex((r) => (r as any)?.internal_id === receiptId);
        if (idx < 0) return arr;
        const copy = arr.slice();
        copy[idx] = {
          ...(copy[idx] as any),
          transacao_id: savedTx.id,
          is_paid: isPaid,
          pay_date: payDate || (copy[idx] as any)?.pay_date,
        };
        return copy;
      });

      if (isCloud) {
        const receiptsCol = collection(db, `households/${householdId}/receipts`);
        const receiptRef = doc(receiptsCol, receiptId);
        const batch = writeBatch(db);
        batch.set(
          receiptRef,
          {
            transacao_id: savedTx.id,
            is_paid: isPaid,
            ...(payDate ? { pay_date: payDate } : {}),
            updatedAt: Timestamp.now(),
          } as any,
          { merge: true }
        );
        await batch.commit();
      }
    },
    [isCloud, upsertCloud, upsertLocal, householdId]
  );

  const onDeleteTransacao = useCallback(
    async (id: string) => {
      const txId = (id || "").trim();
      if (!txId) return;

      // Tenta descobrir Recibo vinculado (estado local primeiro; fallback por padrão TX_<internal_id>)
      const receiptId =
        (Array.isArray(transacoes) ? transacoes : []).find((t) => t.id === txId)?.receipt_id ||
        inferReceiptInternalIdFromTxId(txId);

      if (isCloud) {
        if (receiptId) {
          const receiptsCol = collection(db, `households/${householdId}/receipts`);
          const txCol = collection(db, `households/${householdId}/transacoes`);
          const receiptRef = doc(receiptsCol, receiptId);
          const txRef = doc(txCol, txId);
          const batch = writeBatch(db);
          batch.delete(txRef);
          batch.delete(receiptRef);
          await batch.commit();
        } else {
          await deleteCloud("transacoes", txId);
        }
      }

      // Estado local
      setTransacoes((prev) => deleteLocal(prev, txId));
      if (receiptId) {
        setReceipts((prev) =>
          (Array.isArray(prev) ? prev : []).filter(
            (r) => (r as any)?.internal_id !== receiptId
          )
        );
      }
    },
    [isCloud, deleteCloud, deleteLocal, householdId, transacoes]
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
      // Sprint 3.2+: Recibo sempre cria/atualiza um Lançamento (RECEITA) vinculado
      const internalId = (r?.internal_id || "").trim() || newId();
      const txId = (r?.transacao_id || `TX_${internalId}`).trim();
      const payDate = (r?.pay_date || r?.issue_date || new Date().toISOString().split("T")[0]).trim();

      const receiptToSave: Receipt = {
        ...r,
        internal_id: internalId,
        transacao_id: txId,
        pay_date: payDate,
      };

      const txToSave: Transacao = {
        id: txId,
        workspace_id: r?.workspace_id || "fam_01",
        codigo_pais: receiptToSave.country_code,
        categoria_id: receiptToSave.categoria_id,
        conta_contabil_id: receiptToSave.conta_contabil_id,
        forma_pagamento_id: receiptToSave.forma_pagamento_id,
        tipo: TipoTransacao.RECEITA,
        data_competencia: payDate,
        data_prevista_pagamento: payDate,
        description:
          (receiptToSave.description || "Recibo") +
          (receiptToSave.id ? ` (#${receiptToSave.id})` : ""),
        valor: Number(receiptToSave.received_amount ?? receiptToSave.net_amount ?? 0),
        status: receiptToSave.is_paid ? "PAGO" : "PLANEJADO",
        origem: "MANUAL",
        receipt_id: internalId,
      };

      if (isCloud) {
        const now = Timestamp.now();
        const receiptsCol = collection(
          db,
          `households/${householdId}/receipts`
        );
        const txCol = collection(db, `households/${householdId}/transacoes`);
        const receiptRef = doc(receiptsCol, internalId);
        const txRef = doc(txCol, txId);

        const batch = writeBatch(db);
        batch.set(
          receiptRef,
          {
            ...receiptToSave,
            // Mantém "id" como número fiscal do recibo dentro do documento.
            // O docId no Firestore é o internal_id (seguro, sem "/").
            updatedAt: now,
            createdAt: now,
          } as any,
          { merge: true }
        );
        batch.set(
          txRef,
          {
            ...txToSave,
            updatedAt: now,
            createdAt: now,
          } as any,
          { merge: true }
        );
        await batch.commit();
      }

      // Estado local (sempre) — chave real do Recibo é internal_id
      setReceipts((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        const idx = arr.findIndex(
          (x) => (x as any)?.internal_id === internalId
        );
        if (idx >= 0) {
          const copy = arr.slice();
          copy[idx] = receiptToSave;
          return copy;
        }
        return [receiptToSave, ...arr];
      });

      // Mantém transações em memória/localStorage (mesmo em cloud, para calendário/dashboards).
      setTransacoes((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        const idx = arr.findIndex((x) => x.id === txId);
        if (idx >= 0) {
          const copy = arr.slice();
          copy[idx] = txToSave;
          return copy;
        }
        return [txToSave, ...arr];
      });
      setLedgerRefreshToken((v) => v + 1);
    },
    [isCloud, householdId]
  );

  const onDeleteReceipt = useCallback(
    async (id: string) => {
      const internalId = (id || "").trim();
      // Descobre a transação vinculada (se existir)
      const linkedTxId = (() => {
        const found = (Array.isArray(receipts) ? receipts : []).find(
          (r) => (r as any)?.internal_id === internalId
        );
        return (found as any)?.transacao_id || `TX_${internalId}`;
      })();

      if (isCloud) {
        const receiptsCol = collection(
          db,
          `households/${householdId}/receipts`
        );
        const txCol = collection(db, `households/${householdId}/transacoes`);

        const receiptRef = doc(receiptsCol, internalId);
        const txRef = doc(txCol, linkedTxId);

        const batch = writeBatch(db);
        batch.delete(receiptRef);
        batch.delete(txRef);
        await batch.commit();
      }

      // Estado local
      setReceipts((prev) =>
        (Array.isArray(prev) ? prev : []).filter(
          (r) => (r as any)?.internal_id !== internalId
        )
      );
      setTransacoes((prev) =>
        (Array.isArray(prev) ? prev : []).filter((t) => t.id !== linkedTxId)
      );
      setLedgerRefreshToken((v) => v + 1);
    },
    [isCloud, householdId, receipts]
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
            isCloud={isCloud}
            householdId={householdId}
            refreshToken={ledgerRefreshToken}
          />
        );
      case "calendar":
        return <Calendar transacoes={transacoes} />;
      case "inss":
        return <div className="p-6">Módulo INSS (em breve)</div>;
      case "receipts":
        return (
          <Receipts
            viewMode={viewMode}
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
            currentTransacoes={transacoes}
            currentReceipts={receipts}
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
            Entre com sua conta Google para acessar seus dados na nuvem.
            Este app opera em modo nuvem (cloud) por padrão.
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
              <ErrorBoundary>
                {renderContent()}
              </ErrorBoundary>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}