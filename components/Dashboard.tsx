import React, { useMemo } from "react";

type ExchangeRates = Record<string, number>;

type Categoria = { id: string; nome: string };

type Transacao = {
  id: string;
  tipo?: "DESPESA" | "RECEITA" | string;
  valor?: number | string;
  codigo_pais?: string;
  date?: string;
  categoria_id?: string;
};

type Investimento = {
  id: string;
  current_value?: number | string;
  country_code?: string;
};

type Props = {
  transacoes?: Transacao[];
  categorias?: Categoria[];
  investments?: Investimento[];
  exchangeRates?: ExchangeRates;
};

export default function Dashboard({
  transacoes,
  categorias,
  investments,
  exchangeRates
}: Props) {
  const txs = useMemo(() => (Array.isArray(transacoes) ? transacoes : []), [transacoes]);
  const cats = useMemo(() => (Array.isArray(categorias) ? categorias : []), [categorias]);
  const invs = useMemo(() => (Array.isArray(investments) ? investments : []), [investments]);
  const rates = exchangeRates || {};

  const getVal = (valor: any, codigo_pais?: string) => {
    const v = Number(valor ?? 0);
    if (!codigo_pais) return v;
    const rate = rates[codigo_pais];
    if (!rate || Number.isNaN(rate)) return v;
    return v * rate;
  };

  const total = useMemo(() => {
    return txs.reduce((acc, t) => acc + getVal(t?.valor, t?.codigo_pais), 0);
  }, [txs, rates]);

  const saldoLedger = useMemo(() => {
    return txs.reduce((acc, t) => {
      const v = getVal(t?.valor, t?.codigo_pais);
      if (t?.tipo === "RECEITA") return acc + v;
      if (t?.tipo === "DESPESA") return acc - v;
      return acc;
    }, 0);
  }, [txs, rates]);

  const capitalInvestido = useMemo(() => {
    return invs.reduce((acc, a) => {
      const v = Number(a?.current_value ?? 0);
      // se quiser converter por país depois, dá para aplicar taxa aqui
      return acc + v;
    }, 0);
  }, [invs]);

  // Exemplo por categoria (somando despesas)
  const porCategoria = useMemo(() => {
    return cats.map((cat) => {
      const val = txs
        .filter((t) => t?.tipo === "DESPESA" && t?.categoria_id === cat.id)
        .reduce((acc, t) => acc + getVal(t?.valor, t?.codigo_pais), 0);

      return { categoria: cat.nome, total: val };
    });
  }, [txs, cats, rates]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        Painel Geral
      </h2>

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <div>Saldo (Ledger): {saldoLedger}</div>
        <div>Total Transações (bruto): {total}</div>
        <div>Capital Investido: {capitalInvestido}</div>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
        Despesas por Categoria
      </h3>
      <div style={{ display: "grid", gap: 6 }}>
        {porCategoria.map((x) => (
          <div key={x.categoria}>
            {x.categoria}: {x.total}
          </div>
        ))}
      </div>
    </div>
  );
}
