import React, { useEffect, useMemo, useState } from "react";
import { auth } from "./lib/firebase";
import { onIdTokenChanged, User } from "firebase/auth";

import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Ledger from "./components/Ledger";
import Settings from "./components/Settings";
import TaxReports from "./components/TaxReports";
import Investments from "./components/Investments";
import Calendar from "./components/Calendar";
import AIAdvisor from "./components/AIAdvisor";

import {
  getStorageMode,
  upsertDoc,
  deleteDocById,
  listDocs,
  DEFAULT_HOUSEHOLD_ID
} from "./lib/cloudStore";


// ✅ tipos (mantendo seu padrão atual)
type ViewMode = "PT" | "BR" | "GLOBAL";

export type Categoria = {
  id: string;
  nome: string;
  cor?: string;
};

export type Orcamento = {
  id: string;
  categoriaId: string;
  mes: string; // YYYY-MM
  valor: number;
  countryCode?: "PT" | "BR";
};

export type Transacao = {
  id: string;
  tipo: "DESPESA" | "RECEITA";
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number;
  categoriaId: string;
  countryCode?: "PT" | "BR";
  status?: "PAGO" | "A_PAGAR" | "VENCIDO";
  data_prevista_pagamento?: string;
};

export type InvestmentAsset = {
  id: string;
  name: string;
  type: string;
  country_code: "PT" | "BR";
  current_value: number;
};

export type Recibo = {
  id: string;
  date: string;
  description: string;
  base_amount: number;
  iva_amount: number;
  irs_amount: number;
  received_amount: number;
};

// ✅ local keys
const LS_KEYS = {
  categorias: "categorias",
  orcamentos: "orcamentos",
  transacoes: "transacoes",
  investments: "investments",
  receipts: "receipts"
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  // auth
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // view + page
  const [viewMode, setViewMode] = useState<ViewMode>("PT");
  const [activePage, setActivePage] = useState<string>("DASHBOARD");

  // storage mode
  const [storageMode, setStorageMode] = useState<"local" | "cloud">("local");

  // data
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [investments, setInvestments] = useState<InvestmentAsset[]>([]);
  const [receipts, setReceipts] = useState<Recibo[]>([]);

  // --- 1) auth listener (token pronto) ---
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  // --- 2) ao logar, lê storageMode do Firestore (com retry) ---
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // garante token antes de Firestore (evita permission error “cedo demais”)
          await auth.currentUser?.getIdToken();

          const mode = await getStorageMode(DEFAULT_HOUSEHOLD_ID);
          if (!cancelled) setStorageMode(mode);
          return;
        } catch (e) {
          if (attempt === 3) {
            console.error("Falha ao ler storageMode (assumindo local):", e);
            if (!cancelled) setStorageMode("local");
            return;
          }
          await sleep(500);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isCloud = storageMode === "cloud" && !!user;

  // --- 3) carregar dados (cloud ou local) ---
  useEffect(() => {
    // sempre garantir arrays (evita undefined em reduce/filter)
    if (!authChecked) return;

    if (!isCloud) {
      const cats = safeJsonParse<Categoria[]>(localStorage.getItem(LS_KEYS.categorias), []);
      const orcs = safeJsonParse<Orcamento[]>(localStorage.getItem(LS_KEYS.orcamentos), []);
      const txs = safeJsonParse<Transacao[]>(localStorage.getItem(LS_KEYS.transacoes), []);
      const inv = safeJsonParse<InvestmentAsset[]>(localStorage.getItem(LS_KEYS.investments), []);
      const rec = safeJsonParse<Recibo[]>(localStorage.getItem(LS_KEYS.receipts), []);

      setCategorias(Array.isArray(cats) ? cats : []);
      setOrcamentos(Array.isArray(orcs) ? orcs : []);
      setTransacoes(Array.isArray(txs) ? txs : []);
      setInvestments(Array.isArray(inv) ? inv : []);
      setReceipts(Array.isArray(rec) ? rec : []);
      return;
    }

    // cloud load
    (async () => {
      const [cats, orcs, txs, inv, rec] = await Promise.all([
        listDocs<Categoria>("categorias", DEFAULT_HOUSEHOLD_ID),
        listDocs<Orcamento>("orcamentos", DEFAULT_HOUSEHOLD_ID),
        listDocs<Transacao>("transacoes", DEFAULT_HOUSEHOLD_ID),
        listDocs<InvestmentAsset>("investments", DEFAULT_HOUSEHOLD_ID),
        listDocs<Recibo>("receipts", DEFAULT_HOUSEHOLD_ID)
      ]);

      setCategorias(Array.isArray(cats) ? cats : []);
      setOrcamentos(Array.isArray(orcs) ? orcs : []);
      setTransacoes(Array.isArray(txs) ? txs : []);
      setInvestments(Array.isArray(inv) ? inv : []);
      setReceipts(Array.isArray(rec) ? rec : []);
    })().catch((e) => {
      console.error("Erro ao carregar dados do Firestore:", e);
    });
  }, [isCloud, authChecked]);

  // --- 4) wrappers de CRUD (cloud/local) ---
  const saveCategoria = async (item: Categoria) => {
    const next = [...(Array.isArray(categorias) ? categorias : []).filter((c) => c.id !== item.id), item];
    setCategorias(next);

    if (!isCloud) {
      localStorage.setItem(LS_KEYS.categorias, JSON.stringify(next));
      return;
    }
    await upsertDoc("categorias", item, DEFAULT_HOUSEHOLD_ID);
  };

  const deleteCategoria = async (id: string) => {
    const next = (Array.isArray(categorias) ? categorias : []).filter((c) => c.id !== id);
    setCategorias(next);

    if (!isCloud) {
      localStorage.setItem(LS_KEYS.categorias, JSON.stringify(next));
      return;
    }
    await deleteDocById("categorias", id, DEFAULT_HOUSEHOLD_ID);
  };

  const saveOrcamento = async (item: Orcamento) => {
    const base = Array.isArray(orcamentos) ? orcamentos : [];
    const next = [...base.filter((o) => o.id !== item.id), item];
    setOrcamentos(next);

    if (!isCloud) {
      localStorage.setItem(LS_KEYS.orcamentos, JSON.stringify(next));
      return;
    }
    await upsertDoc("orcamentos", item, DEFAULT_HOUSEHOLD_ID);
  };

  const deleteOrcamento = async (id: string) => {
    const next = (Array.isArray(orcamentos) ? orcamentos : []).filter((o) => o.id !== id);
    setOrcamentos(next);

    if (!isCloud) {
      localStorage.setItem(LS_KEYS.orcamentos, JSON.stringify(next));
      return;
    }
    await deleteDocById("orcamentos", id, DEFAULT_HOUSEHOLD_ID);
  };

  const saveTransacao = async (item: Transacao) => {
    const base = Array.isArray(transacoes) ? transacoes : [];
    const next = [...base.filter((t) => t.id !== item.id), item];
    setTransacoes(next);

    if (!isCloud) {
      localStorage.setItem(LS_KEYS.transacoes, JSON.stringify(next));
      return;
    }
    await upsertDoc("transacoes", item, DEFAULT_HOUSEHOLD_ID);
  };

  const deleteTransacao = async (id: string) => {
    const next = (Array.isArray(transacoes) ? transacoes : []).filter((t) => t.id !== id);
    setTransacoes(next);

    if (!isCloud) {
      localStorage.setItem(LS_KEYS.transacoes, JSON.stringify(next));
      return;
    }
    await deleteDocById("transacoes", id, DEFAULT_HOUSEHOLD_ID);
  };

  const saveInvestment = async (item: InvestmentAsset) => {
    const base = Array.isArray(investments) ? investments : [];
    const next = [...base.filter((a) => a.id !== item.id), item];
    setInvestments(next);

    if (!isCloud) {
      localStorage.setItem(LS_KEYS.investments, JSON.stringify(next));
      return;
    }
    await upsertDoc("investments", item, DEFAULT_HOUSEHOLD_ID);
  };

  const deleteInvestment = async (id: string) => {
    const next = (Array.isArray(investments) ? investments : []).filter((a) => a.id !== id);
    setInvestments(next);

    if (!isCloud) {
      localStorage.setItem(LS_KEYS.investments, JSON.stringify(next));
      return;
    }
    await deleteDocById("investments", id, DEFAULT_HOUSEHOLD_ID);
  };

  const saveReceipt = async (item: Recibo) => {
    const base = Array.isArray(receipts) ? receipts : [];
    const next = [...base.filter((r) => r.id !== item.id), item];
    setReceipts(next);

    if (!isCloud) {
      localStorage.setItem(LS_KEYS.receipts, JSON.stringify(next));
      return;
    }
    await upsertDoc("receipts", item, DEFAULT_HOUSEHOLD_ID);
  };

  const deleteReceipt = async (id: string) => {
    const next = (Array.isArray(receipts) ? receipts : []).filter((r) => r.id !== id);
    setReceipts(next);

    if (!isCloud) {
      localStorage.setItem(LS_KEYS.receipts, JSON.stringify(next));
      return;
    }
    await deleteDocById("receipts", id, DEFAULT_HOUSEHOLD_ID);
  };

  // --- 5) render pages ---
  const page = useMemo(() => {
    const txs = Array.isArray(transacoes) ? transacoes : [];
    const cats = Array.isArray(categorias) ? categorias : [];
    const orcs = Array.isArray(orcamentos) ? orcamentos : [];
    const inv = Array.isArray(investments) ? investments : [];
    const rec = Array.isArray(receipts) ? receipts : [];

    switch (activePage) {
      case "DASHBOARD":
        return (
          <Dashboard
            viewMode={viewMode === "GLOBAL" ? "PT" : viewMode}
            transacoes={txs}
            orcamentos={orcs}
            categorias={cats}
            investments={inv}
          />
        );

      case "LANCAMENTOS":
        return (
          <Ledger
            viewMode={viewMode}
            transacoes={txs}
            categorias={cats}
            onSave={saveTransacao}
            onDelete={deleteTransacao}
          />
        );

      case "AGENDA":
        return <Calendar viewMode={viewMode} transacoes={txs} />;

      case "INVESTIMENTOS":
        return (
          <Investments
            viewMode={viewMode === "GLOBAL" ? "PT" : viewMode}
            investments={inv}
            onSave={saveInvestment}
            onDelete={deleteInvestment}
          />
        );

      case "RELATORIOS":
        return <TaxReports viewMode={viewMode} recibos={rec} />;

      case "CONSULTOR_IA":
        return <AIAdvisor transacoes={txs} investimentos={inv} recibos={rec} />;

      case "CONFIG":
        return (
          <Settings
            viewMode={viewMode}
            storageMode={storageMode}
            onStorageModeChange={setStorageMode}
            categorias={cats}
            orcamentos={orcs}
            onSaveCategoria={saveCategoria}
            onDeleteCategoria={deleteCategoria}
            onSaveOrcamento={saveOrcamento}
            onDeleteOrcamento={deleteOrcamento}
          />
        );

      default:
        return (
          <Dashboard
            viewMode={viewMode === "GLOBAL" ? "PT" : viewMode}
            transacoes={txs}
            orcamentos={orcs}
            categorias={cats}
            investments={inv}
          />
        );
    }
  }, [activePage, viewMode, transacoes, categorias, orcamentos, investments, receipts, storageMode]);

  // --- UI ---
  return (
    <div className="app-shell">
      <Header
        user={user}
        storageMode={storageMode}
      />

      <div className="app-body">
        <Sidebar active={activePage} onNavigate={setActivePage} />

        <main className="app-main">
          {!authChecked ? (
            <div style={{ padding: 24 }}>Carregando autenticação...</div>
          ) : (
            page
          )}
        </main>
      </div>
    </div>
  );
}
