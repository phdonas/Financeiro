import React, { useMemo } from "react";
import { Transacao, Categoria, Orcamento, InvestmentAsset } from "../types";

interface DashboardProps {
  viewMode: "PT" | "BR";
  transacoes: Transacao[];
  orcamentos: Orcamento[];
  categorias: Categoria[];
  investments: InvestmentAsset[];
}

function isDespesa(t: Transacao) {
  const tipo = String((t as any)?.tipo || "").toUpperCase();
  return tipo === "DESPESA";
}

function isReceita(t: Transacao) {
  const tipo = String((t as any)?.tipo || "").toUpperCase();
  return tipo === "RECEITA";
}

const toNumber = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function Dashboard({
  viewMode,
  transacoes,
  orcamentos,
  categorias,
  investments
}: DashboardProps) {
  const safeTransacoes = Array.isArray(transacoes) ? transacoes : [];
  const safeOrcamentos = Array.isArray(orcamentos) ? orcamentos : [];
  const safeCategorias = Array.isArray(categorias) ? categorias : [];
  const safeInvestments = Array.isArray(investments) ? investments : [];

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const resumo = useMemo(() => {
    const txMonth = safeTransacoes.filter((t) => (t?.data || "").slice(0, 7) === currentMonth);

    const receitas = txMonth
      .filter(isReceita)
      .reduce((acc, t) => acc + toNumber((t as any)?.valor), 0);

    const despesas = txMonth
      .filter(isDespesa)
      .reduce((acc, t) => acc + toNumber((t as any)?.valor), 0);

    const saldoMes = receitas - despesas;

    const orcMes = safeOrcamentos
      .filter((o) => o?.mes === currentMonth)
      .reduce((acc, o) => acc + toNumber((o as any)?.valor), 0);

    const totalInvest = safeInvestments
      .filter((a) => a?.country_code === viewMode)
      .reduce((acc, a) => acc + toNumber((a as any)?.current_value), 0);

    return { receitas, despesas, saldoMes, orcMes, totalInvest };
  }, [safeTransacoes, safeOrcamentos, safeInvestments, currentMonth, viewMode]);

  const byCategoria = useMemo(() => {
    const txMonth = safeTransacoes.filter((t) => (t?.data || "").slice(0, 7) === currentMonth);
    const despesas = txMonth.filter(isDespesa);

    const map = new Map<string, number>();
    for (const t of despesas) {
      const catId = (t as any)?.categoriaId || "sem-categoria";
      map.set(catId, (map.get(catId) || 0) + toNumber((t as any)?.valor));
    }

    return Array.from(map.entries())
      .map(([categoriaId, total]) => {
        const cat = safeCategorias.find((c) => c.id === categoriaId);
        return { categoriaId, nome: cat?.nome || "Sem categoria", total };
      })
      .sort((a, b) => b.total - a.total);
  }, [safeTransacoes, safeCategorias, currentMonth]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>Painel Geral ({viewMode})</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 16
        }}
      >
        <div className="card">
          <div className="card-title">Receitas (mês)</div>
          <div className="card-value">{resumo.receitas.toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="card-title">Despesas (mês)</div>
          <div className="card-value">{resumo.despesas.toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="card-title">Saldo (mês)</div>
          <div className="card-value">{resumo.saldoMes.toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="card-title">Investimentos</div>
          <div className="card-value">{resumo.totalInvest.toFixed(2)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Despesas por categoria (mês)</h3>
        {byCategoria.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Sem despesas neste mês.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {byCategoria.slice(0, 10).map((row) => (
              <div
                key={row.categoriaId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: "1px solid rgba(0,0,0,0.08)",
                  paddingBottom: 6
                }}
              >
                <div>{row.nome}</div>
                <div>{row.total.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, opacity: 0.8 }}>
          Orçamento total do mês: <strong>{resumo.orcMes.toFixed(2)}</strong>
        </div>
      </div>
    </div>
  );
}
