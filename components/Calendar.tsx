import React, { useMemo, useState } from "react";
import { InssRecord, Transacao, TipoTransacao } from "../types";

type PaisFiltro = "GLOBAL" | "PT" | "BR";

type Props = {
  transacoes: Transacao[];
  inssRecords?: InssRecord[];
  householdId?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseDateBR(value?: string): Date | null {
  if (!value) return null;

  // ISO (YYYY-MM-DD) ou ISO completo
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  // dd/mm/aaaa
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const d = new Date(yyyy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // fallback
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatMoney(value: number, codigo_pais: "PT" | "BR") {
  const currency = codigo_pais === "PT" ? "EUR" : "BRL";
  try {
    return new Intl.NumberFormat(codigo_pais === "PT" ? "pt-PT" : "pt-BR", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function monthNamePT(monthIdx: number) {
  const d = new Date(2020, monthIdx, 1);
  return d.toLocaleDateString("pt-PT", { month: "long" });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(d: Date, days: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

function createIcsAllDayEvent(args: {
  uid: string;
  summary: string;
  date: Date; // all-day
  description?: string;
}) {
  const y = args.date.getFullYear();
  const m = pad2(args.date.getMonth() + 1);
  const dd = pad2(args.date.getDate());
  const dt = `${y}${m}${dd}`;

  // all-day events use DTEND as next day
  const dtEndDate = addDays(args.date, 1);
  const y2 = dtEndDate.getFullYear();
  const m2 = pad2(dtEndDate.getMonth() + 1);
  const dd2 = pad2(dtEndDate.getDate());
  const dtEnd = `${y2}${m2}${dd2}`;

  const esc = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");

  return [
    "BEGIN:VEVENT",
    `UID:${esc(args.uid)}`,
    `DTSTAMP:${dt}T000000Z`,
    `DTSTART;VALUE=DATE:${dt}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${esc(args.summary)}`,
    args.description ? `DESCRIPTION:${esc(args.description)}` : undefined,
    "END:VEVENT",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export default function Calendar({ transacoes, inssRecords = [], householdId }: Props) {
  const today = new Date();

  const [pais, setPais] = useState<PaisFiltro>("PT");
  const [mes, setMes] = useState<number>(today.getMonth());
  const [ano, setAno] = useState<number>(today.getFullYear());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const years = useMemo(() => {
    const ys = new Set<number>([today.getFullYear()]);
    for (const t of transacoes || []) {
      const d = parseDateBR(t?.data_prevista_pagamento) || parseDateBR(t?.data_competencia);
      if (d) ys.add(d.getFullYear());
    }
    for (const r of inssRecords || []) {
      const d = parseDateBR(r?.vencimento);
      if (d) ys.add(d.getFullYear());
    }
    const arr = Array.from(ys).sort((a, b) => b - a);
    // garante pelo menos um range razoável
    if (arr.length < 5) {
      const base = today.getFullYear();
      for (let y = base - 2; y <= base + 2; y++) ys.add(y);
      return Array.from(ys).sort((a, b) => b - a);
    }
    return arr;
  }, [transacoes, inssRecords]);

  const filteredTx = useMemo(() => {
    const base = Array.isArray(transacoes) ? transacoes : [];
    return base.filter((t) => {
      if (!t) return false;
      if (pais !== "GLOBAL" && t.codigo_pais !== pais) return false;

      const d =
        parseDateBR(t.data_prevista_pagamento) ||
        parseDateBR(t.data_competencia) ||
        null;

      if (!d) return false;
      return d.getFullYear() === ano && d.getMonth() === mes;
    });
  }, [transacoes, pais, ano, mes]);

  const filteredInss = useMemo(() => {
    const base = Array.isArray(inssRecords) ? inssRecords : [];
    // INSS é Brasil, mas no modo GLOBAL entra também
    return base.filter((r) => {
      if (!r) return false;
      if (pais === "PT") return false;
      const d = parseDateBR(r.vencimento);
      if (!d) return false;
      return d.getFullYear() === ano && d.getMonth() === mes;
    });
  }, [inssRecords, pais, ano, mes]);

  const txByDay = useMemo(() => {
    const map = new Map<string, Transacao[]>();
    for (const t of filteredTx) {
      const d =
        parseDateBR(t.data_prevista_pagamento) ||
        parseDateBR(t.data_competencia) ||
        null;
      if (!d) continue;
      const k = dateKey(d);
      const arr = map.get(k) || [];
      arr.push(t);
      map.set(k, arr);
    }
    // ordena: receitas primeiro? No Google não, mas fica melhor: despesas e receitas misturadas.
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        const aIsRec = a.tipo === TipoTransacao.RECEITA;
        const bIsRec = b.tipo === TipoTransacao.RECEITA;
        if (aIsRec !== bIsRec) return aIsRec ? -1 : 1;
        return (b.valor || 0) - (a.valor || 0);
      });
      map.set(k, arr);
    }
    return map;
  }, [filteredTx]);

  const inssByDay = useMemo(() => {
    const map = new Map<string, InssRecord[]>();
    for (const r of filteredInss) {
      const d = parseDateBR(r.vencimento);
      if (!d) continue;
      const k = dateKey(d);
      const arr = map.get(k) || [];
      arr.push(r);
      map.set(k, arr);
    }
    return map;
  }, [filteredInss]);

  const monthGrid = useMemo(() => {
    const first = new Date(ano, mes, 1);
    const start = new Date(first);
    // semana começa na segunda (pt-PT), então: 0=domingo, 1=segunda...
    const dow = first.getDay(); // 0..6
    const offset = dow === 0 ? 6 : dow - 1; // quantos dias voltar para segunda
    start.setDate(first.getDate() - offset);

    const days: Date[] = [];
    for (let i = 0; i < 42; i++) days.push(addDays(start, i)); // 6 semanas
    return days;
  }, [ano, mes]);

  const dayDetails = useMemo(() => {
    if (!selectedDayKey) return { tx: [] as Transacao[], inss: [] as InssRecord[] };
    return {
      tx: txByDay.get(selectedDayKey) || [],
      inss: inssByDay.get(selectedDayKey) || [],
    };
  }, [selectedDayKey, txByDay, inssByDay]);

  const goToday = () => {
    const d = new Date();
    setAno(d.getFullYear());
    setMes(d.getMonth());
  };

  const navMonth = (delta: number) => {
    const d = new Date(ano, mes, 1);
    d.setMonth(d.getMonth() + delta);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  };

  const exportIcs = () => {
    // Dedupe: se um INSS tiver transacao_id existente no mês, não exportar o record separado
    const txIds = new Set(filteredTx.map((t) => t.id));
    const inssToExport = filteredInss.filter((r) => !r.transacao_id || !txIds.has(r.transacao_id));

    const events: string[] = [];

    for (const t of filteredTx) {
      const d =
        parseDateBR(t.data_prevista_pagamento) ||
        parseDateBR(t.data_competencia) ||
        null;
      if (!d) continue;

      const isRec = t.tipo === TipoTransacao.RECEITA;
      const money = formatMoney(Number(t.valor || 0), t.codigo_pais);
      const prefix = isRec ? "Receita" : "Despesa";
      const summary = `${prefix}: ${t.description} (${money})`;

      events.push(
        createIcsAllDayEvent({
          uid: `financeiro-${householdId || "house"}-tx-${t.id}@financefamily`,
          summary,
          date: d,
          description: `Pais=${t.codigo_pais}; Status=${t.status}; Tipo=${t.tipo}; ID=${t.id}`,
        })
      );
    }

    for (const r of inssToExport) {
      const d = parseDateBR(r.vencimento);
      if (!d) continue;

      const money = formatMoney(Number(r.valor || 0), "BR");
      const summary = `Despesa: INSS ${r.quem} Parc ${r.numero_parcela} (${money})`;

      events.push(
        createIcsAllDayEvent({
          uid: `financeiro-${householdId || "house"}-inss-${r.id}@financefamily`,
          summary,
          date: d,
          description: `Pais=BR; Status=${r.status}; Competencia=${r.competencia}; ID=${r.id}`,
        })
      );
    }

    const header = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FinanceFamily//Financeiro//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ].join("\r\n");

    const footer = "END:VCALENDAR";
    const ics = [header, ...events, footer].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const monthStr = pad2(mes + 1);
    const paisStr = pais.toLowerCase();
    a.href = url;
    a.download = `financeiro_${paisStr}_${ano}-${monthStr}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const dayNames = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const monthLabel = `${monthNamePT(mes)} ${ano}`;

  const styles: Record<string, React.CSSProperties> = {
    page: { padding: 16 },
    toolbar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 12,
    },
    title: { fontSize: 20, fontWeight: 700 },
    controlsRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
    btn: {
      border: "1px solid #d0d7de",
      background: "#fff",
      borderRadius: 8,
      padding: "6px 10px",
      cursor: "pointer",
      fontSize: 13,
    },
    select: {
      border: "1px solid #d0d7de",
      borderRadius: 8,
      padding: "6px 10px",
      background: "#fff",
      fontSize: 13,
      cursor: "pointer",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: 6,
    },
    dayHeader: {
      fontSize: 12,
      fontWeight: 700,
      color: "#57606a",
      padding: "6px 8px",
      textAlign: "center",
    },
    cell: {
      border: "1px solid #e6e8eb",
      borderRadius: 10,
      minHeight: 110,
      padding: 8,
      background: "#fff",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      overflow: "hidden",
    },
    cellMuted: {
      background: "#fafbfc",
      color: "#8c959f",
    },
    dayNumberRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
    dayNumber: { fontSize: 12, fontWeight: 700 },
    todayDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      background: "#1f6feb",
      display: "inline-block",
    },
    items: { display: "flex", flexDirection: "column", gap: 4 },
    item: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12,
      lineHeight: "14px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      padding: "2px 6px",
      borderRadius: 6,
    },
    itemRec: { background: "rgba(46, 160, 67, 0.12)", color: "#1a7f37" },
    itemDesp: { background: "rgba(248, 81, 73, 0.12)", color: "#cf222e" },
    itemAux: { background: "rgba(9, 105, 218, 0.10)", color: "#0969da" },
    more: { fontSize: 12, color: "#57606a", paddingLeft: 4 },
    modalOverlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.25)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 50,
    },
    modal: {
      width: "min(720px, 96vw)",
      maxHeight: "80vh",
      background: "#fff",
      borderRadius: 14,
      border: "1px solid #e6e8eb",
      overflow: "hidden",
      boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
    },
    modalHeader: {
      padding: "12px 14px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottom: "1px solid #e6e8eb",
      background: "#fafbfc",
    },
    modalBody: { padding: 14, overflow: "auto" },
    listRow: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      padding: "8px 10px",
      border: "1px solid #e6e8eb",
      borderRadius: 10,
      marginBottom: 8,
      alignItems: "center",
    },
    listLeft: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
    listTitle: { fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" },
    listMeta: { fontSize: 12, color: "#57606a" },
    listValue: { fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" },
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <div style={styles.title}>Agenda Financeira</div>

        <div style={styles.controlsRow}>
          <button style={styles.btn} onClick={() => navMonth(-1)} title="Mês anterior">
            ◀
          </button>

          <span style={{ fontWeight: 700, textTransform: "capitalize" }}>{monthLabel}</span>

          <button style={styles.btn} onClick={() => navMonth(1)} title="Próximo mês">
            ▶
          </button>

          <button style={styles.btn} onClick={goToday}>
            Hoje
          </button>

          <select style={styles.select} value={pais} onChange={(e) => setPais(e.target.value as PaisFiltro)}>
            <option value="PT">PT</option>
            <option value="BR">BR</option>
            <option value="GLOBAL">GLOBAL</option>
          </select>

          <select style={styles.select} value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {monthNamePT(m)}
              </option>
            ))}
          </select>

          <select style={styles.select} value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button style={styles.btn} onClick={exportIcs} title="Exportar para Google Agenda (ICS)">
            Exportar (.ics)
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        {dayNames.map((d) => (
          <div key={d} style={styles.dayHeader}>
            {d}
          </div>
        ))}

        {monthGrid.map((d) => {
          const inMonth = d.getMonth() === mes;
          const k = dateKey(d);
          const itemsTx = txByDay.get(k) || [];
          const itemsInss = inssByDay.get(k) || [];

          // Dedupe visual: se um INSS tem transacao_id e esta transação está no dia, não mostrar INSS separado
          const idsInDay = new Set(itemsTx.map((t) => t.id));
          const inssToShow = itemsInss.filter((r) => !r.transacao_id || !idsInDay.has(r.transacao_id));

          const merged = [
            ...itemsTx.map((t) => ({ kind: "tx" as const, t })),
            ...inssToShow.map((r) => ({ kind: "inss" as const, r })),
          ];

          const maxLines = 4;
          const visible = merged.slice(0, maxLines);
          const remaining = merged.length - visible.length;

          const isToday = isSameDay(d, today);

          return (
            <div
              key={k}
              style={{ ...styles.cell, ...(inMonth ? {} : styles.cellMuted) }}
              onClick={() => setSelectedDayKey(k)}
              title="Clique para ver detalhes do dia"
            >
              <div style={styles.dayNumberRow}>
                <div style={styles.dayNumber}>{d.getDate()}</div>
                {isToday ? <span style={styles.todayDot} /> : <span />}
              </div>

              <div style={styles.items}>
                {visible.map((it, idx) => {
                  if (it.kind === "tx") {
                    const t = it.t;
                    const isRec = t.tipo === TipoTransacao.RECEITA;
                    const money = formatMoney(Number(t.valor || 0), t.codigo_pais);
                    const text = `${t.description} ${money}`;
                    return (
                      <div
                        key={`tx-${t.id}-${idx}`}
                        style={{
                          ...styles.item,
                          ...(isRec ? styles.itemRec : styles.itemDesp),
                        }}
                      >
                        {text}
                      </div>
                    );
                  }

                  const r = it.r;
                  const money = formatMoney(Number(r.valor || 0), "BR");
                  const text = `INSS ${r.quem} ${money}`;
                  return (
                    <div key={`inss-${r.id}-${idx}`} style={{ ...styles.item, ...styles.itemDesp }}>
                      {text}
                    </div>
                  );
                })}

                {remaining > 0 && <div style={styles.more}>+{remaining} mais…</div>}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDayKey && (
        <div style={styles.modalOverlay} onClick={() => setSelectedDayKey(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ fontWeight: 700 }}>
                Detalhes do dia:{" "}
                {(() => {
                  const [y, m, d] = selectedDayKey.split("-");
                  return `${d}/${m}/${y}`;
                })()}
              </div>
              <button style={styles.btn} onClick={() => setSelectedDayKey(null)}>
                Fechar
              </button>
            </div>

            <div style={styles.modalBody}>
              {dayDetails.tx.length === 0 && dayDetails.inss.length === 0 && (
                <div style={{ color: "#57606a" }}>Sem lançamentos neste dia.</div>
              )}

              {dayDetails.tx.map((t) => {
                const isRec = t.tipo === TipoTransacao.RECEITA;
                const money = formatMoney(Number(t.valor || 0), t.codigo_pais);
                return (
                  <div key={t.id} style={styles.listRow}>
                    <div style={styles.listLeft}>
                      <div style={styles.listTitle}>{t.description}</div>
                      <div style={styles.listMeta}>
                        {t.codigo_pais} • {t.tipo} • {t.status}
                      </div>
                    </div>
                    <div style={{ ...styles.listValue, color: isRec ? "#1a7f37" : "#cf222e" }}>
                      {money}
                    </div>
                  </div>
                );
              })}

              {/* INSS sem transação vinculada */}
              {(() => {
                const ids = new Set(dayDetails.tx.map((t) => t.id));
                const list = dayDetails.inss.filter((r) => !r.transacao_id || !ids.has(r.transacao_id));
                return list.map((r) => {
                  const money = formatMoney(Number(r.valor || 0), "BR");
                  return (
                    <div key={r.id} style={styles.listRow}>
                      <div style={styles.listLeft}>
                        <div style={styles.listTitle}>{`INSS ${r.quem} Parc ${r.numero_parcela}`}</div>
                        <div style={styles.listMeta}>{`BR • ${r.status} • Comp ${r.competencia}`}</div>
                      </div>
                      <div style={{ ...styles.listValue, color: "#cf222e" }}>{money}</div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
