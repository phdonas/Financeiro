import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

import { TipoTransacao } from "../types";
import { stableReceiptInternalId, txDedupeKey } from "../lib/importDedupe";
import type {
  CategoriaContabil,
  FormaPagamento,
  Fornecedor,
  ImportMappingUsed,
  Receipt,
  StatusTransacao,
  Transacao,
} from "../types";

interface ImportSectionProps {
  categorias: CategoriaContabil[];
  formasPagamento: FormaPagamento[];
  fornecedores: Fornecedor[];
  /** Para dedupe (não duplicar no Ledger) */
  transacoesExistentes?: Transacao[];
  receiptsExistentes?: Receipt[];
  onSaveTx: (t: Transacao) => void;
  onSaveReceipt: (r: Receipt) => void;

  /** Para dedupe (evitar duplicação em reimport). */
  existingTransacoes?: Transacao[];
  existingReceipts?: Receipt[];

  /** Sprint 5.3: capturar mappingUsed para persistir no importLog no Sprint 5.5 */
  onMappingUsed?: (m: ImportMappingUsed) => void;
}

type ImportTypeLocal = "RECIBOS" | "LANCAMENTOS_BR" | "LANCAMENTOS_PT";
type ImportStep = "TYPE_SELECT" | "UPLOAD" | "MAPPING" | "REVIEW";

type ColumnMode = "LETTERS" | "HEADERS";

interface ParsedRow {
  id: string;
  data: Partial<Transacao> | Partial<Receipt>;
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  displayInfo: {
    data: string;
    identificador: string;
    categoria?: string;
    valor: number;
    detalhe?: string;
  };
}

type ImportValueRemap = {
  suppliers: Record<string, string>;
  categories: Record<string, string>;
  accounts: Record<string, string>;
  payments: Record<string, string>;
};

type UnresolvedIssues = {
  suppliers: string[];
  categories: string[];
  accounts: { cat: string; item: string }[];
  payments: string[];
};

type MappingField =
  | "date"
  | "tipo"
  | "banco"
  | "categoria"
  | "item"
  | "descricao"
  | "valor"
  | "pago"
  | "paid_flag"
  | "id"
  | "fornecedor"
  | "base"
  | "pay_date"
  | "irs_amount"
  | "iva_amount"
  | "received_amount"
  | "net_amount";

type RequiredMode = "ANY" | "ALL";

type FieldConfigRow = {
  field: MappingField;
  column: string;
  requiredMin: boolean;
  requiredImport: boolean;
  defaultValue: string;
  fillRule: string;
};

const DEFAULT_RATES = {
  irs: 11.5,
  iva: 23,
};

function normalizeStr(v: any): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function makeAccountKey(cat: string, item: string): string {
  return `${normalizeStr(cat)}::${normalizeStr(item)}`;
}

function isTruthyPaid(v: any): boolean {
  const s = normalizeStr(v);
  if (typeof v === "boolean") return v;
  if (s === "s" || s === "sim" || s === "y" || s === "yes" || s === "true" || s === "1") return true;
  if (s.includes("pago") || s.includes("paid")) return true;
  return false;
}

function parseMoney(v: any): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // remove símbolos e caracteres não numéricos (mantém sinais, vírgula e ponto)
  const only = s
    .replace(/\s/g, "")
    .replace(/[^0-9,\.\-]/g, "");
  // remove pontos de milhar (1.234,56) e normaliza vírgula para ponto
  const cleaned = only
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function colLetter(idx: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA
  let n = idx;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function convertToISODate(val: any): string {
  if (!val) return "";
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().split("T")[0];
  }
  if (typeof val === "number") {
    // Excel serial date
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    // YYYY-MM-DD
    if (parts[0].length === 4) {
      return `${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
    }
    // DD/MM/YYYY
    return `${parts[2]}-${String(parts[1]).padStart(2, "0")}-${String(parts[0]).padStart(2, "0")}`;
  }
  return "";
}

function requiredFieldsFor(type: ImportTypeLocal): MappingField[] {
  if (type === "RECIBOS") {
    // Validação mínima (definida pelo usuário): Número (id) + Data de emissão
    return ["id", "date"];
  }
  // Validação mínima (definida pelo usuário): Data + Valor
  return ["date", "valor"];
}

function optionalFieldsFor(type: ImportTypeLocal): MappingField[] {
  if (type === "RECIBOS") {
    return [
      "pay_date",
      "fornecedor",
      "descricao",
      "base",
      "irs_amount",
      "iva_amount",
      "received_amount",
      "net_amount",
      "pago",
      "paid_flag",
    ];
  }
  return ["tipo", "banco", "categoria", "item", "descricao", "pago", "paid_flag"];
}

function labelForField(f: MappingField): string {
  switch (f) {
    case "date":
      return "Data";
    case "tipo":
      return "Tipo (Receita/Despesa)";
    case "banco":
      return "Banco / Forma Pagamento";
    case "categoria":
      return "Categoria";
    case "item":
      return "Conta / Item";
    case "descricao":
      return "Descrição";
    case "valor":
      return "Valor";
    case "pago":
      return "Pago? (Status)";
    case "id":
      return "ID do Recibo";
    case "fornecedor":
      return "Fornecedor";
    case "base":
      return "Valor Base";
    case "pay_date":
      return "Data de Pagamento (opcional)";
    case "irs_amount":
      return "IRS (valor)";
    case "iva_amount":
      return "IVA (valor)";
    case "net_amount":
      return "Valor Líquido";
    case "received_amount":
      return "Valor Recebido";
    case "paid_flag":
      return "Flag Pago (visual)";
    default:
      return f;
  }
}

function synonymMapFor(type: ImportTypeLocal): Record<MappingField, string[]> {
  if (type === "RECIBOS") {
    return {
      date: ["issue_date", "data_emissao", "data emissao", "data", "emissao"],
      pay_date: ["pay_date", "data_pagamento", "data pagamento", "pagamento", "recebimento"],
      id: ["id", "numero", "número", "recibo", "receipt"],
      fornecedor: ["fornecedor", "supplier", "emitente"],
      descricao: ["description", "descricao", "descrição", "observacao", "observação"],
      base: ["base_amount", "base", "valor_base", "valor base", "valor"],
      irs_amount: ["irs", "irs_amount", "valor_irs", "valor irs"],
      iva_amount: ["iva", "iva_amount", "valor_iva", "valor iva"],
      received_amount: ["received", "received_amount", "valor_recebido", "valor recebido"],
      net_amount: ["net", "net_amount", "valor_liquido", "valor liquido", "valor líquido"],
      pago: ["is_paid", "pago", "status", "paid"],
      paid_flag: ["flag", "flag_pago", "flag pago"],
      // unused in RECIBOS:
      tipo: ["tipo"],
      banco: ["banco"],
      valor: ["valor"],
      categoria: ["categoria"],
      item: ["item"],
    };
  }
  // Lançamentos
  return {
    date: ["data_competencia", "data", "competencia", "competência", "date"],
    tipo: ["tipo", "tipo_transacao", "tipo transacao", "tipo_transação"],
    banco: ["banco", "forma_pagamento", "forma pagamento", "forma_pagamento_id", "forma"],
    categoria: ["categoria", "categoria_contabil", "categoria contabil"],
    item: ["conta_contabil", "conta contabil", "conta", "item"],
    descricao: ["descricao", "description", "descrição", "historico", "histórico"],
    valor: ["valor", "amount"],
    pago: ["status", "pago", "is_paid", "paid"],
    // unused in lançamentos:
    id: ["id"],
    fornecedor: ["fornecedor"],
    base: ["base"],
    pay_date: ["pay_date"],
    irs_amount: ["irs_amount"],
    iva_amount: ["iva_amount"],
    received_amount: ["received_amount"],
    net_amount: ["net_amount"],
    paid_flag: ["paid_flag"],
  };
}

function detectAutoMapping(
  type: ImportTypeLocal,
  mode: ColumnMode,
  columns: string[]
): ImportMappingUsed | null {
  // Legacy templates (sem header): usa coluna por letra (A-H / A-J)
  if (mode === "LETTERS") {
    if (type === "RECIBOS") {
      return {
        autoDetected: true,
        columns: {
          // Planilha de Recibos (linha 4+): A não usar; B..O conforme instruções
          id: "B",
          date: "C",
          pay_date: "D",
          base: "E",
          irs_amount: "F",
          iva_amount: "G",
          received_amount: "H",
          net_amount: "I",
          fornecedor: "J",
          descricao: "K",
          pago: "O",
        },
      };
    }
    // Lançamentos (Portugal novo: A..I; export antigo: A..H)
    const hasI = columns.includes("I");
    return {
      autoDetected: true,
      columns: {
        date: "A",
        tipo: "B",
        banco: "C",
        categoria: "D",
        item: "E",
        descricao: "F",
        valor: "G",
        ...(hasI ? { paid_flag: "H", pago: "I" } : { pago: "H" }),
      } as any,
    };
  }

  // Header-based: tenta mapear por nomes (ex.: export 5.2 ou layouts conhecidos)
  const syn = synonymMapFor(type);
  const colNorm = columns.map((c) => normalizeStr(c));

  const chosen: Record<string, string> = {};

  (Object.keys(syn) as MappingField[]).forEach((field) => {
    const candidates = syn[field].map(normalizeStr).filter(Boolean);
    if (candidates.length === 0) return;

    // match exato primeiro
    let idx = colNorm.findIndex((h) => candidates.includes(h));
    if (idx >= 0) {
      chosen[field] = columns[idx];
      return;
    }

    // match parcial (contém)
    idx = colNorm.findIndex((h) => candidates.some((c) => h.includes(c)));
    if (idx >= 0) chosen[field] = columns[idx];
  });

  // Valida se cobre os obrigatórios
  const required = requiredFieldsFor(type);
  const ok = required.every((f) => Boolean(chosen[f]));
  if (!ok) return null;

  return {
    autoDetected: true,
    columns: chosen,
  };
}

function buildStructureFromRows(rows: any[][]): {
  mode: ColumnMode;
  headerRowIndex: number | null;
  dataStartIndex: number;
  columns: string[];
  colIndexById: Record<string, number>;
} {
  const safeRows = rows.filter(Boolean);

  // Heurística 1: template antigo tem 3 linhas de header e dados a partir da linha 4 (index 3)
  const row3 = safeRows[3];
  const row0 = safeRows[0];
  const row1 = safeRows[1];
  const maybeLegacy =
    Array.isArray(row3) &&
    row3.length >= 3 &&
    Boolean(convertToISODate(row3[0])) &&
    (typeof (row0?.[0]) === "string" || typeof (row1?.[0]) === "string" || true);

  if (maybeLegacy) {
    const maxCols = Math.min(
      30,
      Math.max(0, ...safeRows.slice(3, 20).map((r) => (Array.isArray(r) ? r.length : 0)))
    );
    const columns = Array.from({ length: maxCols }, (_, i) => colLetter(i));
    const colIndexById: Record<string, number> = {};
    columns.forEach((c, i) => (colIndexById[c] = i));
    return { mode: "LETTERS", headerRowIndex: null, dataStartIndex: 3, columns, colIndexById };
  }

  // Heurística 2: procurar uma linha de header nas primeiras 10 linhas
  let headerRowIndex: number | null = null;
  for (let i = 0; i < Math.min(10, safeRows.length); i++) {
    const r = safeRows[i];
    if (!Array.isArray(r)) continue;
    const texts = r.map((x) => normalizeStr(x)).filter(Boolean);
    const textCount = texts.length;
    const hasHints = texts.some((t) => t.includes("data") || t.includes("date") || t.includes("valor") || t.includes("issue"));
    if (textCount >= 3 && hasHints) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex !== null) {
    const header = safeRows[headerRowIndex] as any[];
    const rawCols = header.map((c) => String(c ?? "").trim()).filter((c) => c.length > 0);
    // manter índice estável: se coluna vazia, cria um "COL_x"
    const colsWithIndex = header.map((c, idx) => {
      const s = String(c ?? "").trim();
      return s.length ? s : `COL_${idx + 1}`;
    });

    // garantir unicidade
    const seen: Record<string, number> = {};
    const columns = colsWithIndex.map((c) => {
      const key = c;
      const n = (seen[key] = (seen[key] || 0) + 1);
      return n === 1 ? c : `${c} (${n})`;
    });

    const colIndexById: Record<string, number> = {};
    columns.forEach((c, i) => (colIndexById[c] = i));
    return {
      mode: "HEADERS",
      headerRowIndex,
      dataStartIndex: headerRowIndex + 1,
      columns,
      colIndexById,
    };
  }

  // fallback: tratar como letras
  const maxCols = Math.min(
    30,
    Math.max(0, ...safeRows.slice(0, 20).map((r) => (Array.isArray(r) ? r.length : 0)))
  );
  const columns = Array.from({ length: maxCols }, (_, i) => colLetter(i));
  const colIndexById: Record<string, number> = {};
  columns.forEach((c, i) => (colIndexById[c] = i));
  return { mode: "LETTERS", headerRowIndex: null, dataStartIndex: 0, columns, colIndexById };
}

const ImportSection: React.FC<ImportSectionProps> = ({
  categorias,
  formasPagamento,
  fornecedores,
  transacoesExistentes,
  receiptsExistentes,
  onSaveTx,
  onSaveReceipt,
  onMappingUsed,
}) => {
  const [currentStep, setCurrentStep] = useState<ImportStep>("TYPE_SELECT");
  const [importType, setImportType] = useState<ImportTypeLocal | null>(null);

  const [importResults, setImportResults] = useState<ParsedRow[]>([]);
  const [rawRows, setRawRows] = useState<any[][] | null>(null);

  const [structureMode, setStructureMode] = useState<ColumnMode>("LETTERS");
  const [dataStartIndex, setDataStartIndex] = useState<number>(3);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [colIndexById, setColIndexById] = useState<Record<string, number>>({});

  const [mappingDraft, setMappingDraft] = useState<Record<string, string>>({});
  const [mappingUsedState, setMappingUsedState] = useState<ImportMappingUsed | null>(null);

  // Sprint 5.5+: configuração de mapeamento avançado (por campo)
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfigRow[]>([]);
  const [minMode, setMinMode] = useState<RequiredMode>("ANY");
  const [importMode, setImportMode] = useState<RequiredMode>("ALL");

  const [valueRemap, setValueRemap] = useState<ImportValueRemap>({
    suppliers: {},
    categories: {},
    accounts: {},
    payments: {},
  });
  const [unresolved, setUnresolved] = useState<UnresolvedIssues | null>(null);
  const [needsRebuild, setNeedsRebuild] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const colIndexByIdRef = useRef<Record<string, number>>({});

  const requiredFields = useMemo(() => (importType ? requiredFieldsFor(importType) : []), [importType]);
  const optionalFields = useMemo(() => (importType ? optionalFieldsFor(importType) : []), [importType]);

  function resetAll() {
    setCurrentStep("TYPE_SELECT");
    setImportType(null);
    setImportResults([]);
    setRawRows(null);
    setAvailableColumns([]);
    setColIndexById({});
    setMappingDraft({});
    setMappingUsedState(null);
    setFieldConfigs([]);
    setMinMode('ANY');
    setImportMode('ALL');
    colIndexByIdRef.current = {};
    setValueRemap({ suppliers: {}, categories: {}, accounts: {}, payments: {} });
    setUnresolved(null);
    setNeedsRebuild(false);
    setStructureMode("LETTERS");
    setDataStartIndex(3);
  }

  function getCell(row: any[], field: MappingField, mappingColumns: Record<string, string>): any {
    const colId = mappingColumns[field];
    if (!colId) return "";
    const idx = (colIndexByIdRef.current || {})[colId];
    if (typeof idx !== "number") return "";
    return row[idx];
  }

  
  function parseWithMapping(rows: any[][], mapping: ImportMappingUsed, remap: ImportValueRemap = valueRemap) {
    const mappingCols = mapping.columns as Record<string, string>;

    const issueSuppliers = new Set<string>();
    const issueCategories = new Set<string>();
    const issueAccounts = new Map<string, { cat: string; item: string }>();
    const issuePayments = new Set<string>();

    const isRowBlank = (row: any[]) =>
      row.every((v) => String(v ?? "").trim() === "");

    const dataRows = rows.slice(dataStartIndex);
    const results: ParsedRow[] = dataRows
      .map((row) => {
        if (!Array.isArray(row)) return null;
        if (isRowBlank(row)) return null;
        const errors: string[] = [];
        const warnings: string[] = [];

        // Regras (por tipo) definidas pelo usuário
        const cfgByField: Record<string, FieldConfigRow> = Object.fromEntries(
          (fieldConfigs || []).map((c) => [c.field, c])
        );

        const getRaw = (f: MappingField) => getCell(row, f, mappingCols);
        const getEffective = (f: MappingField) => {
          const raw = getRaw(f);
          const s = String(raw ?? "").trim();
          if (s) return raw;
          const def = cfgByField[f]?.defaultValue ?? "";
          return def;
        };
        const isFilled = (v: any) => String(v ?? "").trim() !== "";

        const minFields = (fieldConfigs || []).filter((c) => c.requiredMin).map((c) => c.field);
        const importFields = (fieldConfigs || []).filter((c) => c.requiredImport).map((c) => c.field);

        const checkRequired = (fields: MappingField[], mode: RequiredMode) => {
          if (!fields || fields.length === 0) return { ok: true, missing: [] as MappingField[] };
          const filled = fields.filter((f) => isFilled(getEffective(f)));
          if (mode === "ANY") {
            return { ok: filled.length > 0, missing: filled.length > 0 ? [] : fields };
          }
          const missing = fields.filter((f) => !isFilled(getEffective(f)));
          return { ok: missing.length === 0, missing };
        };

        // 1) Filtro: só considerar linha se atender o critério mínimo (ou se não houver critério mínimo, se não for totalmente vazia)
        const minCheck = checkRequired(minFields, minMode);
        if (!minCheck.ok) {
          return null;
        }

        // 2) Validação: linha é importável se atender o critério de importação
        const importCheck = checkRequired(importFields, importMode);
        if (!importCheck.ok) {
          if (importMode === "ANY") errors.push(`Campos obrigatórios ausentes: nenhum entre (${importFields.map(labelForField).join(', ')})`);
          else errors.push(`Campos obrigatórios ausentes: ${importCheck.missing.map(labelForField).join(', ')}`);
        }

        // Data (se existir)
        const dateVal = getEffective("date");
        const dateStr = String(dateVal ?? "").trim();
        const isoDate = dateStr ? convertToISODate(dateVal) : "";
        if (dateStr && !isoDate) errors.push("Data inválida");

        if (importType === "RECIBOS") {
          const rId = String(getEffective("id") || "").trim();

          const supName = String(getEffective("fornecedor") || "").trim();
          const desc = String(getEffective("descricao") || "").trim();

          const payDateIso = convertToISODate(getEffective("pay_date"));
          const baseVal = parseMoney(getEffective("base"));
          const irsA = parseMoney(getEffective("irs_amount"));
          const ivaA = parseMoney(getEffective("iva_amount"));
          const receivedA = parseMoney(getEffective("received_amount"));
          const netA = parseMoney(getEffective("net_amount"));

          const paidRaw = getEffective("pago");
          const isPaid = normalizeStr(paidRaw) === "x" || isTruthyPaid(paidRaw);

          // Campos opcionais: podem estar vazios. Se houver valor e não mapear, vira WARNING (não bloqueia).
          let foundSup: Fornecedor | undefined = undefined;
          if (supName) {
            const foundSupByName = fornecedores.find((s) => s.nome.toUpperCase() === supName.toUpperCase());
            foundSup =
              foundSupByName ||
              (remap.suppliers[normalizeStr(supName)]
                ? fornecedores.find((s) => s.id === remap.suppliers[normalizeStr(supName)])
                : undefined);

            if (!foundSup) {
              issueSuppliers.add(supName);
              warnings.push(`Fornecedor '${supName}' não mapeado`);
            }
          } else {
            warnings.push("Fornecedor/Empresa vazio");
          }

          const country = (foundSup?.pais || "PT") as any;

          // Categoria/Conta derivadas do Fornecedor (se existir)
          const rawCatName = String(foundSup?.descricao || "").trim();
          let foundCat: CategoriaContabil | undefined = undefined;
          let mainConta: any | undefined = undefined;

          if (rawCatName) {
            const catKey = normalizeStr(rawCatName);
            const foundCatByName = categorias.find((c) => c.nome.toUpperCase() === rawCatName.toUpperCase());
            foundCat =
              foundCatByName ||
              (remap.categories[catKey] ? categorias.find((c) => c.id === remap.categories[catKey]) : undefined);

            if (!foundCat) {
              issueCategories.add(rawCatName);
              warnings.push(`Cat '${rawCatName}' não mapeada`);
            } else {
              mainConta = (foundCat?.contas || []).find((c: any) => (c as any)?.codigo_pais === country) || foundCat?.contas?.[0];
              if (!mainConta) warnings.push("Categoria sem contas para vincular");
            }
          }

          const internalId = stableReceiptInternalId({
            receiptId: rId || "",
            issueDateIso: isoDate || "",
            fornecedorId: foundSup?.id || "",
            receivedAmount: receivedA,
          });
          const txId = `TX_${internalId}`;

          const irsRate = baseVal > 0 ? (irsA / baseVal) * 100 : DEFAULT_RATES.irs;
          const ivaRate = baseVal > 0 ? (ivaA / baseVal) * 100 : DEFAULT_RATES.iva;

          const receipt: Partial<Receipt> = {
            internal_id: internalId,
            transacao_id: txId,
            id: rId || "",
            issue_date: isoDate || "",
            pay_date: payDateIso || undefined,
            country_code: country,
            fornecedor_id: foundSup?.id || "",
            categoria_id: foundCat?.id || "",
            conta_contabil_id: mainConta?.id || "",
            description: desc || (rId ? `Recibo #${rId}` : "Recibo importado"),
            base_amount: baseVal || 0,
            irs_rate: Number.isFinite(irsRate) ? Math.round(irsRate * 100) / 100 : undefined,
            iva_rate: Number.isFinite(ivaRate) ? Math.round(ivaRate * 100) / 100 : undefined,
            irs_amount: irsA || 0,
            iva_amount: ivaA || 0,
            net_amount: netA || 0,
            received_amount: receivedA || 0,
            is_paid: isPaid,
            forma_pagamento_id: "",
            flag_calcula_premiacao: Boolean(foundSup?.flag_calcula_premiacao),
            workspace_id: "fam_01",
          };

          return {
            id: receipt.internal_id!,
            data: receipt,
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length ? warnings : undefined,
            displayInfo: {
              data: isoDate || "",
              identificador: rId ? `REC #${rId}` : "REC",
              categoria: foundCat?.nome || rawCatName,
              valor: receipt.received_amount || 0,
              detalhe: supName,
              paidVisual: isPaid,
            } as any,
          };
        }

        // Lançamentos (PT/BR)
        const country = importType === "LANCAMENTOS_BR" ? "BR" : "PT";
        const tipoStr = String(getEffective("tipo") || "").toUpperCase();
        const banco = String(getEffective("banco") || "").trim();
        const catName = String(getEffective("categoria") || "").trim();
        const itemName = String(getEffective("item") || "").trim();
        const desc = String(getEffective("descricao") || "").trim();

        const rawValor = getEffective("valor");
        const rawValorStr = String(rawValor ?? "").trim();
        const val = parseMoney(rawValor);

        // Valor (se presente)
        if (rawValorStr) {
          if (val === 0 && normalizeStr(rawValorStr) !== "0" && normalizeStr(rawValorStr) !== "0,00" && normalizeStr(rawValorStr) !== "0.00") {
            warnings.push("Valor não reconhecido: importado como 0");
          }
        }

        // Campos opcionais: se houver valor e não mapear, vira WARNING (não bloqueia).
        let foundFP: FormaPagamento | undefined = undefined;
        if (banco) {
          const fpKey = normalizeStr(banco);
          const foundFPByName = formasPagamento.find((f) => f.nome.toUpperCase() === banco.toUpperCase());
          foundFP =
            foundFPByName ||
            (remap.payments[fpKey] ? formasPagamento.find((f) => f.id === remap.payments[fpKey]) : undefined);

          if (!foundFP) {
            issuePayments.add(banco);
            warnings.push(`Forma de pagamento '${banco}' não cadastrada`);
          }
        }

        let foundCat: CategoriaContabil | undefined = undefined;
        if (catName) {
          const foundCatByName = categorias.find((c) => c.nome.toUpperCase() === catName.toUpperCase());
          foundCat =
            foundCatByName ||
            (remap.categories[normalizeStr(catName)]
              ? categorias.find((c) => c.id === remap.categories[normalizeStr(catName)])
              : undefined);

          if (!foundCat) {
            issueCategories.add(catName);
            warnings.push(`Cat '${catName}' não mapeada`);
          }
        }

        let foundItem: any | undefined = undefined;
        if (foundCat && itemName) {
          const accountKey = makeAccountKey(catName, itemName);
          const foundItemByName = foundCat?.contas.find((i: any) => i.nome.toUpperCase() === itemName.toUpperCase());
          foundItem =
            foundItemByName ||
            (remap.accounts[accountKey] ? foundCat.contas.find((i: any) => i.id === remap.accounts[accountKey]) : undefined);

          if (!foundItem) {
            issueAccounts.set(accountKey, { cat: catName, item: itemName });
            warnings.push(`Conta '${itemName}' não mapeada`);
          }
        }

        const isPaid = isTruthyPaid(getEffective("pago"));
        const paidFlag = isTruthyPaid(getEffective("paid_flag"));
        const status: StatusTransacao = isPaid ? "PAGO" : "PENDENTE";

        const tipoParsed = (() => {
          const t = normalizeStr(tipoStr);
          if (t.includes("receita")) return TipoTransacao.RECEITA;
          if (t.includes("transfer")) return TipoTransacao.TRANSFERENCIA;
          if (t.includes("pagamento") && t.includes("fatura")) return TipoTransacao.PAGAMENTO_FATURA;
          if (t.includes("pagamento_fatura")) return TipoTransacao.PAGAMENTO_FATURA;
          return TipoTransacao.DESPESA;
        })();

        const tipo = (() => {
          const it = normalizeStr(itemName);
          if (it === "cartao de credito" || (it.includes("cartao") && it.includes("credito"))) {
            return TipoTransacao.PAGAMENTO_FATURA;
          }
          return tipoParsed;
        })();

        const txHash = txDedupeKey({
          country,
          dateIso: isoDate || "",
          valor: val,
          categoriaId: catName,
          contaId: itemName,
          formaId: banco,
          description: desc || itemName || "",
        }).split("|")[1];
        const txId = `IMPT_${txHash}`;

        const tx: Partial<Transacao> = {
          id: txId,
          codigo_pais: country,
          tipo,
          data_competencia: isoDate || "",
          data_prevista_pagamento: isoDate || "",
          description: desc || itemName || "Importada",
          valor: val,
          status,
          forma_pagamento_id: foundFP?.id || "",
          categoria_id: foundCat?.id || "",
          conta_contabil_id: foundItem?.id || "",
          origem: "IMPORTACAO",
          workspace_id: "fam_01",
        };

        return {
          id: tx.id!,
          data: tx,
          isValid: errors.length === 0,
          errors,
          warnings: warnings.length ? warnings : undefined,
          displayInfo: {
            data: isoDate || "",
            identificador: tx.description || "",
            categoria: foundCat?.nome || catName,
            valor: val,
            detalhe: banco,
            paidVisual: paidFlag,
          },
        };
      })
      .filter(Boolean) as ParsedRow[];

    setUnresolved({
      suppliers: Array.from(issueSuppliers).sort(),
      categories: Array.from(issueCategories).sort(),
      accounts: Array.from(issueAccounts.values()).sort((a, b) => (a.cat + a.item).localeCompare(b.cat + b.item)),
      payments: Array.from(issuePayments).sort(),
    });
    setNeedsRebuild(false);

    setImportResults(results);
    setCurrentStep("REVIEW");
  }


  function handleSelectType(t: ImportTypeLocal) {
    setImportType(t);
    setCurrentStep("UPLOAD");
    setImportResults([]);
    setRawRows(null);
    setAvailableColumns([]);
    setColIndexById({});
    setMappingDraft({});
    setMappingUsedState(null);
    setValueRemap({ suppliers: {}, categories: {}, accounts: {}, payments: {} });
    setUnresolved(null);
    setNeedsRebuild(false);
  }

  function handleChooseFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !importType) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      if (!data) return;

      try {
        const workbook = XLSX.read(data, { type: "array" });

        const normName = (s: string) =>
          String(s || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

        const pickSheetName = () => {
          if (importType === "RECIBOS") {
            return (
              workbook.SheetNames.find((n) => normName(n).includes("recibo")) ||
              workbook.SheetNames[0]
            );
          }
          if (importType === "LANCAMENTOS_PT") {
            return (
              workbook.SheetNames.find((n) => normName(n).includes("lanc")) ||
              workbook.SheetNames[0]
            );
          }
          return workbook.SheetNames[0];
        };

        const sheetName = pickSheetName();
        const sheet = workbook.Sheets[sheetName];
        const rows = (() => {
          const ref = (sheet as any)["!ref"];
          if (!ref) return [] as any[][];
          const range = XLSX.utils.decode_range(ref);
          const out: any[][] = [];
          const maxCols = Math.min(30, range.e.c - range.s.c + 1);
          for (let R = range.s.r; R <= range.e.r; R++) {
            const row: any[] = [];
            for (let C = range.s.c; C <= range.e.c && C < range.s.c + maxCols; C++) {
              const addr = XLSX.utils.encode_cell({ r: R, c: C });
              const cell: any = (sheet as any)[addr];
              let v: any = "";
              if (cell) {
                if (cell.v instanceof Date) v = cell.v;
                else if (typeof cell.v === "number") v = cell.v;
                else v = cell.w ?? cell.v ?? "";
              }
              row.push(v ?? "");
            }
            out.push(row);
          }
          return out;
        })() as any[][];
        setRawRows(rows);

        // Força mapeamento direto para Portugal (linha 3 = cabeçalho, dados na linha 4)
        const forcedDirect = (() => {
          if (importType === "LANCAMENTOS_PT") {
            const h = (rows?.[2] || []).map((x) => normalizeStr(x));
            const ok =
              h[1] === "tipotransacao" &&
              h[2] === "formapagamento" &&
              h[3] === "categoriacontabil" &&
              h[4] === "contaitem" &&
              h[5].includes("descricao") &&
              h[6] === "valor" &&
              h[7].includes("flag") &&
              h[8] === "status";
            if (ok) {
              const cols = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
              const idx: Record<string, number> = {};
              cols.forEach((c, i) => (idx[c] = i));
              return {
                mode: "LETTERS" as ColumnMode,
                headerRowIndex: 2,
                dataStartIndex: 3,
                columns: cols,
                colIndexById: idx,
              };
            }
          }
          if (importType === "RECIBOS") {
            // Recibos (layout do usuário): cabeçalho na linha 1 e repetido na linha 2; dados a partir da linha 3.
            const cols = Array.from({ length: 15 }, (_, i) => colLetter(i)); // A..O
            const idx: Record<string, number> = {};
            cols.forEach((c, i) => (idx[c] = i));

            const h0 = (rows?.[0] || []).map((x) => normalizeStr(x));
            const h1 = (rows?.[1] || []).map((x) => normalizeStr(x));
            const headerRepeated = h0.length > 3 && h1.length > 3 && h0[1] === "numero" && h1[1] === "numero";
            const start = headerRepeated ? 2 : 1; // index 2 = linha 3 (dados)

            return {
              mode: "LETTERS" as ColumnMode,
              headerRowIndex: 0,
              dataStartIndex: start,
              columns: cols,
              colIndexById: idx,
            };
          }
          return null;
        })();

        const structure = forcedDirect || buildStructureFromRows(rows);
        setStructureMode(structure.mode);
        setDataStartIndex(structure.dataStartIndex);
        setAvailableColumns(structure.columns);
        colIndexByIdRef.current = structure.colIndexById;
        setColIndexById(structure.colIndexById);

        // Sprint 5.5+: sempre abrir tela de regras/mapeamento (mais robusto do que inferência automática)
        const suggested = detectAutoMapping(importType, structure.mode, structure.columns);

        // Campos (modelo do banco)
        const allFields: MappingField[] = Array.from(new Set([...requiredFieldsFor(importType), ...optionalFieldsFor(importType)]));

        const suggestedCols = (suggested?.columns || {}) as Record<string, string>;
        const initialConfigs: FieldConfigRow[] = allFields.map((field) => {
          const presetCol = suggestedCols[field] || "";
          const isReqMin = requiredFieldsFor(importType).includes(field);
          // defaults por tipo
          let reqMin = isReqMin;
          let reqImport = isReqMin;
          if (importType === "RECIBOS") {
            // linha considerada se tiver ID ou Data; importável se tiver ao menos 1 dos dois (modo ANY por padrão)
            reqMin = field === "id" || field === "date";
            reqImport = field === "id" || field === "date";
          } else {
            // lançamentos: linha considerada se tiver Data ou Valor; importável requer Data e Valor (modo ALL por padrão)
            reqMin = field === "date" || field === "valor";
            reqImport = field === "date" || field === "valor";
          }

          return {
            field,
            column: presetCol,
            requiredMin: reqMin,
            requiredImport: reqImport,
            defaultValue: "",
            fillRule: "",
          };
        });

        // Modos padrão
        if (importType === "RECIBOS") {
          setMinMode("ANY");
          setImportMode("ANY");
        } else {
          setMinMode("ANY");
          setImportMode("ALL");
        }

        setFieldConfigs(initialConfigs);
        setMappingDraft({ ...suggestedCols });
        setCurrentStep("MAPPING");
      } catch (err: any) {
        console.error(err);
        alert("Falha ao ler a planilha/arquivo. Verifique o formato (XLSX/CSV).");
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function mappingIsValid(): boolean {
    if (!importType) return false;
    // Regras: campos marcados como Obrigatório (Importar) precisam estar mapeados e sem duplicar colunas.
    const required = fieldConfigs.filter((c) => c.requiredImport).map((c) => c.field);
    if (required.length === 0) return true;
    const selected = fieldConfigs
      .filter((c) => c.requiredImport)
      .map((c) => (c.column || '').trim())
      .filter(Boolean);
    if (selected.length !== required.length) return false;
    const unique = new Set(selected);
    if (unique.size !== selected.length) return false;
    return true;
  }

  function handleConfirmMapping() {
    if (!importType || !rawRows) return;
    if (!mappingIsValid()) return alert("Mapeie todos os campos obrigatórios (Importar) sem duplicar colunas.");

    const columns: Record<string, string> = {};
    fieldConfigs.forEach((c) => {
      const col = (c.column || "").trim();
      if (col) columns[c.field] = col;
    });

    const mapping: ImportMappingUsed = {
      autoDetected: false,
      columns,
    };

    setMappingDraft(columns);
    setMappingUsedState(mapping);
    onMappingUsed?.(mapping);

    parseWithMapping(rawRows, mapping, valueRemap);
  }


  function rebuildPreview() {
    if (!rawRows || !mappingUsedState) return;
    parseWithMapping(rawRows, mappingUsedState, valueRemap);
  }

  function confirmSync() {
    if (needsRebuild) {
      return alert("Você alterou o remapeamento. Clique em 'Atualizar preview' antes de sincronizar.");
    }

    const validOnes = importResults.filter((r) => r.isValid);
    if (validOnes.length === 0) return alert("Dados inválidos.");

    const seen = new Set<string>();
    const existingTx = new Set((transacoesExistentes || []).map((t) => t.id));
    const existingRc = new Set(
      (receiptsExistentes || []).map((r: any) => String(r?.internal_id || ""))
    );

    let synced = 0;
    validOnes.forEach((res) => {
      if (seen.has(res.id)) return;
      seen.add(res.id);

      if (importType === "RECIBOS") {
        const r = res.data as Receipt;
        // evita duplicação por id interno (upsert) — mantém regra: Recibo gera Lançamento vinculado no App.tsx
        if (r?.internal_id && existingRc.has(String((r as any).internal_id))) {
          onSaveReceipt(r);
          synced++;
          return;
        }
        onSaveReceipt(r);
        synced++;
      } else {
        const t = res.data as Transacao;
        if (t?.id && existingTx.has(String(t.id))) {
          onSaveTx(t);
          synced++;
          return;
        }
        onSaveTx(t);
        synced++;
      }
    });

    alert(`Sincronizado: ${synced} registros.`);
    resetAll();
  }


  const previewSummary = useMemo(() => {
    const total = importResults.length;
    const valid = importResults.filter((r) => r.isValid).length;
    const withWarnings = importResults.filter((r) => r.isValid && (r.warnings?.length || 0) > 0).length;
    const invalid = total - valid;

    const totalValue = importResults
      .filter((r) => r.isValid)
      .reduce((acc, r) => {
        const d: any = r.data;
        const v = typeof d?.valor === "number" ? d.valor : typeof d?.received_amount === "number" ? d.received_amount : 0;
        return acc + (Number.isFinite(v) ? v : 0);
      }, 0);

    return { total, valid, invalid, withWarnings, totalValue };
  }, [importResults]);

  const criticalPending = false;

  const title = useMemo(() => {
    if (importType === "RECIBOS") return "Recibos";
    if (importType === "LANCAMENTOS_BR") return "Lançamentos BR";
    if (importType === "LANCAMENTOS_PT") return "Lançamentos PT";
    return "Importação";
  }, [importType]);

  const currencyPrefix = useMemo(() => {
    if (importType === "LANCAMENTOS_BR") return "R$";
    // Recibos e Lançamentos PT
    return "€";
  }, [importType]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-24 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">
            Importação Local
          </h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] italic opacity-60">
            Sprint 5.3 • Detecção + Mapeamento (De-Para)
          </p>
        </div>

        <button
          type="button"
          onClick={resetAll}
          className="text-[10px] font-black uppercase italic px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all"
        >
          Reiniciar
        </button>
      </div>

      {/* Step: TYPE_SELECT */}
      {currentStep === "TYPE_SELECT" && (
        <div className="space-y-8">
          <div className="text-center">
            <p className="text-[12px] text-gray-500 font-bold">
              Selecione o tipo de importação e depois carregue o arquivo (XLSX ou CSV).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => handleSelectType("LANCAMENTOS_PT")}
              className="rounded-2xl border border-blue-200 p-5 text-left hover:bg-blue-50/30 transition-all active:scale-[0.99]"
            >
              <div className="text-2xl font-black">🇵🇹</div>
              <div className="mt-2 text-bb-blue font-black uppercase italic">Lançamentos PT</div>
              <div className="text-[11px] text-gray-500 font-bold mt-1">
                Importa despesas/receitas (layout antigo ou CSV exportado do app).
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectType("LANCAMENTOS_BR")}
              className="rounded-2xl border border-emerald-200 p-5 text-left hover:bg-emerald-50/30 transition-all active:scale-[0.99]"
            >
              <div className="text-2xl font-black">🇧🇷</div>
              <div className="mt-2 text-bb-blue font-black uppercase italic">Lançamentos BR</div>
              <div className="text-[11px] text-gray-500 font-bold mt-1">
                Mesmo fluxo do PT, com país BR.
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectType("RECIBOS")}
              className="rounded-2xl border border-violet-200 p-5 text-left hover:bg-violet-50/30 transition-all active:scale-[0.99]"
            >
              <div className="text-2xl font-black">🧾</div>
              <div className="mt-2 text-bb-blue font-black uppercase italic">Recibos</div>
              <div className="text-[11px] text-gray-500 font-bold mt-1">
                Importa recibos (PT) e cria a transação associada.
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Step: UPLOAD */}
      {currentStep === "UPLOAD" && importType && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 p-6 bg-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[12px] text-gray-500 font-bold uppercase italic tracking-widest">
                  Tipo selecionado
                </div>
                <div className="text-2xl font-black text-bb-blue italic uppercase tracking-tight">
                  {title}
                </div>
                <div className="text-[11px] text-gray-500 font-bold mt-1">
                  O app tentará reconhecer o layout automaticamente. Se não reconhecer, será exibido o mapeamento (De-Para).
                </div>
              </div>

              <button
                type="button"
                onClick={handleChooseFile}
                className="bg-bb-blue text-white font-black uppercase italic px-5 py-3 rounded-2xl shadow hover:scale-105 active:scale-95 transition-all"
              >
                Selecionar arquivo
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div className="text-[11px] text-gray-500 font-bold">
            Dica: se você exportou do próprio app (Sprint 5.2), a importação deve reconhecer as colunas automaticamente.
          </div>
        </div>
      )}

      {/* Step: MAPPING */}
      {currentStep === "MAPPING" && importType && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-6">
            <div className="text-[12px] text-amber-800 font-black uppercase italic tracking-widest">
              Regras + Mapeamento de Importação
            </div>
            <div className="text-[11px] text-amber-900 font-bold mt-2">
              Aqui você define exatamente em qual coluna está cada campo do banco. O app usa essas regras para ler, validar e importar.
            </div>
            <div className="text-[11px] text-amber-900 font-bold mt-1">
              Nível 1 (Prévia) define quais linhas são consideradas registros. Nível 2 (Importar) define quais linhas são válidas para gravação.
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-6 bg-white space-y-4">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              <div className="flex-1">
                <div className="text-[12px] text-gray-500 font-bold uppercase italic tracking-widest">Obrigatório Nível 1 (Prévia)</div>
                <div className="text-[11px] text-gray-500 font-bold mt-1">Modo</div>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold bg-white"
                  value={minMode}
                  onChange={(e) => setMinMode(e.target.value as any)}
                >
                  <option value="ANY">ANY (basta 1 preenchido)</option>
                  <option value="ALL">ALL (todos preenchidos)</option>
                </select>
              </div>

              <div className="flex-1">
                <div className="text-[12px] text-gray-500 font-bold uppercase italic tracking-widest">Obrigatório Nível 2 (Importar)</div>
                <div className="text-[11px] text-gray-500 font-bold mt-1">Modo</div>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold bg-white"
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as any)}
                >
                  <option value="ANY">ANY (basta 1 preenchido)</option>
                  <option value="ALL">ALL (todos preenchidos)</option>
                </select>
              </div>
            </div>

            <div className="overflow-auto rounded-2xl border border-gray-100">
              <table className="min-w-[980px] w-full text-[12px]">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-black uppercase italic text-gray-500">Campo do banco</th>
                    <th className="px-4 py-3 font-black uppercase italic text-gray-500">Coluna</th>
                    <th className="px-4 py-3 font-black uppercase italic text-gray-500">Obrig. N1</th>
                    <th className="px-4 py-3 font-black uppercase italic text-gray-500">Obrig. N2</th>
                    <th className="px-4 py-3 font-black uppercase italic text-gray-500">Default</th>
                    <th className="px-4 py-3 font-black uppercase italic text-gray-500">Regra de preenchimento</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldConfigs.map((row, idx) => (
                    <tr key={row.field} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                      <td className="px-4 py-3 font-black text-bb-blue italic uppercase">{labelForField(row.field)}</td>
                      <td className="px-4 py-3">
                        <select
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold bg-white"
                          value={row.column}
                          onChange={(e) => {
                            const v = e.target.value;
                            setFieldConfigs((prev) => prev.map((r, i) => (i === idx ? { ...r, column: v } : r)));
                          }}
                        >
                          <option value="">(não mapear)</option>
                          {availableColumns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={row.requiredMin}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFieldConfigs((prev) => prev.map((r, i) => (i === idx ? { ...r, requiredMin: checked } : r)));
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={row.requiredImport}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFieldConfigs((prev) => prev.map((r, i) => (i === idx ? { ...r, requiredImport: checked } : r)));
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold"
                          value={row.defaultValue}
                          onChange={(e) => {
                            const v = e.target.value;
                            setFieldConfigs((prev) => prev.map((r, i) => (i === idx ? { ...r, defaultValue: v } : r)));
                          }}
                          placeholder='""'
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold"
                          value={row.fillRule}
                          onChange={(e) => {
                            const v = e.target.value;
                            setFieldConfigs((prev) => prev.map((r, i) => (i === idx ? { ...r, fillRule: v } : r)));
                          }}
                          placeholder="ex.: buscar relação no cadastro de fornecedores"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3 pt-4">
              <button
                type="button"
                onClick={() => setCurrentStep("UPLOAD")}
                className="px-5 py-3 rounded-2xl border border-gray-200 text-[11px] font-black uppercase italic hover:bg-gray-50 active:scale-95 transition-all"
              >
                Voltar
              </button>

              <button
                type="button"
                onClick={handleConfirmMapping}
                disabled={!mappingIsValid()}
                className="px-5 py-3 rounded-2xl bg-bb-blue text-white text-[11px] font-black uppercase italic shadow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100"
              >
                Atualizar preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: REVIEW */}
      {currentStep === "REVIEW" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 p-6 bg-white">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[12px] text-gray-500 font-bold uppercase italic tracking-widest">
                  Preview
                </div>
                <div className="text-2xl font-black text-bb-blue italic uppercase tracking-tight">
                  {title}
                </div>
                <div className="text-[11px] text-gray-500 font-bold mt-1">
                  Registros válidos serão gravados localmente.
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase italic">
                  <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">Total: {previewSummary.total}</span>
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">Válidos: {previewSummary.valid}</span>
                  <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700">Alertas: {previewSummary.withWarnings}</span>
                  <span className="px-3 py-1 rounded-full bg-red-50 text-red-700">Erros: {previewSummary.invalid}</span>
                  <span className="px-3 py-1 rounded-full bg-bb-blue/10 text-bb-blue">
                    Total válido: {currencyPrefix} {previewSummary.totalValue.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="text-[11px] font-bold text-gray-500">
                  Total: <span className="text-bb-blue font-black">{importResults.length}</span> • Válidos:{" "}
                  <span className="text-emerald-700 font-black">{importResults.filter((r) => r.isValid).length}</span> • Inválidos:{" "}
                  <span className="text-red-600 font-black">{importResults.filter((r) => !r.isValid).length}</span>
                </div>

                <button
                  type="button"
                  onClick={confirmSync}
 disabled={criticalPending || needsRebuild}
                  className="bg-bb-blue text-white font-black uppercase italic px-5 py-3 rounded-2xl shadow hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100"
                >
                  Sincronizar Local
                </button>
              </div>
            </div>
          </div>


          {(unresolved &&
            ((unresolved.categories?.length || 0) > 0 ||
              (unresolved.accounts?.length || 0) > 0 ||
              (unresolved.payments?.length || 0) > 0 ||
              (unresolved.suppliers?.length || 0) > 0)) && (
            <div className="rounded-2xl border border-gray-200 p-6 bg-white">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[12px] text-gray-500 font-bold uppercase italic tracking-widest">
                    Remapeamento rápido
                  </div>
                  <div className="text-[11px] text-gray-500 font-bold mt-1">
                    Mapeie valores do arquivo que não existem no cadastro (categorias/contas/fornecedores) e atualize o preview.
                    {importType === "RECIBOS" ? " (Em Recibos, fornecedor é obrigatório.)" : " (Em Lançamentos, fornecedor não é obrigatório.)"}
                  </div>
                  {needsRebuild && (
                    <div className="mt-2 text-[11px] font-black text-amber-700 uppercase italic">
                      Você alterou o remapeamento — clique em “Atualizar preview”.
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setValueRemap({ suppliers: {}, categories: {}, accounts: {}, payments: {} });
                      setNeedsRebuild(true);
                    }}
                    className="px-4 py-2 rounded-2xl border border-gray-200 bg-white text-[11px] font-black uppercase italic hover:scale-105 active:scale-95 transition-all"
                  >
                    Limpar
                  </button>

                  <button
                    type="button"
                    onClick={rebuildPreview}
                    className="px-4 py-2 rounded-2xl bg-bb-blue text-white text-[11px] font-black uppercase italic shadow hover:scale-105 active:scale-95 transition-all"
                  >
                    Atualizar preview
                  </button>
                </div>
              </div>

              <div className="mt-6 space-y-6">
                {(unresolved.payments?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-black uppercase italic text-bb-blue">Formas de pagamento não mapeadas</div>
                    <div className="space-y-2">
                      {unresolved.payments.map((rawFP) => {
                        const k = normalizeStr(rawFP);
                        return (
                          <div key={k} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                            <div className="text-[11px] font-bold text-gray-700 md:col-span-1 break-words">
                              {rawFP}
                            </div>
                            <div className="md:col-span-2">
                              <select
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold bg-white"
                                value={valueRemap.payments[k] || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setValueRemap((prev) => ({
                                    ...prev,
                                    payments: { ...prev.payments, [k]: v },
                                  }));
                                  setNeedsRebuild(true);
                                }}
                              >
                                <option value="">(Selecione a forma de pagamento destino)</option>
                                {formasPagamento.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.nome}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(unresolved.categories?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-black uppercase italic text-bb-blue">Categorias não mapeadas</div>
                    <div className="space-y-2">
                      {unresolved.categories.map((rawCat) => {
                        const k = normalizeStr(rawCat);
                        return (
                          <div key={k} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                            <div className="text-[11px] font-bold text-gray-700 md:col-span-1 break-words">
                              {rawCat}
                            </div>
                            <div className="md:col-span-2">
                              <select
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold bg-white"
                                value={valueRemap.categories[k] || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setValueRemap((prev) => ({
                                    ...prev,
                                    categories: { ...prev.categories, [k]: v },
                                  }));
                                  setNeedsRebuild(true);
                                }}
                              >
                                <option value="">(Selecione a categoria destino)</option>
                                {categorias.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nome}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(unresolved.accounts?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-black uppercase italic text-bb-blue">Contas/itens não mapeados</div>
                    <div className="space-y-2">
                      {unresolved.accounts.map(({ cat, item }) => {
                        const catKey = normalizeStr(cat);
                        const key = makeAccountKey(cat, item);
                        const targetCat =
                          categorias.find((c) => c.nome.toUpperCase() === String(cat || "").toUpperCase()) ||
                          (valueRemap.categories[catKey]
                            ? categorias.find((c) => c.id === valueRemap.categories[catKey])
                            : undefined);

                        const contas = targetCat?.contas || [];
                        const disabled = !targetCat;

                        return (
                          <div key={key} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                            <div className="text-[11px] font-bold text-gray-700 md:col-span-2 break-words">
                              <span className="font-black">{cat}</span> → {item}
                              {!targetCat && (
                                <span className="ml-2 text-[10px] font-black uppercase italic text-amber-700">
                                  (Mapeie a categoria primeiro)
                                </span>
                              )}
                            </div>
                            <div className="md:col-span-2">
                              <select
                                disabled={disabled}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold bg-white disabled:opacity-50"
                                value={valueRemap.accounts[key] || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setValueRemap((prev) => ({
                                    ...prev,
                                    accounts: { ...prev.accounts, [key]: v },
                                  }));
                                  setNeedsRebuild(true);
                                }}
                              >
                                <option value="">{disabled ? "(Mapeie a categoria para escolher a conta)" : "(Selecione a conta destino)"}</option>
                                {contas.map((it) => (
                                  <option key={it.id} value={it.id}>
                                    {it.nome}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(unresolved.suppliers?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-black uppercase italic text-bb-blue">Fornecedores não mapeados</div>
                    <div className="space-y-2">
                      {unresolved.suppliers.map((rawSup) => {
                        const k = normalizeStr(rawSup);
                        return (
                          <div key={k} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                            <div className="text-[11px] font-bold text-gray-700 md:col-span-1 break-words">
                              {rawSup}
                            </div>
                            <div className="md:col-span-2">
                              <select
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold bg-white"
                                value={valueRemap.suppliers[k] || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setValueRemap((prev) => ({
                                    ...prev,
                                    suppliers: { ...prev.suppliers, [k]: v },
                                  }));
                                  setNeedsRebuild(true);
                                }}
                              >
                                <option value="">(Selecione o fornecedor destino)</option>
                                {fornecedores.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.nome} ({f.pais})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}


          <div className="overflow-x-auto max-h-[520px] border border-gray-100 rounded-2xl">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-gray-50 text-bb-blue font-black uppercase italic sticky top-0 z-10 border-b">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {importResults.slice(0, 200).map((res) => (
                  <tr key={res.id} className="hover:bg-gray-50/40">
                    <td className="px-4 py-3">
                      {res.isValid ? (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600 font-black italic uppercase text-[9px]">OK</span>
                          {typeof (res as any).displayInfo?.paidVisual === "boolean" && (
                            <span
                              title={(res as any).displayInfo.paidVisual ? "Pago" : "Não pago"}
                              className={(res as any).displayInfo.paidVisual ? "text-emerald-600" : "text-gray-400"}
                            >
                              ●
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-red-500 font-black italic uppercase text-[9px]">ERRO</span>
                      )}
                      {!res.isValid && res.errors.length > 0 && (
                        <div className="text-[9px] text-red-600 font-bold mt-1">{res.errors[0]}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold italic">
                      {res.displayInfo.data.split("-").reverse().join("/")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-black block uppercase italic leading-none text-[11px]">
                        {res.displayInfo.identificador}
                      </div>
                      {res.displayInfo.detalhe && (
                        <div className="text-[9px] font-bold text-gray-500 uppercase italic leading-none mt-1">
                          {res.displayInfo.detalhe}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-black uppercase text-gray-700 italic block">
                        {res.displayInfo.categoria || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-bb-blue text-[11px] italic">
                      {currencyPrefix} {Number(res.displayInfo.valor || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importResults.length > 200 && (
            <div className="text-[11px] text-gray-500 font-bold">
              Mostrando apenas as primeiras 200 linhas no preview (performance). A gravação considera todos os válidos.
            </div>
          )}
        </div>
      )}

      {/* Debug small badge (safe) */}
      {mappingUsedState && (
        <div className="text-[10px] text-gray-400 font-bold uppercase italic tracking-widest opacity-70">
          Mapping: {mappingUsedState.autoDetected ? "auto" : "manual"} • colunas:{" "}
          {Object.keys(mappingUsedState.columns || {}).length}
        </div>
      )}
    </div>
  );
};

export default ImportSection;
