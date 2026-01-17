// lib/financeRules.ts
// Regras de negócio compartilháveis (sem acoplar em UI)

import type { Transacao } from '../types';

function normalizeKey(input: unknown): string {
  return String(input ?? '')
    .trim()
    .toUpperCase()
    // Remove acentos
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Colapsa espaços
    .replace(/\s+/g, ' ');
}

/**
 * Regra 1: Pagamento de Cartão de Crédito (Categoria = "Pagamentos"; Item = "Cartão de Crédito")
 * não deve entrar no somatório de despesas/saídas, pois já foi computado quando a despesa
 * do cartão foi lançada.
 */
export function isCreditCardPaymentNames(params: {
  categoriaNome?: string;
  itemNome?: string;
}): boolean {
  const categoria = normalizeKey(params.categoriaNome);
  const item = normalizeKey(params.itemNome);

  if (!categoria || !item) return false;
  if (categoria !== 'PAGAMENTOS') return false;

  // Match preferencial: exato (com ou sem acento)
  if (item === 'CARTAO DE CREDITO' || item === 'CARTAO CREDITO') return true;

  // Fallback tolerante: contém os termos principais
  if (item.includes('CARTAO') && item.includes('CREDITO')) return true;

  return false;
}

export function isCreditCardPaymentTx(
  tx: Pick<Transacao, 'tipo'>,
  params: { categoriaNome?: string; itemNome?: string }
): boolean {
  // Aceita tanto enum/string literal quanto valores já serializados.
  const tipo = normalizeKey((tx as any)?.tipo);
  if (tipo !== 'DESPESA') return false;

  return isCreditCardPaymentNames(params);
}
