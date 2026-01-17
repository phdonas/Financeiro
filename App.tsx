import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from "firebase/auth";

import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Ledger from "./components/Ledger";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Calendar from "./components/Calendar";
import Receipts from "./components/Receipts";
import Investments from "./components/Investments";
import TaxReports from "./components/TaxReports";
import ImportExport from "./components/ImportExport";
import Settings from "./components/Settings";
import InssBrasil from "./components/InssBrasil";
import Admin from "./components/Admin";

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
  getHouseholdMember,
  getHouseholdInviteByEmail,
  acceptHouseholdInvite,
  getStorageMode,
  setStorageMode as setStorageModeCloud,
  listHouseholdItems,
  listInssConfigs,
  listInssRecords,
  upsertHouseholdItem,
  deleteHouseholdItem,
  type HouseholdInvite,
} from "./lib/cloudStore";

import type {
  CategoriaContabil,
  FormaPagamento,
  Fornecedor,
  Orcamento,
  Transacao,
  Receipt,
  InvestmentAsset,
  InssRecord,
  InssYearlyConfig,
} from "./types";
import { TipoTransacao } from "./types";
import { getDefaultBankId as getDefaultBankIdFromRules } from "./lib/financeDefaults";

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
  const [memberRole, setMemberRole] = useState<
    "ADMIN" | "EDITOR" | "LEITOR" | null
  >(null);

  // Sprint 7.2: convite por e-mail (accept invite)
  const [invite, setInvite] = useState<HouseholdInvite | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      // "authReady" deve sinalizar que o bootstrap mínimo terminou.
      // Sprint 7.1: invite-only → não cria membership automaticamente.
      setAuthReady(false);
      setUser(u);
      setInvite(null);
      setInviteError(null);
      setInviteInfo(null);

      if (!u) {
        setMembershipReady(false);
        setMemberRole(null);
        setAuthReady(true);
        return;
      }

      setMembershipReady(false);
      try {
        const m = await getHouseholdMember(u.uid, householdId);
        if (m && (m as any).active !== false) {
          setMemberRole(m.role as any);
          setMembershipReady(true);
        } else {
          setMemberRole(null);
          setMembershipReady(false);
        }
      } catch (e) {
        console.error("Falha ao validar membership:", e);
        setMemberRole(null);
        setMembershipReady(false);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, [householdId]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      const code = String(e?.code ?? "");
      // Em abas anônimas/políticas de privacidade restritivas, o popup pode falhar.
      // Fallback: redirect (mais estável).
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw e;
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };


// -------------------- INVITE (Sprint 7.2) --------------------
const handleCheckInvite = useCallback(async () => {
  if (!user?.email) {
    setInvite(null);
    setInviteError("Não foi possível identificar o e-mail da sua conta Google.");
    setInviteInfo(null);
    return;
  }

  setInviteLoading(true);
  setInviteError(null);
  setInviteInfo(null);
  try {
    const inv = await getHouseholdInviteByEmail(user.email, householdId);
    setInvite(inv);

    if (!inv) {
      setInviteError("Nenhum convite encontrado para este e-mail.");
    } else if (inv.status === "revoked") {
      setInviteError("Seu convite foi revogado. Solicite um novo convite ao administrador.");
    } else if (inv.status === "accepted") {
      setInviteInfo("Convite já está como aceito. Se ainda não liberou o acesso, recarregue a página.");
    } else {
      setInviteInfo(`Convite pendente encontrado. Perfil: ${inv.role}.`);
    }
  } catch (e) {
    console.error("Falha ao verificar convite:", e);
    setInvite(null);
    setInviteError("Falha ao verificar convite. Tente novamente.");
  } finally {
    setInviteLoading(false);
  }
}, [user, householdId]);

const handleAcceptInvite = useCallback(async () => {
  if (!user) return;
  if (!user.email) {
    setInviteError("Não foi possível identificar o e-mail da sua conta Google.");
    return;
  }

  setInviteLoading(true);
  setInviteError(null);
  setInviteInfo(null);

  try {
    await acceptHouseholdInvite({
      uid: user.uid,
      email: user.email,
      name: user.displayName ?? null,
      householdId,
    });

    const m = await getHouseholdMember(user.uid, householdId);
    if (m && (m as any).active !== false) {
      setMemberRole(m.role as any);
      setMembershipReady(true);
      setInviteInfo("Convite aceito. Acesso liberado.");
    } else {
      setMembershipReady(false);
      setInviteInfo("Convite aceito, mas o acesso ainda não ficou ativo. Recarregue a página.");
    }
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("INVITE_NOT_FOUND")) {
      setInviteError("Convite não encontrado para este e-mail.");
    } else if (msg.includes("INVITE_NOT_PENDING")) {
      setInviteError("Este convite não está mais pendente (já aceito ou revogado).");
    } else if (msg.includes("permission") || msg.includes("PERMISSION")) {
      setInviteError("Sem permissão para aceitar o convite. Confirme se as Firestore Rules foram publicadas.");
    } else {
      setInviteError("Falha ao aceitar convite. Tente novamente.");
    }
    console.error("Falha ao aceitar convite:", e);
  } finally {
    setInviteLoading(false);
  }
}, [user, householdId]);

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
    // esperar a validação do membership evita "insufficient permissions".
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
  const [inssRecords, setInssRecords] = useState<InssRecord[]>([]);
  const [inssConfigs, setInssConfigs] = useState<InssYearlyConfig[]>([]);
  const [ledgerRefreshToken, setLedgerRefreshToken] = useState<number>(0);
  const [receiptsRefreshToken, setReceiptsRefreshToken] = useState<number>(0);
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
          setInssRecords(
            safeJsonParse(localStorage.getItem(lsKey("inssRecords")), [])
          );
          setInssConfigs(
            safeJsonParse(localStorage.getItem(lsKey("inssConfigs")), [])
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

          // INSS: carregamento isolado (não pode derrubar o carregamento global)
          try {
            const [cfgs, recs] = await Promise.all([
              listInssConfigs(householdId),
              listInssRecords(householdId),
            ]);
            setInssConfigs(Array.isArray(cfgs) ? cfgs : []);
            setInssRecords(Array.isArray(recs) ? recs : []);
          } catch (e) {
            console.warn("Falha ao carregar INSS (seguindo sem INSS):", e);
            setInssConfigs([]);
            setInssRecords([]);
          }

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
        setInssConfigs([]);
        setInssRecords([]);
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
    localStorage.setItem(lsKey("inssRecords"), JSON.stringify(inssRecords));
  }, [inssRecords]);
  useEffect(() => {
    localStorage.setItem(lsKey("inssConfigs"), JSON.stringify(inssConfigs));
  }, [inssConfigs]);
  useEffect(() => {
    localStorage.setItem(lsKey("exchangeRates"), JSON.stringify(exchangeRates));
  }, [exchangeRates]);


  // Regra 2 (Sprint S1): default de banco por país, com prioridade por match exato.
  // PT → NB | BR → BB
  const getDefaultBankId = useCallback(
    (country: "PT" | "BR") => getDefaultBankIdFromRules(formasPagamento, country),
    [formasPagamento]
  );

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

  // -------------------- INSS (CRUD mínimo - Sprint 4.1) --------------------
  const onSaveInssRecord = useCallback(
    async (r: InssRecord) => {
      // Sprint 4.4: ao salvar/editar um inssRecord, criar/atualizar transação vinculada no Ledger.
      const recId = r?.id || newId();

      const existing =
        recId ? inssRecords.find((x) => x.id === recId) : undefined;
      const transacaoId =
        (r as any)?.transacao_id ||
        (existing as any)?.transacao_id ||
        newId();

      const recordToPersist: InssRecord = {
        ...r,
        id: recId,
        transacao_id: transacaoId,
      };

      // Resolve NIT a partir da config do ano da competência (apenas para descrição padronizada)
      const ano =
        Number(String(recordToPersist.competencia ?? "").slice(0, 4)) ||
        new Date().getFullYear();
      const cfg = inssConfigs.find((c) => Number(c?.ano) === ano);
      const nit =
        recordToPersist.quem === "Paulo" ? cfg?.paulo?.nit : cfg?.debora?.nit;

      // Resolve defaults de categoria/conta (BR) quando disponíveis
      const upper = (s: any) => String(s ?? "").toUpperCase();
      const cats = Array.isArray(categorias) ? categorias : [];
      const despCats = cats.filter((c) => c?.tipo === TipoTransacao.DESPESA);

      const catPick =
        despCats.find((c) => upper(c?.nome).includes("INSS")) ||
        despCats.find((c) => upper(c?.nome).includes("IMPOST")) ||
        despCats.find((c) => upper(c?.nome).includes("TRIBUT")) ||
        despCats[0];

      const contas = Array.isArray(catPick?.contas) ? catPick!.contas : [];
      const contaPick =
        contas.find(
          (ct) =>
            ct?.codigo_pais === "BR" && upper(ct?.nome).includes("INSS")
        ) ||
        contas.find(
          (ct) =>
            ct?.codigo_pais === "BR" && upper(ct?.nome).includes("PREVID")
        ) ||
        contas.find((ct) => ct?.codigo_pais === "BR") ||
        contas[0];

      const descricao = `INSS - ${recordToPersist.quem} - NIT ${
        nit ?? ""
      } - Parcela ${recordToPersist.numero_parcela} - Competência ${
        recordToPersist.competencia
      } - Base ${Number(recordToPersist.salario_base ?? 0)}`;

      const tx: Transacao = {
        id: transacaoId,
        workspace_id: "fam_01",
        codigo_pais: "BR",
        categoria_id: catPick?.id || "",
        conta_contabil_id: contaPick?.id || "",
        forma_pagamento_id: getDefaultBankId("BR"),
        tipo: TipoTransacao.DESPESA,
        data_competencia: `${recordToPersist.competencia}-01`,
        data_prevista_pagamento: recordToPersist.vencimento,
        description: descricao,
        observacao: "Gerado automaticamente (INSS Brasil)",
        valor: Number(recordToPersist.valor ?? 0),
        status: recordToPersist.status,
        origem: "MANUAL",
        inss_record_id: recordToPersist.id,
      };

      if (isCloud) {
        // 1) garante o registro INSS persistido com transacao_id
        await upsertCloud<InssRecord>("inssRecords", recordToPersist);
        setInssRecords((prev) => upsertLocal(prev, recordToPersist));

        // 2) cria/atualiza a transação vinculada no Ledger (sem duplicar)
        const savedTx = await upsertCloud<Transacao>("transacoes", tx);
        setTransacoes((prev) => upsertLocal(prev, savedTx as any));
      } else {
        setInssRecords((prev) => upsertLocal(prev, recordToPersist));
        setTransacoes((prev) => upsertLocal(prev, tx));
      }
    },
    [
      isCloud,
      upsertCloud,
      upsertLocal,
      categorias,
      getDefaultBankId,
      inssConfigs,
      inssRecords,
    ]
  );

  const onDeleteInssRecord = useCallback(
    async (id: string) => {
      if (isCloud) await deleteCloud("inssRecords", id);
      setInssRecords((prev) => deleteLocal(prev, id));
    },
    [isCloud, deleteCloud, deleteLocal]
  );

  const onPatchInssRecord = useCallback(
    async (r: InssRecord) => {
      const id = String((r as any)?.id ?? "").trim();
      if (!id) return;

      // remove undefined (Firestore não aceita)
      const cleaned = Object.fromEntries(
        Object.entries(r as any).filter(([, v]) => v !== undefined)
      ) as InssRecord;

      if (isCloud) {
        const saved = await upsertCloud<InssRecord>("inssRecords", cleaned);
        setInssRecords((prev) => upsertLocal(prev, saved));
      } else {
        setInssRecords((prev) => upsertLocal(prev, cleaned));
      }
    },
    [isCloud, upsertCloud, upsertLocal]
  );

  const onImportInssRecords = useCallback(
    async (records: InssRecord[]) => {
      for (const r of records) {
        const id = String((r as any)?.id ?? "").trim();
        if (!id) continue;

        const cleaned = Object.fromEntries(
          Object.entries(r as any).filter(([, v]) => v !== undefined)
        ) as InssRecord;

        if (isCloud) {
          const saved = await upsertCloud<InssRecord>("inssRecords", cleaned);
          setInssRecords((prev) => upsertLocal(prev, saved));
        } else {
          setInssRecords((prev) => upsertLocal(prev, cleaned));
        }
      }
    },
    [isCloud, upsertCloud, upsertLocal]
  );

  const onSaveInssConfig = useCallback(
    async (cfg: InssYearlyConfig) => {
      const ano = Number((cfg as any)?.ano);
      const salarioBase = Number((cfg as any)?.salario_base);
      const perc = Number((cfg as any)?.percentual_inss);

      // garante id estável (preferir id existente; fallback para config do mesmo ano; senão usar o ano como id)
      const existingSameYear: any =
        (inssConfigs as any[])?.find((c: any) => Number(c?.ano) === ano) ?? null;

      const id =
        (cfg as any)?.id ||
        (existingSameYear as any)?.id ||
        (Number.isFinite(ano) ? String(ano) : undefined);

      const normalized: any = {
        ...(cfg as any),
        ano,
        salario_base: salarioBase,
        percentual_inss: perc,
        ...(id ? { id } : {}),
      };

      if (isCloud) {
        const saved = await upsertCloud<any>("inssConfigs", normalized);
        setInssConfigs((prev) => {
          const next = upsertLocal(prev as any, saved as any) as any[];
          return next
            .filter(Boolean)
            .sort((a: any, b: any) => Number(b?.ano ?? 0) - Number(a?.ano ?? 0));
        });
      } else {
        setInssConfigs((prev) => {
          const next = upsertLocal(prev as any, normalized as any) as any[];
          return next
            .filter(Boolean)
            .sort((a: any, b: any) => Number(b?.ano ?? 0) - Number(a?.ano ?? 0));
        });
      }
    },
    [isCloud, upsertCloud, upsertLocal, inssConfigs]
  );

  const onDeleteInssConfig = useCallback(
    async (id: string) => {
      if (isCloud) await deleteCloud("inssConfigs", id);
      setInssConfigs((prev) => deleteLocal(prev as any, id) as any);
    },
    [isCloud, deleteCloud, deleteLocal]
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

      // 1) Sprint 3.2+: Se este lançamento estiver vinculado a um Recibo, sincroniza de volta (bidirecional)
      try {
        const receiptId =
          ((savedTx as any)?.receipt_id || "").trim() ||
          inferReceiptInternalIdFromTxId(savedTx.id);

        if (receiptId) {
          const isPaid = (savedTx.status || "") === "PAGO";
          const payDate = (
            savedTx.data_prevista_pagamento ||
            savedTx.data_competencia ||
            ""
          ).trim();

          // Atualiza estado local de Recibos (sem mexer em valores/cálculos já existentes)
          setReceipts((prev) => {
            const arr = Array.isArray(prev) ? prev : [];
            const idx = arr.findIndex(
              (r) => (r as any)?.internal_id === receiptId
            );
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
            const receiptsCol = collection(
              db,
              `households/${householdId}/receipts`
            );
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
        }
      } catch (e) {
        console.warn("Falha ao sincronizar Recibo a partir do Ledger:", e);
      }

      // 2) Sprint 4.5: Se este lançamento estiver vinculado a um registro INSS, sincroniza status de volta (Ledger → INSS)
      try {
        const directInssId = String((savedTx as any)?.inss_record_id || "").trim();
        const rec =
          (Array.isArray(inssRecords) ? inssRecords : []).find(
            (r) => r.id === directInssId
          ) ||
          (Array.isArray(inssRecords) ? inssRecords : []).find(
            (r: any) => String(r?.transacao_id || "").trim() === savedTx.id
          );

        if (rec) {
          const desiredStatus = savedTx.status;
          const needsUpdate =
            (rec.status || "") !== (desiredStatus || "") ||
            String((rec as any)?.transacao_id || "").trim() !== savedTx.id;

          if (needsUpdate) {
            const patched: any = {
              ...rec,
              status: desiredStatus,
              transacao_id: savedTx.id,
            };

            // Estado local
            setInssRecords((prev) => {
              const arr = Array.isArray(prev) ? prev : [];
              const idx = arr.findIndex((x) => x.id === rec.id);
              if (idx < 0) return arr;
              const copy = arr.slice();
              copy[idx] = patched;
              return copy;
            });

            // Cloud (best-effort, sem quebrar o CRUD do Ledger)
            if (isCloud) {
              await upsertCloud<InssRecord>("inssRecords", patched);
            }
          }
        }
      } catch (e) {
        console.warn("Falha ao sincronizar INSS a partir do Ledger:", e);
      }
    },
    [isCloud, upsertCloud, upsertLocal, householdId, inssRecords]
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
      // normaliza e garante unicidade por chave (pais + ano + mes + categoria)
      const round2 = (n: any) => {
        const v = Number(n);
        if (!Number.isFinite(v)) return 0;
        return Math.round(v * 100) / 100;
      };

      const normalized: Orcamento = {
        ...(o as any),
        codigo_pais: ((o as any)?.codigo_pais || "PT") as any,
        categoria_id: String((o as any)?.categoria_id || "").trim(),
        ano: Number((o as any)?.ano || new Date().getFullYear()),
        mes: Number((o as any)?.mes || new Date().getMonth() + 1),
        valor_meta: round2((o as any)?.valor_meta),
      } as any;

      const makeDeterministicId = (x: Orcamento) => {
        const raw = `orc_${String((x as any)?.codigo_pais || "PT")}_${Number((x as any)?.ano)}_${Number(
          (x as any)?.mes
        )}_${String((x as any)?.categoria_id || "")}`;
        // Firestore doc id: evitar caracteres estranhos e limitar tamanho
        return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140);
      };

      const sameKey = (x: any) =>
        String(x?.categoria_id || "") === normalized.categoria_id &&
        String(x?.codigo_pais || "PT") === String(normalized.codigo_pais || "PT") &&
        Number(x?.ano) === Number(normalized.ano) &&
        Number(x?.mes) === Number(normalized.mes);

      const deterministicId = makeDeterministicId(normalized);
      normalized.id = deterministicId;

      if (isCloud) {
        const saved = await upsertCloud<Orcamento>("orcamentos", normalized);

        // Limpa duplicidades antigas (docId diferente, mesma chave) — best effort
        const dups = (orcamentos || []).filter((x: any) => sameKey(x) && x?.id && x.id !== deterministicId);
        for (const d of dups) {
          try {
            await deleteCloud("orcamentos", d.id);
          } catch {
            // best effort
          }
        }

        setOrcamentos((prev) => {
          const filtered = prev.filter((x: any) => !(sameKey(x) && x?.id && x.id !== deterministicId));
          return upsertLocal(filtered, saved);
        });
      } else {
        setOrcamentos((prev) => {
          const filtered = prev.filter((x: any) => !(sameKey(x) && x?.id && x.id !== deterministicId));
          return upsertLocal(filtered, normalized);
        });
      }
    },
    [isCloud, upsertCloud, upsertLocal, deleteCloud, orcamentos]
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

      const countryCode = (r?.country_code || "PT") as "PT" | "BR";
      const defaultBankId = getDefaultBankId(countryCode);
      const resolvedFormaPagamentoId = (r?.forma_pagamento_id || "").trim() || defaultBankId;

      const receiptToSave: Receipt = {
        ...r,
        internal_id: internalId,
        transacao_id: txId,
        pay_date: payDate,
        country_code: countryCode,
        forma_pagamento_id: resolvedFormaPagamentoId,
      };

      const txToSave: Transacao = {
        id: txId,
        workspace_id: r?.workspace_id || "fam_01",
        codigo_pais: receiptToSave.country_code,
        categoria_id: receiptToSave.categoria_id,
        conta_contabil_id: receiptToSave.conta_contabil_id,
        forma_pagamento_id: receiptToSave.forma_pagamento_id,
        // Sprint 3.3: propaga fornecedor do Recibo para o Lançamento vinculado
        fornecedor_id: (receiptToSave as any)?.fornecedor_id || "",
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
      setReceiptsRefreshToken((v) => v + 1);
    },
    [isCloud, householdId, getDefaultBankId]
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
      setReceiptsRefreshToken((v) => v + 1);
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

  // Guard: aba Admin só pode ser acessada por ADMIN.
  useEffect(() => {
    if (activeTab === "admin" && memberRole !== "ADMIN") {
      setActiveTab("dashboard");
    }
  }, [activeTab, memberRole]);


  const contentTitle = useMemo(() => {
    const map: Record<string, string> = {
      dashboard: "Painel Geral",
      ledger: "Lançamentos",
      calendar: "Agenda Financeira",
      inss: "INSS Brasil",
      receipts: "Meus Recibos",
      investments: "Investimentos",
      taxes: "Cálculo de IVA",
      import: "Importar/Exportar",
      admin: "Administração",
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
            orcamentos={orcamentos}
            investments={investments}
            exchangeRates={exchangeRates}
            storageMode={storageMode}
            setStorageMode={setStorageModeSafe}
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
        return <Calendar transacoes={transacoes} inssRecords={inssRecords} householdId={householdId} />;
      case "inss":
        return (
          <InssBrasil
            records={inssRecords}
            configs={inssConfigs}
            onSave={onSaveInssRecord}
            onDelete={onDeleteInssRecord}
            onPatch={onPatchInssRecord}
          />
        );
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
            isCloud={isCloud}
            householdId={householdId}
            refreshToken={receiptsRefreshToken}
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
        return (
         <TaxReports
            receipts={receipts}
            viewMode={viewMode}
            fornecedores={fornecedores}
            formasPagamento={formasPagamento}
            onSaveTx={onSaveTransacao}
            isCloud={isCloud}
            householdId={householdId}
          />
        );
      case "import":
        return (
          <ImportExport
            categorias={categorias}
            formasPagamento={formasPagamento}
            fornecedores={fornecedores}
            transacoes={transacoes}
            receipts={receipts}
            inssRecords={inssRecords}
            inssConfigs={inssConfigs}
            onSaveTx={onSaveTransacao}
            onSaveReceipt={onSaveReceipt}
            onImportInssRecords={onImportInssRecords}
          />
        );
      case "admin":
        return (
          <Admin householdId={householdId} user={user} memberRole={memberRole} />
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
            inssConfigs={inssConfigs}
            onSaveInssConfig={onSaveInssConfig}
            onDeleteInssConfig={onDeleteInssConfig}
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

  // Sprint 7.x: invite-only. Usuário autenticado, porém sem membership ativo.
  if (!membershipReady) {
    const canAccept = invite && invite.status === "pending" && !inviteLoading;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-lg">
          <h1 className="text-xl font-black mb-2">Acesso restrito</h1>
          <p className="text-sm text-gray-700 mb-4">
            Seu e-mail <strong>{user.email}</strong> ainda não tem permissão neste household.
          </p>

          <div className="bg-gray-50 border rounded-xl p-4 mb-4">
            <div className="text-[11px] font-black tracking-widest text-gray-700 mb-2">
              COMO LIBERAR O ACESSO
            </div>
            <ol className="list-decimal ml-5 text-sm text-gray-700 space-y-1">
              <li>Peça ao administrador para criar um convite para seu e-mail.</li>
              <li>Clique em <strong>Verificar convite</strong> e depois em <strong>Aceitar convite</strong>.</li>
              <li>Após aceitar, o app libera automaticamente o acesso.</li>
            </ol>
          </div>

          <div className="flex flex-wrap gap-3 items-center mb-4">
            <button
              onClick={handleCheckInvite}
              disabled={inviteLoading}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                inviteLoading ? "bg-gray-200 text-gray-500" : "bg-black text-white hover:opacity-90"
              }`}
            >
              {inviteLoading ? "Verificando…" : "Verificar convite"}
            </button>

            <button
              onClick={handleAcceptInvite}
              disabled={!canAccept}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                canAccept ? "bg-green-600 text-white hover:opacity-90" : "bg-gray-200 text-gray-500"
              }`}
            >
              Aceitar convite
            </button>

            <button
              onClick={handleLogout}
              className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-gray-50 transition"
            >
              Sair
            </button>
          </div>

          {invite && (
            <div className="text-xs text-gray-700 mb-2">
              <span className="font-bold">Status do convite:</span> {invite.status} ·{" "}
              <span className="font-bold">Perfil:</span> {invite.role}
            </div>
          )}

          {inviteInfo && (
            <div className="text-sm text-gray-700 mb-2">{inviteInfo}</div>
          )}

          {inviteError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {inviteError}
            </div>
          )}

          <div className="mt-4 text-xs text-gray-500">
            Admin (alternativa): incluir manualmente em{" "}
            <span className="font-semibold">households/{householdId}/members</span> ou criar convite em{" "}
            <span className="font-semibold">households/{householdId}/invites</span>.
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} showAdmin={memberRole === "ADMIN"} />

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