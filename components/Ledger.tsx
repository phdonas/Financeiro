
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Transacao, TipoTransacao, StatusTransacao, CategoriaContabil, FormaPagamento } from '../types';
import { listTransacoesPage, DEFAULT_HOUSEHOLD_ID } from '../lib/cloudStore';

interface LedgerProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  transacoes: Transacao[];
  categorias: CategoriaContabil[];
  formasPagamento: FormaPagamento[];
  onSave: (t: Transacao) => void | Promise<void>;
  onDelete: (id: string) => void;
  // Sprint 2.8: paginação real via Firestore quando em modo cloud
  isCloud?: boolean;
  householdId?: string;
}

const Ledger: React.FC<LedgerProps> = ({
  viewMode,
  transacoes = [],
  categorias = [],
  formasPagamento = [],
  onSave,
  onDelete,
  isCloud = false,
  householdId,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>('');

  // Sprint 2.4: filtros por mês/ano + hardening contra dados incompletos
  // 0 significa "Todos"
  const [monthFilter, setMonthFilter] = useState<number>(() => new Date().getMonth() + 1);
  const [yearFilter, setYearFilter] = useState<number>(() => new Date().getFullYear());
  // Sprint 2.6: persistência de filtros + paginação incremental (evita travar com listas grandes)
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  // Sprint 2.8: paginação Firestore (cloud) — carrega 20 iniciais + 'Ver mais'
  const [pageSize, setPageSize] = useState<number>(20);
  const [cloudTxs, setCloudTxs] = useState<Transacao[]>([]);
  const [cloudCursor, setCloudCursor] = useState<any>(null);
  const [cloudHasMore, setCloudHasMore] = useState<boolean>(true);
  const [cloudLoading, setCloudLoading] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const effectiveHouseholdId = householdId ?? DEFAULT_HOUSEHOLD_ID;
  const cloudLoadingRef = useRef(false);


  const filtersHydratedRef = useRef(false);
  const filtersStorageKey = useMemo(() => `phdgesfin:ledgerFilters:${viewMode}`, [viewMode]);

  // Hidrata filtros por viewMode (BR/PT/GLOBAL)
  useEffect(() => {
    const now = new Date();
    const defaultMonth = now.getMonth() + 1;
    const defaultYear = now.getFullYear();
    try {
      const raw = localStorage.getItem(filtersStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setCatFilter(typeof parsed?.catFilter === 'string' ? parsed.catFilter : '');
        // Se o usuário escolheu 0 (Todos), respeita. Se vier inválido/ausente, cai no default atual.
        const m = Number(parsed?.monthFilter);
        const y = Number(parsed?.yearFilter);
        setMonthFilter(Number.isFinite(m) ? m : defaultMonth);
        setYearFilter(Number.isFinite(y) ? y : defaultYear);
      } else {
        // Primeira entrada: default = mês/ano atual
        setCatFilter('');
        setMonthFilter(defaultMonth);
        setYearFilter(defaultYear);
      }
    } catch {
      // Storage pode estar bloqueado; ainda assim garantimos um default consistente
      setCatFilter('');
      setMonthFilter(defaultMonth);
      setYearFilter(defaultYear);
    } finally {
      filtersHydratedRef.current = true;
      setVisibleCount(PAGE_SIZE);
    }
  }, [filtersStorageKey]);

  // Persiste filtros (após hidratação)
  useEffect(() => {
    if (!filtersHydratedRef.current) return;
    try {
      localStorage.setItem(filtersStorageKey, JSON.stringify({ catFilter, monthFilter, yearFilter }));
    } catch {
      // ignore (storage pode estar bloqueado)
    }
  }, [filtersStorageKey, catFilter, monthFilter, yearFilter]);

  // Sempre que filtro muda, volta para primeira página
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [catFilter, monthFilter, yearFilter, viewMode]);


// Sprint 2.8: carrega transações por página (Firestore) quando em modo cloud

// Intervalo (start/end) baseado em mês/ano selecionados
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
      const res = await listTransacoesPage({
        householdId: effectiveHouseholdId,
        viewMode,
        pageSize,
        periodRange,
        cursor,
      });

      const incoming = Array.isArray(res?.items) ? (res.items as any[]) : [];

      if (isReset) {
        setCloudTxs(incoming as any);
      } else {
        setCloudTxs((prev) => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const seen = new Set(prevArr.map((t: any) => t?.id).filter(Boolean));
          const merged = [...prevArr];
          for (const it of incoming) {
            if (!it?.id || seen.has(it.id)) continue;
            merged.push(it as any);
          }
          return merged as any;
        });
      }

      setCloudCursor(res?.cursor ?? null);
      setCloudHasMore(!!res?.hasMore);
    } catch (err: any) {
      console.error("Falha ao paginar transações (cloud):", err);
      setCloudError("Falha ao carregar lançamentos do Firestore. Veja o Console (DevTools) para detalhes.");
      setCloudHasMore(false);
    } finally {
      cloudLoadingRef.current = false;
      setCloudLoading(false);
    }
  },
  [isCloud, effectiveHouseholdId, viewMode, pageSize, periodRange]
);


// Quando entrar no Ledger (cloud) ou quando filtros principais mudarem: reset + carrega 1ª página
useEffect(() => {
  if (!isCloud) return;
  // evita reset antes de hidratar (quando existe storage)
  if (!filtersHydratedRef.current) return;

  setCloudCursor(null);
  setCloudHasMore(true);
  setCloudTxs([]);
  fetchCloudPage({ reset: true, cursor: null });
}, [isCloud, effectiveHouseholdId, viewMode, monthFilter, yearFilter, pageSize, periodRange]);


  const parseYearMonth = (dateStr?: string) => {
    if (!dateStr || typeof dateStr !== 'string') return null;

    // Formato esperado: YYYY-MM-DD (string)
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      if (Number.isFinite(year) && Number.isFinite(month)) {
        return { year, month };
      }
      return null;
    }

    // Fallback: tenta parsear por Date()
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }
    return null;
  };



  const availableYears = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const base = isCloud ? cloudTxs : transacoes;
    const list = Array.isArray(base) ? base : [];
    const years = new Set<number>();
    // Garante ano atual e ano selecionado (mesmo sem lançamentos)
    years.add(nowYear);
    if (yearFilter) years.add(yearFilter);
    for (const t of list) {
      const ym = parseYearMonth(t.data_competencia) ?? parseYearMonth(t.data_prevista_pagamento);
      if (ym?.year) years.add(ym.year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [isCloud, cloudTxs, transacoes, yearFilter]);


  const MONTHS_PT = useMemo(
    () => [
      { label: 'Jan', value: 1 },
      { label: 'Fev', value: 2 },
      { label: 'Mar', value: 3 },
      { label: 'Abr', value: 4 },
      { label: 'Mai', value: 5 },
      { label: 'Jun', value: 6 },
      { label: 'Jul', value: 7 },
      { label: 'Ago', value: 8 },
      { label: 'Set', value: 9 },
      { label: 'Out', value: 10 },
      { label: 'Nov', value: 11 },
      { label: 'Dez', value: 12 },
    ],
    []
  );

  const initialForm: Partial<Transacao> = {
    description: '', 
    observacao: '',
    valor: 0, 
    codigo_pais: viewMode === 'GLOBAL' ? 'PT' : viewMode,
    tipo: TipoTransacao.DESPESA, 
    data_competencia: new Date().toISOString().split('T')[0],
    data_prevista_pagamento: new Date().toISOString().split('T')[0],
    categoria_id: '', 
    conta_contabil_id: '', 
    forma_pagamento_id: '',
    // Default "em aberto"
    status: 'PENDENTE',
    saldo_devedor_restante: 0,
    parcela_atual: 1,
    total_parcelas: 1,
    juros_pagos: 0,
    capital_amortizado: 0,
    recorrencia: {
      ativo: false,
      tipo_frequencia: 'MESES',
      // Para MESES, este campo será derivado automaticamente da seleção de meses.
      vezes_por_ano: 1,
      quantidade_anos: 1,
      meses_selecionados: [],
    }
  };

  const [formData, setFormData] = useState<Partial<Transacao>>(initialForm);

  const [saving, setSaving] = useState<boolean>(false);

  // Evita crash quando a categoria ainda não está selecionada
  // ou quando dados no Firestore vierem sem a estrutura esperada (contas).
  const contasDaCategoriaSelecionada = useMemo(() => {
    const categoria = categorias.find((c) => c.id === formData.categoria_id);
    // `contas` deveria existir pelo type, mas pode estar ausente em dados antigos.
    return categoria?.contas ?? [];
  }, [categorias, formData.categoria_id]);

    const makeId = () => {
    // @ts-expect-error crypto pode não existir
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      // @ts-expect-error randomUUID
      return (crypto as any).randomUUID() as string;
    }
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const parseISODate = (iso: string) => {
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec((iso || '').trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    return { y, mo, d };
  };

  const daysInMonth = (y: number, mo: number) => {
    // mo: 1-12
    return new Date(y, mo, 0).getDate();
  };

  const toISODate = (y: number, mo: number, d: number) => {
    const dd = Math.max(1, Math.min(d, daysInMonth(y, mo)));
    const mm = String(mo).padStart(2, '0');
    const dds = String(dd).padStart(2, '0');
    return `${y}-${mm}-${dds}`;
  };

  const estimateDaysOccurrences = (years: number, intervalDays: number) => {
    const totalDays = Math.max(1, years) * 366;
    return Math.ceil(totalDays / Math.max(1, intervalDays));
  };

  const MAX_RECURRENCE_OCCURRENCES = 240;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    // Hardening: garante recorrência consistente sem mutar state diretamente
    const recRaw = formData.recorrencia ?? initialForm.recorrencia!;
    let normalizedRec = recRaw;

    if (recRaw?.ativo) {
      if (recRaw.tipo_frequencia === 'MESES') {
        const meses = (recRaw.meses_selecionados ?? []).filter((m) => m >= 1 && m <= 12);
        if (meses.length === 0) {
          alert('Selecione pelo menos 1 mês para a recorrência.');
          return;
        }
        const unique = Array.from(new Set(meses)).sort((a, b) => a - b);
        normalizedRec = {
          ...recRaw,
          meses_selecionados: unique,
          vezes_por_ano: unique.length,
          quantidade_anos: Math.max(1, Number(recRaw.quantidade_anos || 1)),
        };
      } else {
        normalizedRec = {
          ...recRaw,
          meses_selecionados: [],
          vezes_por_ano: Math.max(1, Number(recRaw.vezes_por_ano || 30)),
          quantidade_anos: Math.max(1, Number(recRaw.quantidade_anos || 1)),
        };
      }
    }

    const closeAndReset = () => {
      setIsModalOpen(false);
      setEditingTxId(null);
      setFormData(initialForm);
    };

    setSaving(true);
    try {
      const baseId = editingTxId || makeId();

      const today = new Date().toISOString().split('T')[0];
      const startISO = (formData.data_competencia || formData.data_prevista_pagamento || today).toString();
      const parsed = parseISODate(startISO) ?? parseISODate(today)!;

      const baseTx: any = {
        ...formData,
        recorrencia: normalizedRec,
        workspace_id: 'fam_01',
        origem: 'MANUAL',
        id: baseId,
      };

      // Edição: não tentamos regenerar série (fluxo seguro). Apenas atualiza o item.
      if (editingTxId || !normalizedRec?.ativo) {
        await Promise.resolve(onSave(baseTx as Transacao));
        closeAndReset();
        // refresh simples (cloud) para evitar discrepância visual
        if (isCloud) {
          try {
            setCloudCursor(null);
            setCloudHasMore(true);
            setCloudTxs([]);
            await fetchCloudPage({ reset: true });
          } catch {}
        }
        return;
      }

      // Criação com recorrência: gera ocorrências adicionais
      const groupId = `rec_${makeId()}`;
      const occurrences: any[] = [];
      let seq = 1;

      occurrences.push({
        ...baseTx,
        recorrencia_grupo_id: groupId,
        recorrencia_seq: seq,
      });

      const years = Math.max(1, Number(normalizedRec.quantidade_anos || 1));
      const baseMonth = parsed.mo;
      const baseYear = parsed.y;
      const baseDay = parsed.d;

      if (normalizedRec.tipo_frequencia === 'MESES') {
        const months = (normalizedRec.meses_selecionados ?? [])
          .filter((m) => m >= 1 && m <= 12)
          .sort((a, b) => a - b);

        // limite preventivo
        const estimated = years * months.length;
        if (estimated > MAX_RECURRENCE_OCCURRENCES) {
          alert(
            `Recorrência muito grande (${estimated} ocorrências). Reduza meses/anos para evitar travamento.`
          );
          return;
        }

        for (let yOff = 0; yOff < years; yOff++) {
          const y = baseYear + yOff;
          for (const m of months) {
            // no primeiro ano, só gera a partir do mês base (para evitar criar no "passado")
            if (yOff === 0 && m < baseMonth) continue;
            // base já está incluída
            if (yOff === 0 && m === baseMonth) continue;

            const iso = toISODate(y, m, baseDay);
            seq += 1;
            occurrences.push({
              ...baseTx,
              id: makeId(),
              data_competencia: iso,
              data_prevista_pagamento: iso,
              recorrencia_grupo_id: groupId,
              recorrencia_seq: seq,
            });
          }
        }
      } else {
        // DIAS: interpreta "vezes_por_ano" como intervalo em dias (ex.: 30)
        const intervalDays = Math.max(1, Number(normalizedRec.vezes_por_ano || 30));
        const estimated = estimateDaysOccurrences(years, intervalDays);
        if (estimated > MAX_RECURRENCE_OCCURRENCES) {
          alert(
            `Recorrência muito grande (~${estimated} ocorrências). Aumente o intervalo (dias) ou reduza anos.`
          );
          return;
        }

        const start = new Date(parsed.y, parsed.mo - 1, parsed.d);
        const end = new Date(parsed.y + years, parsed.mo - 1, parsed.d);

        let cur = new Date(start.getTime());
        while (true) {
          cur = new Date(cur.getTime());
          cur.setDate(cur.getDate() + intervalDays);
          if (cur >= end) break;
          const iso = cur.toISOString().split('T')[0];
          seq += 1;
          occurrences.push({
            ...baseTx,
            id: makeId(),
            data_competencia: iso,
            data_prevista_pagamento: iso,
            recorrencia_grupo_id: groupId,
            recorrencia_seq: seq,
          });
          if (occurrences.length >= MAX_RECURRENCE_OCCURRENCES) break;
        }
      }

      // Persiste todas as ocorrências (sequencial para manter previsibilidade no Firestore)
      for (const tx of occurrences) {
        await Promise.resolve(onSave(tx as Transacao));
      }

      closeAndReset();

      // Em cloud, recarrega a 1ª página do período atual para refletir imediatamente
      if (isCloud) {
        try {
          setCloudCursor(null);
          setCloudHasMore(true);
          setCloudTxs([]);
          await fetchCloudPage({ reset: true });
        } catch {}
      }
    } finally {
      setSaving(false);
    }
  };

  const filteredTxs = useMemo(() => {
    const base = isCloud ? cloudTxs : transacoes;
    const list = Array.isArray(base) ? base : [];

    const filtered = list.filter((t) => {
      const matchCountry = viewMode === 'GLOBAL' || t.codigo_pais === viewMode;
      const matchCat = !catFilter || t.categoria_id === catFilter;

      // Preferência: data de competência; fallback: prevista de pagamento
      const ym = parseYearMonth(t.data_competencia) ?? parseYearMonth(t.data_prevista_pagamento);
      const matchYear = !yearFilter || (ym?.year === yearFilter);
      const matchMonth = !monthFilter || (ym?.month === monthFilter);

      return matchCountry && matchCat && matchYear && matchMonth;
    });

    const safeDateKey = (t: Transacao) => {
      return (t?.data_competencia || t?.data_prevista_pagamento || '').toString();
    };

    // Ordenação desc por string ISO. Datas vazias/invalidas vão para o fim.
    return filtered.sort((a, b) => {
      const da = safeDateKey(a);
      const db = safeDateKey(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      try {
        return db.localeCompare(da);
      } catch {
        return 0;
      }
    });
  }, [isCloud, cloudTxs, transacoes, viewMode, catFilter, monthFilter, yearFilter]);


  // Sprint 2.6: maps para evitar .find() por linha (performance)
  const categoriasById = useMemo(() => {
    const map = new Map<string, CategoriaContabil>();
    (Array.isArray(categorias) ? categorias : []).forEach((c) => {
      if (c?.id) map.set(c.id, c);
    });
    return map;
  }, [categorias]);

  const contasById = useMemo(() => {
    const map = new Map<string, { nome?: string; categoriaNome?: string }>();
    (Array.isArray(categorias) ? categorias : []).forEach((c) => {
      const categoriaNome = c?.nome ?? '';
      const contas = Array.isArray((c as any)?.contas) ? (c as any).contas : [];
      contas.forEach((ct: any) => {
        if (ct?.id) map.set(ct.id, { nome: ct?.nome, categoriaNome });
      });
    });
    return map;
  }, [categorias]);

  const formasById = useMemo(() => {
    const map = new Map<string, FormaPagamento>();
    (Array.isArray(formasPagamento) ? formasPagamento : []).forEach((fp) => {
      if (fp?.id) map.set(fp.id, fp);
    });
    return map;
  }, [formasPagamento]);

  const formatDateBR = (dateStr?: string) => {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
    if (!m) return '';
    return `${m[3]}/${m[2]}/${m[1]}`;
  };
const visibleTxs = useMemo(() => {
  const list = Array.isArray(filteredTxs) ? filteredTxs : [];
  // Em cloud mode, a própria lista já chega paginada (20 por vez). Não re-slice.
  if (isCloud) return list;
  return list.slice(0, Math.max(PAGE_SIZE, visibleCount));
}, [filteredTxs, visibleCount, isCloud]);

const canLoadMore = isCloud
  ? cloudHasMore
  : (Array.isArray(filteredTxs) ? filteredTxs.length : 0) > visibleTxs.length;

const handleLoadMore = () => {
  if (isCloud) {
    if (!cloudHasMore) return;
    fetchCloudPage({ cursor: cloudCursor });
    return;
  }
  setVisibleCount((prev) => prev + PAGE_SIZE);
};


  const stats = useMemo(() => {
    return filteredTxs.reduce((acc, t) => {
      const val = t.valor || 0;
      if (t.tipo === TipoTransacao.RECEITA) acc.entradas += val;
      else acc.saidas += val;
      return acc;
    }, { entradas: 0, saidas: 0 });
  }, [filteredTxs]);

  const getStatusStyle = (status: StatusTransacao) => {
    switch (status) {
      case 'PAGO': return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      case 'ATRASADO': return 'bg-red-100 text-red-700 border border-red-200';
      case 'PLANEJADO': return 'bg-blue-50 text-blue-600 border border-blue-100';
      default: return 'bg-orange-50 text-orange-600 border border-orange-100';
    }
  };

  return (
    <div className="p-6 space-y-6 pb-24 animate-in fade-in duration-500">
      {/* Resumo Rápido PHD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <p className="text-[9px] font-black text-emerald-600 uppercase italic tracking-widest mb-1">Total Entradas (Filtrado)</p>
          <p className="text-2xl font-black text-bb-blue italic">{viewMode === 'PT' ? '€' : 'R$'} {stats.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <p className="text-[9px] font-black text-red-500 uppercase italic tracking-widest mb-1">Total Saídas (Filtrado)</p>
          <p className="text-2xl font-black text-bb-blue italic">{viewMode === 'PT' ? '€' : 'R$'} {stats.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-bb-blue p-6 rounded-[2rem] shadow-xl">
          <p className="text-[9px] font-black text-blue-200 uppercase italic tracking-widest mb-1">Saldo do Período</p>
          <p className="text-2xl font-black text-white italic">{viewMode === 'PT' ? '€' : 'R$'} {(stats.entradas - stats.saidas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-6">
           <div>
              <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Extrato PHD</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 italic tracking-widest">Auditoria e Conciliação</p>
           </div>
           <select 
             className="bg-gray-50 p-3 rounded-xl text-[10px] font-black uppercase border-none outline-none focus:ring-1 focus:ring-bb-blue/20"
             value={catFilter}
             onChange={e => setCatFilter(e.target.value)}
           >
             <option value="">Todas Categorias</option>
             {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
           </select>
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
        </div>
        <button onClick={() => {
          const today = new Date();
          const y = yearFilter || today.getFullYear();
          const m = monthFilter || (today.getMonth() + 1);
          const day = Math.min(today.getDate(), new Date(y, m, 0).getDate());
          const yyyy = String(y).padStart(4, '0');
          const mm = String(m).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;
          setFormData({ ...initialForm, data_competencia: dateStr, data_prevista_pagamento: dateStr });
          setEditingTxId(null);
          setIsModalOpen(true);
        }} className="bg-bb-blue text-white px-8 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg hover:scale-105 active:scale-95 transition-all">➕ Novo Lançamento</button>
      </div>

      <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-gray-50 text-bb-blue uppercase font-black italic border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Datas (Comp/Pag)</th>
                <th className="px-6 py-4">Categoria / Banco</th>
                <th className="px-6 py-4">Descrição</th>
                <th className="px-6 py-4 text-right">Valor</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleTxs.map((t) => (
                <tr key={t.id} className={`hover:bg-gray-50 transition-colors group ${t.status === 'ATRASADO' ? 'bg-red-50/20' : ''}`}>
                  <td className="px-6 py-4">
                    <p className="text-gray-400 font-bold italic">{t.data_competencia?.split('-').reverse().join('/') || formatDateBR(t.data_prevista_pagamento) || '-'}</p>
                    <p className="text-[9px] text-bb-blue font-black uppercase tracking-tighter opacity-40">Pago: {formatDateBR(t.data_prevista_pagamento) || '-'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-bb-blue font-black uppercase text-[10px] block mb-0.5 leading-none">{categoriasById.get(t.categoria_id)?.nome}</span>
                    <span className="text-gray-400 text-[9px] uppercase italic font-bold leading-none">
                      🏦 {formasById.get(t.forma_pagamento_id)?.nome || 'Sem Banco'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-black text-gray-700 uppercase italic leading-none text-[12px]">{t.description}</p>
                      {t.recorrencia?.ativo && <span title="Recorrente" className="text-[10px]">🔁</span>}
                    </div>
                    {t.observacao && <p className="text-[9px] text-bb-blue font-bold italic truncate max-w-[200px]">📝 {t.observacao}</p>}
                  </td>
                  <td className={`px-6 py-4 text-right font-black text-[13px] italic ${t.tipo === TipoTransacao.RECEITA ? 'text-emerald-600' : 'text-bb-blue'}`}>
                    {t.codigo_pais === 'PT' ? '€' : 'R$'} {t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusStyle(t.status)}`}>{t.status}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => {
                          // Hardening: garante defaults (especialmente recorrência) ao editar dados antigos.
                          const merged: Partial<Transacao> = {
                            ...initialForm,
                            ...t,
                            recorrencia: {
                              ...initialForm.recorrencia!,
                              ...(t.recorrencia ?? {}),
                              meses_selecionados: (t.recorrencia?.meses_selecionados ?? []),
                            },
                          };
                          setFormData(merged);
                          setEditingTxId(t.id);
                          setIsModalOpen(true);
                        }}
                        className="w-8 h-8 bg-bb-blue text-white rounded-lg flex items-center justify-center shadow-md"
                      >
                        ✏️
                      </button>
                      <button onClick={() => onDelete(t.id)} className="w-8 h-8 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white border border-red-100">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>


      {/* Sprint 2.6: Paginação incremental */}
      <div className="flex items-center justify-between px-2">
  <div className="flex items-center gap-2">
    {isCloud && (
      <>
        <span className="text-xs text-gray-500">Página</span>
        <select
          className="border rounded-lg px-2 py-1 text-xs"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          <option value={20}>20</option>
          <option value={30}>30</option>
          <option value={50}>50</option>
        </select>
      </>
    )}
    {isCloud && cloudError && <span className="text-xs text-red-600">{cloudError}</span>}
  </div>
        <p className="text-xs text-gray-500">
          Mostrando <span className="font-semibold">{visibleTxs.length}</span> de <span className="font-semibold">{filteredTxs.length}</span> lançamentos
        </p>

        {canLoadMore && (
          <button
            type="button"
            onClick={handleLoadMore}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-bb-blue text-white hover:opacity-90 transition"
          >
            {isCloud && cloudLoading ? 'Carregando...' : 'Ver mais'}
          </button>
        )}
      </div>


      {isModalOpen && (
        <div className="fixed inset-0 bg-bb-blue/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl p-10 space-y-8 animate-in zoom-in duration-300 overflow-y-auto max-h-[95vh] scrollbar-hide">
             <div className="flex justify-between items-start border-b border-gray-100 pb-6">
               <div>
                 <h3 className="text-2xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Registro de Fluxo PHD</h3>
                 <p className="text-[10px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">Mapeamento Contábil e Recorrência</p>
               </div>
               <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-50 w-10 h-10 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 transition-all border border-gray-100">✕</button>
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-7 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Data Competência</label>
                          <input type="date" required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.data_competencia} onChange={e => setFormData({...formData, data_competencia: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Data Pagamento</label>
                          <input type="date" required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.data_prevista_pagamento} onChange={e => setFormData({...formData, data_prevista_pagamento: e.target.value})} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Tipo de Fluxo</label>
                          <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                             <button type="button" onClick={() => setFormData({...formData, tipo: TipoTransacao.DESPESA})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.tipo === TipoTransacao.DESPESA ? 'bg-white text-red-500 shadow-sm border border-gray-100' : 'text-gray-400'}`}>Saída</button>
                             <button type="button" onClick={() => setFormData({...formData, tipo: TipoTransacao.RECEITA})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${formData.tipo === TipoTransacao.RECEITA ? 'bg-white text-emerald-600 shadow-sm border border-gray-100' : 'text-gray-400'}`}>Entrada</button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Banco / Conta</label>
                          <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.forma_pagamento_id} onChange={e => setFormData({...formData, forma_pagamento_id: e.target.value})}><option value="">Selecione banco...</option>{formasPagamento.map(fp => <option key={fp.id} value={fp.id}>{fp.nome}</option>)}</select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Categoria</label>
                          <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.categoria_id} onChange={e => setFormData({...formData, categoria_id: e.target.value, conta_contabil_id: ''})}><option value="">Selecione...</option>{categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Item Específico</label>
			                  <select required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.conta_contabil_id} onChange={e => setFormData({...formData, conta_contabil_id: e.target.value})}><option value="">Selecione...</option>{contasDaCategoriaSelecionada.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}</select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Identificador (Descrição)</label>
                      <input required className="w-full bg-gray-50 p-4 rounded-xl text-xs font-black border border-gray-100" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Ex: Aluguel Fevereiro..." />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2">Valor da Operação</label>
                      <div className="relative">
                         <input type="number" step="0.01" required className="w-full bg-bb-blue/5 p-5 rounded-xl text-2xl font-black text-bb-blue border border-bb-blue/10 outline-none focus:ring-4 focus:ring-bb-blue/10 pl-12" value={formData.valor || ''} onChange={e => setFormData({...formData, valor: Number(e.target.value)})} placeholder="0,00" />
                         <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-bb-blue opacity-30 italic">{formData.codigo_pais === 'PT' ? '€' : 'R$'}</span>
                      </div>
                    </div>
                </div>
                
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-gray-50/50 p-6 rounded-[1.5rem] border border-gray-100 space-y-6">
                        <div className="flex justify-between items-center border-b border-gray-200 pb-3">
                           <h4 className="text-[11px] font-black text-bb-blue uppercase italic tracking-widest">Recorrência & Parcelas</h4>
	                           <button
	                             type="button"
	                             onClick={() => {
	                               const currentRec = formData.recorrencia ?? initialForm.recorrencia!;
	                               const nextActive = !currentRec.ativo;
	                               // UX: ao ativar recorrência por MESES, pré-seleciona o mês do lançamento (se ainda vazio).
	                               const baseMonth = Number((formData.data_prevista_pagamento || new Date().toISOString().split('T')[0]).split('-')[1] || '') || (new Date().getMonth() + 1);
	                               const meses = currentRec.tipo_frequencia === 'MESES' && (currentRec.meses_selecionados ?? []).length === 0 && nextActive
	                                 ? [baseMonth]
	                                 : (currentRec.meses_selecionados ?? []);

	                               setFormData({
	                                 ...formData,
	                                 recorrencia: {
	                                   ...currentRec,
	                                   ativo: nextActive,
	                                   meses_selecionados: meses,
	                                   // para MESES, vezes_por_ano será derivado do tamanho da seleção
	                                   vezes_por_ano: currentRec.tipo_frequencia === 'MESES' ? (meses.length || 1) : currentRec.vezes_por_ano,
	                                 },
	                               });
	                             }}
	                             className={`w-10 h-5 rounded-full relative transition-all ${formData.recorrencia?.ativo ? 'bg-bb-blue' : 'bg-gray-300'}`}
	                           >
                              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${formData.recorrencia?.ativo ? 'right-0.5' : 'left-0.5'}`}></div>
                           </button>
                        </div>
                        
                        {formData.recorrencia?.ativo && (
                          <div className="space-y-3 animate-in slide-in-from-top-2">
                            {/* Linha compacta: frequência + duração */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Frequência</label>
                                <select
                                  className="w-full bg-white p-2.5 rounded-xl text-[11px] font-black border border-gray-100"
                                  value={formData.recorrencia?.tipo_frequencia}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      recorrencia: {
                                        ...formData.recorrencia!,
                                        tipo_frequencia: e.target.value as any,
                                        // Reset de meses ao alternar para DIAS
                                        meses_selecionados: e.target.value === 'DIAS' ? [] : (formData.recorrencia?.meses_selecionados ?? []),
                                      },
                                    })
                                  }
                                >
                                  <option value="MESES">Meses</option>
                                  <option value="DIAS">Dias</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Duração (anos)</label>
                                <input
                                  type="number"
                                  min={1}
                                  className="w-full bg-white p-2.5 rounded-xl text-[11px] font-black border border-gray-100"
                                  value={formData.recorrencia?.quantidade_anos ?? 1}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      recorrencia: {
                                        ...formData.recorrencia!,
                                        quantidade_anos: Number(e.target.value),
                                      },
                                    })
                                  }
                                />
                              </div>
                            </div>

                            {/* MESES: seleção por botões Jan-Dez */}
                            {formData.recorrencia?.tipo_frequencia === 'MESES' ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Meses</label>
                                  <span className="text-[9px] font-black uppercase text-bb-blue/60">
                                    {((formData.recorrencia?.meses_selecionados ?? []).length || 0)}x/ano
                                  </span>
                                </div>
                                <div className="grid grid-cols-6 gap-2">
                                  {MONTHS_PT.map((m) => {
                                    const selected = (formData.recorrencia?.meses_selecionados ?? []).includes(m.value);
                                    return (
                                      <button
                                        key={m.value}
                                        type="button"
                                        onClick={() => {
                                          const current = formData.recorrencia?.meses_selecionados ?? [];
                                          const next = selected
                                            ? current.filter((x) => x !== m.value)
                                            : [...current, m.value];
                                          setFormData({
                                            ...formData,
                                            recorrencia: {
                                              ...formData.recorrencia!,
                                              meses_selecionados: next,
                                              vezes_por_ano: next.length || 1,
                                            },
                                          });
                                        }}
                                        className={`py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${
                                          selected
                                            ? 'bg-bb-blue text-white border-bb-blue shadow-sm'
                                            : 'bg-white text-gray-400 border-gray-100 hover:border-bb-blue/20'
                                        }`}
                                      >
                                        {m.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                <p className="text-[8px] text-gray-400 italic font-bold">
                                  Selecione os meses em que este lançamento deve ocorrer. Ex.: IMI (Mai/Ago/Nov).
                                </p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Intervalo (dias)</label>
                                  <input
                                    type="number"
                                    min={1}
                                    className="w-full bg-white p-2.5 rounded-xl text-[11px] font-black border border-gray-100"
                                    value={formData.recorrencia?.vezes_por_ano ?? 30}
                                    onChange={(e) =>
                                      setFormData({
                                        ...formData,
                                        recorrencia: {
                                          ...formData.recorrencia!,
                                          vezes_por_ano: Number(e.target.value),
                                        },
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Info</label>
                                  <div className="w-full bg-white p-2.5 rounded-xl text-[10px] font-bold border border-gray-100 text-gray-400">
                                    Ex.: 30 = mensal aproximado
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <h4 className="text-[11px] font-black text-bb-blue uppercase italic tracking-widest border-b border-gray-200 pb-3">Observações Adicionais</h4>
                        <textarea className="w-full bg-white p-3 rounded-xl text-[10px] font-bold border border-gray-100 outline-none h-24" value={formData.observacao} onChange={e => setFormData({...formData, observacao: e.target.value})} placeholder="Detalhes técnicos, links ou notas de auditoria..."></textarea>
                    </div>
                </div>
             </div>
             
             <div className="flex flex-wrap justify-between items-center bg-gray-50 p-6 rounded-[1.5rem] border border-gray-100 gap-6">
                <div className="flex-1 min-w-[300px]">
                   <label className="text-[10px] font-black uppercase text-bb-blue italic ml-2 mb-2 block">Estágio Financeiro Atual</label>
                   <div className="grid grid-cols-4 gap-2">
                      {(
                        [
                          { value: 'PLANEJADO', label: 'Planejado' },
                          { value: 'PENDENTE', label: 'Aberto' },
                          { value: 'PAGO', label: 'Pago' },
                          { value: 'ATRASADO', label: 'Atrasado' },
                        ] as Array<{ value: StatusTransacao; label: string }>
                      ).map((st) => (
                        <button 
                          key={st.value}
                          type="button"
                          onClick={() => setFormData({...formData, status: st.value})}
                          className={`py-3 rounded-xl text-[9px] font-black uppercase transition-all border ${formData.status === st.value ? 'bg-bb-blue text-white border-bb-blue shadow-md' : 'bg-white text-gray-400 border-gray-100 hover:border-bb-blue/20'}`}
                        >
                          {st.label}
                        </button>
                      ))}
                   </div>
                </div>
                <div className="flex gap-6 items-center sm:ml-auto">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="text-[11px] font-black uppercase text-gray-400 hover:text-red-500 italic transition-all">Descartar</button>
                   <button
                     type="submit"
                     disabled={saving}
                     className={`bg-bb-blue text-white px-12 py-4 rounded-xl font-black uppercase text-[11px] transition-all ${saving ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
                   >
                     {saving ? 'Salvando...' : 'Sincronizar Dados'}
                   </button>
                </div>
             </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Ledger;
