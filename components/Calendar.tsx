import React, { useMemo, useState } from "react";
import type { Transacao } from "../types";

export type CalendarProps = {
  transacoes?: Transacao[];
};

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Calendar({ transacoes = [] }: CalendarProps) {
  const safeTransacoes = Array.isArray(transacoes) ? transacoes : [];

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const items = useMemo(() => {
    // filtro por mês: YYYY-MM
    return safeTransacoes.filter((t) => {
      const d = (t.data || "").toString();
      return d.startsWith(selectedMonth);
    });
  }, [safeTransacoes, selectedMonth]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Agenda Financeira</h1>

        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="border rounded-lg px-3 py-2 bg-white"
        />
      </div>

      <div className="bg-white border rounded-xl p-4">
        {items.length === 0 ? (
          <div className="text-sm opacity-70">Sem lançamentos no mês selecionado.</div>
        ) : (
          <div className="space-y-2">
            {items.map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b last:border-b-0 py-2">
                <div>
                  <div className="text-sm font-medium">{t.descricao || "Sem descrição"}</div>
                  <div className="text-xs opacity-70">{t.data || "-"}</div>
                </div>
                <div className="text-sm font-semibold">{Number(t.valor || 0).toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
