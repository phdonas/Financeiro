import React, { useMemo, useState } from "react";

type ExchangeRates = Record<string, number>;

type ViewMode = "PT" | "BR" | "GLOBAL";

type ContaItem = {
  id: string;
  nome: string;
};

type Categoria = {
  id: string;
  nome: string;
  tipo?: string;
  contas?: ContaItem[];
};

type Orcamento = {
  id: string;
  categoria_id: string;
  ano: number;
  mes: number;
  valor_meta: number;
  codigo_pais: "PT" | "BR";
};

type Transacao = {
  id: string;
  tipo?: string;
  valor?: number;
  codigo_pais?: "PT" | "BR";
  categoria_id?: string;
  conta_contabil_id?: string;
  data_competencia?: string;
  date?: string;
  data_prevista_pagamento?: string;
  status?: string;
};

type Props = {
  viewMode?: ViewMode;
  transacoes?: Transacao[];
  categorias?: Categoria[];
  orcamentos?: Orcamento[];
  exchangeRates?: ExchangeRates;
  // compat (não usado aqui, mas App passa)
  investments?: any[];
  storageMode?: any;
  setStorageMode?: any;
};

type MonthKey = `${number}-${string}`; // YYYY-MM

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseISODateLike(s?: string): Date | null {
  if (!s) return null;
  const raw = String(s).trim();
  if (!raw) return null;

  // Remove time portion if present
  const cleaned = raw.split("T")[0].split(" ")[0].trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const d = new Date(cleaned + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(cleaned)) {
    const [y, m, d] = cleaned.split("/").map((x) => parseInt(x, 10));
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
    const [d, m, y] = cleaned.split("/").map((x) => parseInt(x, 10));
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(cleaned)) {
    const [d, m, y] = cleaned.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // Fallback to Date parsing
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}


function monthKeyFromDate(d: Date): MonthKey {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${pad2(m)}` as MonthKey;
}

function formatISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function startOfMonthISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function endOfMonthISO(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return formatISODateLocal(last);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}


function monthKeyFromYM(ano: number, mes: number): MonthKey {
  return `${ano}-${pad2(mes)}` as MonthKey;
}

function monthRange(start: MonthKey, end: MonthKey): MonthKey[] {
  const [sy, sm] = start.split("-").map((x) => Number(x));
  const [ey, em] = end.split("-").map((x) => Number(x));
  if (!sy || !sm || !ey || !em) return [];
  const out: MonthKey[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(monthKeyFromYM(y, m));
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
    if (out.length > 240) break; // proteção
  }
  return out;
}

function addMonthsToKey(base: MonthKey, add: number): MonthKey {
  const [y0, m0] = base.split("-").map((x) => Number(x));
  let y = y0;
  let m = m0 + add;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  return monthKeyFromYM(y, m);
}

function firstDayOfMonthKey(mk: MonthKey): Date {
  const [y, m] = mk.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, 1, 0, 0, 0, 0);
}


function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtMoney(v: number, mode: ViewMode) {
  const abs = Number.isFinite(v) ? v : 0;
  const locale = mode === "BR" ? "pt-BR" : "pt-PT";
  const currency = mode === "BR" ? "BRL" : "EUR";
  try {
    // GLOBAL → EUR
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: mode === "GLOBAL" ? "EUR" : currency,
      maximumFractionDigits: 2,
    }).format(abs);
  } catch {
    return abs.toFixed(2);
  }
}

function safeNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export default function Dashboard({
  viewMode = "GLOBAL",
  transacoes,
  categorias,
  orcamentos,
  exchangeRates,
}: Props) {
  const txs = useMemo(() => (Array.isArray(transacoes) ? transacoes : []), [transacoes]);
  const cats = useMemo(() => (Array.isArray(categorias) ? categorias : []), [categorias]);
  const budgets = useMemo(() => (Array.isArray(orcamentos) ? orcamentos : []), [orcamentos]);
  const rates = exchangeRates || {};

  const catById = useMemo(() => {
    const m = new Map<string, Categoria>();
    for (const c of cats) m.set(String(c?.id ?? ""), c);
    return m;
  }, [cats]);

  const contasByCat = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const c of cats) {
      const inner = new Map<string, string>();
      for (const it of Array.isArray(c?.contas) ? c.contas : []) {
        inner.set(String(it.id), String(it.nome));
      }
      m.set(String(c?.id ?? ""), inner);
    }
    return m;
  }, [cats]);

  const allMonthKeys = useMemo(() => {
    const set = new Set<string>();
    for (const t of txs) {
      const d =
        parseISODateLike(t?.data_competencia) ||
        parseISODateLike(t?.date) ||
        parseISODateLike(t?.data_prevista_pagamento);
      if (d) set.add(monthKeyFromDate(d));
    }
    for (const b of budgets) {
      const y = safeNum(b?.ano);
      const m = safeNum(b?.mes);
      if (y >= 2000 && m >= 1 && m <= 12) set.add(monthKeyFromYM(y, m));
    }
    const arr = Array.from(set);
    arr.sort();
    return arr as MonthKey[];
  }, [txs, budgets]);

    type PeriodPreset = "30D" | "90D" | "YTD" | "12M" | "CUSTOM";

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("CUSTOM");
  const [customStart, setCustomStart] = useState<string>(() => startOfMonthISO(new Date()));
  const [customEnd, setCustomEnd] = useState<string>(() => endOfMonthISO(new Date()));
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [projectionMonthsCount, setProjectionMonthsCount] = useState<number>(6);

  const resolvedPeriod = useMemo(() => {
    const now = new Date();

    let startISO = customStart;
    let endISO = customEnd;

    if (periodPreset === "30D") {
      startISO = formatISODateLocal(addDays(now, -29));
      endISO = formatISODateLocal(now);
    } else if (periodPreset === "90D") {
      startISO = formatISODateLocal(addDays(now, -89));
      endISO = formatISODateLocal(now);
    } else if (periodPreset === "YTD") {
      startISO = `${now.getFullYear()}-01-01`;
      endISO = formatISODateLocal(now);
    } else if (periodPreset === "12M") {
      const start = addMonths(now, -11);
      startISO = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-01`;
      endISO = formatISODateLocal(now);
    }

    // Normalize order
    if (startISO > endISO) {
      const tmp = startISO;
      startISO = endISO;
      endISO = tmp;
    }

    const startDate = parseISODateLike(startISO) ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = parseISODateLike(endISO) ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Inclusive range
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const startMonth = monthKeyFromDate(startDate);
    const endMonth = monthKeyFromDate(endDate);

    return { startISO, endISO, startDate, endDate, startMonth, endMonth };
  }, [periodPreset, customStart, customEnd]);

  const monthsInPeriod = useMemo(() => {
    return monthRange(resolvedPeriod.startMonth, resolvedPeriod.endMonth);
  }, [resolvedPeriod.startMonth, resolvedPeriod.endMonth]);

  const periodLabel = useMemo(() => {
    // Display as YYYY-MM when the range is exactly the current month, otherwise show dates.
    if (
      resolvedPeriod.startISO.endsWith("-01") &&
      resolvedPeriod.endISO === endOfMonthISO(parseISODateLike(resolvedPeriod.startISO) ?? new Date())
    ) {
      return monthKeyFromDate(parseISODateLike(resolvedPeriod.startISO) ?? new Date());
    }
    return `${resolvedPeriod.startISO} → ${resolvedPeriod.endISO}`;
  }, [resolvedPeriod.startISO, resolvedPeriod.endISO]);

const modeLabel = useMemo(() => {
    if (viewMode === "PT") return "🇵🇹 PT";
    if (viewMode === "BR") return "🇧🇷 BR";
    return "🌐 Consolidado";
  }, [viewMode]);

  const getConverted = (valor: any, codigo_pais?: "PT" | "BR") => {
    const v = safeNum(valor);
    if (viewMode !== "GLOBAL") return v;
    const cc = codigo_pais || "PT";
    const r = safeNum((rates as any)[cc]);
    if (!r) return v;
    return v * r;
  };

  const filteredTxs = useMemo(() => {
    const startTs = resolvedPeriod.startDate.getTime();
    const endTs = resolvedPeriod.endDate.getTime();

    return txs.filter((t) => {
      if (viewMode !== "GLOBAL") {
        if ((t?.codigo_pais || "PT") !== viewMode) return false;
      }
      const d =
        parseISODateLike(t?.data_competencia) ||
        parseISODateLike(t?.date) ||
        parseISODateLike(t?.data_prevista_pagamento);
      if (!d) return false;
      const ts = d.getTime();
      return ts >= startTs && ts <= endTs;
    });
  }, [txs, viewMode, resolvedPeriod.startISO, resolvedPeriod.endISO]);

  const filteredBudgets = useMemo(() => {
    const periodSet = new Set(monthsInPeriod);
    return budgets.filter((b) => {
      const mk = monthKeyFromYM(safeNum(b?.ano), safeNum(b?.mes));
      if (!periodSet.has(mk)) return false;
      if (viewMode !== "GLOBAL") {
        return (b?.codigo_pais || "PT") === viewMode;
      }
      return true;
    });
  }, [budgets, viewMode, monthsInPeriod]);

  const budgetByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of filteredBudgets) {
      const cid = String(b?.categoria_id ?? "");
      if (!cid) continue;
      const v = getConverted(b?.valor_meta, b?.codigo_pais);
      m.set(cid, (m.get(cid) ?? 0) + safeNum(v));
    }
    return m;
  }, [filteredBudgets, viewMode, rates]);

  const realByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of filteredTxs) {
      if (String(t?.tipo ?? "") !== "DESPESA") continue;
      const cid = String(t?.categoria_id ?? "");
      if (!cid) continue;
      const v = getConverted(t?.valor, t?.codigo_pais);
      m.set(cid, (m.get(cid) ?? 0) + safeNum(v));
    }
    return m;
  }, [filteredTxs, viewMode, rates]);

  const trendByCategory = useMemo(() => {
    // Tendência: média móvel simples dos últimos 3 meses (até o fim do período)
    const end = resolvedPeriod.endMonth;
    const [ey, em] = end.split("-").map((x) => Number(x));
    const back: MonthKey[] = [];
    for (let i = 0; i < 3; i++) {
      let y = ey;
      let m = em - i;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      back.push(monthKeyFromYM(y, m));
    }
    const backSet = new Set(back);
    const monthly: Map<string, Map<MonthKey, number>> = new Map();

    for (const t of txs) {
      if (String(t?.tipo ?? "") !== "DESPESA") continue;
      if (viewMode !== "GLOBAL") {
        if ((t?.codigo_pais || "PT") !== viewMode) continue;
      }
      const d =
        parseISODateLike(t?.data_competencia) ||
        parseISODateLike(t?.date) ||
        parseISODateLike(t?.data_prevista_pagamento);
      if (!d) continue;
      const mk = monthKeyFromDate(d);
      if (!backSet.has(mk)) continue;
      const cid = String(t?.categoria_id ?? "");
      if (!cid) continue;
      const v = getConverted(t?.valor, t?.codigo_pais);
      if (!monthly.has(cid)) monthly.set(cid, new Map());
      const inner = monthly.get(cid)!;
      inner.set(mk, (inner.get(mk) ?? 0) + safeNum(v));
    }

    const out = new Map<string, number>();
    const monthsCount = Math.max(1, monthsInPeriod.length);
    for (const [cid, mm] of monthly.entries()) {
      const vals = back.map((k) => mm.get(k) ?? 0);
      const denom = Math.max(1, vals.filter((x) => x !== 0).length);
      const avg = vals.reduce((a, b) => a + b, 0) / denom;
      out.set(cid, avg * monthsCount);
    }
    return out;
  }, [txs, viewMode, resolvedPeriod.endMonth, monthsInPeriod, rates]);

  const tableRows = useMemo(() => {
    const set = new Set<string>();
    for (const [cid] of realByCategory) set.add(cid);
    for (const [cid] of budgetByCategory) set.add(cid);
    for (const [cid] of trendByCategory) set.add(cid);

    const rows = Array.from(set).map((cid) => {
      const nome = catById.get(cid)?.nome || cid;
      const real = realByCategory.get(cid) ?? 0;
      const orc = budgetByCategory.get(cid) ?? 0;
      const trend = trendByCategory.get(cid) ?? 0;
      const diff = real - orc;
      const pct = orc ? (diff / orc) * 100 : null;
      return { cid, nome, real, orc, trend, diff, pct };
    });

    rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return rows;
  }, [realByCategory, budgetByCategory, trendByCategory, catById]);

  const topAbs = useMemo(() => tableRows.slice(0, 5), [tableRows]);

  const topPct = useMemo(() => {
    const withPct = tableRows
      .filter((r) => r.pct !== null)
      .slice()
      .sort((a, b) => Math.abs((b.pct ?? 0)) - Math.abs((a.pct ?? 0)));
    return withPct.slice(0, 5);
  }, [tableRows]);

  const maxRef = useMemo(() => {
    let mx = 0;
    for (const r of tableRows) {
      mx = Math.max(mx, Math.abs(r.real), Math.abs(r.orc), Math.abs(r.trend));
    }
    return mx || 1;
  }, [tableRows]);

  const drillItems = useMemo(() => {
    if (!selectedCatId) return [] as Array<{ id: string; nome: string; total: number }>;
    const m = new Map<string, number>();
    for (const t of filteredTxs) {
      if (String(t?.tipo ?? "") !== "DESPESA") continue;
      if (String(t?.categoria_id ?? "") !== selectedCatId) continue;
      const it = String(t?.conta_contabil_id ?? "");
      if (!it) continue;
      const v = getConverted(t?.valor, t?.codigo_pais);
      m.set(it, (m.get(it) ?? 0) + safeNum(v));
    }
    const nameMap = contasByCat.get(selectedCatId) || new Map();
    const rows = Array.from(m.entries()).map(([id, total]) => ({
      id,
      nome: nameMap.get(id) || id,
      total,
    }));
    rows.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    return rows;
  }, [selectedCatId, filteredTxs, contasByCat, viewMode, rates]);

  const projectionStart = useMemo<MonthKey>(() => {
    return monthKeyFromDate(new Date());
  }, []);

  const projectionMonths = useMemo(() => {
    const out: MonthKey[] = [];
    for (let i = 0; i < projectionMonthsCount; i++) out.push(addMonthsToKey(projectionStart, i));
    return out;
  }, [projectionStart, projectionMonthsCount]);

  const projection = useMemo(() => {
    const startDate = firstDayOfMonthKey(projectionStart);
    const startMs = startDate.getTime();
    const monthSet = new Set(projectionMonths);

    const monthly = new Map<MonthKey, { entradas: number; saidas: number }>();
    for (const mk of projectionMonths) monthly.set(mk, { entradas: 0, saidas: 0 });

    let saldoInicial = 0;

    for (const t of txs) {
      // país/visão
      if (viewMode !== "GLOBAL") {
        if ((t?.codigo_pais || "PT") !== viewMode) continue;
      }

      const d =
        parseISODateLike(t?.data_prevista_pagamento) ||
        parseISODateLike(t?.data_competencia) ||
        parseISODateLike(t?.date);
      if (!d) continue;

      const status = String(t?.status ?? "");
      const tipo = String(t?.tipo ?? "");
      const val = safeNum(getConverted(t?.valor, t?.codigo_pais));
      const ms = d.getTime();

      // saldo inicial: somente PAGO antes do mês inicial da projeção
      if (status === "PAGO" && ms < startMs) {
        if (tipo === "RECEITA") saldoInicial += val;
        else if (tipo === "DESPESA" || tipo === "PAGAMENTO_FATURA") saldoInicial -= val;
        continue;
      }

      // projeção: somente não-pago (pendente/planejado/atrasado)
      if (status === "PAGO") continue;

      let mk = monthKeyFromDate(d);
      // vencidos/atrasados antes do mês inicial entram no mês inicial
      if (ms < startMs) mk = projectionStart;

      if (!monthSet.has(mk)) continue;

      const rec = monthly.get(mk) || { entradas: 0, saidas: 0 };
      if (tipo === "RECEITA") rec.entradas += val;
      else if (tipo === "DESPESA" || tipo === "PAGAMENTO_FATURA") rec.saidas += val;
      monthly.set(mk, rec);
    }

    let saldo = saldoInicial;
    const rows = projectionMonths.map((mk) => {
      const rec = monthly.get(mk) || { entradas: 0, saidas: 0 };
      const net = rec.entradas - rec.saidas;
      saldo += net;
      return {
        mes: mk,
        entradas: rec.entradas,
        saidas: rec.saidas,
        net,
        saldo,
      };
    });

    return { saldoInicial, rows };
  }, [txs, viewMode, rates, projectionMonths, projectionStart]);

  const projectionChart = useMemo(() => {
    const rows = projection?.rows || [];
    if (rows.length === 0) return { points: "", min: 0, max: 0 };
    const vals = rows.map((r) => safeNum(r.saldo));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;

    const W = 520;
    const H = 120;
    const P = 12;

    const pts = rows
      .map((r, i) => {
        const x = P + (i * (W - P * 2)) / Math.max(1, rows.length - 1);
        const y = P + (H - P * 2) * (1 - (safeNum(r.saldo) - min) / span);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return { points: pts, min, max };
  }, [projection]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-black text-bb-blue uppercase italic">Painel Geral</h2>
            <div className="text-[11px] text-gray-500 font-semibold mt-1">
              Filtro País: <b>{modeLabel}</b> · Período: <b>{periodLabel}</b>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-2">PERÍODO</div>
              <div className="flex flex-wrap gap-2">
                {([
                  ["30D", "30 DIAS"],
                  ["90D", "90 DIAS"],
                  ["YTD", "YTD"],
                  ["12M", "12 MESES"],
                  ["CUSTOM", "PERSONALIZADO"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    className={`px-4 py-2 rounded-xl border text-sm font-semibold transition ${
                      periodPreset === key
                        ? "bg-blue-700 text-white border-blue-700"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setPeriodPreset(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-end justify-between">
              <div className="flex flex-wrap gap-6 items-end">
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1">INÍCIO</div>
                  <input
                    type="date"
                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
                    value={periodPreset === "CUSTOM" ? customStart : resolvedPeriod.startISO}
                    disabled={periodPreset !== "CUSTOM"}
                    onChange={(e) => {
                      setPeriodPreset("CUSTOM");
                      setCustomStart(e.target.value);
                    }}
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1">FIM</div>
                  <input
                    type="date"
                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
                    value={periodPreset === "CUSTOM" ? customEnd : resolvedPeriod.endISO}
                    disabled={periodPreset !== "CUSTOM"}
                    onChange={(e) => {
                      setPeriodPreset("CUSTOM");
                      setCustomEnd(e.target.value);
                    }}
                  />
                </div>
              </div>

              {selectedCatId && (
                <button
                  className="px-3 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-sm"
                  onClick={() => setSelectedCatId(null)}
                >
                  ← Voltar
                </button>
              )}
            </div>

            <div className="text-xs text-gray-500">
              Período selecionado: <span className="font-semibold">{periodLabel}</span>
            </div>
          </div>

        </div>
      </div>

      {!selectedCatId ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
              <h3 className="text-sm font-black uppercase text-bb-blue">Top desvios (valor)</h3>
              <div className="mt-4 space-y-3">
                {topAbs.length === 0 ? (
                  <div className="text-[12px] text-gray-500 font-semibold">Sem dados no período.</div>
                ) : (
                  topAbs.map((r) => (
                    <div key={`abs-${r.cid}`} className="flex items-center justify-between gap-3">
                      <div className="text-[12px] font-semibold text-gray-700 truncate">{r.nome}</div>
                      <div className={`text-[12px] font-black ${r.diff >= 0 ? "text-red-600" : "text-green-600"}`}>
                        {fmtMoney(r.diff, viewMode)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
              <h3 className="text-sm font-black uppercase text-bb-blue">Top desvios (%)</h3>
              <div className="mt-4 space-y-3">
                {topPct.length === 0 ? (
                  <div className="text-[12px] text-gray-500 font-semibold">Sem dados no período.</div>
                ) : (
                  topPct.map((r) => (
                    <div
                      key={`pct-${r.cid}`}
                      className="flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1 -mx-2"
                      onClick={() => setSelectedCatId(r.cid)}
                    >
                      <div className="text-[12px] font-semibold text-gray-700 truncate">{r.nome}</div>
                      <div className={`text-[12px] font-black ${(r.pct ?? 0) >= 0 ? "text-red-600" : "text-green-600"}`}>
                        {((r.pct ?? 0)).toFixed(1)}%
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

                    <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-black uppercase text-bb-blue">Projeção de caixa</h3>
                <p className="text-[11px] text-gray-500 font-semibold mt-1">
                  Saldo inicial (histórico pago): <b>{fmtMoney(projection.saldoInicial, viewMode)}</b>
                </p>
              </div>

              <div className="flex items-end gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-500">N meses</label>
                  <select
                    value={projectionMonthsCount}
                    onChange={(e) => setProjectionMonthsCount(Number(e.target.value))}
                    className="mt-1 p-3 rounded-xl border bg-gray-50 text-[12px]"
                  >
                    {[3, 6, 9, 12].map((n) => (
                      <option key={`n-${n}`} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-4">
              {(projection?.rows || []).length === 0 ? (
                <div className="text-[12px] text-gray-500 font-semibold">Sem dados para projetar.</div>
              ) : (
                <div className="w-full overflow-x-auto">
                  <svg
                    viewBox="0 0 520 120"
                    width="100%"
                    height="120"
                    className="rounded-xl bg-gray-50 border"
                    preserveAspectRatio="none"
                  >
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-bb-blue"
                      points={projectionChart.points}
                    />
                  </svg>
                </div>
              )}
            </div>

            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="py-2">Mês</th>
                    <th className="py-2 text-right">Entradas</th>
                    <th className="py-2 text-right">Saídas</th>
                    <th className="py-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {(projection?.rows || []).map((r) => (
                    <tr key={`proj-${r.mes}`} className="border-t">
                      <td className="py-3 font-semibold">{r.mes}</td>
                      <td className="py-3 text-right text-green-700 font-semibold">{fmtMoney(r.entradas, viewMode)}</td>
                      <td className="py-3 text-right text-red-700 font-semibold">{fmtMoney(r.saidas, viewMode)}</td>
                      <td className="py-3 text-right font-black">{fmtMoney(r.saldo, viewMode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
<div className="bg-white p-6 rounded-[2rem] border shadow-sm">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-black uppercase text-bb-blue">Orçamento (Real x Orçado x Tendência)</h3>
                <p className="text-[11px] text-gray-500 font-semibold mt-1">
                  Clique na categoria para ver o detalhamento por item.
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="py-2">Categoria</th>
                    <th className="py-2 text-right">Real</th>
                    <th className="py-2 text-right">Orçado</th>
                    <th className="py-2 text-right">Tendência</th>
                    <th className="py-2 text-right">Desvio</th>
                    <th className="py-2 text-right">%</th>
                    <th className="py-2">Gráfico</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td className="py-6 text-gray-500" colSpan={7}>
                        Sem dados no período.
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((r) => {
                      const wReal = clamp((Math.abs(r.real) / maxRef) * 120, 0, 120);
                      const wOrc = clamp((Math.abs(r.orc) / maxRef) * 120, 0, 120);
                      const wTrend = clamp((Math.abs(r.trend) / maxRef) * 120, 0, 120);
                      return (
                        <tr key={r.cid} className="border-t hover:bg-gray-50">
                          <td className="py-3 font-semibold">
                            <button
                              type="button"
                              onClick={() => setSelectedCatId(r.cid)}
                              className="text-left hover:underline"
                            >
                              {r.nome}
                            </button>
                          </td>
                          <td className="py-3 text-right">{fmtMoney(r.real, viewMode)}</td>
                          <td className="py-3 text-right">{fmtMoney(r.orc, viewMode)}</td>
                          <td className="py-3 text-right">{fmtMoney(r.trend, viewMode)}</td>
                          <td className={`py-3 text-right font-black ${r.diff >= 0 ? "text-red-600" : "text-green-600"}`}>
                            {fmtMoney(r.diff, viewMode)}
                          </td>
                          <td className="py-3 text-right text-gray-600 font-semibold">
                            {r.pct === null ? "–" : `${r.pct.toFixed(1)}%`}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-1">
                              <div className="h-2 rounded bg-gray-200" style={{ width: 120 }}>
                                <div className="h-2 rounded bg-blue-300" style={{ width: wReal }} />
                              </div>
                              <div className="h-2 rounded bg-gray-200" style={{ width: 120 }}>
                                <div className="h-2 rounded bg-yellow-300" style={{ width: wOrc }} />
                              </div>
                              <div className="h-2 rounded bg-gray-200" style={{ width: 120 }}>
                                <div className="h-2 rounded bg-green-300" style={{ width: wTrend }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-black uppercase text-bb-blue">Detalhamento por item</h3>
              <p className="text-[11px] text-gray-500 font-semibold mt-1">
                Categoria: <b>{catById.get(selectedCatId)?.nome || selectedCatId}</b>
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Real</th>
                </tr>
              </thead>
              <tbody>
                {drillItems.length === 0 ? (
                  <tr>
                    <td className="py-6 text-gray-500" colSpan={2}>
                      Sem despesas para esta categoria no período.
                    </td>
                  </tr>
                ) : (
                  drillItems.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="py-3 font-semibold">{it.nome}</td>
                      <td className="py-3 text-right">{fmtMoney(it.total, viewMode)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}