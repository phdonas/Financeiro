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
  limit,
  startAfter,
  Timestamp
} from "firebase/firestore";

// ✅ Ajuste aqui se quiser mudar o household padrão no futuro
export const DEFAULT_HOUSEHOLD_ID = "casa-paulo";

// helpers
function householdPath(householdId: string = DEFAULT_HOUSEHOLD_ID) {
  return `households/${householdId}`;
}

export async function getStorageMode(householdId: string = DEFAULT_HOUSEHOLD_ID): Promise<"local" | "cloud"> {
  const ref = doc(db, `${householdPath(householdId)}/settings/app`);
  const snap = await getDoc(ref);
  const mode = snap.exists() ? (snap.data().storageMode as any) : null;
  return mode === "cloud" ? "cloud" : "local";
}

// ---------- Generic CRUD helpers (simple, safe) ----------

export async function upsertDoc<T extends { id: string }>(
  collectionName: string,
  item: T,
  householdId: string = DEFAULT_HOUSEHOLD_ID
) {
  const ref = doc(db, `${householdPath(householdId)}/${collectionName}/${item.id}`);
  await setDoc(ref, { ...item, updatedAt: Timestamp.now() }, { merge: true });
}

export async function deleteDocById(
  collectionName: string,
  id: string,
  householdId: string = DEFAULT_HOUSEHOLD_ID
) {
  const ref = doc(db, `${householdPath(householdId)}/${collectionName}/${id}`);
  await deleteDoc(ref);
}

export async function listDocs<T>(
  collectionName: string,
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<T[]> {
  const colRef = collection(db, `${householdPath(householdId)}/${collectionName}`);
  const snap = await getDocs(colRef);
  return snap.docs.map((d) => d.data() as T);
}

// ---------- Pagination helper for transactions (20 by 20) ----------
// (vamos usar depois, mas já deixo pronto)
export async function listDocsPaged<T>(
  collectionName: string,
  pageSize: number,
  lastField: any | null, // last doc field used for ordering
  orderField: string = "date",
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<{ items: T[]; nextCursor: any | null }> {
  const colRef = collection(db, `${householdPath(householdId)}/${collectionName}`);

  const baseQ = query(colRef, orderBy(orderField, "desc"), limit(pageSize));

  const q2 = lastField
    ? query(colRef, orderBy(orderField, "desc"), startAfter(lastField), limit(pageSize))
    : baseQ;

  const snap = await getDocs(q2);

  const items = snap.docs.map((d) => d.data() as T);
  const last = snap.docs.length > 0 ? (snap.docs[snap.docs.length - 1].get(orderField) as any) : null;

  return { items, nextCursor: last };
}
