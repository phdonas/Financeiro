import React, { useMemo } from "react";
import type { Categoria, Orcamento, Transacao, Investment } from "../types";

export type DashboardProps = {
  transacoes?: Transacao[];
  categorias?: Categoria[];
  orcamentos?: Orcamento[];
  investments?: Investment[];
  viewMode: "local" | "cloud";
};

function formatMoney(v: number, currency: string = "EUR") {
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency
    }).format(v || 0);
  } catch {
    return `${v || 0}`;
  }
}

function getVal(valor: number, codigo_pais?: string) {
  // Aqui você pode fazer conversão real depois.
  // Por enquanto, retornamos o valor “como está”.
  return Number(valor || 0);
}

export default function Dashboard({
  transacoes = [],
  categorias = [],
  orcamentos = [],
  investments = [],
  viewMode
}: DashboardProps) {
  const safeTransacoes = Array.isArray(transacoes) ? transacoes : [];
  const safeInvestments = Array.isArray(investments) ? investments : [];

  const summary = useMemo(() => {
    const saldoLedger = safeTransacoes.reduce((acc, t) => acc + getVal(t.valor, t.codigo_pais), 0);

    const capitalInvestido = safeInvestments.reduce(
      (acc, a) => acc + getVal(a.current_value, a.country_code),
      0
    );

    return {
      saldoLedger,
      capitalInvestido
    };
  }, [safeTransacoes, safeInvestments]);

  const categoriasResumo = useMemo(() => {
    // Exemplo: total por categoria
    const map: Record<string, number> = {};

    for (const t of safeTransacoes) {
      const cat = (t.categoria_id || "sem_categoria").toString();
      map[cat] = (map[cat] || 0) + getVal(t.valor, t.codigo_pais);
    }

    return Object.entries(map).map(([categoria_id, total]) => {
      const cat = categorias.find((c) => c.id === categoria_id);
      return {
        categoria_id,
        categoria_nome: cat?.nome || categoria_id,
        total
      };
    });
  }, [safeTransacoes, categorias]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Painel Geral</h1>
        <div className="text-xs px-3 py-1 rounded-full bg-white border">
          {viewMode === "cloud" ? "Nuvem ativa" : "Modo local ativo"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-sm opacity-70 mb-1">Saldo (lançamentos)</div>
          <div className="text-2xl font-bold">{formatMoney(summary.saldoLedger)}</div>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <div className="text-sm opacity-70 mb-1">Capital investido</div>
          <div className="text-2xl font-bold">{formatMoney(summary.capitalInvestido)}</div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">Totais por categoria</h2>

        {categoriasResumo.length === 0 ? (
          <div className="text-sm opacity-70">Sem dados para exibir.</div>
        ) : (
          <div className="space-y-2">
            {categoriasResumo.map((row) => (
              <div key={row.categoria_id} className="flex items-center justify-between">
                <div className="text-sm">{row.categoria_nome}</div>
                <div className="text-sm font-medium">{formatMoney(row.total)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
