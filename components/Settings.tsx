import React, { useMemo, useState } from "react";
import { TipoTransacao, InssYearlyConfig } from "../types";

type CountryCode = "PT" | "BR";

type ContaItem = {
  id: string;
  nome: string;
  codigo_pais: CountryCode;
  fornecedor_padrao?: string;
  observacao?: string;
};

type Categoria = {
  id: string;
  nome: string;
  cor?: string;
  countryCode?: CountryCode;
  // Campos do modelo "novo" (cloud) – usados em Ledger
  tipo?: TipoTransacao;
  contas?: ContaItem[];
};

type FormaPagamentoCategoria = "BANCO" | "CARTAO" | "DINHEIRO";

type FormaPagamento = {
  id: string;
  nome: string;
  categoria: FormaPagamentoCategoria;
  countryCode?: CountryCode;
};

type Fornecedor = {
  id: string;
  nome: string;
  countryCode?: CountryCode;
};

type Orcamento = {
  id: string;
  countryCode: CountryCode;
  categoriaId: string;
  valor: number;
};

interface SettingsProps {
  categorias: Categoria[];
  formasPagamento: FormaPagamento[];
  fornecedores: Fornecedor[];
  orcamentos: Orcamento[];

  onSaveCategoria: (c: Categoria) => void;
  onDeleteCategoria: (id: string) => void;

  onSaveFormaPagamento: (fp: FormaPagamento) => void;
  onDeleteFormaPagamento: (id: string) => void;

  onSaveFornecedor: (f: Fornecedor) => void;
  onDeleteFornecedor: (id: string) => void;

  onSaveOrcamento: (o: Orcamento) => void;
  onDeleteOrcamento: (id: string) => void;

  // Sprint 4.2 — INSS
  inssConfigs: (InssYearlyConfig & { id?: string })[];
  onSaveInssConfig: (cfg: InssYearlyConfig & { id?: string }) => void | Promise<void>;
  onDeleteInssConfig: (id: string) => void | Promise<void>;
}

function newId() {
  // browser moderno (inclui Chrome/Edge)
  // fallback caso rode em ambiente sem crypto
  // @ts-ignore
  return typeof crypto !== "undefined" && crypto.randomUUID
    // @ts-ignore
    ? crypto.randomUUID()
    : "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// IMPORTANTE: este componente precisa ficar fora do Settings.
// Quando ele é declarado dentro do componente principal, a cada setState
// o React entende que é um "novo" componente (nova referência de função),
// desmonta e monta de novo — e isso faz o input perder foco/cursor.
type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

const Modal: React.FC<ModalProps> = React.memo(({ open, title, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl bg-white rounded-[2rem] shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-bb-blue font-black uppercase text-sm">{title}</h3>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-xl bg-gray-100 font-black text-xs">
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
});

const Settings: React.FC<SettingsProps> = ({
  categorias,
  formasPagamento,
  fornecedores,
  orcamentos,
  inssConfigs,
  onSaveCategoria,
  onDeleteCategoria,
  onSaveFormaPagamento,
  onDeleteFormaPagamento,
  onSaveFornecedor,
  onDeleteFornecedor,
  onSaveOrcamento,
  onDeleteOrcamento,
  onSaveInssConfig,
  onDeleteInssConfig,
}) => {
  const [tab, setTab] = useState<"CATEGORIAS" | "PAGAMENTO" | "FORNECEDORES" | "ORCAMENTO" | "INSS">("CATEGORIAS");

  // --- Modals state ---
  const [catOpen, setCatOpen] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [itemOpen, setItemOpen] = useState(false);
  const [fpOpen, setFpOpen] = useState(false);
  const [supOpen, setSupOpen] = useState(false);
  const [orcOpen, setOrcOpen] = useState(false);
  const [inssOpen, setInssOpen] = useState(false);

  const [catMode, setCatMode] = useState<"NEW" | "EDIT">("NEW");
  const [inssMode, setInssMode] = useState<"NEW" | "EDIT">("NEW");

  const [catForm, setCatForm] = useState<Categoria>({
    id: "",
    nome: "",
    cor: "#1D4ED8",
    countryCode: "PT",
    tipo: TipoTransacao.DESPESA,
    contas: [],
  });
  const [itemForm, setItemForm] = useState<ContaItem>({ id: "", nome: "", codigo_pais: "PT" });
  const [fpForm, setFpForm] = useState<FormaPagamento>({ id: "", nome: "", categoria: "BANCO", countryCode: "PT" });
  const [supForm, setSupForm] = useState<Fornecedor>({ id: "", nome: "", countryCode: "PT" });
  const [orcForm, setOrcForm] = useState<Orcamento>({ id: "", countryCode: "PT", categoriaId: "", valor: 0 });

  const [inssForm, setInssForm] = useState<InssYearlyConfig & { id?: string }>(() => ({
    id: undefined,
    ano: new Date().getFullYear(),
    salario_base: 0,
    percentual_inss: 0,
    paulo: { nit: "", total_parcelas: 0, data_aposentadoria: "" },
    debora: { nit: "", total_parcelas: 0, data_aposentadoria: "" },
  }));
  const [inssError, setInssError] = useState<string>("");

  const categoriasById = useMemo(() => {
    const m = new Map<string, Categoria>();
    categorias.forEach((c) => m.set(c.id, c));
    return m;
  }, [categorias]);

  const selectedCategoria = useMemo(() => {
    if (!selectedCatId) return null;
    return categorias.find((c) => c.id === selectedCatId) || null;
  }, [categorias, selectedCatId]);

  const selectedContas: ContaItem[] = useMemo(() => {
    const contas = (selectedCategoria as any)?.contas;
    return Array.isArray(contas) ? (contas as ContaItem[]) : [];
  }, [selectedCategoria]);

  // --- Actions ---
  function openNewCategoria() {
    setCatMode("NEW");
    setCatForm({
      id: newId(),
      nome: "",
      cor: (catForm as any)?.cor ?? "#1D4ED8",
      countryCode: (catForm as any)?.countryCode ?? "PT",
      tipo: TipoTransacao.DESPESA,
      contas: [],
    });
    setCatOpen(true);
  }


  // --- INSS (Sprint 4.2) ---
  function openNewInssConfig() {
    setInssMode("NEW");
    setInssError("");
    const currentYear = new Date().getFullYear();

    // tenta reaproveitar último config (se existir) como base
    const sorted = (inssConfigs as any[])
      .slice()
      .sort((a: any, b: any) => Number(b?.ano ?? 0) - Number(a?.ano ?? 0));
    const last = sorted[0] as any;

    setInssForm({
      id: undefined,
      ano: currentYear,
      salario_base: Number(last?.salario_base ?? 0),
      percentual_inss: Number(last?.percentual_inss ?? 0),
      paulo: {
        nit: String(last?.paulo?.nit ?? ""),
        total_parcelas: Number(last?.paulo?.total_parcelas ?? 0),
        data_aposentadoria: String(last?.paulo?.data_aposentadoria ?? ""),
      },
      debora: {
        nit: String(last?.debora?.nit ?? ""),
        total_parcelas: Number(last?.debora?.total_parcelas ?? 0),
        data_aposentadoria: String(last?.debora?.data_aposentadoria ?? ""),
      },
    });

    setInssOpen(true);
  }

  function openEditInssConfig(cfg: any) {
    setInssMode("EDIT");
    setInssError("");
    setInssForm({
      id: cfg?.id,
      ano: Number(cfg?.ano ?? new Date().getFullYear()),
      salario_base: Number(cfg?.salario_base ?? 0),
      percentual_inss: Number(cfg?.percentual_inss ?? 0),
      paulo: {
        nit: String(cfg?.paulo?.nit ?? ""),
        total_parcelas: Number(cfg?.paulo?.total_parcelas ?? 0),
        data_aposentadoria: String(cfg?.paulo?.data_aposentadoria ?? ""),
      },
      debora: {
        nit: String(cfg?.debora?.nit ?? ""),
        total_parcelas: Number(cfg?.debora?.total_parcelas ?? 0),
        data_aposentadoria: String(cfg?.debora?.data_aposentadoria ?? ""),
      },
    });
    setInssOpen(true);
  }

  function isValidBRDate(d: string) {
    const s = String(d || "").trim();
    if (!s) return true; // opcional
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!m) return false;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yy)) return false;
    if (yy < 1900 || yy > 2100) return false;
    if (mm < 1 || mm > 12) return false;
    const maxDay = new Date(yy, mm, 0).getDate();
    return dd >= 1 && dd <= maxDay;
  }

  async function saveInssConfig() {
    setInssError("");

    const ano = Number((inssForm as any)?.ano);
    const salarioBase = Number((inssForm as any)?.salario_base);
    const perc = Number((inssForm as any)?.percentual_inss);

    if (!Number.isFinite(ano) || ano <= 0) {
      setInssError("Ano é obrigatório.");
      return;
    }
    if (!Number.isFinite(salarioBase) || Math.floor(salarioBase) !== salarioBase || salarioBase <= 0) {
      setInssError("Salário base deve ser um número inteiro maior que zero.");
      return;
    }
    if (!Number.isFinite(perc) || perc <= 0) {
      setInssError("Percentual INSS deve ser maior que zero.");
      return;
    }

    const pNit = String((inssForm as any)?.paulo?.nit ?? "").trim();
    const dNit = String((inssForm as any)?.debora?.nit ?? "").trim();
    if (!pNit || !dNit) {
      setInssError("NIT é obrigatório para Paulo e Débora.");
      return;
    }

    const pParcelas = Number((inssForm as any)?.paulo?.total_parcelas);
    const dParcelas = Number((inssForm as any)?.debora?.total_parcelas);
    if (!Number.isFinite(pParcelas) || pParcelas <= 0 || Math.floor(pParcelas) !== pParcelas) {
      setInssError("Total de parcelas do Paulo deve ser inteiro maior que zero.");
      return;
    }
    if (!Number.isFinite(dParcelas) || dParcelas <= 0 || Math.floor(dParcelas) !== dParcelas) {
      setInssError("Total de parcelas da Débora deve ser inteiro maior que zero.");
      return;
    }

    const pApos = String((inssForm as any)?.paulo?.data_aposentadoria ?? "").trim();
    const dApos = String((inssForm as any)?.debora?.data_aposentadoria ?? "").trim();
    if (!isValidBRDate(pApos) || !isValidBRDate(dApos)) {
      setInssError("Datas de aposentadoria devem estar no formato dd/mm/aaaa (ou vazias).");
      return;
    }

    const payload: any = {
      ...(inssForm as any),
      ano,
      salario_base: salarioBase,
      percentual_inss: perc,
      paulo: { ...(inssForm as any).paulo, nit: pNit, total_parcelas: pParcelas, data_aposentadoria: pApos },
      debora: { ...(inssForm as any).debora, nit: dNit, total_parcelas: dParcelas, data_aposentadoria: dApos },
    };

    await onSaveInssConfig(payload);
    setInssOpen(false);
  }

  async function onDeleteInssConfigConfirm(id: string, ano?: number) {
    const label = ano ? `Ano ${ano}` : "este item";
    if (!window.confirm(`Excluir parâmetros INSS de ${label}?`)) return;
    await onDeleteInssConfig(id);
  }

  function openEditCategoria(c: Categoria) {
    setCatMode("EDIT");
    const contas = Array.isArray((c as any)?.contas) ? ((c as any).contas as ContaItem[]) : [];
    setCatForm({
      ...(c as any),
      id: c.id,
      nome: c.nome || "",
      cor: (c as any)?.cor ?? "#1D4ED8",
      countryCode: (c as any)?.countryCode ?? "PT",
      tipo: (c as any)?.tipo ?? TipoTransacao.DESPESA,
      contas,
    });
    setCatOpen(true);
  }

  function saveCategoria() {
    const nome = catForm.nome.trim();
    if (!nome) return;

    const contas = Array.isArray((catForm as any)?.contas) ? ((catForm as any).contas as ContaItem[]) : [];
    const tipo = (catForm as any)?.tipo ?? TipoTransacao.DESPESA;

    onSaveCategoria({ ...(catForm as any), nome, tipo, contas });
    setCatOpen(false);
  }

  function openNewItem(categoryId: string, defaultCountry?: CountryCode) {
    setSelectedCatId(categoryId);
    setItemForm({ id: newId(), nome: "", codigo_pais: (defaultCountry || "PT") as CountryCode });
    setItemOpen(true);
  }

  function openEditItem(categoryId: string, it: ContaItem) {
    setSelectedCatId(categoryId);
    setItemForm({ ...it });
    setItemOpen(true);
  }

  function saveItem() {
    if (!selectedCategoria) return;
    const nome = itemForm.nome.trim();
    if (!nome) return;

    const current = selectedContas;
    const nextItem: ContaItem = { ...itemForm, nome };

    const exists = current.some((x) => x.id === nextItem.id);
    const nextContas = exists
      ? current.map((x) => (x.id === nextItem.id ? nextItem : x))
      : [...current, nextItem];

    onSaveCategoria({ ...(selectedCategoria as any), contas: nextContas });
    setItemOpen(false);
  }

  function deleteItem(categoryId: string, itemId: string) {
    const cat = categorias.find((c) => c.id === categoryId);
    if (!cat) return;

    const contas = Array.isArray((cat as any)?.contas) ? ((cat as any).contas as ContaItem[]) : [];
    const nextContas = contas.filter((x) => x.id !== itemId);

    onSaveCategoria({ ...(cat as any), contas: nextContas });
  }


  function openNewFP() {
    setFpForm({ id: newId(), nome: "", categoria: "BANCO", countryCode: "PT" });
    setFpOpen(true);
  }
  function saveFP() {
    if (!fpForm.nome.trim()) return;
    onSaveFormaPagamento({ ...fpForm, nome: fpForm.nome.trim() });
    setFpOpen(false);
  }

  function openNewFornecedor() {
    setSupForm({ id: newId(), nome: "", countryCode: "PT" });
    setSupOpen(true);
  }
  function saveFornecedor() {
    if (!supForm.nome.trim()) return;
    onSaveFornecedor({ ...supForm, nome: supForm.nome.trim() });
    setSupOpen(false);
  }

  function openNewOrcamento() {
    setOrcForm({ id: newId(), countryCode: "PT", categoriaId: categorias[0]?.id || "", valor: 0 });
    setOrcOpen(true);
  }
  function saveOrcamento() {
    if (!orcForm.categoriaId) return;
    onSaveOrcamento({ ...orcForm, valor: Number(orcForm.valor || 0) });
    setOrcOpen(false);
  }

  // --- UI helpers ---
  const tabBtn = (id: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border ${
        tab === id ? "bg-bb-blue text-white border-bb-blue" : "bg-white text-bb-blue border-gray-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-2xl font-black text-bb-blue uppercase italic">Configurações</h2>
          <p className="text-[11px] text-gray-500 font-semibold">Cadastros base: categorias, formas de pagamento, fornecedores e metas.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tabBtn("CATEGORIAS", "Categorias")}
          {tabBtn("PAGAMENTO", "Pagamento")}
          {tabBtn("FORNECEDORES", "Fornecedores")}
          {tabBtn("ORCAMENTO", "Orçamento")}
          {tabBtn("INSS", "INSS")}
        </div>
      </div>

      {/* CATEGORIAS */}
      {tab === "CATEGORIAS" && (
        <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-bb-blue uppercase italic">Categorias</h3>
              <p className="text-[11px] text-gray-500 font-semibold">
                Cada categoria pode ter itens (<span className="font-black">Conta/Item</span>) que aparecem no formulário de lançamento.
                Gerencie os itens dentro de cada card.
              </p>
            </div>

            <button
              type="button"
              onClick={openNewCategoria}
              className="px-4 py-2 rounded-xl bg-bb-blue text-white text-[10px] font-black uppercase shadow-lg"
            >
              + Adicionar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {categorias.map((c) => {
              const contas = Array.isArray((c as any)?.contas) ? ((c as any).contas as ContaItem[]) : [];
              const tipo = (c as any)?.tipo || "-";
              const country = ((c as any)?.countryCode || "PT") as CountryCode;
              const cor = (c as any)?.cor || "#94A3B8";

              return (
                <div key={c.id} className="rounded-[1.5rem] border bg-gray-50/50 p-5 shadow-sm space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded" style={{ background: cor }} />
                        <h4 className="font-black text-bb-blue uppercase italic truncate">{c.nome}</h4>
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600 font-semibold">
                        <span>
                          Tipo: <span className="text-gray-900 font-black">{tipo}</span>
                        </span>
                        <span>
                          País: <span className="text-gray-900 font-black">{country}</span>
                        </span>
                        <span>
                          Itens: <span className="text-gray-900 font-black">{contas.length}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => openEditCategoria(c)}
                        className="px-3 py-1 rounded-xl bg-bb-blue/10 text-bb-blue text-[10px] font-black uppercase"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const ok = window.confirm(`Excluir a categoria "${c.nome}"?`);
                          if (ok) onDeleteCategoria(c.id);
                        }}
                        className="px-3 py-1 rounded-xl bg-red-50 text-red-700 text-[10px] font-black uppercase"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-[10px] uppercase text-gray-500 font-black tracking-widest">Itens (Conta/Item)</p>
                      <button
                        type="button"
                        onClick={() => openNewItem(c.id, country)}
                        className="px-3 py-1 rounded-xl bg-bb-blue text-white text-[10px] font-black uppercase shadow"
                      >
                        + Item
                      </button>
                    </div>

                    <div className="space-y-2">
                      {contas.map((it) => (
                        <div key={it.id} className="flex items-center justify-between gap-3 border rounded-xl p-3 bg-gray-50">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{it.nome}</p>
                            <p className="text-[10px] text-gray-500 font-semibold">
                              {it.codigo_pais}
                              {it.fornecedor_padrao ? ` • Forn: ${it.fornecedor_padrao}` : ""}
                              {it.observacao ? ` • ${it.observacao}` : ""}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <button
                              type="button"
                              onClick={() => openEditItem(c.id, it)}
                              className="px-3 py-1 rounded-xl bg-bb-blue/10 text-bb-blue text-[10px] font-black uppercase"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const ok = window.confirm(`Excluir o item "${it.nome}"?`);
                                if (ok) deleteItem(c.id, it.id);
                              }}
                              className="px-3 py-1 rounded-xl bg-red-50 text-red-700 text-[10px] font-black uppercase"
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                      ))}

                      {contas.length === 0 && (
                        <div className="text-[12px] text-gray-500">Nenhum item cadastrado nesta categoria.</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {categorias.length === 0 && (
              <div className="text-gray-500 font-semibold">Nenhuma categoria cadastrada ainda.</div>
            )}
          </div>
        </div>
      )}


      {/* PAGAMENTO */}
      {tab === "PAGAMENTO" && (
        <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-bb-blue uppercase italic">Formas de Pagamento</h3>
            <button
              type="button"
              onClick={openNewFP}
              className="px-4 py-2 rounded-xl bg-bb-blue text-white text-[10px] font-black uppercase shadow-lg"
            >
              + Adicionar
            </button>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="py-2">Nome</th>
                  <th className="py-2">Categoria</th>
                  <th className="py-2">País</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {formasPagamento.map((fp) => (
                  <tr key={fp.id} className="border-t">
                    <td className="py-3 font-semibold">{fp.nome}</td>
                    <td className="py-3">{fp.categoria}</td>
                    <td className="py-3">{fp.countryCode || "-"}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteFormaPagamento(fp.id)}
                        className="px-3 py-1 rounded-xl bg-red-50 text-red-700 text-[10px] font-black uppercase"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
                {formasPagamento.length === 0 && (
                  <tr>
                    <td className="py-6 text-gray-500" colSpan={4}>
                      Nenhuma forma de pagamento cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FORNECEDORES */}
      {tab === "FORNECEDORES" && (
        <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-bb-blue uppercase italic">Fornecedores</h3>
            <button
              type="button"
              onClick={openNewFornecedor}
              className="px-4 py-2 rounded-xl bg-bb-blue text-white text-[10px] font-black uppercase shadow-lg"
            >
              + Adicionar
            </button>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="py-2">Nome</th>
                  <th className="py-2">País</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="py-3 font-semibold">{f.nome}</td>
                    <td className="py-3">{f.countryCode || "-"}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteFornecedor(f.id)}
                        className="px-3 py-1 rounded-xl bg-red-50 text-red-700 text-[10px] font-black uppercase"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
                {fornecedores.length === 0 && (
                  <tr>
                    <td className="py-6 text-gray-500" colSpan={3}>
                      Nenhum fornecedor cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ORÇAMENTO */}
      {tab === "ORCAMENTO" && (
        <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-bb-blue uppercase italic">Orçamento (metas)</h3>
            <button
              type="button"
              onClick={openNewOrcamento}
              className="px-4 py-2 rounded-xl bg-bb-blue text-white text-[10px] font-black uppercase shadow-lg"
            >
              + Definir meta
            </button>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="py-2">País</th>
                  <th className="py-2">Categoria</th>
                  <th className="py-2">Valor</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {orcamentos.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="py-3 font-semibold">{o.countryCode}</td>
                    <td className="py-3">{categoriasById.get(o.categoriaId)?.nome || o.categoriaId}</td>
                    <td className="py-3">{Number(o.valor).toFixed(2)}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteOrcamento(o.id)}
                        className="px-3 py-1 rounded-xl bg-red-50 text-red-700 text-[10px] font-black uppercase"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
                {orcamentos.length === 0 && (
                  <tr>
                    <td className="py-6 text-gray-500" colSpan={4}>
                      Nenhuma meta definida.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INSS */}
      {tab === "INSS" && (
        <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-black uppercase text-bb-blue">Parâmetros INSS</h3>
              <p className="text-[11px] text-gray-500 font-semibold">
                Configurações por ano fiscal: salário base, percentual e dados do contribuinte (NIT, parcelas, aposentadoria).
              </p>
            </div>

            <button
              type="button"
              onClick={openNewInssConfig}
              className="px-4 py-2 rounded-xl bg-bb-blue text-white text-[10px] font-black uppercase shadow-lg"
            >
              + Adicionar ano
            </button>
          </div>

          {inssConfigs.length === 0 ? (
            <div className="text-[12px] text-gray-500 font-semibold bg-gray-50 border rounded-2xl p-4">
              Nenhum parâmetro cadastrado ainda. Clique em <b>Adicionar ano</b>.
            </div>
          ) : (
            <div className="space-y-3">
              {inssConfigs
                .slice()
                .sort((a: any, b: any) => Number(b?.ano ?? 0) - Number(a?.ano ?? 0))
                .map((cfg: any) => {
                  const id = cfg?.id || String(cfg?.ano ?? "");
                  const fmtNum = (n: any) =>
                    Number.isFinite(Number(n)) ? Number(n).toLocaleString("pt-BR") : "-";
                  const fmtPct = (n: any) =>
                    Number.isFinite(Number(n)) ? `${Number(n).toLocaleString("pt-BR")} %` : "-";

                  return (
                    <div
                      key={id}
                      className="rounded-[1.5rem] border bg-gray-50 p-4 flex items-start justify-between gap-4 flex-wrap"
                    >
                      <div className="min-w-[260px]">
                        <div className="text-[12px] font-black uppercase text-gray-700">
                          Ano {cfg?.ano ?? "-"}
                        </div>
                        <div className="text-[11px] text-gray-600 font-semibold mt-1">
                          Salário base: <b>{fmtNum(cfg?.salario_base)}</b> · Percentual INSS:{" "}
                          <b>{fmtPct(cfg?.percentual_inss)}</b>
                        </div>

                        <div className="text-[11px] text-gray-600 font-semibold mt-2">
                          <b>Paulo</b> · NIT: {cfg?.paulo?.nit || "-"} · Parcelas:{" "}
                          {cfg?.paulo?.total_parcelas ?? "-"} · Aposentadoria:{" "}
                          {cfg?.paulo?.data_aposentadoria || "-"}
                        </div>
                        <div className="text-[11px] text-gray-600 font-semibold">
                          <b>Débora</b> · NIT: {cfg?.debora?.nit || "-"} · Parcelas:{" "}
                          {cfg?.debora?.total_parcelas ?? "-"} · Aposentadoria:{" "}
                          {cfg?.debora?.data_aposentadoria || "-"}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditInssConfig(cfg)}
                          className="px-3 py-2 rounded-xl border bg-white text-[10px] font-black uppercase shadow-sm"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteInssConfigConfirm(id, cfg?.ano)}
                          className="px-3 py-2 rounded-xl border bg-white text-[10px] font-black uppercase text-red-600 shadow-sm"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
      {/* MODAL:Categoria */}
      <Modal
        open={catOpen}
        title={catMode === "NEW" ? "Adicionar categoria" : "Editar categoria"}
        onClose={() => setCatOpen(false)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">Nome</label>
            <input
              value={catForm.nome}
              onChange={(e) => setCatForm((s) => ({ ...s, nome: e.target.value }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
              placeholder="Ex.: Alimentação"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">Tipo</label>
            <select
              value={((catForm as any)?.tipo as any) || TipoTransacao.DESPESA}
              onChange={(e) => setCatForm((s) => ({ ...(s as any), tipo: e.target.value as any }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
            >
              <option value={TipoTransacao.DESPESA}>Despesa</option>
              <option value={TipoTransacao.RECEITA}>Receita</option>
              <option value={TipoTransacao.TRANSFERENCIA}>Transferência</option>
              <option value={TipoTransacao.PAGAMENTO_FATURA}>Pagamento Fatura</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">País</label>
            <select
              value={catForm.countryCode || "PT"}
              onChange={(e) => setCatForm((s) => ({ ...s, countryCode: e.target.value as CountryCode }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
            >
              <option value="PT">🇵🇹 PT</option>
              <option value="BR">🇧🇷 BR</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">Cor</label>
            <input
              type="color"
              value={catForm.cor || "#1D4ED8"}
              onChange={(e) => setCatForm((s) => ({ ...s, cor: e.target.value }))}
              className="w-full mt-1 h-12 p-2 rounded-xl border bg-gray-50"
            />
          </div>
          <div className="flex items-end justify-between gap-2 md:col-span-2 flex-wrap">
            <div className="text-[11px] text-gray-500 font-semibold">
              Itens (Conta/Item) são gerenciados diretamente no card da categoria.
            </div>
<div className="flex items-end justify-end gap-2 ml-auto">
            <button type="button" onClick={() => setCatOpen(false)} className="px-4 py-3 rounded-xl bg-gray-100 font-black text-[10px] uppercase">
              Cancelar
            </button>
            <button type="button" onClick={saveCategoria} className="px-4 py-3 rounded-xl bg-bb-blue text-white font-black text-[10px] uppercase">
              Salvar
            </button>
            </div>
          </div>
        </div>
      </Modal>

      

      

      {/* MODAL:Item (conta) */}
      <Modal
        open={itemOpen}
        title={itemForm.id ? "Adicionar/Editar item" : "Adicionar item"}
        onClose={() => setItemOpen(false)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-[10px] font-black uppercase text-gray-500">Nome do item</label>
            <input
              value={itemForm.nome}
              onChange={(e) => setItemForm((s) => ({ ...s, nome: e.target.value }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
              placeholder="Ex.: Supermercado / Energia / Gasolina"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">País</label>
            <select
              value={itemForm.codigo_pais}
              onChange={(e) => setItemForm((s) => ({ ...s, codigo_pais: e.target.value as CountryCode }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
            >
              <option value="PT">🇵🇹 PT</option>
              <option value="BR">🇧🇷 BR</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">Fornecedor padrão (opcional)</label>
            <input
              value={itemForm.fornecedor_padrao || ""}
              onChange={(e) => setItemForm((s) => ({ ...s, fornecedor_padrao: e.target.value }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
              placeholder="Ex.: Continente / EDP"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-[10px] font-black uppercase text-gray-500">Observação (opcional)</label>
            <input
              value={itemForm.observacao || ""}
              onChange={(e) => setItemForm((s) => ({ ...s, observacao: e.target.value }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
              placeholder="Ex.: usar sempre cartão X"
            />
          </div>

          <div className="flex items-end justify-end gap-2 md:col-span-2">
            <button type="button" onClick={() => setItemOpen(false)} className="px-4 py-3 rounded-xl bg-gray-100 font-black text-[10px] uppercase">
              Cancelar
            </button>
            <button type="button" onClick={saveItem} className="px-4 py-3 rounded-xl bg-bb-blue text-white font-black text-[10px] uppercase">
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL:Forma de Pagamento */}
      <Modal open={fpOpen} title="Adicionar forma de pagamento" onClose={() => setFpOpen(false)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">Nome</label>
            <input
              value={fpForm.nome}
              onChange={(e) => setFpForm((s) => ({ ...s, nome: e.target.value }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
              placeholder="Ex.: ABN AMRO / Visa / Dinheiro"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">Categoria</label>
            <select
              value={fpForm.categoria}
              onChange={(e) => setFpForm((s) => ({ ...s, categoria: e.target.value as FormaPagamentoCategoria }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
            >
              <option value="BANCO">Banco</option>
              <option value="CARTAO">Cartão</option>
              <option value="DINHEIRO">Dinheiro</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">País</label>
            <select
              value={fpForm.countryCode || "PT"}
              onChange={(e) => setFpForm((s) => ({ ...s, countryCode: e.target.value as CountryCode }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
            >
              <option value="PT">🇵🇹 PT</option>
              <option value="BR">🇧🇷 BR</option>
            </select>
          </div>
          <div className="flex items-end justify-end gap-2">
            <button type="button" onClick={() => setFpOpen(false)} className="px-4 py-3 rounded-xl bg-gray-100 font-black text-[10px] uppercase">
              Cancelar
            </button>
            <button type="button" onClick={saveFP} className="px-4 py-3 rounded-xl bg-bb-blue text-white font-black text-[10px] uppercase">
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL:Fornecedor */}
      <Modal open={supOpen} title="Adicionar fornecedor" onClose={() => setSupOpen(false)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">Nome</label>
            <input
              value={supForm.nome}
              onChange={(e) => setSupForm((s) => ({ ...s, nome: e.target.value }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
              placeholder="Ex.: EDP / Continente / Vodaf..."
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">País</label>
            <select
              value={supForm.countryCode || "PT"}
              onChange={(e) => setSupForm((s) => ({ ...s, countryCode: e.target.value as CountryCode }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
            >
              <option value="PT">🇵🇹 PT</option>
              <option value="BR">🇧🇷 BR</option>
            </select>
          </div>
          <div className="flex items-end justify-end gap-2 md:col-span-2">
            <button type="button" onClick={() => setSupOpen(false)} className="px-4 py-3 rounded-xl bg-gray-100 font-black text-[10px] uppercase">
              Cancelar
            </button>
            <button type="button" onClick={saveFornecedor} className="px-4 py-3 rounded-xl bg-bb-blue text-white font-black text-[10px] uppercase">
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL:Orçamento */}
      <Modal open={orcOpen} title="Definir meta (orçamento)" onClose={() => setOrcOpen(false)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">País</label>
            <select
              value={orcForm.countryCode}
              onChange={(e) => setOrcForm((s) => ({ ...s, countryCode: e.target.value as CountryCode }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
            >
              <option value="PT">🇵🇹 PT</option>
              <option value="BR">🇧🇷 BR</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">Categoria</label>
            <select
              value={orcForm.categoriaId}
              onChange={(e) => setOrcForm((s) => ({ ...s, categoriaId: e.target.value }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">Valor</label>
            <input
              type="number"
              value={orcForm.valor}
              onChange={(e) => setOrcForm((s) => ({ ...s, valor: Number(e.target.value) }))}
              className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
              placeholder="0"
            />
          </div>
          <div className="flex items-end justify-end gap-2">
            <button type="button" onClick={() => setOrcOpen(false)} className="px-4 py-3 rounded-xl bg-gray-100 font-black text-[10px] uppercase">
              Cancelar
            </button>
            <button type="button" onClick={saveOrcamento} className="px-4 py-3 rounded-xl bg-bb-blue text-white font-black text-[10px] uppercase">
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL:INSS */}
      <Modal
        open={inssOpen}
        title={inssMode === "NEW" ? "Adicionar parâmetros INSS" : "Editar parâmetros INSS"}
        onClose={() => setInssOpen(false)}
      >
        <div className="space-y-4">
          {inssError ? (
            <div className="rounded-2xl border bg-red-50 text-red-700 p-3 text-[11px] font-black">
              {inssError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Ano</label>
              <input
                type="number"
                value={Number((inssForm as any).ano)}
                onChange={(e) => setInssForm((s: any) => ({ ...s, ano: Number(e.target.value) }))}
                className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
                placeholder="2026"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Salário base (inteiro)</label>
              <input
                type="number"
                value={Number((inssForm as any).salario_base)}
                onChange={(e) =>
                  setInssForm((s: any) => ({
                    ...s,
                    salario_base: Number(e.target.value),
                  }))
                }
                className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
                placeholder="Ex.: 1412"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Percentual INSS</label>
              <input
                type="number"
                value={Number((inssForm as any).percentual_inss)}
                onChange={(e) =>
                  setInssForm((s: any) => ({
                    ...s,
                    percentual_inss: Number(e.target.value),
                  }))
                }
                className="w-full mt-1 p-3 rounded-xl border bg-gray-50"
                placeholder="Ex.: 20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-gray-50 p-4">
              <div className="text-[11px] font-black uppercase text-gray-700 mb-3">Paulo</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-500">NIT</label>
                  <input
                    value={(inssForm as any).paulo?.nit || ""}
                    onChange={(e) =>
                      setInssForm((s: any) => ({
                        ...s,
                        paulo: { ...(s as any).paulo, nit: e.target.value },
                      }))
                    }
                    className="w-full mt-1 p-3 rounded-xl border bg-white"
                    placeholder="NIT do Paulo"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-500">Total parcelas</label>
                  <input
                    type="number"
                    value={Number((inssForm as any).paulo?.total_parcelas ?? 0)}
                    onChange={(e) =>
                      setInssForm((s: any) => ({
                        ...s,
                        paulo: {
                          ...(s as any).paulo,
                          total_parcelas: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full mt-1 p-3 rounded-xl border bg-white"
                    placeholder="Ex.: 12"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-[10px] font-black uppercase text-gray-500">
                    Data aposentadoria (dd/mm/aaaa)
                  </label>
                  <input
                    value={(inssForm as any).paulo?.data_aposentadoria || ""}
                    onChange={(e) =>
                      setInssForm((s: any) => ({
                        ...s,
                        paulo: { ...(s as any).paulo, data_aposentadoria: e.target.value },
                      }))
                    }
                    className="w-full mt-1 p-3 rounded-xl border bg-white"
                    placeholder="Ex.: 15/08/2032"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-gray-50 p-4">
              <div className="text-[11px] font-black uppercase text-gray-700 mb-3">Débora</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-500">NIT</label>
                  <input
                    value={(inssForm as any).debora?.nit || ""}
                    onChange={(e) =>
                      setInssForm((s: any) => ({
                        ...s,
                        debora: { ...(s as any).debora, nit: e.target.value },
                      }))
                    }
                    className="w-full mt-1 p-3 rounded-xl border bg-white"
                    placeholder="NIT da Débora"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-500">Total parcelas</label>
                  <input
                    type="number"
                    value={Number((inssForm as any).debora?.total_parcelas ?? 0)}
                    onChange={(e) =>
                      setInssForm((s: any) => ({
                        ...s,
                        debora: {
                          ...(s as any).debora,
                          total_parcelas: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full mt-1 p-3 rounded-xl border bg-white"
                    placeholder="Ex.: 12"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-[10px] font-black uppercase text-gray-500">
                    Data aposentadoria (dd/mm/aaaa)
                  </label>
                  <input
                    value={(inssForm as any).debora?.data_aposentadoria || ""}
                    onChange={(e) =>
                      setInssForm((s: any) => ({
                        ...s,
                        debora: { ...(s as any).debora, data_aposentadoria: e.target.value },
                      }))
                    }
                    className="w-full mt-1 p-3 rounded-xl border bg-white"
                    placeholder="Ex.: 15/08/2032"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setInssOpen(false)}
              className="px-4 py-2 rounded-xl border bg-white text-[10px] font-black uppercase shadow-sm"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={saveInssConfig}
              className="px-4 py-2 rounded-xl bg-bb-blue text-white text-[10px] font-black uppercase shadow-lg"
            >
              Salvar
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default Settings;
