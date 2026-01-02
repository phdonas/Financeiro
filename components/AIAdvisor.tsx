import React, { useMemo, useState } from "react";
import type { Categoria, Orcamento, Transacao, Investment } from "../types";

export type AIAdvisorProps = {
  transacoes?: Transacao[];
  categorias?: Categoria[];
  orcamentos?: Orcamento[];
  investments?: Investment[];
  viewMode: "local" | "cloud";
};

export default function AIAdvisor({
  transacoes = [],
  categorias = [],
  orcamentos = [],
  investments = [],
  viewMode
}: AIAdvisorProps) {
  const safeTransacoes = Array.isArray(transacoes) ? transacoes : [];
  const safeInvestments = Array.isArray(investments) ? investments : [];

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  const summary = useMemo(() => {
    const totalGasto = safeTransacoes
      .filter((t) => t.tipo === "DESPESA")
      .reduce((acc, t) => acc + (Number(t.valor) || 0), 0);

    const totalRecebido = safeTransacoes
      .filter((t) => t.tipo === "RECEITA")
      .reduce((acc, t) => acc + (Number(t.valor) || 0), 0);

    const patrimonio = safeInvestments.reduce((acc, a) => acc + (Number(a.current_value) || 0), 0);

    return { totalGasto, totalRecebido, patrimonio };
  }, [safeTransacoes, safeInvestments]);

  async function handleAsk() {
    setLoading(true);
    try {
      // Aqui você pode integrar com IA depois.
      // Por enquanto, só demonstramos o “resumo” sem quebrar o app.
      const txt = [
        `Modo: ${viewMode}`,
        `Receita: ${summary.totalRecebido.toFixed(2)}`,
        `Despesa: ${summary.totalGasto.toFixed(2)}`,
        `Patrimônio: ${summary.patrimonio.toFixed(2)}`
      ].join("\n");

      setResult(txt);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Consultor IA</h1>
        <div className="text-xs px-3 py-1 rounded-full bg-white border">
          {viewMode === "cloud" ? "Nuvem ativa" : "Modo local ativo"}
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4">
        <button
          onClick={handleAsk}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-60"
        >
          {loading ? "Analisando..." : "Gerar diagnóstico"}
        </button>

        <pre className="mt-4 whitespace-pre-wrap text-sm">{result}</pre>
      </div>
    </div>
  );
}
