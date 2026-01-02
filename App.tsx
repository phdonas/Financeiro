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

import { DEFAULT_HOUSEHOLD_ID, getStorageMode } from "./lib/cloudStore";

type StorageMode = "local" | "cloud";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [storageMode, setStorageMode] = useState<StorageMode>("local");

  const householdId = DEFAULT_HOUSEHOLD_ID;

  // -------------------- AUTH --------------------
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

  // -------------------- STORAGE MODE (cloud/local) --------------------
  useEffect(() => {
    if (!authReady) return;

    // sem user => local
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

  const isCloud = storageMode === "cloud" && !!user;

  // -------------------- CONTENT ROUTER --------------------
  const content = useMemo(() => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard />;
      case "ai_advisor":
        return <AIAdvisor />;
      case "ledger":
        return <Ledger />;
      case "calendar":
        return <Calendar />;
      case "investments":
        return <Investments />;
      case "taxes":
        return <TaxReports />;
      case "settings":
        return <Settings />;
      default:
        return (
          <div className="p-8">
            <h2 className="text-xl font-black">Tela ainda não implementada</h2>
            <p className="text-sm text-gray-500 mt-2">Aba: {activeTab}</p>
          </div>
        );
    }
  }, [activeTab]);

  // -------------------- UI STATES --------------------
  if (!authReady) {
    return <div className="p-8 text-sm text-gray-600">Carregando…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
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

  // -------------------- MAIN LAYOUT --------------------
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* top bar */}
        <div className="px-6 py-4 border-b bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                isCloud ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {isCloud ? "NUVEM ATIVA" : "MODO LOCAL ATIVO"}
            </span>

            <span className="text-xs text-gray-600">
              Household: <b>{householdId}</b>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600 truncate max-w-[320px]">
              {user.email || "Usuário autenticado"}
            </span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl text-xs font-black bg-gray-900 text-white"
            >
              Sair
            </button>
          </div>
        </div>

        {/* content */}
        <div className="flex-1 min-w-0">{content}</div>
      </div>
    </div>
  );
}
