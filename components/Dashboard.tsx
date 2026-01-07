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

function parseISODateLike(raw?: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function monthKeyFromDate(d: Date): MonthKey {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${pad2(m)}` as MonthKey;
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

  const defaultEnd = useMemo<MonthKey>(() => {
    if (allMonthKeys.length > 0) return allMonthKeys[allMonthKeys.length - 1];
    const now = new Date();
    return monthKeyFromDate(now);
  }, [allMonthKeys]);

  const defaultStart = useMemo<MonthKey>(() => {
    if (allMonthKeys.length > 0) return allMonthKeys[allMonthKeys.length - 1];
    const now = new Date();
    return monthKeyFromDate(now);
  }, [allMonthKeys]);

  const [periodStart, setPeriodStart] = useState<MonthKey>(defaultStart);
  const [periodEnd, setPeriodEnd] = useState<MonthKey>(defaultEnd);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  const normalizedPeriod = useMemo(() => {
    const s = String(periodStart);
    const e = String(periodEnd);
    return s <= e ? { start: periodStart, end: periodEnd } : { start: periodEnd, end: periodStart };
  }, [periodStart, periodEnd]);

  const monthsInPeriod = useMemo(() => {
    return monthRange(normalizedPeriod.start, normalizedPeriod.end);
  }, [normalizedPeriod]);

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
    const periodSet = new Set(monthsInPeriod);
    return txs.filter((t) => {
      if (viewMode !== "GLOBAL") {
        if ((t?.codigo_pais || "PT") !== viewMode) return false;
      }
      const d =
        parseISODateLike(t?.data_competencia) ||
        parseISODateLike(t?.date) ||
        parseISODateLike(t?.data_prevista_pagamento);
      if (!d) return false;
      const mk = monthKeyFromDate(d);
      return periodSet.has(mk);
    });
  }, [txs, viewMode, monthsInPeriod]);

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
    const end = normalizedPeriod.end;
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
  }, [txs, viewMode, normalizedPeriod, monthsInPeriod, rates]);

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

  const monthsOptions = useMemo(() => {
    const opts = allMonthKeys.length > 0 ? allMonthKeys : [defaultEnd];
    return opts;
  }, [allMonthKeys, defaultEnd]);

  const periodLabel = useMemo(() => {
    const s = normalizedPeriod.start;
    const e = normalizedPeriod.end;
    if (s === e) return s;
    return `${s} → ${e}`;
  }, [normalizedPeriod]);

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

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Início</label>
              <select
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value as MonthKey)}
                className="mt-1 p-3 rounded-xl border bg-gray-50 text-[12px]"
              >
                {monthsOptions.map((k) => (
                  <option key={`s-${k}`} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Fim</label>
              <select
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value as MonthKey)}
                className="mt-1 p-3 rounded-xl border bg-gray-50 text-[12px]"
              >
                {monthsOptions.map((k) => (
                  <option key={`e-${k}`} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            {selectedCatId && (
              <button
                type="button"
                onClick={() => setSelectedCatId(null)}
                className="px-4 py-3 rounded-xl border bg-white text-[10px] font-black uppercase shadow-sm"
              >
                ← Voltar
              </button>
            )}
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
                    <div key={`pct-${r.cid}`} className="flex items-center justify-between gap-3">
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
