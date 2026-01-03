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
} from "firebase/firestore";

import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

export type StorageMode = "local" | "cloud";

// ✅ ESSENCIAL para o build do App.tsx
export const DEFAULT_HOUSEHOLD_ID = "casa-paulo";

function householdPath(householdId: string = DEFAULT_HOUSEHOLD_ID) {
  return `households/${householdId}`;
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
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as T[];
}

export async function upsertHouseholdItem<T extends { id?: string }>(
  subcollection: string,
  item: T,
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<string> {
  const col = collection(db, `${householdPath(householdId)}/${subcollection}`);
  const ref = item.id ? doc(col, item.id) : doc(col);
  const now = Timestamp.now();

  await setDoc(
    ref,
    {
      ...item,
      updatedAt: now,
      ...(item.id ? {} : { createdAt: now }),
    },
    { merge: true }
  );

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
}) {
  const {
    householdId = DEFAULT_HOUSEHOLD_ID,
    viewMode = "GLOBAL",
    pageSize = 20,
    cursor = null,
    startDate,
    endDate,
  } = params;

  const col = collection(db, `${householdPath(householdId)}/transacoes`);

  const constraints: any[] = [];

  // Filtro por país (quando não é GLOBAL)
  if (viewMode !== "GLOBAL") {
    constraints.push(where("codigo_pais", "==", viewMode));
  }

  // Filtro por período (opcional)
  if (startDate && endDate) {
    constraints.push(where("data_competencia", ">=", startDate));
    constraints.push(where("data_competencia", "<", endDate));
  }

  // Ordenação default do Ledger: mais recente → mais antigo
  // Observação: data_competencia é string ISO, ordenação lexicográfica funciona.
  constraints.push(orderBy("data_competencia", "desc"));
  constraints.push(orderBy("__name__", "desc"));

  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(pageSize));

  const q = query(col, ...constraints);
  const snap = await getDocs(q);

  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const nextCursor: TransacoesCursor = snap.docs.length
    ? (snap.docs[snap.docs.length - 1] as any)
    : null;
  const hasMore = snap.docs.length === pageSize;

  return { items, cursor: nextCursor, hasMore };
}
