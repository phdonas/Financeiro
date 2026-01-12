import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DEFAULT_HOUSEHOLD_ID, listHouseholdItems, upsertHouseholdItem } from '../lib/cloudStore';
import { CategoriaContabil, Receipt, Fornecedor, Transacao, TipoTransacao, FormaPagamento } from '../types';

interface TaxReportsProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  receipts: Receipt[];
  fornecedores: Fornecedor[];
  formasPagamento: FormaPagamento[];
  onSaveTx: (t: Transacao) => void;
  isCloud: boolean;
  householdId: string;
}

type TaxSessionDoc = {
  id: string;
  tipo: 'IVA';
  codigo_pais: 'PT';
  year: number;
  quarter: number;
  excludedReceiptInternalIds: string[];
  updatedAt?: any;
  createdAt?: any;
};

function fmtEUR(v: number) {
  const n = Number.isFinite(v) ? v : 0;
  return `€ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function addMonthsISO(isoDate: string, months: number) {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function splitIntoInstallments(total: number, n: number) {
  const parts = Math.max(1, Math.min(3, Math.floor(n || 1)));
  const cents = Math.round((Number.isFinite(total) ? total : 0) * 100);
  const base = Math.floor(cents / parts);
  const remainder = cents - base * parts;
  const out: number[] = [];
  for (let i = 0; i < parts; i++) {
    const c = base + (i === parts - 1 ? remainder : 0);
    out.push(c / 100);
  }
  return out;
}

function normKey(s: string) {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const TaxReports: React.FC<TaxReportsProps> = ({
  viewMode,
  receipts,
  fornecedores,
  formasPagamento,
  onSaveTx,
  isCloud,
  householdId,
}) => {
  const [activeTab, setActiveTab] = useState<'IVA' | 'IRS'>('IVA');
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterQuarter, setFilterQuarter] = useState<number>(1);

  const sessionId = useMemo(() => `pt-iva-${filterYear}-q${filterQuarter}`, [filterYear, filterQuarter]);

  const [excludedInternalIds, setExcludedInternalIds] = useState<Set<string>>(new Set());
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const persistTimerRef = useRef<number | null>(null);

  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [launchData, setLaunchData] = useState({
    data_pagamento: new Date().toISOString().split('T')[0],
    forma_pagamento_id: '',
    parcelas: 1,
    description: '',
  });

  // UX + estabilidade: quando abrir o modal e existir ao menos 1 banco, pré-seleciona o primeiro.
  // Evita submit inválido e reduz chances de erro por forma_pagamento_id vazio.
  useEffect(() => {
    if (!isLaunchModalOpen) return;
    if (launchData.forma_pagamento_id) return;
    const first = (formasPagamento ?? [])[0]?.id;
    if (first) setLaunchData((prev) => ({ ...prev, forma_pagamento_id: first }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLaunchModalOpen, formasPagamento]);

  const [ivaCategoriaId, setIvaCategoriaId] = useState<string>('');
  const [ivaContaId, setIvaContaId] = useState<string>('');

  // Resolve IDs (Categoria: PAGAMENTOS; Item: Imob - IVA)
  useEffect(() => {
    let cancelled = false;
    async function loadIvaAccountIds() {
      setIvaCategoriaId('');
      setIvaContaId('');

      if (!householdId) return;

      try {
        // Cloud: lê do Firestore
        if (isCloud) {
          const cats = await listHouseholdItems<CategoriaContabil>('categorias', householdId);
          const cat = (cats || []).find((c) => normKey(c?.nome || '') === 'PAGAMENTOS');
          const conta = (cat?.contas || []).find((it) => normKey(it?.nome || '') === normKey('Imob - IVA'));
          if (!cancelled) {
            setIvaCategoriaId(cat?.id || '');
            setIvaContaId(conta?.id || '');
          }
          return;
        }

        // Local: lê do localStorage (mesma convenção do App.tsx)
        const lsPrefix = `ff_${DEFAULT_HOUSEHOLD_ID}_`;
        const raw = localStorage.getItem(`${lsPrefix}categorias`);
        const cats = raw ? (JSON.parse(raw) as CategoriaContabil[]) : [];
        const safeCats = Array.isArray(cats) ? cats : [];

        const catPag = safeCats.find((c) => normKey(c?.nome || '') === 'PAGAMENTOS');
        const contaIva = (catPag?.contas || []).find((it) => normKey(it?.nome || '') === normKey('Imob - IVA'));

        // fallback seguro (evita crash por ids inexistentes)
        const fallbackCat = catPag || safeCats.find((c) => normKey(c?.nome || '').includes('PAG')) || safeCats[0];
        const fallbackConta =
          contaIva ||
          (fallbackCat?.contas || []).find((it) => normKey(it?.nome || '').includes('IVA')) ||
          (fallbackCat?.contas || [])[0];

        if (!cancelled) {
          setIvaCategoriaId(fallbackCat?.id || '');
          setIvaContaId(fallbackConta?.id || '');
        }
      } catch {
        // ignore
      }
    }

    loadIvaAccountIds();
    return () => {
      cancelled = true;
    };
  }, [householdId, isCloud]);

  const fornecedoresById = useMemo(() => {
    const m = new Map<string, Fornecedor>();
    (fornecedores ?? []).forEach((f) => m.set(f.id, f));
    return m;
  }, [fornecedores]);

  const receiptsDoPeriodo = useMemo(() => {
    return receipts.filter((r) => {
      if (r.country_code !== 'PT') return false;
      const date = new Date(r.issue_date + 'T12:00:00');
      const q = Math.floor(date.getMonth() / 3) + 1;
      return date.getFullYear() === filterYear && q === filterQuarter;
    });
  }, [receipts, filterYear, filterQuarter]);

  const ivaStats = useMemo(() => {
    const included = receiptsDoPeriodo.filter((r) => !excludedInternalIds.has(r.internal_id));
    const total = included.reduce((acc, r) => acc + (r.iva_amount || 0), 0);
    return {
      total,
      countTotal: receiptsDoPeriodo.length,
      countIncluded: included.length,
      countExcluded: receiptsDoPeriodo.length - included.length,
    };
  }, [receiptsDoPeriodo, excludedInternalIds]);

  // Cálculos IRS Anual (Portugal)
  const irsAnual = useMemo(() => {
    const filtered = receipts.filter(
      (r) => r.country_code === 'PT' && new Date(r.issue_date + 'T12:00:00').getFullYear() === filterYear
    );
    const bruto = filtered.reduce((acc, r) => acc + r.base_amount, 0);
    const retencao = filtered.reduce((acc, r) => acc + (r.irs_amount || 0), 0);
    const liquido = filtered.reduce((acc, r) => acc + r.received_amount, 0);
    return { bruto, retencao, liquido, count: filtered.length };
  }, [receipts, filterYear]);

  // Load session exclusions (cloud-first)
  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      setSessionLoaded(false);
      setExcludedInternalIds(new Set());

      if (!householdId) {
        setSessionLoaded(true);
        return;
      }

      const localKey = `taxSession:${householdId}:${sessionId}`;
      try {
        if (isCloud) {
          const ref = doc(db, `households/${householdId}/taxSessions/${sessionId}`);
          const snap = await getDoc(ref);
          if (!cancelled && snap.exists()) {
            const data = snap.data() as any;
            const ids = Array.isArray(data?.excludedReceiptInternalIds) ? data.excludedReceiptInternalIds : [];
            setExcludedInternalIds(new Set(ids.filter((x: any) => typeof x === 'string')));
          }
        } else {
          const raw = localStorage.getItem(localKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            const ids = Array.isArray(parsed?.excludedReceiptInternalIds) ? parsed.excludedReceiptInternalIds : [];
            setExcludedInternalIds(new Set(ids.filter((x: any) => typeof x === 'string')));
          }
        }
      } catch {
        // fallback local
        try {
          const raw = localStorage.getItem(localKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            const ids = Array.isArray(parsed?.excludedReceiptInternalIds) ? parsed.excludedReceiptInternalIds : [];
            setExcludedInternalIds(new Set(ids.filter((x: any) => typeof x === 'string')));
          }
        } catch {
          // ignore
        }
      } finally {
        if (!cancelled) setSessionLoaded(true);
      }
    }
    loadSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId, householdId, isCloud]);

  // Persist exclusions (debounced)
  useEffect(() => {
    if (!sessionLoaded) return;
    if (!householdId) return;

    const localKey = `taxSession:${householdId}:${sessionId}`;

    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(async () => {
      const payload: TaxSessionDoc = {
        id: sessionId,
        tipo: 'IVA',
        codigo_pais: 'PT',
        year: filterYear,
        quarter: filterQuarter,
        excludedReceiptInternalIds: Array.from(excludedInternalIds),
      };

      try {
        if (isCloud) {
          await upsertHouseholdItem('taxSessions', payload as any, householdId);
        }
      } catch {
        // ignore
      }

      try {
        localStorage.setItem(localKey, JSON.stringify(payload));
      } catch {
        // ignore
      }
    }, 350);

    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [excludedInternalIds, sessionLoaded, householdId, sessionId, isCloud, filterYear, filterQuarter]);

  const toggleExcluded = (internalId: string) => {
    setExcludedInternalIds((prev) => {
      const next = new Set(prev);
      if (next.has(internalId)) next.delete(internalId);
      else next.add(internalId);
      return next;
    });
  };

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!launchData.forma_pagamento_id) return;

    const parcelas = Math.max(1, Math.min(3, Math.floor(Number(launchData.parcelas) || 1)));
    const parts = splitIntoInstallments(ivaStats.total, parcelas);

    const groupId = `iva_${sessionId}_${Math.random().toString(36).slice(2, 10)}`;

    parts.forEach((valor, idx) => {
      const parcelaAtual = idx + 1;
      const totalParcelas = parts.length;

      const data = addMonthsISO(launchData.data_pagamento, idx);
      const baseDesc = `Liquidação IVA ${filterQuarter}T ${filterYear}, parcela ${parcelaAtual} de ${totalParcelas}`;
      const description = launchData.description ? `${baseDesc} - ${launchData.description}` : baseDesc;

      const categoriaId = ivaCategoriaId || 'cat_impostos';
      const contaId = ivaContaId || 'item_iva';

      const novaTx: Transacao = {
        id: Math.random().toString(36).substr(2, 9),
        workspace_id: 'fam_01',
        codigo_pais: 'PT',
        categoria_id: categoriaId,
        conta_contabil_id: contaId,
        forma_pagamento_id: launchData.forma_pagamento_id,
        tipo: TipoTransacao.DESPESA,
        data_competencia: data,
        data_prevista_pagamento: data,
        description,
        valor,
        // mantém compatibilidade com o contrato StatusTransacao (evita crash em telas que assumem enum conhecido)
        status: 'PLANEJADO',
        origem: 'MANUAL',
        recorrencia_grupo_id: groupId,
        recorrencia_seq: parcelaAtual,
        parcela_atual: parcelaAtual,
        total_parcelas: totalParcelas,
      };

      onSaveTx(novaTx);
    });

    setIsLaunchModalOpen(false);
  };

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-700 pb-24">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-6">
        <div>
          <h3 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">
            Centro Fiscal Nuvem
          </h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">
            Apuramento de Auditoria BR/PT
          </p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('IVA')}
            className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${
              activeTab === 'IVA' ? 'bg-bb-blue text-white shadow-md' : 'text-gray-400'
            }`}
          >
            Auditoria IVA
          </button>
          <button
            onClick={() => setActiveTab('IRS')}
            className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${
              activeTab === 'IRS' ? 'bg-bb-blue text-white shadow-md' : 'text-gray-400'
            }`}
          >
            Simulação IRS
          </button>
        </div>
      </div>

      {activeTab === 'IVA' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-4">
              <p className="text-[10px] font-black text-bb-blue uppercase italic tracking-widest border-b pb-2">
                Período de Apuramento
              </p>
              <div className="grid grid-cols-2 gap-4">
                <select
                  className="bg-gray-50 p-3 rounded-xl text-xs font-black"
                  value={filterYear}
                  onChange={(e) => setFilterYear(Number(e.target.value))}
                >
                  {[2024, 2025, 2026].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select
                  className="bg-gray-50 p-3 rounded-xl text-xs font-black"
                  value={filterQuarter}
                  onChange={(e) => setFilterQuarter(Number(e.target.value))}
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      {q}º Trimestre
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[9px] text-gray-300 font-bold uppercase italic">
                  {ivaStats.countIncluded} Incluídos • {ivaStats.countExcluded} Excluídos
                </p>
                <p className="text-[9px] text-gray-300 font-bold uppercase italic">
                  {ivaStats.countTotal} Recibos
                </p>
              </div>
            </div>

            <div className="md:col-span-2 bg-bb-blue p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:scale-150 transition-all"></div>
              <div>
                <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1 italic">
                  Dívida IVA Liquidado
                </p>
                <h2 className="text-4xl font-black text-white italic tracking-tighter">{fmtEUR(ivaStats.total)}</h2>
                <p className="text-[9px] text-blue-200 font-bold uppercase italic mt-2">
                  Sessão: {filterQuarter}T/{filterYear} • {sessionLoaded ? 'Pronta' : 'Carregando...'}
                </p>
              </div>
              <button
                onClick={() => setIsLaunchModalOpen(true)}
                disabled={ivaStats.total <= 0 || !sessionLoaded}
                className="bg-bb-yellow text-bb-blue px-10 py-4 rounded-xl text-[10px] font-black uppercase shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
              >
                Gerar Lançamento
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-gray-50 flex justify-between items-center">
              <h4 className="text-[11px] font-black text-bb-blue uppercase italic">Extrato Fiscal Trimestral</h4>
              <p className="text-[9px] text-gray-400 font-bold uppercase italic">
                Marque para excluir/incluir no cálculo
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-gray-50 text-bb-blue font-black uppercase italic">
                  <tr>
                    <th className="px-6 py-4 w-[70px]">Incluir</th>
                    <th className="px-6 py-4">Fatura</th>
                    <th className="px-6 py-4">Fornecedor</th>
                    <th className="px-6 py-4">Data</th>
                    <th className="px-6 py-4">Base Tributável</th>
                    <th className="px-6 py-4 text-right">IVA Apurado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {receiptsDoPeriodo.map((r) => {
                    const fornecedor = fornecedoresById.get(r.fornecedor_id);
                    const incluido = !excludedInternalIds.has(r.internal_id);
                    return (
                      <tr key={r.internal_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={incluido}
                            onChange={() => toggleExcluded(r.internal_id)}
                            className="h-4 w-4 accent-bb-blue"
                          />
                        </td>
                        <td className="px-6 py-4 font-black text-bb-blue">#{r.id}</td>
                        <td className="px-6 py-4 text-gray-500 font-bold">
                          {fornecedor?.nome ?? fornecedor?.id ?? '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-400 font-bold">
                          {r.issue_date.split('-').reverse().join('/')}
                        </td>
                        <td className="px-6 py-4 font-bold">{fmtEUR(r.base_amount)}</td>
                        <td className="px-6 py-4 text-right font-black text-bb-blue italic">
                          {fmtEUR(r.iva_amount || 0)}
                        </td>
                      </tr>
                    );
                  })}
                  {receiptsDoPeriodo.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-xs text-gray-400 font-bold">
                        Sem recibos no período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'IRS' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-700">
          <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="space-y-6">
              <div>
                <h4 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">
                  Mapa Anual IRS
                </h4>
                <p className="text-[9px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">
                  Base Freelancer (Portugal)
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-black text-gray-400 uppercase">Faturamento Bruto</p>
                <p className="text-2xl font-black text-bb-blue italic">{fmtEUR(irsAnual.bruto)}</p>
              </div>
            </div>

            <div className="bg-gray-50 p-8 rounded-[2rem] border border-gray-100 flex flex-col justify-center">
              <p className="text-[10px] font-black text-red-500 uppercase italic tracking-widest mb-2">
                Retenção na Fonte (11.5%)
              </p>
              <p className="text-3xl font-black text-red-500 italic leading-none">{fmtEUR(irsAnual.retencao)}</p>
              <p className="text-[8px] text-gray-400 font-bold uppercase mt-4">Simulado em {irsAnual.count} recibos</p>
            </div>

            <div className="bg-emerald-500 p-8 rounded-[2rem] shadow-xl flex flex-col justify-center">
              <p className="text-[10px] font-black text-emerald-100 uppercase italic tracking-widest mb-2">
                Disponibilidade Líquida
              </p>
              <p className="text-3xl font-black text-white italic leading-none">{fmtEUR(irsAnual.liquido)}</p>
            </div>
          </div>
        </div>
      )}

      {isLaunchModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleLaunch}
            className="bg-white rounded-[2.5rem] p-10 w-full max-w-sm space-y-6 animate-in zoom-in duration-300 shadow-2xl"
          >
            <div className="border-b border-gray-100 pb-4">
              <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">
                Liquidação de IVA
              </h3>
              <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 italic">
                {filterQuarter}T/{filterYear} • Total {fmtEUR(ivaStats.total)}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-bb-blue uppercase italic ml-1">Data 1ª Parcela</label>
                <input
                  type="date"
                  required
                  className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue"
                  value={launchData.data_pagamento}
                  onChange={(e) => setLaunchData({ ...launchData, data_pagamento: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-bb-blue uppercase italic ml-1">Parcelas</label>
                <select
                  className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue"
                  value={launchData.parcelas}
                  onChange={(e) => setLaunchData({ ...launchData, parcelas: Number(e.target.value) })}
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}x
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-bb-blue uppercase italic ml-1">Banco de Saída</label>
                <select
                  required
                  className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue"
                  value={launchData.forma_pagamento_id}
                  onChange={(e) => setLaunchData({ ...launchData, forma_pagamento_id: e.target.value })}
                >
                  <option value="">Selecione Banco...</option>
                  {(formasPagamento ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-bb-blue uppercase italic ml-1">Descrição (opcional)</label>
                <input
                  type="text"
                  className="w-full bg-gray-50 p-4 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue"
                  value={launchData.description}
                  placeholder={`Liquidação IVA ${filterQuarter}T ${filterYear}, parcela 1 de N`}
                  onChange={(e) => setLaunchData({ ...launchData, description: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => setIsLaunchModalOpen(false)}
                className="flex-1 text-[10px] font-black uppercase text-gray-400 italic"
              >
                Descartar
              </button>
              <button
                type="submit"
                className="flex-[2] bg-bb-blue text-white py-4 rounded-xl text-[10px] font-black uppercase shadow-xl tracking-widest"
              >
                Sincronizar Ledger
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default TaxReports;
