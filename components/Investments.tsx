import React, { useMemo, useState } from "react";
import {
  InvestmentAsset,
  InvestmentTransaction,
  InvestmentTransactionType,
} from "../types";

interface InvestmentsProps {
  viewMode: "BR" | "PT" | "GLOBAL";
  initialAssets: InvestmentAsset[];
  onSave: (a: InvestmentAsset) => void;
  onDelete: (id: string) => void;
}

type PeriodPreset = "30D" | "90D" | "YTD" | "YOY" | "CUSTOM";

const isoToday = () => new Date().toISOString().slice(0, 10);

function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfYearISO(iso: string) {
  const y = iso.slice(0, 4);
  return `${y}-01-01`;
}

function addYearsISO(iso: string, years: number) {
  const d = new Date(iso + "T00:00:00");
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function formatMoney(value: number, country: "PT" | "BR") {
  const sign = country === "PT" ? "€" : "R$";
  return `${sign} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function safeNumber(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function txLabel(t: InvestmentTransactionType) {
  switch (t) {
    case "BUY":
      return "Compra / Aporte";
    case "SELL":
      return "Venda / Resgate";
    case "YIELD":
      return "Proventos / Juros";
    case "REVALUATION":
      return "Revalorização / Ajuste";
    default:
      return t;
  }
}

function txSign(t: InvestmentTransactionType) {
  return t === "SELL" ? -1 : 1;
}

const Investments: React.FC<InvestmentsProps> = ({
  viewMode,
  initialAssets,
  onSave,
  onDelete,
}) => {
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // filtros
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<Record<string, boolean>>({
    FIXED: true,
    VARIABLE: true,
    CRYPTO: true,
  });
  const [institutionFilter, setInstitutionFilter] = useState<string>("ALL");

  // período (rentabilidade)
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("30D");
  const [customStart, setCustomStart] = useState(addDaysISO(isoToday(), -30));
  const [customEnd, setCustomEnd] = useState(isoToday());

  // forms
  const [assetForm, setAssetForm] = useState<Partial<InvestmentAsset>>({
    name: "",
    institution: "",
    type: "FIXED",
    country_code: "PT",
    initial_balance: 0,
    current_value: 0,
    history: [],
  });

  const [txForm, setTxForm] = useState<Partial<InvestmentTransaction>>({
    date: isoToday(),
    type: "YIELD",
    value: 0,
    description: "",
  });

  const [balanceAdjustValue, setBalanceAdjustValue] = useState<number>(0);

  const periodRange = useMemo(() => {
    const end = isoToday();
    if (periodPreset === "30D") return { start: addDaysISO(end, -30), end };
    if (periodPreset === "90D") return { start: addDaysISO(end, -90), end };
    if (periodPreset === "YTD") return { start: startOfYearISO(end), end };
    if (periodPreset === "YOY") return { start: addYearsISO(end, -1), end };
    return {
      start: customStart || addDaysISO(end, -30),
      end: customEnd || end,
    };
  }, [periodPreset, customStart, customEnd]);

  const scopedAssets = useMemo(() => {
    if (viewMode === "GLOBAL") return initialAssets;
    const cc = viewMode === "PT" ? "PT" : "BR";
    return initialAssets.filter((a) => a.country_code === cc);
  }, [initialAssets, viewMode]);

  const institutions = useMemo(() => {
    const set = new Set<string>();
    initialAssets.forEach((a) => set.add(a.institution));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [initialAssets]);

  function valueAt(asset: InvestmentAsset, iso: string) {
    const base = safeNumber(asset.initial_balance);
    const history = Array.isArray(asset.history) ? asset.history : [];
    const sum = history
      .filter((t) => t.date <= iso)
      .reduce((acc, t) => {
        const v = safeNumber(t.value);
        if (t.type === "SELL") return acc - v;
        // BUY, YIELD, REVALUATION entram como +
        return acc + v;
      }, 0);
    return base + sum;
  }

  function periodMetrics(asset: InvestmentAsset) {
    const start = valueAt(asset, periodRange.start);
    const end = valueAt(asset, periodRange.end);

    const history = Array.isArray(asset.history) ? asset.history : [];
    const inPeriod = history.filter(
      (t) => t.date >= periodRange.start && t.date <= periodRange.end
    );

    const netFlows = inPeriod.reduce((acc, t) => {
      const v = safeNumber(t.value);
      if (t.type === "BUY") return acc + v;
      if (t.type === "SELL") return acc - v;
      return acc;
    }, 0);

    // ganho = evolução líquida - fluxos
    const gain = end - start - netFlows;

    const denom = Math.max(0.01, start + Math.max(0, netFlows));
    const pct = (gain / denom) * 100;

    return { start, end, netFlows, gain, pct };
  }

  const filteredAssets = useMemo(() => {
    const s = search.trim().toLowerCase();
    return scopedAssets
      .filter((a) => typeFilter[a.type])
      .filter((a) => (institutionFilter === "ALL" ? true : a.institution === institutionFilter))
      .filter((a) => {
        if (!s) return true;
        return (
          a.name.toLowerCase().includes(s) ||
          a.institution.toLowerCase().includes(s)
        );
      })
      .map((a) => {
        const m = periodMetrics(a);
        return { asset: a, metrics: m };
      });
  }, [scopedAssets, typeFilter, institutionFilter, search, periodRange.start, periodRange.end]);

  const groupStats = useMemo(() => {
    const groups: Record<"PT" | "BR", any> = {
      PT: { total: 0, gain: 0, denom: 0, items: [] as any[] },
      BR: { total: 0, gain: 0, denom: 0, items: [] as any[] },
    };

    filteredAssets.forEach(({ asset, metrics }) => {
      const cc = asset.country_code;
      groups[cc].total += safeNumber(asset.current_value);
      groups[cc].gain += metrics.gain;
      groups[cc].denom += Math.max(0.01, metrics.start + Math.max(0, metrics.netFlows));
      groups[cc].items.push({ asset, metrics });
    });

    const finalize = (g: any) => ({
      ...g,
      pct: g.denom ? (g.gain / g.denom) * 100 : 0,
    });

    return {
      PT: finalize(groups.PT),
      BR: finalize(groups.BR),
    };
  }, [filteredAssets]);

  const showPT = viewMode === "PT" || viewMode === "GLOBAL";
  const showBR = viewMode === "BR" || viewMode === "GLOBAL";

  const allocationBars = (items: Array<{ asset: InvestmentAsset; metrics: any }>, cc: "PT" | "BR") => {
    const sorted = [...items].sort((a, b) => safeNumber(b.asset.current_value) - safeNumber(a.asset.current_value));
    const total = sorted.reduce((acc, x) => acc + safeNumber(x.asset.current_value), 0) || 1;
    return (
      <div className="space-y-3">
        {sorted.slice(0, 8).map(({ asset }) => {
          const pct = (safeNumber(asset.current_value) / total) * 100;
          return (
            <div key={asset.id} className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold">
                <span className="text-gray-700 uppercase tracking-wider">{asset.name}</span>
                <span className="text-gray-500">{pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-2 bg-bb-blue rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
              </div>
              <div className="text-[10px] text-gray-500 font-bold">{formatMoney(asset.current_value, cc)}</div>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="py-10 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Sem ativos neste recorte
          </div>
        )}
      </div>
    );
  };

  const openCreateAsset = () => {
    setAssetForm({
      name: "",
      institution: "",
      type: "FIXED",
      country_code: viewMode === "BR" ? "BR" : "PT",
      initial_balance: 0,
      current_value: 0,
      history: [],
    });
    setEditingAssetId(null);
    setBalanceAdjustValue(0);
    setIsAssetModalOpen(true);
  };

  const openEditAsset = (a: InvestmentAsset) => {
    setAssetForm({ ...a, history: Array.isArray(a.history) ? a.history : [] });
    setEditingAssetId(a.id);
    setBalanceAdjustValue(safeNumber(a.current_value));
    setIsAssetModalOpen(true);
  };

  const handleSaveAsset = (e: React.FormEvent) => {
    e.preventDefault();

    const isEditing = !!editingAssetId;
    const existing = isEditing ? initialAssets.find((x) => x.id === editingAssetId) : undefined;

    const id = editingAssetId || Math.random().toString(36).slice(2, 11);
    const country_code = (assetForm.country_code || "PT") as "PT" | "BR";
    const type = (assetForm.type || "FIXED") as any;
    const name = String(assetForm.name || "").trim();
    const institution = String(assetForm.institution || "").trim();

    const history = Array.isArray(assetForm.history) ? assetForm.history : [];

    // saldo base ao criar
    const initial_balance = safeNumber(assetForm.initial_balance);

    // ao editar, permite ajustar o saldo atual criando um lançamento de ajuste (REVALUATION)
    let nextHistory = [...history];
    let computedNow = initial_balance;
    nextHistory.forEach((tx) => {
      const v = safeNumber(tx.value);
      if (tx.type === "SELL") computedNow -= v;
      else computedNow += v;
    });

    let current_value = computedNow;

    if (isEditing && existing) {
      const desired = safeNumber(balanceAdjustValue);
      const diff = desired - computedNow;

      if (Math.abs(diff) >= 0.01) {
        const adjustTx: InvestmentTransaction = {
          id: Math.random().toString(36).slice(2, 11),
          date: isoToday(),
          type: "REVALUATION",
          value: diff,
          description: "Ajuste de saldo",
        };
        nextHistory = [...nextHistory, adjustTx];
        current_value = desired;
      } else {
        current_value = computedNow;
      }
    } else {
      // novo ativo: saldo atual = saldo inicial
      current_value = initial_balance;
    }

    const finalAsset: InvestmentAsset = {
      id,
      country_code,
      name,
      type,
      institution,
      initial_balance,
      current_value,
      history: nextHistory,
    };

    onSave(finalAsset);
    setIsAssetModalOpen(false);
    setEditingAssetId(null);
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetId) return;

    const asset = initialAssets.find((a) => a.id === selectedAssetId);
    if (!asset) return;

    const newTx: InvestmentTransaction = {
      id: Math.random().toString(36).slice(2, 11),
      date: String(txForm.date || isoToday()),
      type: (txForm.type || "YIELD") as InvestmentTransactionType,
      value: safeNumber(txForm.value),
      description: String(txForm.description || "").trim(),
    };

    const newHistory = [...(asset.history || []), newTx];

    // recalcula valor atual
    let newValue = safeNumber(asset.initial_balance);
    newHistory.forEach((tx) => {
      const v = safeNumber(tx.value);
      if (tx.type === "SELL") newValue -= v;
      else newValue += v;
    });

    onSave({ ...asset, history: newHistory, current_value: newValue });

    setTxForm({
      date: isoToday(),
      type: "YIELD",
      value: 0,
      description: "",
    });
  };

  const handleDeleteTx = (assetId: string, txId: string) => {
    const asset = initialAssets.find((a) => a.id === assetId);
    if (!asset) return;

    const newHistory = (asset.history || []).filter((t) => t.id !== txId);

    let newValue = safeNumber(asset.initial_balance);
    newHistory.forEach((tx) => {
      const v = safeNumber(tx.value);
      if (tx.type === "SELL") newValue -= v;
      else newValue += v;
    });

    onSave({ ...asset, history: newHistory, current_value: newValue });
  };

  const selectedAsset = useMemo(() => {
    if (!selectedAssetId) return null;
    return initialAssets.find((a) => a.id === selectedAssetId) || null;
  }, [selectedAssetId, initialAssets]);

  const selectedMetrics = useMemo(() => {
    if (!selectedAsset) return null;
    return periodMetrics(selectedAsset);
  }, [selectedAsset, periodRange.start, periodRange.end]);

  const renderSummaryCard = (cc: "PT" | "BR") => {
    const g = groupStats[cc];
    const title = cc === "PT" ? "Portugal (EUR)" : "Brasil (BRL)";
    const badge = g.pct >= 0 ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50";
    const gainSign = g.gain >= 0 ? "+" : "";
    return (
      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] italic">{title}</p>
            <h3 className="text-2xl font-black text-bb-blue italic tracking-tight">
              {formatMoney(g.total, cc)}
            </h3>
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-black italic ${badge}`}>
            {gainSign}{formatMoney(g.gain, cc)} • {g.pct.toFixed(2)}%
          </div>
        </div>

        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
          Retorno no período: {periodRange.start.split("-").reverse().join("/")} → {periodRange.end.split("-").reverse().join("/")}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-8 pb-24 animate-in fade-in duration-700">
      {/* Filtros + Período */}
      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
          <div>
            <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">
              Investimentos
            </h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 italic tracking-widest">
              Carteira, filtros e rentabilidade por período
            </p>
          </div>

          <button
            onClick={openCreateAsset}
            className="bg-bb-blue text-white px-8 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all"
          >
            ➕ Adicionar Ativo
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Buscar
            </label>
            <input
              className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100"
              placeholder="Nome ou instituição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="lg:col-span-3">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Instituição
            </label>
            <select
              className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100"
              value={institutionFilter}
              onChange={(e) => setInstitutionFilter(e.target.value)}
            >
              <option value="ALL">Todas</option>
              {institutions.map((inst) => (
                <option key={inst} value={inst}>
                  {inst}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-5">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Tipo de Ativo
            </label>
            <div className="flex flex-wrap gap-2">
              {(["FIXED", "VARIABLE", "CRYPTO"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setTypeFilter((s) => ({ ...s, [t]: !s[t] }))
                  }
                  className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                    typeFilter[t]
                      ? "bg-bb-blue text-white border-bb-blue"
                      : "bg-gray-50 text-gray-400 border-gray-100"
                  }`}
                >
                  {t === "FIXED" ? "Renda Fixa" : t === "VARIABLE" ? "Renda Variável" : "Cripto"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setInstitutionFilter("ALL");
                  setTypeFilter({ FIXED: true, VARIABLE: true, CRYPTO: true });
                }}
                className="px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 hover:text-bb-blue transition-all"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
          <div className="lg:col-span-5">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Período
            </label>
            <div className="flex flex-wrap gap-2">
              {([
                ["30D", "30 dias"],
                ["90D", "90 dias"],
                ["YTD", "YTD"],
                ["YOY", "12 meses"],
                ["CUSTOM", "Personalizado"],
              ] as Array<[PeriodPreset, string]>).map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriodPreset(p)}
                  className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                    periodPreset === p
                      ? "bg-bb-blue text-white border-bb-blue"
                      : "bg-gray-50 text-gray-400 border-gray-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                Início
              </label>
              <input
                type="date"
                className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100"
                value={periodRange.start}
                onChange={(e) => {
                  setPeriodPreset("CUSTOM");
                  setCustomStart(e.target.value);
                }}
                disabled={periodPreset !== "CUSTOM"}
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                Fim
              </label>
              <input
                type="date"
                className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100"
                value={periodRange.end}
                onChange={(e) => {
                  setPeriodPreset("CUSTOM");
                  setCustomEnd(e.target.value);
                }}
                disabled={periodPreset !== "CUSTOM"}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resumo + retorno por período */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {showPT && renderSummaryCard("PT")}
        {showBR && renderSummaryCard("BR")}
      </div>

      {/* Alocação (gráfico simples) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {showPT && (
          <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100">
            <h4 className="text-[10px] font-black text-bb-blue uppercase italic tracking-widest mb-4">
              Alocação (PT)
            </h4>
            {allocationBars(groupStats.PT.items, "PT")}
          </div>
        )}
        {showBR && (
          <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100">
            <h4 className="text-[10px] font-black text-bb-blue uppercase italic tracking-widest mb-4">
              Alocação (BR)
            </h4>
            {allocationBars(groupStats.BR.items, "BR")}
          </div>
        )}
      </div>

      {/* Lista de ativos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {filteredAssets.length === 0 ? (
          <div className="col-span-3 py-20 bg-white rounded-[2rem] border-2 border-dashed border-gray-100 flex flex-col items-center justify-center opacity-40 grayscale">
            <span className="text-5xl mb-4">📉</span>
            <p className="text-xs font-black uppercase text-bb-blue italic tracking-widest">
              Nenhum ativo neste recorte
            </p>
          </div>
        ) : (
          filteredAssets.map(({ asset, metrics }) => {
            const badge = metrics.pct >= 0 ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50";
            const gainSign = metrics.gain >= 0 ? "+" : "";
            return (
              <div
                key={asset.id}
                className="bg-white rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden flex flex-col border-b-4 border-b-transparent hover:border-b-bb-blue"
              >
                <div className="p-8 space-y-4 flex-1">
                  <div className="flex justify-between items-start">
                    <span
                      className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                        asset.type === "VARIABLE"
                          ? "bg-orange-50 text-orange-600"
                          : asset.type === "CRYPTO"
                          ? "bg-purple-50 text-purple-600"
                          : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {asset.type}
                    </span>
                    <span className="text-xs">{asset.country_code === "PT" ? "🇵🇹" : "🇧🇷"}</span>
                  </div>

                  <div>
                    <h4 className="text-lg font-black text-bb-blue italic uppercase tracking-tighter leading-none mb-1">
                      {asset.name}
                    </h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                      {asset.institution}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-gray-50 space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-[9px] font-black text-gray-300 uppercase italic">Saldo Atual</p>
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black italic ${badge}`}>
                        {gainSign}{formatMoney(metrics.gain, asset.country_code)} • {metrics.pct.toFixed(2)}%
                      </div>
                    </div>
                    <p className="text-2xl font-black text-bb-blue italic">
                      {formatMoney(asset.current_value, asset.country_code)}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50/50 p-6 flex justify-between items-center">
                  <button
                    onClick={() => {
                      setSelectedAssetId(asset.id);
                      setIsTxModalOpen(true);
                      setTxForm({
                        date: isoToday(),
                        type: "YIELD",
                        value: 0,
                        description: "",
                      });
                    }}
                    className="text-[10px] font-black uppercase text-bb-blue italic hover:underline"
                  >
                    Histórico / Operações
                  </button>

                  <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => openEditAsset(asset)}
                      className="text-bb-blue text-xs"
                      title="Editar"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => onDelete(asset.id)}
                      className="text-red-500 text-xs"
                      title="Excluir"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Ativo */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveAsset}
            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-10 space-y-6 animate-in zoom-in duration-300"
          >
            <div className="border-b border-gray-100 pb-4">
              <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">
                {editingAssetId ? "Editar Ativo" : "Cadastrar Ativo"}
              </h3>
              <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 italic">
                Custódia e saldo
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAssetForm({ ...assetForm, country_code: "PT" })}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${
                    assetForm.country_code === "PT"
                      ? "bg-bb-blue text-white border-bb-blue"
                      : "bg-gray-50 text-gray-400 border-transparent"
                  }`}
                >
                  Portugal
                </button>
                <button
                  type="button"
                  onClick={() => setAssetForm({ ...assetForm, country_code: "BR" })}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${
                    assetForm.country_code === "BR"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-gray-50 text-gray-400 border-transparent"
                  }`}
                >
                  Brasil
                </button>
              </div>

              <input
                required
                className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100"
                placeholder="Nome do Ativo"
                value={assetForm.name || ""}
                onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
              />
              <input
                required
                className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100"
                placeholder="Instituição Financeira"
                value={assetForm.institution || ""}
                onChange={(e) =>
                  setAssetForm({ ...assetForm, institution: e.target.value })
                }
              />
              <select
                className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100"
                value={assetForm.type || "FIXED"}
                onChange={(e) =>
                  setAssetForm({ ...assetForm, type: e.target.value as any })
                }
              >
                <option value="FIXED">Renda Fixa</option>
                <option value="VARIABLE">Renda Variável</option>
                <option value="CRYPTO">Criptoativos</option>
              </select>

              {!editingAssetId ? (
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-bb-blue/5 p-4 rounded-xl text-lg font-black text-bb-blue border border-bb-blue/10"
                  placeholder="Saldo inicial"
                  value={assetForm.initial_balance ?? ""}
                  onChange={(e) =>
                    setAssetForm({
                      ...assetForm,
                      initial_balance: safeNumber(e.target.value),
                    })
                  }
                />
              ) : (
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-bb-blue/5 p-4 rounded-xl text-lg font-black text-bb-blue border border-bb-blue/10"
                  placeholder="Saldo atual"
                  value={Number.isFinite(balanceAdjustValue) ? balanceAdjustValue : 0}
                  onChange={(e) => setBalanceAdjustValue(safeNumber(e.target.value))}
                />
              )}
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => setIsAssetModalOpen(false)}
                className="flex-1 text-[10px] font-black uppercase text-gray-400 italic"
              >
                Sair
              </button>
              <button
                type="submit"
                className="flex-[2] bg-bb-blue text-white py-4 rounded-xl text-[10px] font-black uppercase shadow-xl tracking-widest"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Transação */}
      {isTxModalOpen && selectedAsset && (
        <div className="fixed inset-0 bg-bb-blue/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl p-10 flex flex-col md:flex-row gap-10 animate-in zoom-in duration-300">
            <div className="md:w-1/2 space-y-6">
              <div className="border-b border-gray-100 pb-4">
                <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">
                  Operações
                </h3>
                <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 italic">
                  {selectedAsset.name} • {selectedAsset.institution}
                </p>
              </div>

              {selectedMetrics && (
                <div className="bg-gray-50 p-6 rounded-[1.5rem] border border-gray-100 space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    <span>Saldo início</span>
                    <span>{formatMoney(selectedMetrics.start, selectedAsset.country_code)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    <span>Saldo fim</span>
                    <span>{formatMoney(selectedMetrics.end, selectedAsset.country_code)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    <span>Fluxos (aportes/resgates)</span>
                    <span>{formatMoney(selectedMetrics.netFlows, selectedAsset.country_code)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                    <span className="text-bb-blue">Retorno no período</span>
                    <span className={selectedMetrics.gain >= 0 ? "text-emerald-700" : "text-red-600"}>
                      {(selectedMetrics.gain >= 0 ? "+" : "")}{formatMoney(selectedMetrics.gain, selectedAsset.country_code)} • {selectedMetrics.pct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              <form onSubmit={handleAddTransaction} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    required
                    className="bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100"
                    value={String(txForm.date || isoToday())}
                    onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                  />
                  <select
                    className="bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100"
                    value={String(txForm.type || "YIELD")}
                    onChange={(e) =>
                      setTxForm({ ...txForm, type: e.target.value as any })
                    }
                  >
                    <option value="BUY">Compra / Aporte (+)</option>
                    <option value="SELL">Venda / Resgate (-)</option>
                    <option value="YIELD">Proventos / Juros (+)</option>
                    <option value="REVALUATION">Revalorização / Ajuste (+/-)</option>
                  </select>
                </div>

                <input
                  type="number"
                  step="0.01"
                  required
                  className="w-full bg-bb-blue/5 p-4 rounded-xl text-xl font-black text-bb-blue"
                  placeholder="Valor"
                  value={safeNumber(txForm.value) || ""}
                  onChange={(e) =>
                    setTxForm({ ...txForm, value: safeNumber(e.target.value) })
                  }
                />
                <input
                  className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border border-gray-100"
                  placeholder="Descrição (opcional)"
                  value={String(txForm.description || "")}
                  onChange={(e) =>
                    setTxForm({ ...txForm, description: e.target.value })
                  }
                />

                <div className="flex gap-4 pt-6">
                  <button
                    type="button"
                    onClick={() => setIsTxModalOpen(false)}
                    className="flex-1 text-[10px] font-black uppercase text-gray-400 italic"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] bg-bb-blue text-white py-4 rounded-xl text-[10px] font-black uppercase shadow-xl tracking-widest"
                  >
                    Registrar
                  </button>
                </div>
              </form>
            </div>

            <div className="md:w-1/2 flex flex-col bg-gray-50 p-8 rounded-[2rem] border border-gray-100 max-h-[560px]">
              <h4 className="text-[10px] font-black text-bb-blue uppercase italic tracking-widest mb-6 border-b border-gray-200 pb-3">
                Histórico
              </h4>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {(selectedAsset.history || [])
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((tx) => (
                    <div
                      key={tx.id}
                      className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center group"
                    >
                      <div>
                        <p className="text-[8px] text-gray-400 font-bold mb-1">
                          {tx.date.split("-").reverse().join("/")}
                        </p>
                        <p className="text-[10px] font-black text-gray-700 uppercase leading-none">
                          {tx.description || txLabel(tx.type)}
                        </p>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                          {txLabel(tx.type)}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div
                          className={`text-[11px] font-black italic ${
                            tx.type === "SELL" ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          {(txSign(tx.type) < 0 ? "-" : "+")}{" "}
                          {formatMoney(safeNumber(tx.value), selectedAsset.country_code)}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteTx(selectedAsset.id, tx.id)}
                          className="opacity-0 group-hover:opacity-100 transition-all text-red-500 text-xs"
                          title="Excluir operação"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}

                {(selectedAsset.history?.length || 0) === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center py-20 opacity-30 italic">
                    <span className="text-3xl mb-2">📜</span>
                    <p className="text-[9px] font-black uppercase">
                      Sem histórico registrado
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-6 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                Saldo atual:{" "}
                <span className="text-bb-blue font-black">
                  {formatMoney(selectedAsset.current_value, selectedAsset.country_code)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Investments;
