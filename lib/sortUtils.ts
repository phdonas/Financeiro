/**
 * Helpers de ordenação (Regra 3)
 *
 * Estratégia escolhida: ordenar listas A–Z no ponto de uso (UI) com helper único.
 * Isso reduz risco de regressão (não mexe em cadastros/IDs, só na apresentação).
 */

export type HasNome = { nome?: unknown };

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");

/**
 * Ordena itens por `nome` usando localeCompare.
 * Usa sensitivity 'base' para ignorar acentos/case na comparação.
 */
export function sortByNome<T extends HasNome>(
  items: T[] | undefined | null,
  locale: string = "pt-BR"
): T[] {
  const arr = Array.isArray(items) ? items.slice() : [];
  arr.sort((a, b) =>
    norm(a?.nome).localeCompare(norm(b?.nome), locale, { sensitivity: "base" })
  );
  return arr;
}
