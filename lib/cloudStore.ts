// lib/cloudStore.ts
import { db } from "./firebase";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
  runTransaction,
} from "firebase/firestore";

import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

import type { ImportLog, InssRecord, InssYearlyConfig } from "../types";

export type StorageMode = "local" | "cloud";

// ✅ ESSENCIAL para o build do App.tsx
export const DEFAULT_HOUSEHOLD_ID = "casa-paulo";

function householdPath(householdId: string = DEFAULT_HOUSEHOLD_ID) {
  return `households/${householdId}`;
}

// Remove campos com valor undefined (Firestore não aceita undefined).
// Faz strip profundo apenas em objetos "plain" e arrays; preserva Timestamps e outros objetos.
function deepStripUndefined<T>(value: T): T {
  if (value === undefined) return undefined as any;
  if (value === null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => deepStripUndefined(v)).filter((v) => v !== undefined) as any;
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    const isPlain = proto === Object.prototype || proto === null;
    if (!isPlain) return value;
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      const vv = deepStripUndefined(v);
      if (vv !== undefined) out[k] = vv;
    }
    return out;
  }
  return value;
}

/** -------------------- MEMBERSHIP / ROLES -------------------- */

export type MemberRole = "ADMIN" | "EDITOR" | "LEITOR";

export type HouseholdMember = {
  uid: string;
  householdId: string;
  role: MemberRole;
  active: boolean;
  email?: string | null;
  name?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type HouseholdInviteStatus = "pending" | "accepted" | "revoked";

export type HouseholdInvite = {
  email: string;
  emailLower: string;
  role: MemberRole;
  status: HouseholdInviteStatus;
  createdAt?: Timestamp;
  createdBy?: string | null;
  acceptedAt?: Timestamp;
  acceptedByUid?: string | null;
  revokedAt?: Timestamp;
  revokedBy?: string | null;
  updatedAt?: Timestamp;
};

function normalizeEmailLower(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Retorna o convite do e-mail no household: households/{householdId}/invites/{emailLower}
 * Sprint 7.2: invite-only por e-mail.
 */
export async function getHouseholdInviteByEmail(
  email: string | null | undefined,
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<HouseholdInvite | null> {
  const emailLower = normalizeEmailLower(email);
  if (!emailLower) return null;

  const inviteRef = doc(db, `${householdPath(householdId)}/invites/${emailLower}`);
  const snap = await getDoc(inviteRef);
  if (!snap.exists()) return null;

  const data = snap.data() as any;

  const role: MemberRole =
    data?.role === "ADMIN" || data?.role === "EDITOR" || data?.role === "LEITOR"
      ? data.role
      : "LEITOR";

  const status: HouseholdInviteStatus =
    data?.status === "pending" || data?.status === "accepted" || data?.status === "revoked"
      ? data.status
      : "pending";

  return {
    email: String(data?.email ?? emailLower),
    emailLower: String(data?.emailLower ?? emailLower),
    role,
    status,
    createdAt: data?.createdAt,
    createdBy: (data?.createdBy ?? null) as any,
    acceptedAt: data?.acceptedAt,
    acceptedByUid: (data?.acceptedByUid ?? null) as any,
    revokedAt: data?.revokedAt,
    revokedBy: (data?.revokedBy ?? null) as any,
    updatedAt: data?.updatedAt,
  };
}

/**
 * Aceita um convite e cria o membership do usuário no household.
 * Operação atômica via transaction.
 */
export async function acceptHouseholdInvite(params: {
  uid: string;
  email: string | null | undefined;
  name?: string | null;
  householdId?: string;
}): Promise<HouseholdMember> {
  const householdId = params.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const uid = String(params.uid ?? "");
  const emailLower = normalizeEmailLower(params.email);

  if (!uid) throw new Error("MISSING_UID");
  if (!emailLower) throw new Error("MISSING_EMAIL");

  const inviteRef = doc(db, `${householdPath(householdId)}/invites/${emailLower}`);
  const memberRef = doc(db, `${householdPath(householdId)}/members/${uid}`);

  return await runTransaction(db, async (tx) => {
    const now = Timestamp.now();

    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists()) throw new Error("INVITE_NOT_FOUND");

    const invite = inviteSnap.data() as any;
    const status: HouseholdInviteStatus =
      invite?.status === "pending" || invite?.status === "accepted" || invite?.status === "revoked"
        ? invite.status
        : "pending";

    if (status !== "pending") throw new Error("INVITE_NOT_PENDING");

    const role: MemberRole =
      invite?.role === "ADMIN" || invite?.role === "EDITOR" || invite?.role === "LEITOR"
        ? invite.role
        : "LEITOR";

    // Cria/atualiza membership
    tx.set(
      memberRef,
      {
        uid,
        householdId,
        role,
        active: true,
        email: params.email ?? null,
        name: params.name ?? null,
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );

    // Marca convite como aceito
    tx.update(inviteRef, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUid: uid,
      updatedAt: now,
    });

    return {
      uid,
      householdId,
      role,
      active: true,
      email: (params.email ?? null) as any,
      name: (params.name ?? null) as any,
      createdAt: now,
      updatedAt: now,
    };
  });
}





/** -------------------- ADMIN (Sprint 7.3) -------------------- */

export async function listHouseholdInvites(
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<HouseholdInvite[]> {
  const colRef = collection(db, `${householdPath(householdId)}/invites`);
  const snap = await getDocs(colRef);

  const items: HouseholdInvite[] = snap.docs.map((d) => {
    const data: any = d.data() as any;

    const role: MemberRole =
      data?.role === "ADMIN" || data?.role === "EDITOR" || data?.role === "LEITOR"
        ? data.role
        : "LEITOR";

    const status: HouseholdInviteStatus =
      data?.status === "pending" || data?.status === "accepted" || data?.status === "revoked"
        ? data.status
        : "pending";

    const emailLower = String(data?.emailLower ?? d.id ?? "").toLowerCase();

    return {
      email: String(data?.email ?? emailLower),
      emailLower,
      role,
      status,
      createdAt: data?.createdAt,
      createdBy: (data?.createdBy ?? null) as any,
      acceptedAt: data?.acceptedAt,
      acceptedByUid: (data?.acceptedByUid ?? null) as any,
      revokedAt: data?.revokedAt,
      revokedBy: (data?.revokedBy ?? null) as any,
      updatedAt: data?.updatedAt,
    };
  });

  items.sort((a, b) => String(a.emailLower || "").localeCompare(String(b.emailLower || "")));
  return items;
}

export async function upsertHouseholdInvite(params: {
  email: string;
  role: MemberRole;
  householdId?: string;
  createdByUid?: string | null;
}): Promise<void> {
  const householdId = params.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const emailRaw = String(params.email ?? "").trim();
  const emailLower = normalizeEmailLower(emailRaw);

  if (!emailLower) throw new Error("MISSING_EMAIL");

  const role: MemberRole =
    params.role === "ADMIN" || params.role === "EDITOR" || params.role === "LEITOR"
      ? params.role
      : "LEITOR";

  const inviteRef = doc(db, `${householdPath(householdId)}/invites/${emailLower}`);

  await runTransaction(db, async (tx) => {
    const now = Timestamp.now();
    const existing = await tx.get(inviteRef);

    if (existing.exists()) {
      const data: any = existing.data() as any;
      const status: HouseholdInviteStatus =
        data?.status === "pending" || data?.status === "accepted" || data?.status === "revoked"
          ? data.status
          : "pending";

      // Se já foi aceito, não recriar como pending (evita confusão).
      if (status === "accepted") {
        throw new Error("INVITE_ALREADY_ACCEPTED");
      }

      const createdAt = data?.createdAt ?? now;
      const createdBy = (data?.createdBy ?? params.createdByUid ?? null) as any;

      tx.set(
        inviteRef,
        {
          email: emailRaw,
          emailLower,
          role,
          status: "pending",
          createdAt,
          createdBy,
          updatedAt: now,
          revokedAt: null,
          revokedBy: null,
        },
        { merge: true }
      );
      return;
    }

    tx.set(inviteRef, {
      email: emailRaw,
      emailLower,
      role,
      status: "pending",
      createdAt: now,
      createdBy: (params.createdByUid ?? null) as any,
      updatedAt: now,
    });
  });
}

export async function revokeHouseholdInvite(params: {
  email: string;
  householdId?: string;
  revokedByUid?: string | null;
}): Promise<void> {
  const householdId = params.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const emailLower = normalizeEmailLower(params.email);
  if (!emailLower) throw new Error("MISSING_EMAIL");

  const inviteRef = doc(db, `${householdPath(householdId)}/invites/${emailLower}`);

  await runTransaction(db, async (tx) => {
    const now = Timestamp.now();
    const snap = await tx.get(inviteRef);
    if (!snap.exists()) throw new Error("INVITE_NOT_FOUND");

    const data: any = snap.data() as any;
    const status: HouseholdInviteStatus =
      data?.status === "pending" || data?.status === "accepted" || data?.status === "revoked"
        ? data.status
        : "pending";

    if (status != "pending") throw new Error("INVITE_NOT_PENDING");

    tx.update(inviteRef, {
      status: "revoked",
      revokedAt: now,
      revokedBy: (params.revokedByUid ?? null) as any,
      updatedAt: now,
    });
  });
}

export async function listHouseholdMembers(
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<HouseholdMember[]> {
  const colRef = collection(db, `${householdPath(householdId)}/members`);
  const snap = await getDocs(colRef);

  const items: HouseholdMember[] = snap.docs.map((d) => {
    const data: any = d.data() as any;

    const role: MemberRole =
      data?.role === "ADMIN" || data?.role === "EDITOR" || data?.role === "LEITOR"
        ? data.role
        : "LEITOR";

    return {
      uid: String(data?.uid ?? d.id),
      householdId: String(data?.householdId ?? householdId),
      role,
      active: Boolean(data?.active),
      email: (data?.email ?? null) as any,
      name: (data?.name ?? null) as any,
      createdAt: data?.createdAt,
      updatedAt: data?.updatedAt,
    };
  });

  // Ordena: ativos primeiro, depois role, depois e-mail
  const roleRank = (r: MemberRole) => (r === "ADMIN" ? 0 : r === "EDITOR" ? 1 : 2);
  items.sort((a, b) => {
    const aa = a.active ? 0 : 1;
    const bb = b.active ? 0 : 1;
    if (aa != bb) return aa - bb;
    const rr = roleRank(a.role) - roleRank(b.role);
    if (rr != 0) return rr;
    return String(a.email || a.uid).localeCompare(String(b.email || b.uid));
  });

  return items;
}

export async function updateHouseholdMember(params: {
  uid: string;
  householdId?: string;
  role?: MemberRole;
  active?: boolean;
  updatedByUid?: string | null;
}): Promise<void> {
  const householdId = params.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const uid = String(params.uid ?? "").trim();
  if (!uid) throw new Error("MISSING_UID");

  // Referências (não usar query dentro de transaction; Firestore tx não suporta tx.get(query))
  const memberRef = doc(db, "households", householdId, "members", uid);
  const membersCol = collection(db, "households", householdId, "members");

  // Leitura fora da transação para calcular próxima ação e validar LAST_ADMIN
  const snap0 = await getDoc(memberRef);
  if (!snap0.exists()) throw new Error("MEMBER_NOT_FOUND");

  const current: any = snap0.data() as any;
  const curRole: MemberRole =
    current?.role === "ADMIN" || current?.role === "EDITOR" || current?.role === "LEITOR"
      ? current.role
      : "LEITOR";
  const curActive = Boolean(current?.active);

  const nextRole: MemberRole =
    params.role === undefined
      ? curRole
      : params.role === "ADMIN" || params.role === "EDITOR" || params.role === "LEITOR"
        ? params.role
        : curRole;

  const nextActive: boolean = params.active === undefined ? curActive : Boolean(params.active);

  // Proteção: não deixar o household ficar sem ADMIN ativo
  // (validação feita fora do tx para evitar tx.get(query).)
  if (curActive && curRole === "ADMIN" && (!nextActive || nextRole !== "ADMIN")) {
    const allSnap = await getDocs(membersCol);

    let activeAdmins = 0;
    for (const d of allSnap.docs) {
      const data: any = d.data() as any;
      const role: MemberRole =
        data?.role === "ADMIN" || data?.role === "EDITOR" || data?.role === "LEITOR"
          ? data.role
          : "LEITOR";
      const active = Boolean(data?.active);

      const effRole = d.id === uid ? nextRole : role;
      const effActive = d.id === uid ? nextActive : active;

      if (effActive && effRole === "ADMIN") activeAdmins++;
    }

    if (activeAdmins < 1) throw new Error("LAST_ADMIN");
  }

  await runTransaction(db, async (tx) => {
    const now = Timestamp.now();

    const snap = await tx.get(memberRef);
    if (!snap.exists()) throw new Error("MEMBER_NOT_FOUND");

    tx.update(memberRef, {
      role: nextRole,
      active: nextActive,
      updatedAt: now,
      updatedBy: (params.updatedByUid ?? null) as any,
    });
  });
}
/**
 * Retorna o membership do usuário no household (ou null se não existir).
 * Sprint 7.1: invite-only → não criamos membership automaticamente aqui.
 */
export async function getHouseholdMember(
  uid: string,
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<HouseholdMember | null> {
  if (!uid) return null;
  const memberRef = doc(db, `${householdPath(householdId)}/members/${uid}`);
  const snap = await getDoc(memberRef);
  if (!snap.exists()) return null;
  const data = snap.data() as any;

  const role: MemberRole =
    data?.role === "ADMIN" || data?.role === "EDITOR" || data?.role === "LEITOR"
      ? data.role
      : "LEITOR";

  return {
    uid: String(data?.uid ?? uid),
    householdId: String(data?.householdId ?? householdId),
    role,
    active: Boolean(data?.active),
    email: (data?.email ?? null) as any,
    name: (data?.name ?? null) as any,
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}

/**
 * Garante que o usuário exista como membro do household.
 * Padrão do projeto: households/{householdId}/members/{uid}
 *
 * Observação: este bootstrap é deliberadamente permissivo para evitar "lockout"
 * (travamento do app) caso as Rules dependam do membership.
 * Um endurecimento mais forte (convites/join code/ownerUid) entra em sprint posterior.
 */
export async function ensureHouseholdMember(
  uid: string,
  householdId: string = DEFAULT_HOUSEHOLD_ID,
  extra?: { email?: string | null; name?: string | null }
) {
  if (!uid) return;

  const memberRef = doc(db, `${householdPath(householdId)}/members/${uid}`);

  // Preserva role existente se já existir; senão, cria como ADMIN (bootstrap).
  let role: MemberRole = "ADMIN";
  try {
    const snap = await getDoc(memberRef);
    if (snap.exists()) {
      const data = snap.data() as any;
      if (
        data?.role === "ADMIN" ||
        data?.role === "EDITOR" ||
        data?.role === "LEITOR"
      ) {
        role = data.role;
      }
    }
  } catch {
    // Se falhar leitura, ainda tentamos gravar (pode ser 1º acesso)
  }

  await setDoc(
    memberRef,
    {
      uid,
      householdId,
      role,
      active: true,
      email: extra?.email ?? null,
      name: extra?.name ?? null,
      updatedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Lê storageMode do doc: households/{householdId}/settings/app
 * Se não existir, assume "local" por segurança.
 */
export async function getStorageMode(
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<StorageMode> {
  const ref = doc(db, `${householdPath(householdId)}/settings/app`);
  const snap = await getDoc(ref);

  if (!snap.exists()) return "cloud";

  const data = snap.data() as any;
  const mode = data?.storageMode;
  return mode === "cloud" ? "cloud" : "local";
}

export async function setStorageMode(
  mode: StorageMode,
  householdId: string = DEFAULT_HOUSEHOLD_ID
) {
  const ref = doc(db, `${householdPath(householdId)}/settings/app`);
  await setDoc(
    ref,
    {
      storageMode: mode,
      updatedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/** -------------------- GENERIC CRUD (subcollections) -------------------- */

export async function listHouseholdItems<T = any>(
  subcollection: string,
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<T[]> {
  const col = collection(db, `${householdPath(householdId)}/${subcollection}`);
  const q = query(col, orderBy("updatedAt", "desc"), limit(500));
  const snap = await getDocs(q);
  // IMPORTANTE: sempre manter o id do documento (d.id) como fonte da verdade.
  // Alguns itens podem conter um campo "id" no payload que não corresponde ao docId
  // (ex.: "id" vazio). Nesse caso, o spread não pode sobrescrever o docId.
  return snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })) as T[];
}

export async function upsertHouseholdItem<T extends { id?: string }>(
  subcollection: string,
  item: T,
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<string> {
  const col = collection(db, `${householdPath(householdId)}/${subcollection}`);
  const ref = item.id ? doc(col, item.id) : doc(col);
  const now = Timestamp.now();

  const payload = deepStripUndefined({
    ...item,
    updatedAt: now,
    ...(item.id ? {} : { createdAt: now }),
  });

  await setDoc(ref, payload as any, { merge: true });

  return ref.id;
}

export async function deleteHouseholdItem(
  subcollection: string,
  id: string,
  householdId: string = DEFAULT_HOUSEHOLD_ID
) {
  const ref = doc(db, `${householdPath(householdId)}/${subcollection}/${id}`);
  await deleteDoc(ref);
}

/** -------------------- Sprint 5: IMPORT LOGS (helpers) -------------------- */

export const IMPORT_LOGS_SUB = "importLogs";

/**
 * Lista logs de importação (mais recentes primeiro).
 * Fallback seguro: se faltar createdAt, ordena localmente.
 */
export async function listImportLogs(params?: {
  householdId?: string;
  limitSize?: number;
}): Promise<ImportLog[]> {
  const householdId = params?.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const limitSize = params?.limitSize ?? 50;

  const col = collection(db, `${householdPath(householdId)}/${IMPORT_LOGS_SUB}`);

  // Se createdAt existir, usamos orderBy; caso contrário, caímos em listagem simples.
  try {
    const q = query(col, orderBy("createdAt", "desc"), limit(limitSize));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any;
  } catch {
    const q = query(col, limit(limitSize));
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any[];
    items.sort((a, b) => {
      const aMs = (a?.createdAt?.toMillis?.() ?? 0) as number;
      const bMs = (b?.createdAt?.toMillis?.() ?? 0) as number;
      return bMs - aMs;
    });
    return items as any;
  }
}

/**
 * Cria/atualiza um ImportLog.
 * Sprint 5.1: gravamos createdAt/updatedAt (Timestamp) para suportar ordenação.
 */
export async function upsertImportLog(
  log: Partial<ImportLog> & { householdId?: string },
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<string> {
  const col = collection(db, `${householdPath(householdId)}/${IMPORT_LOGS_SUB}`);
  const ref = log.id ? doc(col, log.id) : doc(col);
  const now = Timestamp.now();

  const payload: any = {
    ...log,
    householdId,
    updatedAt: now,
    ...(log.id ? {} : { createdAt: now }),
  };
  delete payload.id;

  await setDoc(ref, payload, { merge: true });
  return ref.id;
}

/** -------------------- INSS (helpers) --------------------
 * Objetivo: listar configs/records mesmo que o usuário crie docs manualmente
 * sem campos de ordenação (ex.: updatedAt). Evita quebrar o carregamento global.
 */

export const INSS_CONFIGS_SUB = "inssConfigs";
export const INSS_RECORDS_SUB = "inssRecords";

export async function listInssConfigs(
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<InssYearlyConfig[]> {
  const col = collection(db, `${householdPath(householdId)}/${INSS_CONFIGS_SUB}`);
  const q = query(col, limit(500));
  const snap = await getDocs(q);

  const items = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    // configs: ordenar por ano desc (fallback 0)
    .sort((a: any, b: any) => Number(b?.ano ?? 0) - Number(a?.ano ?? 0));

  return items as any;
}

export async function listInssRecords(
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<InssRecord[]> {
  const col = collection(db, `${householdPath(householdId)}/${INSS_RECORDS_SUB}`);
  const q = query(col, limit(500));
  const snap = await getDocs(q);

  const items = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    // records: ordenar por vencimento desc (fallback string vazia)
    .sort((a: any, b: any) => String(b?.vencimento ?? "").localeCompare(String(a?.vencimento ?? "")));

  return items as any;
}

// Sprint 2.8: paginação de transações no Firestore (Ledger)
// Cursor é o último DocumentSnapshot retornado (para startAfter)
export type TransacoesCursor = QueryDocumentSnapshot<DocumentData> | null;

export async function listTransacoesPage(params: {
  householdId?: string;
  viewMode?: "PT" | "BR" | "GLOBAL";
  pageSize?: number;
  cursor?: TransacoesCursor;
  // Datas em ISO yyyy-mm-dd (mesmo padrão de data_competencia no app)
  startDate?: string; // inclusive
  endDate?: string;   // exclusive
  // Campo de data usado para filtrar/ordenar quando startDate/endDate são informados.
  // Default mantém o comportamento antigo (data_competencia).
  dateField?: "data_competencia" | "data_prevista_pagamento";
}) {
  const {
    householdId = DEFAULT_HOUSEHOLD_ID,
    viewMode = "GLOBAL",
    pageSize = 20,
    cursor = null,
    startDate,
    endDate,
    dateField = "data_competencia",
  } = params;

  const col = collection(db, `${householdPath(householdId)}/transacoes`);

  const runQuery = async (opts: {
    includeCountry: boolean;
    orderField: "data_competencia" | "data_prevista_pagamento";
    rangeField: "data_competencia" | "data_prevista_pagamento";
  }) => {
    const constraints: any[] = [];

    // Filtro por país (quando não é GLOBAL)
    if (opts.includeCountry && viewMode !== "GLOBAL") {
      constraints.push(where("codigo_pais", "==", viewMode));
    }

    // Filtro por período (opcional)
    // Importante: quando usamos range, Firestore exige orderBy no mesmo campo.
    if (startDate && endDate) {
      constraints.push(where(opts.rangeField, ">=", startDate));
      constraints.push(where(opts.rangeField, "<", endDate));
    }

    // Ordenação default do Ledger: mais recente → mais antigo
    // Observação: datas são strings ISO, ordenação lexicográfica funciona.
    constraints.push(orderBy(opts.orderField, "desc"));
    constraints.push(orderBy("__name__", "desc"));

    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(pageSize));

    return getDocs(query(col, ...constraints));
  };

  // Tentativa 1 (preferida): aplicar filtros pelo campo selecionado
  // (ex.: CAIXA => data_prevista_pagamento). Isso evita “ficar clicando Ver mais”.
  const preferredField: "data_competencia" | "data_prevista_pagamento" =
    startDate && endDate ? dateField : "data_competencia";

  let snap;
  try {
    snap = await runQuery({
      includeCountry: true,
      orderField: preferredField,
      rangeField: preferredField,
    });
  } catch (e) {
    // Tentativa 2: remove o filtro de país para reduzir necessidade de índice composto.
    // (o filtro por país pode ser aplicado no cliente sem quebrar a lista)
    try {
      snap = await runQuery({
        includeCountry: false,
        orderField: preferredField,
        rangeField: preferredField,
      });
    } catch (e2) {
      // Tentativa 3 (fallback): volta para o comportamento antigo (data_competencia)
      // para não travar o app por falta de índices.
      snap = await runQuery({
        includeCountry: true,
        orderField: "data_competencia",
        rangeField: "data_competencia",
      });
    }
  }

  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const nextCursor: TransacoesCursor = snap.docs.length
    ? (snap.docs[snap.docs.length - 1] as any)
    : null;
  const hasMore = snap.docs.length === pageSize;

  return { items, cursor: nextCursor, hasMore };
}

// Sprint 3.6: paginação de recibos no Firestore (Recibos)
// Cursor é o último DocumentSnapshot retornado (para startAfter)
export type ReceiptsCursor = QueryDocumentSnapshot<DocumentData> | null;

export async function listReceiptsPage(params: {
  householdId?: string;
  viewMode?: "PT" | "BR" | "GLOBAL";
  pageSize?: number;
  cursor?: ReceiptsCursor;
  // Datas em ISO yyyy-mm-dd (mesmo padrão de issue_date no app)
  startDate?: string; // inclusive
  endDate?: string; // exclusive
  fornecedorId?: string; // equality
  isPaid?: boolean | null; // null => todos
}) {
  const {
    householdId = DEFAULT_HOUSEHOLD_ID,
    viewMode = "GLOBAL",
    pageSize = 20,
    cursor = null,
    startDate,
    endDate,
    fornecedorId,
    isPaid = null,
  } = params;

  const col = collection(db, `${householdPath(householdId)}/receipts`);

  const buildConstraints = (opts: {
    includeFornecedor?: boolean;
    includeIsPaid?: boolean;
    cursor?: ReceiptsCursor | null;
    limitSize: number;
  }) => {
    const constraints: any[] = [];

    // Filtro por país (quando não é GLOBAL)
    if (viewMode !== "GLOBAL") {
      constraints.push(where("country_code", "==", viewMode));
    }

    // Filtro por fornecedor (opcional)
    if (opts.includeFornecedor && fornecedorId) {
      constraints.push(where("fornecedor_id", "==", fornecedorId));
    }

    // Filtro por status (opcional)
    if (opts.includeIsPaid && (isPaid === true || isPaid === false)) {
      constraints.push(where("is_paid", "==", isPaid));
    }

    // Filtro por período (opcional)
    if (startDate && endDate) {
      constraints.push(where("issue_date", ">=", startDate));
      constraints.push(where("issue_date", "<", endDate));
    }

    // Ordenação default: mais recente → mais antigo
    // Observação: issue_date é string ISO, ordenação lexicográfica funciona.
    constraints.push(orderBy("issue_date", "desc"));
    constraints.push(orderBy("__name__", "desc"));

    if (opts.cursor) constraints.push(startAfter(opts.cursor));
    constraints.push(limit(opts.limitSize));

    return constraints;
  };

  // 1) Tentativa "ideal" (server-side filtering)
  try {
    const constraints = buildConstraints({
      includeFornecedor: true,
      includeIsPaid: true,
      cursor,
      limitSize: pageSize,
    });

    const q = query(col, ...constraints);
    const snap = await getDocs(q);

    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const nextCursor: ReceiptsCursor = snap.docs.length
      ? (snap.docs[snap.docs.length - 1] as any)
      : null;
    const hasMore = snap.docs.length === pageSize;

    return { items, cursor: nextCursor, hasMore };
  } catch (e: any) {
    const msg = String(e?.message || "");
    const code = String(e?.code || "");
    const isIndexErr =
      code === "failed-precondition" ||
      msg.toLowerCase().includes("requires an index") ||
      msg.toLowerCase().includes("index");

    if (!isIndexErr) throw e;

    // 2) Fallback: busca com constraints mínimas (sem fornecedor/is_paid) e filtra no cliente.
    // Motivo: reduzir explosão de índices quando o usuário alterna BR/PT/GLOBAL + filtros.
    const rawLimit = Math.max(60, pageSize * 3);
    let out: any[] = [];
    let nextCursor: ReceiptsCursor = cursor;
    let hasMore = false;

    // Vamos iterar páginas "brutas" até montar pageSize itens filtrados (ou acabar).
    // Limite de iterações para não explodir leituras no plano free.
    const maxIters = 6;
    let iter = 0;

    while (out.length < pageSize && iter < maxIters) {
      const constraints = buildConstraints({
        includeFornecedor: false,
        includeIsPaid: false,
        cursor: nextCursor,
        limitSize: rawLimit,
      });

      const q = query(col, ...constraints);
      const snap = await getDocs(q);

      if (!snap.docs.length) {
        hasMore = false;
        nextCursor = null;
        break;
      }

      // Filtra mantendo snapshot para cursor correto (não pular itens)
      let filledThisSnap = false;
      for (let i = 0; i < snap.docs.length; i++) {
        const docSnap: any = snap.docs[i];
        const data: any = { id: docSnap.id, ...(docSnap.data() as any) };

        const okFornecedor = !fornecedorId || data?.fornecedor_id === fornecedorId;
        const okPaid =
          isPaid === null || isPaid === undefined
            ? true
            : Boolean(data?.is_paid) === Boolean(isPaid);

        if (okFornecedor && okPaid) {
          out.push(data);
          nextCursor = docSnap as any; // cursor aponta para o último item efetivamente entregue
          if (out.length >= pageSize) {
            // ainda há chance de haver mais na mesma página bruta, então hasMore true
            hasMore = i < snap.docs.length - 1 || snap.docs.length === rawLimit;
            filledThisSnap = true;
            break;
          }
        }
      }

      if (filledThisSnap) break;

      // Não preencheu o pageSize ainda: avançar cursor para o final desta página bruta
      nextCursor = snap.docs[snap.docs.length - 1] as any;
      hasMore = snap.docs.length === rawLimit;
      if (!hasMore) break;

      iter++;
    }

    return { items: out, cursor: nextCursor, hasMore };
  }
}
