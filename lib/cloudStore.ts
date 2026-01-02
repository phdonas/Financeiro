import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";

const HOUSEHOLD_ID = "casa-paulo";

// settings/app (storageMode etc.)
export async function getStorageMode(): Promise<"local" | "cloud"> {
  const ref = doc(db, "households", HOUSEHOLD_ID, "settings", "app");
  const snap = await getDoc(ref);

  const mode = (snap.exists() ? snap.data()?.storageMode : null) as any;
  return mode === "cloud" ? "cloud" : "local";
}

// Lista todos os docs de uma subcoleção: households/{HOUSEHOLD_ID}/{collectionName}
export async function listDocs<T = any>(collectionName: string): Promise<T[]> {
  const colRef = collection(db, "households", HOUSEHOLD_ID, collectionName);

  // ordena por updatedAt quando existir; se não existir, não quebra (mas pode ficar sem ordem)
  // Para não falhar em coleções antigas sem updatedAt, tentamos primeiro com orderBy e se der erro, sem.
  try {
    const q = query(colRef, orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as T);
  } catch {
    const snap = await getDocs(colRef);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as T);
  }
}

// Upsert: grava id + timestamps coerentes
export async function upsertDoc<T extends { id: string }>(
  collectionName: string,
  item: T
): Promise<void> {
  const ref = doc(db, "households", HOUSEHOLD_ID, collectionName, item.id);

  // preserva createdAt se já existe
  const existing = await getDoc(ref);
  const createdAt =
    existing.exists() && existing.data()?.createdAt
      ? existing.data()!.createdAt
      : serverTimestamp();

  await setDoc(
    ref,
    {
      ...item,
      id: item.id,
      createdAt,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteDocById(
  collectionName: string,
  id: string
): Promise<void> {
  const ref = doc(db, "households", HOUSEHOLD_ID, collectionName, id);
  await deleteDoc(ref);
}
