export type CsvPrimitive = string | number | boolean | null | undefined;

function normalizeLineBreaks(s: string) {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function escapeCsvValue(value: CsvPrimitive, delimiter: string) {
  if (value === null || value === undefined) return "";
  const str = normalizeLineBreaks(String(value));
  const mustQuote =
    str.includes(delimiter) || str.includes("\n") || str.includes('"');
  if (!mustQuote) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Converte um array de objetos (linhas) em CSV com cabeçalho explícito.
 * - delimiter padrão ';'
 * - inclui BOM no download (ver downloadCsv) para Excel abrir UTF-8 corretamente.
 */
export function toCsv(rows: Record<string, CsvPrimitive>[], delimiter: string = ";") {
  if (!rows || rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);

  const headerLine = headers.map((h) => escapeCsvValue(h, delimiter)).join(delimiter);
  const dataLines = rows.map((r) =>
    headers.map((h) => escapeCsvValue(r[h], delimiter)).join(delimiter)
  );

  return [headerLine, ...dataLines].join("\n");
}

/** Download de CSV (com BOM UTF-8) no browser. */
export function downloadCsv(filename: string, csvText: string) {
  const bom = "\ufeff";
  const blob = new Blob([bom + csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

/** Retorna Date se ISO YYYY-MM-DD for válido; senão null. */
export function safeISODate(iso: string): Date | null {
  if (!iso) return null;
  // aceita YYYY-MM ou YYYY-MM-DD
  const m = iso.match(/^\d{4}-\d{2}(-\d{2})?$/);
  if (!m) return null;

  const parts = iso.split("-");
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = parts.length >= 3 ? Number(parts[2]) : 1;

  if (!y || !mo || mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;

  const dt = new Date(Date.UTC(y, mo - 1, d));
  // valida se não houve overflow (ex.: 2026-02-31)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** Converte YYYY-MM-DD (ou YYYY-MM) para DD/MM/YYYY (ou MM/YYYY quando dia ausente). */
export function formatDateISOToDMY(iso?: string) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length < 2) return iso;

  const y = parts[0];
  const m = parts[1];

  if (parts.length === 2) {
    return `${m}/${y}`;
  }

  const d = parts[2];
  return `${d}/${m}/${y}`;
}

/** Formata número para Excel pt-PT/pt-BR: vírgula decimal. */
export function formatNumberExcel(n: number, decimals: number = 2) {
  if (typeof n !== "number" || Number.isNaN(n)) return "";
  const fixed = n.toFixed(decimals);
  return fixed.replace(".", ",");
}

export function formatMoneyExcel(n: number) {
  return formatNumberExcel(n, 2);
}

export function formatYesNo(v: boolean) {
  return v ? "SIM" : "NAO";
}
