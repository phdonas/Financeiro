// Sprint 5.5 – Import Dedup Helpers

function normalizeForKey(v: any): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // uint32
  return (hash >>> 0).toString(16);
}

function safeNumKey(v: any): string {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9\-.,]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return "0";
  // mantém sinal e 2 casas para estabilidade
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function txDedupeKey(input: {
  country: string;
  dateIso: string;
  valor: any;
  categoriaId: string;
  contaId: string;
  formaId: string;
  description: string;
}): string {
  const base = [
    normalizeForKey(input.country),
    normalizeForKey(input.dateIso),
    safeNumKey(input.valor),
    normalizeForKey(input.categoriaId),
    normalizeForKey(input.contaId),
    normalizeForKey(input.formaId),
    normalizeForKey(input.description),
  ].join("|");
  return `TX|${djb2Hash(base)}`;
}

export function receiptDedupeKey(input: {
  country: string;
  receiptId: string;
  issueDateIso: string;
  fornecedorId: string;
  baseAmount: any;
  receivedAmount: any;
}): string {
  const base = [
    normalizeForKey(input.country),
    normalizeForKey(input.receiptId),
    normalizeForKey(input.issueDateIso),
    normalizeForKey(input.fornecedorId),
    safeNumKey(input.baseAmount),
    safeNumKey(input.receivedAmount),
  ].join("|");
  return `RC|${djb2Hash(base)}`;
}

export function stableReceiptInternalId(args: {
  receiptId: string;
  issueDateIso: string;
  fornecedorId: string;
  receivedAmount: any;
}): string {
  const base = [
    normalizeForKey(args.receiptId),
    normalizeForKey(args.issueDateIso),
    normalizeForKey(args.fornecedorId),
    safeNumKey(args.receivedAmount),
  ].join("|");
  // docId no Firestore não pode conter "/"; usamos prefixo e hash
  return `RC_${djb2Hash(base)}`;
}
