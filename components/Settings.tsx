import React, { useMemo, useState } from "react";

type CountryCode = "PT" | "BR";

type Categoria = {
  id: string;
  nome: string;
  cor?: string;
  countryCode?: CountryCode;
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
  onSaveCategoria,
  onDeleteCategoria,
  onSaveFormaPagamento,
  onDeleteFormaPagamento,
  onSaveFornecedor,
  onDeleteFornecedor,
  onSaveOrcamento,
  onDeleteOrcamento,
}) => {
  const [tab, setTab] = useState<"CATEGORIAS" | "PAGAMENTO" | "FORNECEDORES" | "ORCAMENTO">("CATEGORIAS");

  // --- Modals state ---
  const [catOpen, setCatOpen] = useState(false);
  const [fpOpen, setFpOpen] = useState(false);
  const [supOpen, setSupOpen] = useState(false);
  const [orcOpen, setOrcOpen] = useState(false);

  const [catForm, setCatForm] = useState<Categoria>({ id: "", nome: "", cor: "#1D4ED8", countryCode: "PT" });
  const [fpForm, setFpForm] = useState<FormaPagamento>({ id: "", nome: "", categoria: "BANCO", countryCode: "PT" });
  const [supForm, setSupForm] = useState<Fornecedor>({ id: "", nome: "", countryCode: "PT" });
  const [orcForm, setOrcForm] = useState<Orcamento>({ id: "", countryCode: "PT", categoriaId: "", valor: 0 });

  const categoriasById = useMemo(() => {
    const m = new Map<string, Categoria>();
    categorias.forEach((c) => m.set(c.id, c));
    return m;
  }, [categorias]);

  // --- Actions ---
  function openNewCategoria() {
    setCatForm({ id: newId(), nome: "", cor: "#1D4ED8", countryCode: "PT" });
    setCatOpen(true);
  }
  function saveCategoria() {
    if (!catForm.nome.trim()) return;
    onSaveCategoria({ ...catForm, nome: catForm.nome.trim() });
    setCatOpen(false);
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
        </div>
      </div>

      {/* CATEGORIAS */}
      {tab === "CATEGORIAS" && (
        <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-bb-blue uppercase italic">Categorias</h3>
            <button
              type="button"
              onClick={openNewCategoria}
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
                  <th className="py-2">Cor</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {categorias.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-3 font-semibold">{c.nome}</td>
                    <td className="py-3">{c.countryCode || "-"}</td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-4 h-4 rounded" style={{ background: c.cor || "#94A3B8" }} />
                        <span className="text-[11px] text-gray-500">{c.cor || "-"}</span>
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteCategoria(c.id)}
                        className="px-3 py-1 rounded-xl bg-red-50 text-red-700 text-[10px] font-black uppercase"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
                {categorias.length === 0 && (
                  <tr>
                    <td className="py-6 text-gray-500" colSpan={4}>
                      Nenhuma categoria cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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

      {/* MODAL: Categoria */}
      <Modal open={catOpen} title="Adicionar categoria" onClose={() => setCatOpen(false)}>
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
          <div className="flex items-end justify-end gap-2">
            <button type="button" onClick={() => setCatOpen(false)} className="px-4 py-3 rounded-xl bg-gray-100 font-black text-[10px] uppercase">
              Cancelar
            </button>
            <button type="button" onClick={saveCategoria} className="px-4 py-3 rounded-xl bg-bb-blue text-white font-black text-[10px] uppercase">
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Forma de Pagamento */}
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

      {/* MODAL: Fornecedor */}
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

      {/* MODAL: Orçamento */}
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
    </div>
  );
};

export default Settings;
