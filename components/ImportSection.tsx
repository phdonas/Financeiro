import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

import { TipoTransacao } from "../types";
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
  onSaveTx: (t: Transacao) => void;
  onSaveReceipt: (r: Receipt) => void;

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
  displayInfo: {
    data: string;
    identificador: string;
    categoria?: string;
    valor: number;
    detalhe?: string;
  };
}

type MappingField =
  | "date"
  | "tipo"
  | "banco"
  | "categoria"
  | "item"
  | "descricao"
  | "valor"
  | "pago"
  | "id"
  | "fornecedor"
  | "base"
  | "irs_rate"
  | "iva_rate";

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
  // remove espaços e milhares comuns
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // remove pontos de milhar
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
  if (typeof val === "number") {
    // Excel serial date
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  const parts = s.split(/[/-]/);
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
    return ["date", "id", "fornecedor", "categoria", "item", "base", "pago"];
  }
  return ["date", "tipo", "banco", "categoria", "item", "descricao", "valor", "pago"];
}

function optionalFieldsFor(type: ImportTypeLocal): MappingField[] {
  if (type === "RECIBOS") return ["descricao", "irs_rate", "iva_rate"];
  return [];
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
    case "irs_rate":
      return "IRS % (opcional)";
    case "iva_rate":
      return "IVA % (opcional)";
    default:
      return f;
  }
}

function synonymMapFor(type: ImportTypeLocal): Record<MappingField, string[]> {
  if (type === "RECIBOS") {
    return {
      date: ["issue_date", "data_emissao", "data emissao", "data", "emissao"],
      id: ["id", "numero", "número", "recibo", "receipt"],
      fornecedor: ["fornecedor", "supplier", "emitente"],
      categoria: ["categoria", "categoria_contabil", "categoria contabil"],
      item: ["conta_contabil", "conta contabil", "conta", "item", "subcategoria"],
      descricao: ["description", "descricao", "descrição", "observacao", "observação"],
      base: ["base_amount", "base", "valor_base", "valor base", "valor"],
      irs_rate: ["irs_rate", "irs%", "irs_percent", "irs percent"],
      iva_rate: ["iva_rate", "iva%", "iva_percent", "iva percent"],
      pago: ["is_paid", "pago", "status", "paid"],
      // unused in RECIBOS:
      tipo: ["tipo"],
      banco: ["banco"],
      valor: ["valor"],
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
    irs_rate: ["irs_rate"],
    iva_rate: ["iva_rate"],
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
          date: "A",
          id: "B",
          fornecedor: "C",
          categoria: "D",
          item: "E",
          descricao: "F",
          base: "G",
          irs_rate: "H",
          iva_rate: "I",
          pago: "J",
        },
      };
    }
    // Lançamentos
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
        pago: "H",
      },
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

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setStructureMode("LETTERS");
    setDataStartIndex(3);
  }

  function getCell(row: any[], field: MappingField, mappingColumns: Record<string, string>): any {
    const colId = mappingColumns[field];
    if (!colId) return "";
    const idx = colIndexById[colId];
    if (typeof idx !== "number") return "";
    return row[idx];
  }

  function parseWithMapping(rows: any[][], mapping: ImportMappingUsed) {
    const mappingCols = mapping.columns as Record<string, string>;

    const dataRows = rows.slice(dataStartIndex);
    const results: ParsedRow[] = dataRows
      .map((row) => {
        if (!Array.isArray(row)) return null;

        const dateVal = getCell(row, "date", mappingCols);
        if (!dateVal || String(dateVal).trim() === "") return null;

        const errors: string[] = [];
        const isoDate = convertToISODate(dateVal);
        if (!isoDate) errors.push("Data inválida");

        if (importType === "RECIBOS") {
          const rId = String(getCell(row, "id", mappingCols) || "").trim();
          const supName = String(getCell(row, "fornecedor", mappingCols) || "").trim();
          const catName = String(getCell(row, "categoria", mappingCols) || "").trim();
          const itemName = String(getCell(row, "item", mappingCols) || "").trim();
          const desc = String(getCell(row, "descricao", mappingCols) || "").trim();

          const baseVal = parseMoney(getCell(row, "base", mappingCols));
          const irsP = parseMoney(getCell(row, "irs_rate", mappingCols)) || DEFAULT_RATES.irs;
          const ivaP = parseMoney(getCell(row, "iva_rate", mappingCols)) || DEFAULT_RATES.iva;

          if (!rId) errors.push("ID do recibo vazio");
          if (!supName) errors.push("Fornecedor vazio");
          if (!catName) errors.push("Categoria vazia");
          if (!itemName) errors.push("Conta/Item vazio");
          if (!(baseVal > 0)) errors.push("Valor base inválido");

          const foundSup = fornecedores.find((s) => s.nome.toUpperCase() === supName.toUpperCase());
          const foundCat = categorias.find((c) => c.nome.toUpperCase() === catName.toUpperCase());
          const foundItem = foundCat?.contas.find((i) => i.nome.toUpperCase() === itemName.toUpperCase());

          if (!foundSup) errors.push(`Fornecedor '${supName}' não mapeado`);
          if (!foundCat) errors.push(`Cat '${catName}' não mapeada`);
          if (foundCat && !foundItem) errors.push(`Conta '${itemName}' não mapeada`);

          const isPaid = isTruthyPaid(getCell(row, "pago", mappingCols));

          const irsA = (baseVal * irsP) / 100;
          const ivaA = (baseVal * ivaP) / 100;

          const receipt: Partial<Receipt> = {
            internal_id: Math.random().toString(36).substr(2, 9),
            id: rId,
            issue_date: isoDate,
            country_code: "PT",
            fornecedor_id: foundSup?.id || "",
            categoria_id: foundCat?.id || "",
            conta_contabil_id: foundItem?.id || "",
            description: desc || itemName || "Recibo importado",
            base_amount: baseVal,
            irs_rate: irsP,
            iva_rate: ivaP,
            irs_amount: irsA,
            iva_amount: ivaA,
            net_amount: baseVal - irsA,
            received_amount: baseVal - irsA + ivaA,
            is_paid: isPaid,
            forma_pagamento_id: "",
            flag_calcula_premiacao: false,
            workspace_id: "fam_01",
          };

          return {
            id: receipt.internal_id!,
            data: receipt,
            isValid: errors.length === 0,
            errors,
            displayInfo: {
              data: isoDate,
              identificador: `REC #${rId}`,
              categoria: catName,
              valor: receipt.received_amount || 0,
              detalhe: supName,
            },
          };
        }

        // Lançamentos
        const country = importType === "LANCAMENTOS_BR" ? "BR" : "PT";
        const tipoStr = String(getCell(row, "tipo", mappingCols) || "").toUpperCase();
        const banco = String(getCell(row, "banco", mappingCols) || "").trim();
        const catName = String(getCell(row, "categoria", mappingCols) || "").trim();
        const itemName = String(getCell(row, "item", mappingCols) || "").trim();
        const desc = String(getCell(row, "descricao", mappingCols) || "").trim();
        const val = parseMoney(getCell(row, "valor", mappingCols));

        if (!banco) errors.push("Banco/forma pagamento vazio");
        if (!catName) errors.push("Categoria vazia");
        if (!itemName) errors.push("Conta/Item vazio");
        if (!(val !== 0)) errors.push("Valor inválido");

        const foundFP = formasPagamento.find((f) => f.nome.toUpperCase() === banco.toUpperCase());
        const foundCat = categorias.find((c) => c.nome.toUpperCase() === catName.toUpperCase());
        const foundItem = foundCat?.contas.find((i) => i.nome.toUpperCase() === itemName.toUpperCase());

        if (!foundCat) errors.push(`Cat '${catName}' não mapeada`);
        if (foundCat && !foundItem) errors.push(`Conta '${itemName}' não mapeada`);

        const isPaid = isTruthyPaid(getCell(row, "pago", mappingCols));
        const status: StatusTransacao = isPaid ? "PAGO" : "PENDENTE";
        const tipo = tipoStr.includes("RECEITA") ? (TipoTransacao as any).RECEITA : (TipoTransacao as any).DESPESA;

        const tx: Partial<Transacao> = {
          id: Math.random().toString(36).substr(2, 9),
          codigo_pais: country,
          tipo,
          data_competencia: isoDate,
          data_prevista_pagamento: isoDate,
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
          displayInfo: {
            data: isoDate,
            identificador: tx.description || "",
            categoria: catName,
            valor: val,
            detalhe: banco,
          },
        };
      })
      .filter(Boolean) as ParsedRow[];

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
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" }) as any[][];
        setRawRows(rows);

        const structure = buildStructureFromRows(rows);
        setStructureMode(structure.mode);
        setDataStartIndex(structure.dataStartIndex);
        setAvailableColumns(structure.columns);
        setColIndexById(structure.colIndexById);

        // Auto-detect mapping
        const auto = detectAutoMapping(importType, structure.mode, structure.columns);
        if (auto) {
          setMappingUsedState(auto);
          onMappingUsed?.(auto);
          parseWithMapping(rows, auto);
          return;
        }

        // Se não conseguiu auto-mapear, vai para modo de mapeamento (De-Para)
        const required = requiredFieldsFor(importType);
        const syn = synonymMapFor(importType);

        const draft: Record<string, string> = {};
        // tentativa de pré-preenchimento (match parcial)
        const colsNorm = structure.columns.map((c) => normalizeStr(c));
        required.forEach((field) => {
          const candidates = (syn[field] || []).map(normalizeStr).filter(Boolean);
          if (candidates.length === 0) return;
          const idx = colsNorm.findIndex((h) => candidates.some((c) => h.includes(c)));
          if (idx >= 0) draft[field] = structure.columns[idx];
        });

        optionalFieldsFor(importType).forEach((field) => {
          const candidates = (syn[field] || []).map(normalizeStr).filter(Boolean);
          if (candidates.length === 0) return;
          const idx = colsNorm.findIndex((h) => candidates.some((c) => h.includes(c)));
          if (idx >= 0) draft[field] = structure.columns[idx];
        });

        setMappingDraft(draft);
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
    const required = requiredFieldsFor(importType);
    // todos os obrigatórios selecionados e não duplicados
    const selected = required.map((f) => mappingDraft[f]).filter(Boolean);
    if (selected.length !== required.length) return false;
    const unique = new Set(selected);
    if (unique.size !== selected.length) return false;
    return true;
  }

  function handleConfirmMapping() {
    if (!importType || !rawRows) return;
    if (!mappingIsValid()) return alert("Mapeie todos os campos obrigatórios (sem duplicar colunas).");

    const mapping: ImportMappingUsed = {
      autoDetected: false,
      columns: { ...mappingDraft },
    };

    setMappingUsedState(mapping);
    onMappingUsed?.(mapping);

    parseWithMapping(rawRows, mapping);
  }

  function confirmSync() {
    const validOnes = importResults.filter((r) => r.isValid);
    if (validOnes.length === 0) return alert("Dados inválidos.");

    validOnes.forEach((res) => {
      if (importType === "RECIBOS") {
        const r = res.data as Receipt;
        onSaveReceipt(r);
        // mantém a regra existente: recibo cria uma transação de receita vinculada
        onSaveTx({
          id: `TX_${r.internal_id}`,
          workspace_id: "fam_01",
          codigo_pais: r.country_code,
          categoria_id: r.categoria_id,
          conta_contabil_id: r.conta_contabil_id,
          forma_pagamento_id: (r as any).forma_pagamento_id,
          tipo: (TipoTransacao as any).RECEITA,
          data_competencia: r.issue_date,
          data_prevista_pagamento: r.issue_date,
          description: `${r.description} (#${r.id})`,
          valor: r.received_amount,
          status: r.is_paid ? "PAGO" : "PENDENTE",
          origem: "IMPORTACAO",
          receipt_id: r.internal_id,
        } as any);
      } else {
        const t = res.data as Transacao;
        onSaveTx(t);
      }
    });

    alert(`Sincronizado: ${validOnes.length} registros.`);
    resetAll();
  }

  const title = useMemo(() => {
    if (importType === "RECIBOS") return "Recibos";
    if (importType === "LANCAMENTOS_BR") return "Lançamentos BR";
    if (importType === "LANCAMENTOS_PT") return "Lançamentos PT";
    return "Importação";
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
              Mapeamento (De-Para)
            </div>
            <div className="text-[11px] text-amber-900 font-bold mt-2">
              Não foi possível reconhecer o layout automaticamente. Selecione quais colunas do arquivo representam os campos obrigatórios.
            </div>
            <div className="text-[11px] text-amber-900 font-bold mt-1">
              Regra: campos obrigatórios precisam estar todos preenchidos e sem duplicar a mesma coluna.
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-6 bg-white space-y-4">
            <div className="text-[12px] text-gray-500 font-bold uppercase italic tracking-widest">
              Campos obrigatórios
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {requiredFields.map((f) => (
                <label key={f} className="space-y-1">
                  <div className="text-[11px] font-black text-bb-blue italic uppercase">{labelForField(f)}</div>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold bg-white"
                    value={mappingDraft[f] || ""}
                    onChange={(e) => setMappingDraft((prev) => ({ ...prev, [f]: e.target.value }))}
                  >
                    <option value="">Selecione...</option>
                    {availableColumns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {optionalFields.length > 0 && (
              <>
                <div className="pt-2 text-[12px] text-gray-500 font-bold uppercase italic tracking-widest">
                  Campos opcionais
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {optionalFields.map((f) => (
                    <label key={f} className="space-y-1">
                      <div className="text-[11px] font-black text-bb-blue italic uppercase">{labelForField(f)}</div>
                      <select
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold bg-white"
                        value={mappingDraft[f] || ""}
                        onChange={(e) => setMappingDraft((prev) => ({ ...prev, [f]: e.target.value }))}
                      >
                        <option value="">(Opcional)</option>
                        {availableColumns.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </>
            )}

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
                Continuar para preview
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
                  Registros válidos serão gravados localmente. (Logs e dedupe serão implementados no Sprint 5.5)
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
                  className="bg-bb-blue text-white font-black uppercase italic px-5 py-3 rounded-2xl shadow hover:scale-105 active:scale-95 transition-all"
                >
                  Sincronizar Local
                </button>
              </div>
            </div>
          </div>

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
                        <span className="text-emerald-600 font-black italic uppercase text-[9px]">OK</span>
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
                      {Number(res.displayInfo.valor || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
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
