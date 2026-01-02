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

export async function getStorageMode(
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<"local" | "cloud"> {
  const ref = doc(db, `${householdPath(householdId)}/settings/app`);
  const snap = await getDoc(ref);
  const mode = snap.exists() ? (snap.data().storageMode as any) : null;
  return mode === "cloud" ? "cloud" : "local";
}

// ---------- Generic CRUD helpers (simple, safe) ----------

export async function upsertDoc<T extends { id?: string }>(
  collectionName: string,
  item: T,
  householdId: string = DEFAULT_HOUSEHOLD_ID
): Promise<string> {
  const colPath = `${householdPath(householdId)}/${collectionName}`;
  const colRef = collection(db, colPath);

  // Se não vier id (ou vier vazio), geramos um id estável do Firestore.
  const cleanId = typeof item.id === "string" ? item.id.trim() : "";
  const id = cleanId ? cleanId : doc(colRef).id;

  const ref = doc(colRef, id);

  // Sempre persistimos o campo id para facilitar o front (e manter consistência nos imports/exports)
  await setDoc(
    ref,
    { ...item, id, updatedAt: Timestamp.now() },
    { merge: true }
  );

  return id;
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

  // Inclui id do documento, caso o documento não tenha o campo id (ou para garantir consistência)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as T));
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

  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as T));
  const last = snap.docs.length > 0 ? (snap.docs[snap.docs.length - 1].get(orderField) as any) : null;

  return { items, nextCursor: last };
}
