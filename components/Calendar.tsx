import React, { useMemo } from "react";

type Transacao = {
  id: string;
  date?: string; // ISO ou dd/mm/aaaa (depende do seu app)
  descricao?: string;
  valor?: number | string;
  tipo?: "DESPESA" | "RECEITA" | string;
  pg?: boolean;
  pago?: boolean;
};

type Props = {
  transacoes?: Transacao[];
};

export default function Calendar({ transacoes }: Props) {
  const txs = useMemo(
    () => (Array.isArray(transacoes) ? transacoes : []),
    [transacoes]
  );

  // exemplo: próximos lançamentos (não pagos)
  const proximos = useMemo(() => {
    return txs
      .filter((t) => !t?.pago)
      .slice(0, 50);
  }, [txs]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        Agenda Financeira
      </h2>

      {proximos.length === 0 ? (
        <div>Nenhum lançamento pendente.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {proximos.map((t) => (
            <div
              key={t.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 10
              }}
            >
              <div style={{ fontWeight: 700 }}>{t?.descricao || "Sem descrição"}</div>
              <div>Data: {t?.date || "—"}</div>
              <div>Tipo: {t?.tipo || "—"}</div>
              <div>Valor: {Number(t?.valor ?? 0)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
