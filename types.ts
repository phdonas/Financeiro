
export enum TipoTransacao {
  DESPESA = 'DESPESA',
  RECEITA = 'RECEITA',
  TRANSFERENCIA = 'TRANSFERENCIA',
  PAGAMENTO_FATURA = 'PAGAMENTO_FATURA'
}

export type StatusTransacao = 'PAGO' | 'PENDENTE' | 'ATRASADO' | 'PLANEJADO';

export interface ContaItem {
  id: string;
  nome: string;
  fornecedor_padrao?: string;
  codigo_pais: 'PT' | 'BR';
  observacao?: string;
}

export interface CategoriaContabil {
  id: string;
  nome: string;
  tipo: TipoTransacao;
  contas: ContaItem[];
}

export interface FormaPagamento {
  id: string;
  nome: string;
  categoria: 'BANCO' | 'CARTAO' | 'DINHEIRO';
}

export interface Fornecedor {
  id: string;
  nome: string;
  pais: 'PT' | 'BR';
  descricao: string;
  flag_calcula_premiacao: boolean;
}

export interface Orcamento {
  id: string;
  categoria_id: string;
  ano: number;
  mes: number;
  valor_meta: number;
  codigo_pais: 'PT' | 'BR';
}

export interface ConfigRecorrencia {
  status_recorrencia?: string;
  ativo: boolean;
  tipo_frequencia: 'DIAS' | 'MESES';
  meses_selecionados?: number[];
  vezes_por_ano: number;
  quantidade_anos: number;
}

export interface Transacao {
  id: string;
  workspace_id: string;
  codigo_pais: 'PT' | 'BR';
  categoria_id: string; 
  conta_contabil_id: string; 
  forma_pagamento_id: string;
  /** Fornecedor (quando aplicável). Sprint 3.3: Recibos propagam para o Lançamento vinculado. */
  fornecedor_id?: string;
  tipo: TipoTransacao;
  data_competencia: string; 
  data_prevista_pagamento: string;
  description: string;
  observacao?: string;
  valor: number;
  status: StatusTransacao;
  origem: 'IMPORTACAO' | 'MANUAL';
  recorrencia?: ConfigRecorrencia;
  recorrencia_grupo_id?: string;
  recorrencia_seq?: number;
  receipt_id?: string;
  /** Sprint 4.4: vínculo com registro INSS (quando aplicável). */
  inss_record_id?: string;
  parcela_atual?: number;
  total_parcelas?: number;
  saldo_devedor_restante?: number;
  juros_pagos?: number;
  capital_amortizado?: number;
  data_revisao_taxa?: string;
}

export interface Receipt {
  id: string; 
  internal_id: string; 
  workspace_id: string;
  country_code: 'PT' | 'BR';
  issue_date: string;
  /** Data de pagamento/recebimento (quando aplicável). Opcional para compatibilidade retroativa. */
  pay_date?: string;
  fornecedor_id: string;
  categoria_id: string; 
  conta_contabil_id: string;
  forma_pagamento_id: string;
  base_amount: number; 
  irs_rate?: number;
  irs_amount?: number;
  iva_rate?: number;
  iva_amount?: number;
  inss_rate?: number;
  inss_amount?: number;
  irpf_rate?: number;
  irpf_amount?: number;
  net_amount: number; 
  received_amount: number; 
  description: string;
  is_paid: boolean;
  flag_calcula_premiacao: boolean;
  /** ID da transação vinculada no Ledger (Sprint 3). */
  transacao_id?: string;
  document_url?: string;
}

export interface InssRecord {
  id: string;
  /** Sprint 4.4: id do lançamento vinculado no Ledger (transacoes). */
  transacao_id?: string;
  /** Import INSS: marcação manual para inserir no Ledger (staging). */
  lancar_no_ledger?: boolean;
  numero_parcela: number;
  quem: 'Paulo' | 'Débora';
  competencia: string;
  vencimento: string;
  status: StatusTransacao;
  valor: number;
  salario_base: number;
}

export interface InssYearlyConfig {
  id?: string;
  ano: number;
  salario_base: number;
  percentual_inss: number;
  paulo: { nit: string; total_parcelas: number; data_aposentadoria: string };
  debora: { nit: string; total_parcelas: number; data_aposentadoria: string };
}

export type InvestmentTransactionType = 'BUY' | 'SELL' | 'YIELD' | 'REVALUATION';

export interface InvestmentTransaction {
  id: string;
  date: string;
  type: InvestmentTransactionType;
  value: number;
  description?: string;
}

export interface InvestmentAsset {
  id: string;
  country_code: 'PT' | 'BR';
  name: string;
  type: 'FIXED' | 'VARIABLE' | 'CRYPTO';
  institution: string;
  initial_balance: number;
  current_value: number;
  yield_target_monthly?: number;
  history?: InvestmentTransaction[];
}

/** -------------------- Sprint 5: Import/Export + Logs + Paridade -------------------- */

export type ImportType =
  | "LANCAMENTOS_PT"
  | "LANCAMENTOS_BR"
  | "RECIBOS"
  | "INSS";

export type ImportEntityKey =
  | "transacoes"
  | "receipts"
  | "inssConfigs"
  | "inssRecords";

export type ImportMappingColumns = Record<string, string>; // campo -> nome da coluna no arquivo

export type ImportMappingUsed = {
  autoDetected: boolean;
  columns: ImportMappingColumns;
};

export type ImportDateRange = {
  min: string; // YYYY-MM-DD
  max: string; // YYYY-MM-DD
};

export type ImportCounts = {
  totalRows: number;
  validRows: number;
  inserted: number;
  updated: number;
  dedupedSkipped: number;
  invalidSkipped: number;
};

export type ImportWarnings = {
  missingCategorias?: number;
  missingItens?: number;
  missingContas?: number;
  missingFornecedores?: number;
  invalidDates?: number;
  invalidValues?: number;
};

/**
 * Snapshot de paridade persistido no ImportLog.
 * Sprint 5.1: contrato mínimo (evolui no 5.6).
 */
export type ParitySnapshot = {
  /**
   * chave agregadora (ex.: 2026-01|PT|categoriaId|contaId)
   * valores: totais e divergências.
   */
  totalsByKey: Record<
    string,
    {
      fileTotal: number;
      appTotal: number;
      diff: number;
      diffPct?: number;
      countFile?: number;
      countApp?: number;
    }
  >;
  topDivergences?: Array<{
    key: string;
    fileTotal: number;
    appTotal: number;
    diff: number;
    diffPct?: number;
  }>;
};

export type ImportCreatedBy = {
  uid: string;
  displayName?: string | null;
  email?: string | null;
};

export type ImportSourceFile = {
  name: string;
  size?: number;
  lastModified?: number;
};

export interface ImportLog {
  id: string;
  householdId: string;
  createdAt?: any; // Timestamp (evita dependência direta do firebase no types)
  createdBy: ImportCreatedBy;
  importType: ImportType;
  sourceFile?: ImportSourceFile;
  mappingUsed?: ImportMappingUsed;
  dateRange?: ImportDateRange;
  counts: ImportCounts;
  warnings?: ImportWarnings;
  paritySnapshot?: ParitySnapshot;
  notes?: string;
}
