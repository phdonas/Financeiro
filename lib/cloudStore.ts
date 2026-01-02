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
} from "firebase/firestore";

export type StorageMode = "local" | "cloud";

// ✅ ESSENCIAL para o build do App.tsx
export const DEFAULT_HOUSEHOLD_ID = "casa-paulo";

function householdPath(householdId: string = DEFAULT_HOUSEHOLD_ID) {
  return `households/${householdId}`;
}

/**
 * Garante que o usuário existe como "member" dentro do household.
 * Isso permite regras baseadas em membership sem travar o primeiro acesso.
 */
export async function ensureHouseholdMember(
  uid: string,
  householdId: string = DEFAULT_HOUSEHOLD_ID,
  extra?: { email?: string | null; name?: string | null }
) {
  if (!uid) return;

  // ✅ bootstrap membership global (regras costumam validar /members/{uid})
  const globalRef = doc(db, `members/${uid}`);
  await setDoc(
    globalRef,
    {
      uid,
      householdId,
      active: true,
      // permissões básicas (ajuste depois conforme sua política)
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      email: extra?.email ?? null,
      name: extra?.name ?? null,
      updatedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    },
    { merge: true }
  );

  // (Opcional) também registra dentro do household para uso futuro
  const hhRef = doc(db, `${householdPath(householdId)}/members/${uid}`);
  await setDoc(
    hhRef,
    {
      uid,
      householdId,
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

  if (!snap.exists()) return "local";

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

/** Helpers genéricos de CRUD em subcoleções do household */
export async function listHouseholdItems<T = any>(
  subcollection: string,
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<T[]> {
  const col = collection(db, `${householdPath(householdId)}/${subcollection}`);
  const q = query(col, orderBy("createdAt", "desc"), limit(500));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as T[];
}

export async function upsertHouseholdItem<T extends { id?: string }>(
  subcollection: string,
  item: T,
  householdId: string = DEFAULT_HOUSEHOLD_ID
) {
  const col = collection(db, `${householdPath(householdId)}/${subcollection}`);
  const ref = item.id ? doc(col, item.id) : doc(col);
  await setDoc(
    ref,
    { ...item, updatedAt: Timestamp.now(), createdAt: Timestamp.now() },
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
