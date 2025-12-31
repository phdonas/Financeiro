
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
  tipo: TipoTransacao;
  data_competencia: string; 
  data_prevista_pagamento: string;
  description: string;
  observacao?: string;
  valor: number;
  status: StatusTransacao;
  origem: 'IMPORTACAO' | 'MANUAL';
  recorrencia?: ConfigRecorrencia;
  receipt_id?: string;
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
  document_url?: string; // Novo campo Fase 3
}

export interface InssRecord {
  id: string;
  numero_parcela: number;
  quem: 'Paulo' | 'Débora';
  competencia: string;
  vencimento: string;
  status: StatusTransacao;
  valor: number;
  salario_base: number;
}

export interface InssYearlyConfig {
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
