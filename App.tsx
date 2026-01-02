import React, { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";

import Dashboard from "./components/Dashboard";
import AIAdvisor from "./components/AIAdvisor";
import Ledger from "./components/Ledger";
import Calendar from "./components/Calendar";
import Investments from "./components/Investments";
import TaxReports from "./components/TaxReports";
import Settings from "./components/Settings";

import { auth, googleProvider } from "./lib/firebase";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";

import {
  DEFAULT_HOUSEHOLD_ID,
  getStorageMode,
  listDocs,
  upsertDoc,
  deleteDocById
} from "./lib/cloudStore";

// ---- helpers localStorage (fallback) ----
function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

type StorageMode = "local" | "cloud";

// Keys local (se cair em modo local)
const LS_KEYS = {
  categorias: "ff_categorias",
  formasPagamento: "ff_formas_pagamento",
  orcamentos: "ff_orcamentos",
  fornecedores: "ff_fornecedores",
  inss: "ff_inss_configs",
  transacoes: "ff_transacoes",
  investments: "ff_investments"
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [storageMode, setStorageMode] = useState<StorageMode>("local");
  const householdId = DEFAULT_HOUSEHOLD_ID;

  // Dados principais (mantidos como any[] para não travar build por tipagem)
  const [categorias, setCategorias] = useState<any[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<any[]>([]);
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [inssConfigs, setInssConfigs] = useState<any[]>([]);
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);

  // -------- AUTH ----------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  async function handleLogin() {
    await signInWithPopup(auth, googleProvider);
  }

  async function handleLogout() {
    await signOut(auth);
  }

  // -------- StorageMode (cloud/local) ----------
  useEffect(() => {
    if (!authReady) return;

    // Se não tiver user, nem tenta cloud.
    if (!user) {
      setStorageMode("local");
      return;
    }

    (async () => {
      try {
        const mode = await getStorageMode(householdId);
        setStorageMode(mode);
      } catch (e) {
        console.error("Falha ao ler storageMode (assumindo local):", e);
        setStorageMode("local");
      }
    })();
  }, [authReady, user, householdId]);

  // -------- Load data (cloud ou local) ----------
  useEffect(() => {
    if (!authReady) return;

    // Local: carrega do localStorage sempre
    if (storageMode === "local" || !user) {
      setCategorias(lsGet(LS_KEYS.categorias, []));
      setFormasPagamento(lsGet(LS_KEYS.formasPagamento, []));
      setOrcamentos(lsGet(LS_KEYS.orcamentos, []));
      setFornecedores(lsGet(LS_KEYS.fornecedores, []));
      setInssConfigs(lsGet(LS_KEYS.inss, []));
      setTransacoes(lsGet(LS_KEYS.transacoes, []));
      setInvestments(lsGet(LS_KEYS.investments, []));
      return;
    }

    // Cloud: busca do Firestore
    (async () => {
      try {
        const [
          cats,
          fps,
          orcs,
          sups,
          inss,
          trans,
          invs
        ] = await Promise.all([
          listDocs<any>("categorias", householdId),
          listDocs<any>("formas_pagamento", householdId),
          listDocs<any>("orcamentos", householdId),
          listDocs<any>("fornecedores", householdId),
          listDocs<any>("inss_configs", householdId),
          listDocs<any>("transacoes", householdId),
          listDocs<any>("investments", householdId)
        ]);

        setCategorias(cats);
        setFormasPagamento(fps);
        setOrcamentos(orcs);
        setFornecedores(sups);
        setInssConfigs(inss);
        setTransacoes(trans);
        setInvestments(invs);
      } catch (e) {
        console.error("Falha ao carregar dados cloud (caindo para local):", e);
        setStorageMode("local");
      }
    })();
  }, [authReady, storageMode, user, householdId]);

  // -------- CRUD helpers (cloud/local) ----------
  async function saveItem(collectionName: string, item: any, setter: (fn: any) => void, lsKey: string) {
    if (storageMode === "cloud" && user) {
      await upsertDoc(collectionName, item, householdId);
      // reload simples (evita bugs de estado)
      const fresh = await listDocs<any>(collectionName, householdId);
      setter(fresh);
      return;
    }

    // local
    const current = lsGet<any[]>(lsKey, []);
    const next = (() => {
      const idx = current.findIndex((x) => x.id === item.id);
      if (idx >= 0) {
        const copy = [...current];
        copy[idx] = { ...copy[idx], ...item };
        return copy;
      }
      return [...current, item];
    })();
    lsSet(lsKey, next);
    setter(next);
  }

  async function deleteItem(collectionName: string, id: string, setter: (v: any) => void, lsKey: string) {
    if (storageMode === "cloud" && user) {
      await deleteDocById(collectionName, id, householdId);
      const fresh = await listDocs<any>(collectionName, householdId);
      setter(fresh);
      return;
    }

    const current = lsGet<any[]>(lsKey, []);
    const next = current.filter((x) => x.id !== id);
    lsSet(lsKey, next);
    setter(next);
  }

  const isCloud = storageMode === "cloud" && !!user;

  const content = useMemo(() => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard transacoes={transacoes} investments={investments} categorias={categorias} />;
      case "ai_advisor":
        return <AIAdvisor transacoes={transacoes} investments={investments} />;
      case "ledger":
        return <Ledger transacoes={transacoes} categorias={categorias} formasPagamento={formasPagamento} />;
      case "calendar":
        return <Calendar transacoes={transacoes} categorias={categorias} />;
      case "investments":
        return <Investments investments={investments} />;
      case "taxes":
        return <TaxReports transacoes={transacoes} />;
      case "settings":
        return (
          <Settings
            categorias={categorias}
            onSaveCat={(c) => saveItem("categorias", c, setCategorias, LS_KEYS.categorias)}
            onDeleteCat={(id) => deleteItem("categorias", id, setCategorias, LS_KEYS.categorias)}
            formasPagamento={formasPagamento}
            onSaveFP={(f) => saveItem("formas_pagamento", f, setFormasPagamento, LS_KEYS.formasPagamento)}
            onDeleteFP={(id) => deleteItem("formas_pagamento", id, setFormasPagamento, LS_KEYS.formasPagamento)}
            orcamentos={orcamentos}
            onSaveOrc={(o) => saveItem("orcamentos", o, setOrcamentos, LS_KEYS.orcamentos)}
            onDeleteOrc={(id) => deleteItem("orcamentos", id, setOrcamentos, LS_KEYS.orcamentos)}
            fornecedores={fornecedores}
            onSaveSup={(s) => saveItem("fornecedores", s, setFornecedores, LS_KEYS.fornecedores)}
            onDeleteSup={(id) => deleteItem("fornecedores", id, setFornecedores, LS_KEYS.fornecedores)}
            inssConfigs={inssConfigs}
            onSaveInss={(i) => saveItem("inss_configs", i, setInssConfigs, LS_KEYS.inss)}
            onDeleteInss={(ano) => deleteItem("inss_configs", ano, setInssConfigs, LS_KEYS.inss)}
          />
        );
      default:
        return (
          <div className="p-8">
            <h2 className="text-xl font-black">Tela ainda não implementada</h2>
            <p className="text-sm text-gray-500 mt-2">Aba: {activeTab}</p>
          </div>
        );
    }
  }, [activeTab, transacoes, investments, categorias, formasPagamento, orcamentos, fornecedores, inssConfigs, isCloud]);

  // ---------- UI ----------
  if (!authReady) {
    return <div className="p-8 text-sm text-gray-600">Carregando…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-sm w-full bg-white rounded-2xl border shadow p-6 space-y-4">
          <h1 className="text-xl font-black text-bb-blue">FinanceFamily</h1>
          <p className="text-sm text-gray-600">
            Faça login para usar a nuvem (Firestore). Sem login, o app opera em modo local.
          </p>
          <button
            onClick={handleLogin}
            className="w-full bg-bb-blue text-white py-3 rounded-xl text-sm font-black"
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

      <div className="flex-1 min-w-0">
        <div className="px-6 py-4 border-b bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                isCloud ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {isCloud ? "NUVEM ATIVA" : "MODO LOCAL ATIVO"}
            </span>
            <
