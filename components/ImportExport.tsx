import React, { useMemo, useState } from "react";

import ImportSection from "./ImportSection";

import type {
  CategoriaContabil,
  FormaPagamento,
  Fornecedor,
  Receipt,
  Transacao,
} from "../types";

type ImportExportTab = "import" | "export" | "logs_parity";

type ImportExportProps = {
  categorias: CategoriaContabil[];
  formasPagamento: FormaPagamento[];
  fornecedores: Fornecedor[];

  // Dados atuais (usados em sprints seguintes)
  transacoes: Transacao[];
  receipts: Receipt[];

  // Callbacks para persistência (cloud/local já tratado no App)
  onSaveTx: (t: Transacao) => void;
  onSaveReceipt: (r: Receipt) => void;
};

export default function ImportExport(props: ImportExportProps) {
  const {
    categorias,
    formasPagamento,
    fornecedores,
    transacoes,
    receipts,
    onSaveTx,
    onSaveReceipt,
  } = props;

  const [tab, setTab] = useState<ImportExportTab>("import");

  const headerSubtitle = useMemo(() => {
    const map: Record<ImportExportTab, string> = {
      import: "Importação de planilhas (com prévia e validações — evolui no Sprint 5)",
      export: "Exportação CSV para backup e reconciliação (Sprint 5.2)",
      logs_parity:
        "Logs de importação e relatório de paridade (Sprint 5.3+)",
    };
    return map[tab];
  }, [tab]);

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
        {[
          { id: "import", label: "Importar" },
          { id: "export", label: "Exportar" },
          { id: "logs_parity", label: "Logs / Paridade" },
        ].map((t) => (
          <button
            key={t.id}
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
        <ImportSection
          categorias={categorias}
          formasPagamento={formasPagamento}
          fornecedores={fornecedores}
          onSaveTx={onSaveTx}
          onSaveReceipt={onSaveReceipt}
        />
      )}

      {tab === "export" && (
        <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-8 space-y-3">
          <h3 className="text-lg font-black text-bb-blue italic uppercase tracking-tighter leading-none">
            Exportação (Sprint 5.2)
          </h3>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Nesta etapa, serão adicionados botões para exportar CSV (separador “;”) de:
            Lançamentos PT, Lançamentos BR, Recibos e INSS.
          </p>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Dados atuais em memória: {transacoes?.length ?? 0} lançamentos e {receipts?.length ?? 0} recibos.
          </p>
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] italic opacity-60">
            Placeholder — não altera dados nem fluxo existente.
          </div>
        </div>
      )}

      {tab === "logs_parity" && (
        <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-8 space-y-3">
          <h3 className="text-lg font-black text-bb-blue italic uppercase tracking-tighter leading-none">
            Logs / Paridade (Sprint 5.3+)
          </h3>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Esta aba será usada para:
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
