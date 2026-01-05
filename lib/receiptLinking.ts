// lib/receiptLinking.ts
// Sprint 3.1: fundação para vínculo bidirecional Recibos ↔ Lançamentos.
// Arquivo 100% puro (sem Firestore): apenas drafts/patches/validações.

import { TipoTransacao } from "../types";
import type { Receipt, Transacao, StatusTransacao } from "../types";

export type LinkSyncSource = "RECEIPT" | "TRANSACAO";

export type ReceiptTransacaoLink = {
  receiptId: string;
  transacaoId: string;
};

export type LinkWarning = {
  code: string;
  message: string;
};

/**
 * Importante:
 *  - Sprint 3.2: docId do Recibo = Receipt.internal_id
 *  - docId da Transação vinculada = `TX_${internal_id}` (ou outro txId existente em receipt.transacao_id)
 * Estas funções viram o ponto único de ajuste para futuras migrações.
 */
export function getReceiptDocId(receipt: Receipt): string {
  // Sprint 3.2: o docId do recibo passa a ser o `internal_id`.
  // Fallback para compatibilidade com dados legados.
  return receipt.internal_id || receipt.id;
}

export function getTransacaoDocId(tx: Transacao): string {
  return tx.id;
}

export function statusFromIsPaid(isPaid: boolean): StatusTransacao {
  return isPaid ? "PAGO" : "PLANEJADO";
}

export function isPaidFromStatus(status?: StatusTransacao): boolean {
  return status === "PAGO";
}

/** Escolhe o melhor valor para representar o recebimento no Ledger. */
export function pickReceiptAmount(receipt: Receipt): number {
  const candidates = [receipt.received_amount, receipt.net_amount, receipt.base_amount];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

/** Data de competência padrão para a transação derivada de recibo. */
export function pickReceiptCompetenciaDate(receipt: Receipt): string {
  return receipt.pay_date ?? receipt.issue_date;
}

/** Data prevista de pagamento padrão. Se existir pay_date, usa; senão issue_date. */
export function pickReceiptPrevistaPagamentoDate(receipt: Receipt): string {
  return receipt.pay_date ?? receipt.issue_date;
}

export function buildTransacaoDescriptionFromReceipt(receipt: Receipt): string {
  const base = (receipt.description ?? "").trim();
  const numero = (receipt.id ?? "").trim();
  if (base && numero) return `${base} (#${numero})`;
  if (base) return base;
  if (numero) return `Recibo (#${numero})`;
  return "Recibo";
}

/**
 * Monta um draft de Transação a partir de um Recibo.
 * - Não inclui `id` (id é decisão do chamador).
 * - Inclui receipt_id com base no docId atual do recibo.
 */
export function buildTransacaoFromReceipt(
  receipt: Receipt,
  opts?: {
    origem?: Transacao["origem"];
    /** Permite sobrescrever o tipo (default: RECEITA). */
    tipo?: TipoTransacao;
  }
): Omit<Transacao, "id"> {
  const tipo = opts?.tipo ?? TipoTransacao.RECEITA;

  return {
    workspace_id: receipt.workspace_id,
    codigo_pais: receipt.country_code,
    categoria_id: receipt.categoria_id,
    conta_contabil_id: receipt.conta_contabil_id,
    forma_pagamento_id: receipt.forma_pagamento_id,
    tipo,
    data_competencia: pickReceiptCompetenciaDate(receipt),
    data_prevista_pagamento: pickReceiptPrevistaPagamentoDate(receipt),
    description: buildTransacaoDescriptionFromReceipt(receipt),
    observacao: undefined,
    valor: pickReceiptAmount(receipt),
    status: statusFromIsPaid(receipt.is_paid),
    origem: opts?.origem ?? "MANUAL",
    recorrencia: undefined,
    recorrencia_grupo_id: undefined,
    recorrencia_seq: undefined,
    receipt_id: getReceiptDocId(receipt),
    parcela_atual: undefined,
    total_parcelas: undefined,
    saldo_devedor_restante: undefined,
    juros_pagos: undefined,
    capital_amortizado: undefined,
    data_revisao_taxa: undefined,
  };
}

/**
 * Patch mínimo a aplicar em Transação existente quando a edição nasceu no Recibo.
 * Precedência (Sprint 3.1): recibo manda em valor/datas/categorias/descrição/status.
 */
export function patchTransacaoFromReceipt(receipt: Receipt): Partial<Transacao> {
  return {
    codigo_pais: receipt.country_code,
    categoria_id: receipt.categoria_id,
    conta_contabil_id: receipt.conta_contabil_id,
    forma_pagamento_id: receipt.forma_pagamento_id,
    tipo: TipoTransacao.RECEITA,
    data_competencia: pickReceiptCompetenciaDate(receipt),
    data_prevista_pagamento: pickReceiptPrevistaPagamentoDate(receipt),
    description: buildTransacaoDescriptionFromReceipt(receipt),
    valor: pickReceiptAmount(receipt),
    status: statusFromIsPaid(receipt.is_paid),
    receipt_id: getReceiptDocId(receipt),
  };
}

/**
 * Patch mínimo a aplicar em Recibo existente quando a edição nasceu no Ledger.
 * Precedência (Sprint 3.1): ledger manda em status/pago.
 */
export function patchReceiptFromTransacao(tx: Transacao): Partial<Receipt> {
  const isPaid = isPaidFromStatus(tx.status);

  const patch: Partial<Receipt> = {
    is_paid: isPaid,
    transacao_id: getTransacaoDocId(tx),
  };

  // Se houver pay_date no modelo (opcional), podemos espelhar ao marcar como pago.
  if (isPaid) {
    patch.pay_date = tx.data_prevista_pagamento ?? tx.data_competencia;
  }

  return patch;
}

/** Gera os IDs de vínculo (docIds) a serem gravados em ambos os lados. */
export function buildLinkIds(receipt: Receipt, tx: Transacao): ReceiptTransacaoLink {
  return {
    receiptId: getReceiptDocId(receipt),
    transacaoId: getTransacaoDocId(tx),
  };
}

/**
 * Valida se receipt e transacao estão coerentes para o vínculo.
 * Retorna warnings (não lança erro) para facilitar hardening no Sprint 3.7.
 */
export function validateReceiptTransacaoLink(receipt: Receipt, tx: Transacao): LinkWarning[] {
  const warnings: LinkWarning[] = [];

  const receiptId = getReceiptDocId(receipt);
  const txId = getTransacaoDocId(tx);

  if (receipt.transacao_id && receipt.transacao_id !== txId) {
    warnings.push({
      code: "RECEIPT_TRANSACAO_ID_MISMATCH",
      message: `Recibo.transacao_id aponta para '${receipt.transacao_id}', mas a transação atual é '${txId}'.`,
    });
  }

  if (tx.receipt_id && tx.receipt_id !== receiptId) {
    warnings.push({
      code: "TRANSACAO_RECEIPT_ID_MISMATCH",
      message: `Transacao.receipt_id aponta para '${tx.receipt_id}', mas o recibo atual é '${receiptId}'.`,
    });
  }

  if (tx.codigo_pais !== receipt.country_code) {
    warnings.push({
      code: "COUNTRY_CODE_MISMATCH",
      message: `País divergente: transacao.codigo_pais='${tx.codigo_pais}' vs receipt.country_code='${receipt.country_code}'.`,
    });
  }

  const paidFromTx = isPaidFromStatus(tx.status);
  if (paidFromTx !== receipt.is_paid) {
    warnings.push({
      code: "PAID_STATUS_MISMATCH",
      message: `Pago divergente: transacao.status='${tx.status}' vs receipt.is_paid='${receipt.is_paid}'.`,
    });
  }

  return warnings;
}
