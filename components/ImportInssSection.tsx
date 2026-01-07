import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

import type { InssRecord, InssYearlyConfig, StatusTransacao } from "../types";

type Props = {
  inssRecords: InssRecord[];
  inssConfigs: InssYearlyConfig[];
  onImportInssRecords: (records: InssRecord[]) => void | Promise<void>;
};

function normalizeKey(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function parseMoney(v: any): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const only = s.replace(/\s/g, "").replace(/[^0-9,.\-]/g, "");
  const cleaned = only.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function convertToISODate(val: any): string {
  if (!val) return "";
  if (val instanceof Date && !Number.isNaN(val.getTime()))
    return val.toISOString().split("T")[0];

  // Excel serial date
  if (typeof val === "number") {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split("T")[0];
  }

  const s = String(val).trim();
  const parts = s.split(/[\/\-\.]/).filter(Boolean);

  // YYYY-MM (competência)
  if (parts.length === 2 && parts[0].length === 4)
    return `${parts[0]}-${String(parts[1]).padStart(2, "0")}`;

  // MM/YYYY
  if (parts.length === 2 && parts[1].length === 4)
    return `${parts[1]}-${String(parts[0]).padStart(2, "0")}`;

  // YYYY-MM-DD ou DD/MM/YYYY
  if (parts.length === 3) {
    if (parts[0].length === 4)
      return `${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(
        parts[2]
      ).padStart(2, "0")}`;
    return `${parts[2]}-${String(parts[1]).padStart(2, "0")}-${String(
      parts[0]
    ).padStart(2, "0")}`;
  }

  return "";
}

function toYYYYMM(val: any): string {
  const iso = convertToISODate(val);
  if (!iso) return "";
  if (iso.length === 7) return iso;
  if (iso.length >= 10) return iso.slice(0, 7);
  return "";
}

function parseQuem(v: any): "Paulo" | "Débora" | "" {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = normalizeKey(s);
  if (n.includes("deb")) return "Débora";
  if (n.includes("paul")) return "Paulo";
  // tenta match exato
  if (s === "Paulo" || s === "Débora") return s;
  return "";
}

function parseStatusCell(v: any): 0 | 1 | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (n === 0 || n === 1) return n as 0 | 1;
  const k = normalizeKey(s);
  if (k.includes("pago")) return 1;
  if (k.includes("aberto") || k.includes("pendente")) return 0;
  return null;
}

function calcStatus(status01: 0 | 1 | null, vencIso: string): StatusTransacao {
  if (status01 === 1) return "PAGO";
  const todayIso = new Date().toISOString().slice(0, 10);
  if (vencIso && vencIso <= todayIso) return "ATRASADO";
  return "PLANEJADO";
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default function ImportInssSection({
  inssRecords,
  inssConfigs,
  onImportInssRecords,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<any[][]>([]);
  const [skipExisting, setSkipExisting] = useState<boolean>(true);

  const existingIds = useMemo(
    () => new Set((inssRecords || []).map((r) => r.id).filter(Boolean)),
    [inssRecords]
  );

  const parsed = useMemo(() => {
    if (!rows || rows.length === 0)
      return {
        valid: [] as InssRecord[],
        invalid: [] as { idx: number; reason: string }[],
      };

    let startIdx = 0;
    const h = (rows[0] || []).map((c: any) => normalizeKey(c));
    const looksHeader =
      h.includes("parcela") ||
      h.includes("numero_da_parcela") ||
      h.includes("quem") ||
      h.includes("competencia") ||
      h.includes("vencimento") ||
      h.includes("status");
    if (looksHeader) startIdx = 1;

    const valid: InssRecord[] = [];
    const invalid: { idx: number; reason: string }[] = [];

    for (let i = startIdx; i < rows.length; i++) {
      const r = rows[i] || [];
      const parcela = Number(String(r[0] ?? "").trim());
      const quem = parseQuem(r[1]);
      const comp = toYYYYMM(r[2]);
      const vencIso = convertToISODate(r[3]);
      const valPlan = parseMoney(r[4]);
      const status01 = parseStatusCell(r[5]);

      if (!Number.isFinite(parcela) || parcela <= 0) {
        invalid.push({ idx: i + 1, reason: "Parcela inválida" });
        continue;
      }
      if (!quem) {
        invalid.push({ idx: i + 1, reason: "Quem inválido (use Paulo/Débora)" });
        continue;
      }
      if (!comp) {
        invalid.push({ idx: i + 1, reason: "Competência inválida" });
        continue;
      }
      if (!vencIso || vencIso.length < 10) {
        invalid.push({ idx: i + 1, reason: "Vencimento inválido" });
        continue;
      }

      const ano = Number(comp.slice(0, 4));
      const cfg = (inssConfigs || []).find((c) => Number(c?.ano) === ano);
      const salario_base = Number(cfg?.salario_base ?? 0);
      const perc = Number(cfg?.percentual_inss ?? 0);
      const computed =
        salario_base > 0 && perc > 0 ? round2(salario_base * (perc / 100)) : 0;

      const valorFinal = valPlan > 0 ? round2(valPlan) : computed;

      const status = calcStatus(status01, vencIso);

      const id = `inss_${normalizeKey(quem)}_${comp}_${parcela}`;

      if (skipExisting && existingIds.has(id)) continue;

      valid.push({
        id,
        numero_parcela: parcela,
        quem,
        competencia: comp,
        vencimento: vencIso,
        status,
        valor: Number(valorFinal || 0),
        salario_base: Number(salario_base || 0),
        lancar_no_ledger: false,
      });
    }

    return { valid, invalid };
  }, [rows, inssConfigs, skipExisting, existingIds]);

  const handlePick = () => fileRef.current?.click();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const wb = XLSX.read(data, { type: "array" });
        const norm = (s: string) => normalizeKey(s);
        const sheetName =
          wb.SheetNames.find((n) => norm(n).includes("inss")) ||
          wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: true,
          defval: "",
        }) as any[][];
        setRows(aoa || []);
      } catch {
        alert("Falha ao ler o XLSX do INSS.");
      }
    };
    reader.readAsArrayBuffer(f);
  };

  const doImport = async () => {
    if (parsed.valid.length === 0) return alert("Nada para importar.");
    await onImportInssRecords(parsed.valid);
    alert(`Importado (staging): ${parsed.valid.length} registros.`);
    setRows([]);
    setFileName("");
  };

  return (
    <div className="bg-white rounded-[1.5rem] border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-black italic text-bb-blue uppercase tracking-widest">
            Importar INSS Brasil (staging)
          </div>
          <div className="text-xs text-gray-500 font-bold mt-1">
            Layout A–F: parcela, quem, competência, vencimento, valor, status (0/1).{" "}
            Se valor vier vazio/0, usa cálculo do ano (Configurações → INSS).
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-bold hover:border-bb-blue"
            onClick={handlePick}
          >
            Selecionar XLSX
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-gray-600">
        <div>
          Arquivo: <span className="text-gray-800">{fileName || "—"}</span>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={skipExisting}
            onChange={(e) => setSkipExisting(e.target.checked)}
          />
          Pular existentes (mesmo ID)
        </label>
        <div>
          Válidos: <span className="text-gray-800">{parsed.valid.length}</span> |{" "}
          Inválidos: <span className="text-gray-800">{parsed.invalid.length}</span>
        </div>
      </div>

      {parsed.invalid.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-black uppercase italic tracking-widest">
            Linhas inválidas (primeiras 10)
          </div>
          <ul className="list-disc pl-5 mt-2">
            {parsed.invalid.slice(0, 10).map((x) => (
              <li key={`${x.idx}-${x.reason}`}>
                Linha {x.idx}: {x.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.valid.length > 0 && (
        <div className="mt-3 overflow-auto rounded-xl border border-gray-100">
          <table className="min-w-[980px] w-full text-[11px]">
            <thead className="bg-gray-50 uppercase font-black italic text-bb-blue border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Parcela</th>
                <th className="px-4 py-3 text-left">Quem</th>
                <th className="px-4 py-3 text-left">Competência</th>
                <th className="px-4 py-3 text-left">Vencimento</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {parsed.valid.slice(0, 50).map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-[10px]">{r.id}</td>
                  <td className="px-4 py-2">{r.numero_parcela}</td>
                  <td className="px-4 py-2">{r.quem}</td>
                  <td className="px-4 py-2">{r.competencia}</td>
                  <td className="px-4 py-2">{r.vencimento}</td>
                  <td className="px-4 py-2 text-right">
                    {Number(r.valor || 0).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {parsed.valid.length > 50 && (
            <div className="px-4 py-2 text-[10px] text-gray-500 font-bold">
              Mostrando 50 de {parsed.valid.length}.
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          className="px-6 py-3 bg-gray-900 text-white rounded-[1.25rem] font-black italic uppercase tracking-wider disabled:opacity-50"
          disabled={parsed.valid.length === 0}
          onClick={doImport}
        >
          Importar para INSS (staging)
        </button>
      </div>
    </div>
  );
}
