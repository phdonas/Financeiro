import React, { useMemo, useState } from "react";

import ImportSection from "./ImportSection";
import ImportInssSection from "./ImportInssSection";

import type {
  CategoriaContabil,
  FormaPagamento,
  Fornecedor,
    ImportMappingUsed,
  Receipt,
  Transacao,
  InssRecord,
  InssYearlyConfig,
} from "../types";

import {
  downloadCsv,
  toCsv,
  formatDateISOToDMY,
  formatMoneyExcel,
  formatNumberExcel,
  formatYesNo,
  safeISODate,
} from "../lib/csvExport";

type ImportExportTab = "import" | "export" | "logs_parity";

type ExportFilterMode = "ALL" | "MONTH_YEAR" | "RANGE";

type ImportExportProps = {
  categorias: CategoriaContabil[];
  formasPagamento: FormaPagamento[];
  fornecedores: Fornecedor[];
  transacoes: Transacao[];
  receipts: Receipt[];
  inssRecords: InssRecord[];
  inssConfigs: InssYearlyConfig[];
  onSaveTx: (t: Transacao) => void;
  onSaveReceipt: (r: Receipt) => void;
  onImportInssRecords: (records: InssRecord[]) => void | Promise<void>;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymdFromParts(year: number, month: number) {
  return `${year}-${pad2(month)}`;
}

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function dateInRange(isoDate: string | undefined, startISO?: string, endISO?: string) {
  if (!isoDate) return false;
  const d = safeISODate(isoDate);
  if (!d) return false;
  const start = startISO ? safeISODate(startISO) : null;
  const end = endISO ? safeISODate(endISO) : null;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function inMonthYear(isoDate: string | undefined, ym: string) {
  if (!isoDate) return false;
  // aceita YYYY-MM ou YYYY-MM-DD
  return isoDate.startsWith(ym);
}

export default function ImportExport(props: ImportExportProps) {
  const {
    categorias,
    formasPagamento,
    fornecedores,
    transacoes,
    receipts,
    inssRecords,
    inssConfigs,
    onSaveTx,
    onSaveReceipt,
    onImportInssRecords,
  } = props;

  const [tab, setTab] = useState<ImportExportTab>("import");

  const [lastMappingUsed, setLastMappingUsed] = useState<ImportMappingUsed | null>(null);

  // Export filters
  const [filterMode, setFilterMode] = useState<ExportFilterMode>("ALL");
  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [rangeStart, setRangeStart] = useState<string>(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [rangeEnd, setRangeEnd] = useState<string>(toDateInputValue(now));

  const headerSubtitle = useMemo(() => {
    const map: Record<ImportExportTab, string> = {
      import: "Importação de planilhas (com prévia e validações — evolui no Sprint 5)",
      export: "Exportação CSV para backup e reconciliação (Sprint 5.2)",
      logs_parity: "Logs de importação e relatório de paridade (Sprint 5.3+)",
    };
    return map[tab];
  }, [tab]);

  const tabs = useMemo(
    () => [
      { id: "import", label: "Importar" },
      { id: "export", label: "Exportar" },
      { id: "logs_parity", label: "Logs / Paridade" },
    ],
    []
  );

  const categoriaById = useMemo(() => {
    const m = new Map<string, CategoriaContabil>();
    categorias.forEach((c) => m.set(c.id, c));
    return m;
  }, [categorias]);

  const contaById = useMemo(() => {
    const m = new Map<string, { contaId: string; contaNome: string; categoriaId: string; categoriaNome: string }>();
    categorias.forEach((cat) => {
      cat.contas?.forEach((ct) => {
        m.set(ct.id, { contaId: ct.id, contaNome: ct.nome, categoriaId: cat.id, categoriaNome: cat.nome });
      });
    });
    return m;
  }, [categorias]);

  const formaById = useMemo(() => {
    const m = new Map<string, FormaPagamento>();
    formasPagamento.forEach((f) => m.set(f.id, f));
    return m;
  }, [formasPagamento]);

  const fornecedorById = useMemo(() => {
    const m = new Map<string, Fornecedor>();
    fornecedores.forEach((f) => m.set(f.id, f));
    return m;
  }, [fornecedores]);

  const filterSuffix = useMemo(() => {
    if (filterMode === "MONTH_YEAR") return ymdFromParts(year, month);
    if (filterMode === "RANGE") return `${rangeStart}_${rangeEnd}`;
    return toDateInputValue(new Date());
  }, [filterMode, year, month, rangeStart, rangeEnd]);

  const applyExportFilters = useMemo(() => {
    const ym = ymdFromParts(year, month);

    const filterTx = (t: Transacao) => {
      const dateIso = t.data_competencia || t.data_prevista_pagamento;
      if (filterMode === "MONTH_YEAR") return inMonthYear(dateIso, ym);
      if (filterMode === "RANGE") return dateInRange(dateIso, rangeStart, rangeEnd);
      return true;
    };

    const filterReceipt = (r: Receipt) => {
      const dateIso = r.issue_date || r.pay_date;
      if (filterMode === "MONTH_YEAR") return inMonthYear(dateIso, ym);
      if (filterMode === "RANGE") return dateInRange(dateIso, rangeStart, rangeEnd);
      return true;
    };

    const filterInssRecord = (r: InssRecord) => {
      // vencimento é YYYY-MM-DD; competencia costuma ser YYYY-MM
      const dateIso = r.vencimento || r.competencia;
      if (filterMode === "MONTH_YEAR") return inMonthYear(dateIso, ym);
      if (filterMode === "RANGE") return dateInRange(dateIso, rangeStart, rangeEnd);
      return true;
    };

    return { filterTx, filterReceipt, filterInssRecord };
  }, [filterMode, year, month, rangeStart, rangeEnd]);

  const txPT = useMemo(
    () => transacoes.filter((t) => t.codigo_pais === "PT").filter(applyExportFilters.filterTx),
    [transacoes, applyExportFilters]
  );
  const txBR = useMemo(
    () => transacoes.filter((t) => t.codigo_pais === "BR").filter(applyExportFilters.filterTx),
    [transacoes, applyExportFilters]
  );
  const receiptsFiltered = useMemo(
    () => receipts.filter(applyExportFilters.filterReceipt),
    [receipts, applyExportFilters]
  );
  const inssRecordsFiltered = useMemo(
    () => inssRecords.filter(applyExportFilters.filterInssRecord),
    [inssRecords, applyExportFilters]
  );

  function buildLancamentosRows(list: Transacao[]) {
    return list.map((t) => {
      const cat = categoriaById.get(t.categoria_id);
      const conta = contaById.get(t.conta_contabil_id);
      const forma = formaById.get(t.forma_pagamento_id);
      const forn = t.fornecedor_id ? fornecedorById.get(t.fornecedor_id) : undefined;

      return {
        id: t.id,
        pais: t.codigo_pais,
        data_competencia: formatDateISOToDMY(t.data_competencia),
        data_prevista_pagamento: formatDateISOToDMY(t.data_prevista_pagamento),
        tipo: t.tipo,
        status: t.status,
        categoria: cat?.nome || "",
        categoria_id: t.categoria_id,
        conta: conta?.contaNome || "",
        conta_id: t.conta_contabil_id,
        forma_pagamento: forma?.nome || "",
        forma_pagamento_id: t.forma_pagamento_id,
        fornecedor: forn?.nome || "",
        fornecedor_id: t.fornecedor_id || "",
        descricao: t.description || "",
        observacao: t.observacao || "",
        valor: formatMoneyExcel(t.valor),
        origem: t.origem,
        receipt_id: t.receipt_id || "",
        inss_record_id: t.inss_record_id || "",
        recorrencia_grupo_id: t.recorrencia_grupo_id || "",
        recorrencia_seq: typeof t.recorrencia_seq === "number" ? String(t.recorrencia_seq) : "",
      };
    });
  }

  function buildReceiptsRows(list: Receipt[]) {
    return list.map((r) => {
      const cat = categoriaById.get(r.categoria_id);
      const conta = contaById.get(r.conta_contabil_id);
      const forma = formaById.get(r.forma_pagamento_id);
      const forn = fornecedorById.get(r.fornecedor_id);

      return {
        id: r.id,
        internal_id: r.internal_id,
        pais: r.country_code,
        data_emissao: formatDateISOToDMY(r.issue_date),
        data_pagamento: formatDateISOToDMY(r.pay_date),
        fornecedor: forn?.nome || "",
        fornecedor_id: r.fornecedor_id,
        categoria: cat?.nome || "",
        categoria_id: r.categoria_id,
        conta: conta?.contaNome || "",
        conta_id: r.conta_contabil_id,
        forma_pagamento: forma?.nome || "",
        forma_pagamento_id: r.forma_pagamento_id,
        base_amount: formatMoneyExcel(r.base_amount),
        irs_rate: r.irs_rate != null ? formatNumberExcel(r.irs_rate, 4) : "",
        irs_amount: r.irs_amount != null ? formatMoneyExcel(r.irs_amount) : "",
        iva_rate: r.iva_rate != null ? formatNumberExcel(r.iva_rate, 4) : "",
        iva_amount: r.iva_amount != null ? formatMoneyExcel(r.iva_amount) : "",
        inss_rate: r.inss_rate != null ? formatNumberExcel(r.inss_rate, 4) : "",
        inss_amount: r.inss_amount != null ? formatMoneyExcel(r.inss_amount) : "",
        irpf_rate: r.irpf_rate != null ? formatNumberExcel(r.irpf_rate, 4) : "",
        irpf_amount: r.irpf_amount != null ? formatMoneyExcel(r.irpf_amount) : "",
        net_amount: formatMoneyExcel(r.net_amount),
        received_amount: formatMoneyExcel(r.received_amount),
        descricao: r.description || "",
        pago: formatYesNo(!!r.is_paid),
        flag_calcula_premiacao: formatYesNo(!!r.flag_calcula_premiacao),
        transacao_id: r.transacao_id || "",
        document_url: r.document_url || "",
      };
    });
  }

  function buildInssRecordsRows(list: InssRecord[]) {
    return list.map((r) => ({
      id: r.id,
      quem: r.quem,
      competencia: r.competencia || "",
      vencimento: formatDateISOToDMY(r.vencimento),
      numero_parcela: String(r.numero_parcela),
      status: r.status,
      valor: formatMoneyExcel(r.valor),
      salario_base: formatMoneyExcel(r.salario_base),
      transacao_id: r.transacao_id || "",
    }));
  }

  function buildInssConfigsRows(list: InssYearlyConfig[]) {
    return list
      .slice()
      .sort((a, b) => (a.ano || 0) - (b.ano || 0))
      .map((c) => ({
        ano: String(c.ano),
        salario_base: formatMoneyExcel(c.salario_base),
        percentual_inss: formatNumberExcel(c.percentual_inss, 4),
        paulo_nit: c.paulo?.nit || "",
        paulo_total_parcelas: String(c.paulo?.total_parcelas ?? ""),
        paulo_data_aposentadoria: c.paulo?.data_aposentadoria || "",
        debora_nit: c.debora?.nit || "",
        debora_total_parcelas: String(c.debora?.total_parcelas ?? ""),
        debora_data_aposentadoria: c.debora?.data_aposentadoria || "",
      }));
  }

  function doExportLancamentos(pais: "PT" | "BR") {
    const list = pais === "PT" ? txPT : txBR;
    const rows = buildLancamentosRows(list);
    const filename = `export_lancamentos_${pais}_${filterSuffix}.csv`;
    downloadCsv(filename, toCsv(rows, ";"));
  }

  function doExportReceipts() {
    const rows = buildReceiptsRows(receiptsFiltered);
    const filename = `export_recibos_${filterSuffix}.csv`;
    downloadCsv(filename, toCsv(rows, ";"));
  }

  function doExportInss() {
    // Blueprint menciona INSS como entidade, mas internamente há Records e Configs.
    // Para manter auditabilidade, exportamos ambos (2 arquivos) com nomes padronizados.
    const rowsRecords = buildInssRecordsRows(inssRecordsFiltered);
    const f1 = `export_inss_records_${filterSuffix}.csv`;
    downloadCsv(f1, toCsv(rowsRecords, ";"));

    const rowsConfigs = buildInssConfigsRows(inssConfigs);
    const f2 = `export_inss_configs_${filterSuffix}.csv`;
    downloadCsv(f2, toCsv(rowsConfigs, ";"));
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 pb-24 animate-in fade-in duration-700">
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">
          Importar / Exportar
        </h2>
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] italic opacity-60">
          {headerSubtitle}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as ImportExportTab)}
            className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
              tab === (t.id as ImportExportTab)
                ? "bg-bb-blue text-white border-bb-blue shadow"
                : "bg-white text-bb-blue border-gray-200 hover:border-bb-blue"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === "import" && (
        <div className="space-y-4">
          <ImportSection
            categorias={categorias}
            formasPagamento={formasPagamento}
            fornecedores={fornecedores}
            onSaveTx={onSaveTx}
            onSaveReceipt={onSaveReceipt}
            onMappingUsed={(m) => setLastMappingUsed(m)}
          />

          <ImportInssSection
            inssRecords={inssRecords}
            inssConfigs={inssConfigs}
            onImportInssRecords={onImportInssRecords}
          />
        </div>
      )}

      {tab === "export" && (
        <div className="space-y-4">
          <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-black text-bb-blue italic uppercase tracking-tighter leading-none">
                Exportação CSV (Sprint 5.2)
              </h3>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Gera arquivos CSV com separador <b>;</b>, com <b>BOM UTF-8</b> e valores em formato compatível com Excel (vírgula decimal).
                Você pode filtrar por mês/ano ou por intervalo de datas.
              </p>
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                  Filtro
                </div>
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[12px]"
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as ExportFilterMode)}
                >
                  <option value="ALL">Todos</option>
                  <option value="MONTH_YEAR">Mês / Ano</option>
                  <option value="RANGE">Intervalo</option>
                </select>
              </div>

              {filterMode === "MONTH_YEAR" && (
                <>
                  <div className="space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Mês
                    </div>
                    <select
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[12px]"
                      value={month}
                      onChange={(e) => setMonth(Number(e.target.value))}
                    >
                      {Array.from({ length: 12 }).map((_, i) => {
                        const v = i + 1;
                        return (
                          <option key={v} value={v}>
                            {pad2(v)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Ano
                    </div>
                    <input
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[12px]"
                      type="number"
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                    />
                  </div>
                </>
              )}

              {filterMode === "RANGE" && (
                <>
                  <div className="space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Início
                    </div>
                    <input
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[12px]"
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Fim
                    </div>
                    <input
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[12px]"
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Botões */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => doExportLancamentos("PT")}
                className="rounded-2xl border border-gray-200 bg-white hover:border-bb-blue px-4 py-3 text-left transition-all"
              >
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] italic">
                  Lançamentos PT
                </div>
                <div className="text-sm font-black text-bb-blue italic uppercase tracking-tight">
                  Exportar CSV
                </div>
                <div className="text-[11px] text-gray-600 mt-1">
                  Linhas: <b>{txPT.length}</b>
                </div>
              </button>

              <button
                type="button"
                onClick={() => doExportLancamentos("BR")}
                className="rounded-2xl border border-gray-200 bg-white hover:border-bb-blue px-4 py-3 text-left transition-all"
              >
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] italic">
                  Lançamentos BR
                </div>
                <div className="text-sm font-black text-bb-blue italic uppercase tracking-tight">
                  Exportar CSV
                </div>
                <div className="text-[11px] text-gray-600 mt-1">
                  Linhas: <b>{txBR.length}</b>
                </div>
              </button>

              <button
                type="button"
                onClick={doExportReceipts}
                className="rounded-2xl border border-gray-200 bg-white hover:border-bb-blue px-4 py-3 text-left transition-all"
              >
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] italic">
                  Recibos
                </div>
                <div className="text-sm font-black text-bb-blue italic uppercase tracking-tight">
                  Exportar CSV
                </div>
                <div className="text-[11px] text-gray-600 mt-1">
                  Linhas: <b>{receiptsFiltered.length}</b>
                </div>
              </button>

              <button
                type="button"
                onClick={doExportInss}
                className="rounded-2xl border border-gray-200 bg-white hover:border-bb-blue px-4 py-3 text-left transition-all"
              >
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] italic">
                  INSS (Records + Configs)
                </div>
                <div className="text-sm font-black text-bb-blue italic uppercase tracking-tight">
                  Exportar CSV
                </div>
                <div className="text-[11px] text-gray-600 mt-1">
                  Records: <b>{inssRecordsFiltered.length}</b> • Configs: <b>{inssConfigs.length}</b>
                </div>
              </button>
            </div>

            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] italic opacity-60">
              Dica: abra no Excel e confirme separador “;”, vírgula decimal e acentuação. Se aparecer tudo em uma coluna, revise o separador do Excel.
            </div>
          </div>
        </div>
      )}

      {tab === "logs_parity" && (
        <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-8 space-y-3">
          <h3 className="text-lg font-black text-bb-blue italic uppercase tracking-tighter leading-none">
            Logs / Paridade (Sprint 5.3+)
          </h3>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Nesta etapa, serão adicionados:
          </p>
          <ul className="list-disc ml-5 text-[11px] text-gray-600 space-y-1">
            <li>Exibir logs de importação (com totais, dedupe e usuário).</li>
            <li>Gerar relatório de paridade por mês/país/categoria/conta.</li>
            <li>Destacar divergências e sugerir correções/deduplicação.</li>
          </ul>
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] italic opacity-60">
            Placeholder — estrutura pronta para evoluir sem regressões.
          </div>
        </div>
      )}
    </div>
  );
}
