import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CategoriaContabil,
  FormaPagamento,
  Fornecedor,
  Receipt,
} from "../types";
import { DEFAULT_HOUSEHOLD_ID, listReceiptsPage } from "../lib/cloudStore";
import { getDefaultBankId as getDefaultBankIdFromRules } from "../lib/financeDefaults";
import { sortByNome } from "../lib/sortUtils";

interface ReceiptsProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  receipts: Receipt[];
  fornecedores: Fornecedor[];
  categorias: CategoriaContabil[];
  formasPagamento: FormaPagamento[];
  onSaveReceipt: (r: Receipt) => void | Promise<void>;
  onDeleteReceipt: (internalId: string) => void;
  // Sprint 3.6: paginação/filtros (cloud)
  isCloud?: boolean;
  householdId?: string;
  refreshToken?: number;
}

const Receipts: React.FC<ReceiptsProps> = ({ viewMode, receipts, fornecedores, categorias, formasPagamento, onSaveReceipt, onDeleteReceipt, isCloud = false, householdId, refreshToken = 0 }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Sprint 3.6: filtros + paginação (UI similar ao Ledger)
  const PAGE_SIZE = 20;
  const MONTHS_PT = useMemo(
    () => [
      { value: 1, label: 'Jan' }, { value: 2, label: 'Fev' }, { value: 3, label: 'Mar' }, { value: 4, label: 'Abr' },
      { value: 5, label: 'Mai' }, { value: 6, label: 'Jun' }, { value: 7, label: 'Jul' }, { value: 8, label: 'Ago' },
      { value: 9, label: 'Set' }, { value: 10, label: 'Out' }, { value: 11, label: 'Nov' }, { value: 12, label: 'Dez' },
    ],
    []
  );

  const [monthFilter, setMonthFilter] = useState<number>(() => new Date().getMonth() + 1);
  const [yearFilter, setYearFilter] = useState<number>(() => new Date().getFullYear());
  const [fornecedorFilter, setFornecedorFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL');

  // Local (modo local): paginação por slice
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  // Cloud (modo cloud): paginação real via Firestore
  const [cloudPageSize] = useState<number>(PAGE_SIZE);
  const [cloudItems, setCloudItems] = useState<Receipt[]>([]);
  const [cloudCursor, setCloudCursor] = useState<any>(null);
  const [cloudHasMore, setCloudHasMore] = useState<boolean>(true);
  const [cloudLoading, setCloudLoading] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const effectiveHouseholdId = householdId ?? DEFAULT_HOUSEHOLD_ID;
  const cloudLoadingRef = useRef(false);

  const filtersHydratedRef = useRef(false);
  const filtersStorageKey = useMemo(() => `phdgesfin:receiptsFilters:${viewMode}`, [viewMode]);

  // Hidrata filtros por viewMode
  useEffect(() => {
    const now = new Date();
    const defaultMonth = now.getMonth() + 1;
    const defaultYear = now.getFullYear();
    try {
      const raw = localStorage.getItem(filtersStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const m = Number(parsed?.monthFilter);
        const y = Number(parsed?.yearFilter);
        setMonthFilter(Number.isFinite(m) ? m : defaultMonth);
        setYearFilter(Number.isFinite(y) ? y : defaultYear);
        setFornecedorFilter(typeof parsed?.fornecedorFilter === 'string' ? parsed.fornecedorFilter : '');
        const st = String(parsed?.statusFilter || 'ALL');
        setStatusFilter(st === 'PAID' || st === 'UNPAID' ? st : 'ALL');
      } else {
        setMonthFilter(defaultMonth);
        setYearFilter(defaultYear);
        setFornecedorFilter('');
        setStatusFilter('ALL');
      }
    } catch {
      setMonthFilter(defaultMonth);
      setYearFilter(defaultYear);
      setFornecedorFilter('');
      setStatusFilter('ALL');
    } finally {
      filtersHydratedRef.current = true;
      setVisibleCount(PAGE_SIZE);
    }
  }, [filtersStorageKey]);

  // Persiste filtros
  useEffect(() => {
    if (!filtersHydratedRef.current) return;
    try {
      localStorage.setItem(
        filtersStorageKey,
        JSON.stringify({ monthFilter, yearFilter, fornecedorFilter, statusFilter })
      );
    } catch {
      // ignore
    }
  }, [filtersStorageKey, monthFilter, yearFilter, fornecedorFilter, statusFilter]);

  // Sempre que filtro muda, volta para primeira página
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [monthFilter, yearFilter, fornecedorFilter, statusFilter, viewMode]);

  const periodRange = useMemo(() => {
    if (!yearFilter || !monthFilter) return null;
    const y = yearFilter;
    const mth = monthFilter;
    const mm = String(mth).padStart(2, '0');
    const startDate = `${y}-${mm}-01`;
    const nextMonth = mth === 12 ? 1 : mth + 1;
    const nextYear = mth === 12 ? y + 1 : y;
    const mm2 = String(nextMonth).padStart(2, '0');
    const endDate = `${nextYear}-${mm2}-01`;
    return { startDate, endDate };
  }, [yearFilter, monthFilter]);

  const fetchCloudPage = useCallback(
    async (opts?: { reset?: boolean; cursor?: any }) => {
      if (!isCloud) return;
      if (cloudLoadingRef.current) return;

      const isReset = !!opts?.reset;
      const cursor = isReset ? null : (opts?.cursor ?? null);

      cloudLoadingRef.current = true;
      setCloudLoading(true);
      setCloudError(null);

      try {
        const res = await listReceiptsPage({
          householdId: effectiveHouseholdId,
          viewMode,
          pageSize: cloudPageSize,
          cursor,
          startDate: periodRange?.startDate,
          endDate: periodRange?.endDate,
          fornecedorId: fornecedorFilter || undefined,
          isPaid: statusFilter === 'ALL' ? null : statusFilter === 'PAID',
        });

        if (isReset) {
          setCloudItems(res.items as any);
        } else {
          setCloudItems((prev) => [...(Array.isArray(prev) ? prev : []), ...(res.items as any)]);
        }
        setCloudCursor(res.cursor as any);
        setCloudHasMore(!!res.hasMore);
      } catch (e: any) {
        console.error('Falha ao paginar recibos (cloud):', e);
        setCloudError('Falha ao carregar recibos.');
        setCloudHasMore(false);
      } finally {
        setCloudLoading(false);
        cloudLoadingRef.current = false;
      }
    },
    [
      isCloud,
      effectiveHouseholdId,
      viewMode,
      cloudPageSize,
      periodRange,
      fornecedorFilter,
      statusFilter,
    ]
  );

  // Reset & fetch inicial (cloud)
  useEffect(() => {
    if (!isCloud) return;
    // Aguarda hidratação para evitar disparar duas vezes ao carregar
    if (!filtersHydratedRef.current) return;
    setCloudItems([]);
    setCloudCursor(null);
    setCloudHasMore(true);
    fetchCloudPage({ reset: true });
  }, [isCloud, viewMode, monthFilter, yearFilter, fornecedorFilter, statusFilter, refreshToken, fetchCloudPage]);

  const initialForm: Partial<Receipt> = {
    id: '', 
    country_code: (viewMode === 'GLOBAL' ? 'PT' : viewMode) as 'PT' | 'BR',
    issue_date: new Date().toISOString().split('T')[0],
    pay_date: new Date().toISOString().split('T')[0],
    base_amount: 0, 
    irs_rate: 11.5, 
    iva_rate: 23, 
    inss_rate: 11, 
    irpf_rate: 27.5,
    description: '', 
    is_paid: false,
    fornecedor_id: '',
    categoria_id: '',
    conta_contabil_id: '',
    forma_pagamento_id: '',
    flag_calcula_premiacao: false,
    document_url: ''
  };

  
  const supplierCountry = (s: Fornecedor): 'PT' | 'BR' | undefined => {
    const anyS: any = s as any;
    return (anyS.countryCode ?? anyS.pais ?? anyS.codigo_pais ?? anyS.country_code) as any;
  };

  const isPayingSource = (s: Fornecedor): boolean => {
    const anyS: any = s as any;
    // Default: se não existir flag, assume true para não esconder fornecedores legados.
    return anyS.flag_fonte_pagadora !== false;
  };
const [formData, setFormData] = useState<Partial<Receipt>>(initialForm);

  // Entrada monetária (Bruto Nominal): usar string controlada para aceitar vírgula/ponto,
  // e só normalizar para número (2 casas) sem “travar” a digitação.
  const [baseAmountInput, setBaseAmountInput] = useState<string>(() => {
    const v = initialForm.base_amount;
    return typeof v === 'number' && Number.isFinite(v)
      ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '';
  });

  const formatMoneyPT = (v: number): string =>
    v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const parseMoneyAny = (raw: string): number | undefined => {
    const s0 = String(raw ?? '').trim();
    if (!s0) return undefined;

    // mantém apenas dígitos, separadores e sinal
    let s = s0.replace(/[^\d.,-]/g, '');
    if (!s) return undefined;

    // determina separador decimal como o ÚLTIMO entre ',' e '.'
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    let decSep: ',' | '.' | null = null;
    if (lastComma > -1 && lastDot > -1) decSep = lastComma > lastDot ? ',' : '.';
    else if (lastComma > -1) decSep = ',';
    else if (lastDot > -1) decSep = '.';

    if (decSep) {
      const parts = s.split(decSep);
      const frac = parts.pop() ?? '';
      const intPart = parts.join('').replace(/[.,]/g, '');
      s = `${intPart}.${frac}`;
    } else {
      // sem separador decimal: remove milhares
      s = s.replace(/[.,]/g, '');
    }

    const n = parseFloat(s);
    if (!Number.isFinite(n)) return undefined;
    // arredonda para 2 casas
    return Math.round(n * 100) / 100;
  };

  const setBaseAmountFromRaw = (raw: string) => {
    setBaseAmountInput(raw);
    const parsed = parseMoneyAny(raw);
    setFormData((prev) => ({ ...prev, base_amount: raw === '' ? undefined : parsed }));
  };

  const calcs = useMemo(() => {
    const base = formData.base_amount || 0;
    if (formData.country_code === 'PT') {
      const irs = (base * (formData.irs_rate || 0)) / 100;
      const iva = (base * (formData.iva_rate || 0)) / 100;
      return { 
        tax1: irs, tax2: iva, net: base - irs, received: (base - irs) + iva,
        tax1Label: 'IRS (-)', tax2Label: 'IVA (+)', symbol: '€'
      };
    }
    const inss = (base * (formData.inss_rate || 0)) / 100;
    const irpf = (base * (formData.irpf_rate || 0)) / 100;
    return { 
      tax1: inss, tax2: irpf, net: base - inss - irpf, received: base - inss - irpf,
      tax1Label: 'INSS (-)', tax2Label: 'IRPF (-)', symbol: 'R$'
    };
  }, [formData]);

  const itensDaCategoria = useMemo(() => {
    const catId = String((formData as any)?.categoria_id || '').trim();
    if (!catId) return [] as any[];
    const cat: any = categorias.find((c) => c.id === catId);
    const contas: any[] = Array.isArray(cat?.contas) ? cat.contas : [];
    const ccode = String((formData as any)?.country_code || (viewMode === 'GLOBAL' ? '' : viewMode) || '').trim();
    const filtered = contas.filter((ct) => {
      if (!ccode) return true;
      return !ct?.codigo_pais || String(ct.codigo_pais) === ccode;
    });
    return sortByNome(filtered as any, 'pt-BR');
  }, [categorias, formData.categoria_id, formData.country_code, viewMode]);

  // Regra 2 (Sprint S1): default de banco por país, com prioridade por match exato.
  const getDefaultBankId = (country: 'PT' | 'BR') =>
    getDefaultBankIdFromRules(formasPagamento, country);

  // Regra 3 (Sprint S1): listas em ordem A–Z no ponto de uso (UI)
  const fornecedoresSorted = useMemo(() => sortByNome(fornecedores, 'pt-BR'), [fornecedores]);
  const categoriasSorted = useMemo(() => sortByNome(categorias, 'pt-BR'), [categorias]);
  const formasSorted = useMemo(() => sortByNome(formasPagamento, 'pt-BR'), [formasPagamento]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Regras de validação (Sprint 3): pagamento >= emissão; Item obrigatório
    const issue = String((formData as any)?.issue_date || '').trim();
    const pay = String((formData as any)?.pay_date || '').trim();
    if (issue && pay && pay < issue) {
      alert('A Data de pagamento deve ser maior ou igual à Data de emissão.');
      return;
    }

    const categoriaId = String((formData as any)?.categoria_id || '').trim();
    const itemId = String((formData as any)?.conta_contabil_id || '').trim();
    if (!categoriaId) {
      alert('Selecione uma Categoria.');
      return;
    }
    if (!itemId) {
      alert('Selecione o Item da Categoria.');
      return;
    }

    const internalId = editingId || Math.random().toString(36).substr(2, 9);
    
    const finalReceipt: Receipt = {
      ...formData as Receipt,
      internal_id: internalId,
      transacao_id: (formData as any)?.transacao_id || `TX_${internalId}`,
      workspace_id: 'fam_01',
      net_amount: calcs.net,
      received_amount: calcs.received,
      ...(formData.country_code === 'PT' ? { irs_amount: calcs.tax1, iva_amount: calcs.tax2 } : { inss_amount: calcs.tax1, irpf_amount: calcs.tax2 })
    };

    try {
      await Promise.resolve(onSaveReceipt(finalReceipt));
      setIsModalOpen(false); setEditingId(null); setFormData(initialForm); setBaseAmountInput(formatMoneyPT(Number(initialForm.base_amount || 0)));
    } catch (err) {
      console.error('Falha ao salvar recibo:', err);
      alert('Falha ao salvar o recibo. Veja o Console (DevTools) para detalhes.');
    }
};

  const availableYears = useMemo(() => {
    const now = new Date().getFullYear();
    const years: number[] = [];
    for (let y = now; y >= now - 8; y--) years.push(y);
    return years;
  }, []);

  const payingSuppliers = useMemo(() => {
    const list = Array.isArray(fornecedoresSorted) ? fornecedoresSorted : [];
    return list
      .filter((s) => isPayingSource(s))
      .filter((s) => {
        if (viewMode === 'GLOBAL') return true;
        const c = supplierCountry(s);
        return !c || c === viewMode;
      });
  }, [fornecedoresSorted, viewMode]);

  const baseList = useMemo(() => {
    return isCloud ? cloudItems : (Array.isArray(receipts) ? receipts : []);
  }, [isCloud, cloudItems, receipts]);

  // Filtro local (modo local) — cloud já filtra na query
  const filteredLocal = useMemo(() => {
    if (isCloud) return baseList;
    const list = Array.isArray(baseList) ? baseList : [];
    const p = periodRange;
    const inPeriod = (d?: string) => {
      if (!p) return true;
      const dd = String(d || '');
      return dd >= p.startDate && dd < p.endDate;
    };
    return list.filter((r) => {
      if (viewMode !== 'GLOBAL' && r.country_code !== viewMode) return false;
      if (fornecedorFilter && r.fornecedor_id !== fornecedorFilter) return false;
      if (statusFilter === 'PAID' && !r.is_paid) return false;
      if (statusFilter === 'UNPAID' && r.is_paid) return false;
      if (!inPeriod(r.issue_date)) return false;
      return true;
    });
  }, [isCloud, baseList, viewMode, fornecedorFilter, statusFilter, periodRange]);

  const visibleReceipts = useMemo(() => {
    const list = isCloud ? baseList : filteredLocal;
    const sorted = (Array.isArray(list) ? list : []).slice().sort((a, b) => {
      // default: data desc
      const da = String(a.issue_date || '');
      const db = String(b.issue_date || '');
      if (da !== db) return db.localeCompare(da);
      return String(b.internal_id || '').localeCompare(String(a.internal_id || ''));
    });
    return isCloud ? sorted : sorted.slice(0, visibleCount);
  }, [isCloud, baseList, filteredLocal, visibleCount]);

  const handleDelete = useCallback(
    (internalId: string) => {
      const ok = window.confirm('Deseja realmente excluir este Recibo? (O Lançamento vinculado também será excluído)');
      if (!ok) return;
      onDeleteReceipt(internalId);
    },
    [onDeleteReceipt]
  );

  const handleLoadMore = useCallback(() => {
    if (isCloud) {
      if (!cloudHasMore || cloudLoading) return;
      fetchCloudPage({ cursor: cloudCursor });
      return;
    }
    setVisibleCount((v) => v + PAGE_SIZE);
  }, [isCloud, cloudHasMore, cloudLoading, fetchCloudPage, cloudCursor]);

  return (
    <div className="p-6 space-y-6 pb-24 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h3 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Gestão de Emissões</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 italic tracking-widest">Controle de Impostos e Retenções BR/PT</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="bg-gray-50 p-3 rounded-xl text-[10px] font-black uppercase tracking-[0.08em] text-bb-blue/80 appearance-none transition-all duration-200 ease border-none outline-none focus:ring-1 focus:ring-bb-blue/20"
            value={monthFilter}
            onChange={(e) => setMonthFilter(Number(e.target.value))}
          >
            <option value={0}>Todos os meses</option>
            {MONTHS_PT.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <select
            className="bg-gray-50 p-3 rounded-xl text-[10px] font-black uppercase tracking-[0.08em] text-bb-blue/80 appearance-none transition-all duration-200 ease border-none outline-none focus:ring-1 focus:ring-bb-blue/20"
            value={yearFilter}
            onChange={(e) => setYearFilter(Number(e.target.value))}
          >
            <option value={0}>Todos os anos</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select
            className="bg-gray-50 p-3 rounded-xl text-[10px] font-black uppercase border-none outline-none focus:ring-1 focus:ring-bb-blue/20"
            value={fornecedorFilter}
            onChange={(e) => setFornecedorFilter(e.target.value)}
          >
            <option value="">Todos Fornecedores</option>
            {payingSuppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>

          <select
            className="bg-gray-50 p-3 rounded-xl text-[10px] font-black uppercase border-none outline-none focus:ring-1 focus:ring-bb-blue/20"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL">Todos Status</option>
            <option value="PAID">Pago</option>
            <option value="UNPAID">Planejado</option>
          </select>

          {cloudError && (
            <span className="text-[10px] font-black text-red-500 uppercase italic">{cloudError}</span>
          )}

          <button
            onClick={() => {
              const c = (initialForm.country_code || 'PT') as 'PT' | 'BR';
              const defaultBank = getDefaultBankId(c);
              setFormData({ ...initialForm, forma_pagamento_id: defaultBank });
              setBaseAmountInput(formatMoneyPT(Number((initialForm.base_amount ?? 0) as any)));
              setEditingId(null);
              setIsModalOpen(true);
            }}
            className="bg-bb-blue text-white px-8 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg hover:scale-105 active:scale-95 transition-all"
          >
            🧾 Nova Emissão
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-gray-50 text-bb-blue uppercase font-black italic border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Data / ID</th>
                <th className="px-6 py-4">Fornecedor</th>
                <th className="px-6 py-4">Categoria</th>
                <th className="px-6 py-4 text-right">Bruto</th>
                <th className="px-6 py-4 text-right">Líquido</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleReceipts.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-300 font-black uppercase italic opacity-30">Sem registros</td></tr>
              ) : (
                visibleReceipts.map(r => (
                  <tr key={r.internal_id} className="hover:bg-gray-50/40 transition-colors group">
                    <td className="px-6 py-3">
                      <span className="text-[10px] text-gray-400 font-bold block">{r.issue_date.split('-').reverse().join('/')}</span>
                      <span className="font-black text-bb-blue text-[9px] italic">#{r.id}</span>
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-black text-gray-700 uppercase leading-none mb-1 flex items-center gap-1">
                        {r.flag_calcula_premiacao && <span title="Fornecedor com Premiação">⭐</span>}
                        {fornecedores.find(s => s.id === r.fornecedor_id)?.nome || 'Entidade Indeterminada'}
                      </p>
                      <p className="text-[8px] text-gray-400 uppercase font-bold italic tracking-tighter">{r.country_code === 'PT' ? '🇵🇹 Regime Portugal' : '🇧🇷 Regime Brasil'}</p>
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-black text-bb-blue uppercase text-[9px] leading-none mb-0.5">{categorias.find(c => c.id === r.categoria_id)?.nome}</p>
                      <p className="text-[7px] text-gray-400 uppercase italic leading-none">{categorias.find(c => c.id === r.categoria_id)?.contas.find(i => i.id === r.conta_contabil_id)?.nome}</p>
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-gray-400 italic">
                      {r.country_code === 'PT' ? '€' : 'R$'} {r.base_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right font-black text-bb-blue text-[12px] italic">
                      {r.country_code === 'PT' ? '€' : 'R$'} {r.received_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`px-4 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${r.is_paid ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
                        {r.is_paid ? 'PAGO' : 'PLANEJADO'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <div className="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-all">
                        {r.document_url && (
                          <a href={r.document_url} target="_blank" rel="noreferrer" className="w-8 h-8 bg-gray-50 text-gray-400 rounded-lg flex items-center justify-center border border-gray-100 hover:bg-bb-blue hover:text-white transition-all">🔗</a>
                        )}
                        <button onClick={() => { setEditingId(r.internal_id); setFormData(r); setBaseAmountInput(typeof (r as any).base_amount === 'number' ? formatMoneyPT((r as any).base_amount) : ''); setIsModalOpen(true); }} className="w-8 h-8 bg-bb-blue text-white rounded-lg flex items-center justify-center shadow-md">✏️</button>
                        <button onClick={() => handleDelete(r.internal_id)} className="w-8 h-8 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white border border-red-100 transition-all">✕</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-center">
        {(isCloud ? cloudHasMore : (filteredLocal.length > visibleCount)) && (
          <button
            onClick={handleLoadMore}
            disabled={cloudLoading}
            className="bg-gray-50 text-bb-blue px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] border border-gray-100 hover:bg-white transition-all disabled:opacity-60"
          >
            {cloudLoading ? 'Carregando…' : 'Ver mais'}
          </button>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl p-10 space-y-8 animate-in zoom-in duration-300 overflow-y-auto max-h-[95vh] scrollbar-hide">
             <div className="flex justify-between items-start border-b border-gray-100 pb-6">
                <div>
                  <h2 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Novo Recibo/NF</h2>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">Apuramento de Base e Liquidez</p>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-50 w-10 h-10 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 transition-all border border-gray-100">✕</button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-8">
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Nº Recibo/Fatura</label>
                        <input required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} placeholder="Ref. 2025/001" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Data Emissão</label>
                        <input
                          type="date"
                          required
                          className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none"
                          value={formData.issue_date}
                          onChange={(e) => {
                            const nextIssue = e.target.value;
                            setFormData((prev) => {
                              const next: any = { ...prev, issue_date: nextIssue };
                              if (next.pay_date && String(next.pay_date) < String(nextIssue)) {
                                next.pay_date = nextIssue;
                              }
                              return next;
                            });
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Data Pagamento</label>
                        <input
                          type="date"
                          required
                          min={formData.issue_date || undefined}
                          className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 outline-none"
                          value={formData.pay_date}
                          onChange={(e) => setFormData({ ...formData, pay_date: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Regime Fiscal</label>
                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                           <button
                             type="button"
                             onClick={() =>
                               setFormData((prev) => {
                                 const current = (prev?.country_code || 'PT') as 'PT' | 'BR';
                                 const next: any = { ...prev, country_code: 'PT' };
                                 // Default NB para PT (mantém editável)
                                 if (!prev?.forma_pagamento_id || prev?.forma_pagamento_id === getDefaultBankId(current)) {
                                   next.forma_pagamento_id = getDefaultBankId('PT');
                                 }
                                 return next;
                               })
                             }
                             className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.country_code === 'PT' ? 'bg-white text-bb-blue shadow-sm border border-gray-100' : 'text-gray-400'}`}
                           >
                             🇵🇹 PT
                           </button>
                           <button
                             type="button"
                             onClick={() =>
                               setFormData((prev) => {
                                 const current = (prev?.country_code || 'PT') as 'PT' | 'BR';
                                 const next: any = { ...prev, country_code: 'BR' };
                                 // Default BB para BR (mantém editável)
                                 if (!prev?.forma_pagamento_id || prev?.forma_pagamento_id === getDefaultBankId(current)) {
                                   next.forma_pagamento_id = getDefaultBankId('BR');
                                 }
                                 return next;
                               })
                             }
                             className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.country_code === 'BR' ? 'bg-white text-emerald-600 shadow-sm border border-gray-100' : 'text-gray-400'}`}
                           >
                             🇧🇷 BR
                           </button>
                        </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Fornecedor / Pagadora</label>
                        <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.fornecedor_id} onChange={e => {
                          const fornecedorId = e.target.value;
                          const fornecedor = fornecedoresSorted.find(s => s.id === fornecedorId);
                          setFormData({
                            ...formData,
                            fornecedor_id: fornecedorId,
                            // Default editável: vem do Fornecedor/Fonte Pagadora.
                            flag_calcula_premiacao: fornecedor ? !!(fornecedor as any).flag_calcula_premiacao : !!formData.flag_calcula_premiacao,
                          });
                        }}>
                          <option value="">Selecione o Fornecedor...</option>
                          {payingSuppliers
                            .filter((s) => !formData.country_code || supplierCountry(s) === formData.country_code)
                            .map((s) => (
                              <option key={s.id} value={s.id}>{s.nome}</option>
                            ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Categoria</label>
                        <select
                          required
                          className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100"
                          value={formData.categoria_id}
                          onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value, conta_contabil_id: '' })}
                        >
                          <option value="">Selecione uma categoria...</option>
                          {categoriasSorted.filter(c => (c as any).tipo === 'RECEITA').map(c => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>

                        <div className="mt-3 space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Item</label>
                          <select
                            required
                            disabled={!formData.categoria_id}
                            className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100 disabled:opacity-50"
                            value={formData.conta_contabil_id || ''}
                            onChange={(e) => setFormData({ ...formData, conta_contabil_id: e.target.value })}
                          >
                            <option value="">
                              {formData.categoria_id ? 'Selecione o item...' : 'Selecione a categoria primeiro'}
                            </option>
                            {itensDaCategoria.map((ct: any) => (
                              <option key={ct.id} value={ct.id}>{ct.nome}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                   </div>

                   <div className="space-y-6">
                      <h4 className="text-[10px] font-black text-bb-blue uppercase italic tracking-widest border-b border-gray-100 pb-2">Esteira de Cálculo de Faturamento</h4>
                      <div className="flex flex-wrap items-center gap-4 bg-gray-50/50 p-6 rounded-[1.5rem] border border-gray-100">
                        <div className="flex-1 min-w-[140px] space-y-1.5">
                           <label className="text-[9px] font-black text-gray-400 uppercase ml-1 italic">Bruto Nominal</label>
                           <div className="relative">
                              <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0,00"
                              className="w-full bg-white p-4 rounded-xl text-xl font-black text-bb-blue border border-gray-100 outline-none focus:ring-2 focus:ring-bb-blue/20"
                              value={baseAmountInput}
                              onChange={(e) => setBaseAmountFromRaw(e.target.value)}
                              onBlur={() => {
                                const parsed = parseMoneyAny(baseAmountInput);
                                if (parsed === undefined) {
                                  setBaseAmountInput('');
                                  setFormData((prev) => ({ ...prev, base_amount: undefined }));
                                  return;
                                }
                                setBaseAmountInput(formatMoneyPT(parsed));
                                setFormData((prev) => ({ ...prev, base_amount: parsed }));
                              }}
                            />
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs opacity-30 italic">{calcs.symbol}</span>
                           </div>
                        </div>
                        <div className="text-gray-200 font-black text-xl select-none">➔</div>
                        <div className="flex-1 min-w-[140px] space-y-1.5">
                           <label className="text-[9px] font-black text-red-400 uppercase ml-1 italic">{calcs.tax1Label} %</label>
                           <input
                             type="number"
                             step="0.01"
                             className="w-full bg-white p-4 rounded-xl text-xl font-black text-red-500 border border-gray-100 outline-none"
                             value={(() => {
                               const val = formData.country_code === 'PT' ? formData.irs_rate : formData.inss_rate;
                               return val === undefined || val === null ? '' : Number(val).toFixed(2);
                             })()}
                             onChange={(e) => {
                               const raw = e.target.value;
                               const key = (formData.country_code === 'PT' ? 'irs_rate' : 'inss_rate') as any;
                               if (raw === '') {
                                 setFormData({ ...(formData as any), [key]: undefined });
                                 return;
                               }
                               const v = Math.round(parseFloat(raw) * 100) / 100;
                               setFormData({ ...(formData as any), [key]: Number.isFinite(v) ? v : undefined });
                             }}
                           />
                        </div>
                        <div className="text-gray-200 font-black text-xl select-none">➔</div>
                        <div className="flex-1 min-w-[140px] space-y-1.5">
                           <label className={`text-[9px] font-black uppercase ml-1 italic ${formData.country_code === 'PT' ? 'text-emerald-500' : 'text-red-400'}`}>{calcs.tax2Label} %</label>
                           <input
                             type="number"
                             step="0.01"
                             className={`w-full bg-white p-4 rounded-xl text-xl font-black border border-gray-100 outline-none ${formData.country_code === 'PT' ? 'text-emerald-600' : 'text-red-500'}`}
                             value={(() => {
                               const val = formData.country_code === 'PT' ? formData.iva_rate : formData.irpf_rate;
                               return val === undefined || val === null ? '' : Number(val).toFixed(2);
                             })()}
                             onChange={(e) => {
                               const raw = e.target.value;
                               const key = (formData.country_code === 'PT' ? 'iva_rate' : 'irpf_rate') as any;
                               if (raw === '') {
                                 setFormData({ ...(formData as any), [key]: undefined });
                                 return;
                               }
                               const v = Math.round(parseFloat(raw) * 100) / 100;
                               setFormData({ ...(formData as any), [key]: Number.isFinite(v) ? v : undefined });
                             }}
                           />
                        </div>
                      </div>
                      
                      <div className="bg-bb-blue p-8 rounded-[1.5rem] shadow-xl flex justify-between items-center group relative overflow-hidden">
                         <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-white/10 transition-all"></div>
                         <div>
                            <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest leading-none mb-1 opacity-80 italic">Disponibilidade de Caixa (Líquido)</p>
                            <p className="text-4xl font-black text-white italic leading-none">{calcs.symbol} {calcs.received.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-[9px] font-black text-blue-200 uppercase opacity-60 italic">Custo Tributário Estimado</p>
                            <p className="text-lg font-black text-bb-yellow italic leading-none">{calcs.symbol} {(Math.abs(calcs.tax1) + (formData.country_code === 'BR' ? Math.abs(calcs.tax2) : 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                   <div className="bg-gray-50/50 p-6 rounded-[1.5rem] border border-gray-100 space-y-6">
                      <h4 className="text-[11px] font-black text-bb-blue uppercase italic tracking-widest border-b border-gray-200 pb-3">Auditoria Local</h4>

                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-1 italic">Status do Recebimento</label>
                        <div className="flex bg-white p-1 rounded-xl border border-gray-100">
                          <button type="button" onClick={() => setFormData({ ...formData, is_paid: false })} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${!formData.is_paid ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'text-gray-400'}`}>Planejado</button>
                          <button type="button" onClick={() => setFormData({ ...formData, is_paid: true })} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.is_paid ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-gray-400'}`}>Pago</button>
                        </div>
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-1 italic">Link do Documento (Anexo Local/Nuvem)</label>
                        <input className="w-full bg-white p-3 rounded-xl text-[10px] font-black border border-gray-100 outline-none focus:ring-1 focus:ring-bb-blue/30" value={formData.document_url || ''} onChange={e => setFormData({...formData, document_url: e.target.value})} placeholder="https://link.com/fatura.pdf" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-1 italic">Detalhamento do Faturamento</label>
                        <textarea className="w-full bg-white p-3 rounded-xl text-[10px] font-bold border border-gray-100 outline-none h-20" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Descrição técnica do serviço prestado..."></textarea>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-1 italic">Banco de Destino</label>
                        <select required className="w-full bg-white p-3 rounded-xl text-xs font-black border border-gray-100" value={formData.forma_pagamento_id} onChange={e => setFormData({...formData, forma_pagamento_id: e.target.value})}>
                          <option value="">Selecione Banco...</option>
                          {formasSorted.map(fp => <option key={fp.id} value={fp.id}>{fp.nome}</option>)}
                        </select>
                      </div>

                      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100">
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase text-bb-blue italic leading-none">Calcula Campanha</span>
                            <span className="text-[8px] font-bold text-gray-400 uppercase italic">Padrão vem do Fornecedor</span>
                         </div>
                         <button type="button" onClick={() => setFormData({...formData, flag_calcula_premiacao: !formData.flag_calcula_premiacao})} className={`w-12 h-6 rounded-full transition-all relative ${formData.flag_calcula_premiacao ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${formData.flag_calcula_premiacao ? 'right-1' : 'left-1'}`}></div>
                         </button>
                      </div>

                   </div>
                </div>
             </div>

             <div className="flex flex-wrap justify-between items-center bg-gray-50 p-6 rounded-[1.5rem] border border-gray-100 gap-6">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                   <span className="text-[10px] font-black text-bb-blue italic opacity-60 uppercase tracking-widest">Armazenamento Local Seguro</span>
                </div>
                <div className="flex gap-6 items-center">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="text-[11px] font-black uppercase text-gray-400 hover:text-red-500 italic transition-all">Descartar</button>
                   <button type="submit" className="bg-bb-blue text-white px-12 py-4 rounded-xl text-[12px] font-black uppercase shadow-xl tracking-[0.1em] hover:scale-105 active:scale-95 transition-all">Confirmar Emissão</button>
                </div>
             </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Receipts;