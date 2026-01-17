import type { FormaPagamento } from "../types";

/**
 * Defaults de negócio (Regra 2)
 *
 * - PT: default deve ser "NB" (Novo Banco) quando existir como item exato.
 * - BR: default deve ser "BB" (Banco do Brasil) quando existir como item exato.
 *
 * Importante: a lista de bancos pode conter opções como "NB VISA D" e "NB VISA P".
 * Não devemos escolher o primeiro que "contém NB" — precisamos priorizar match exato.
 */

type Country = "PT" | "BR";

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

export function getDefaultBankId(
  formasPagamento: FormaPagamento[] | undefined | null,
  country: Country
): string {
  const list = Array.isArray(formasPagamento) ? formasPagamento : [];
  const mapped = list.map((fp) => ({ id: fp.id, nome: norm(fp.nome) }));

  const pickExact = (names: string[]) =>
    mapped.find((x) => names.includes(x.nome))?.id;

  const pickFirst = (pred: (nome: string) => boolean) =>
    mapped.find((x) => pred(x.nome))?.id;

  if (country === "PT") {
    // 1) match exato NB
    const exact = pickExact(["NB"]);
    if (exact) return exact;

    // 2) sinônimos de Novo Banco
    const novoBanco = pickExact(["NOVO BANCO", "NOVOBANCO", "NOVO-BANCO"]);
    if (novoBanco) return novoBanco;

    // 3) fallback seguro: opções que começam com NB (evita pegar aleatoriamente algo que só contém NB)
    const nbStarts = pickFirst((n) => n.startsWith("NB ") || n === "NB");
    if (nbStarts) return nbStarts;

    // 4) último fallback: contém NB ou Novo Banco
    const contains =
      pickFirst((n) => n.includes(" NB")) ||
      pickFirst((n) => n.includes("NB")) ||
      pickFirst((n) => n.includes("NOVO BANCO")) ||
      pickFirst((n) => n.includes("NOVOBANCO"));
    return contains || list[0]?.id || "";
  }

  // BR
  const exact = pickExact(["BB"]);
  if (exact) return exact;

  const bancoDoBrasil = pickExact(["BANCO DO BRASIL"]);
  if (bancoDoBrasil) return bancoDoBrasil;

  const starts = pickFirst((n) => n.startsWith("BB ") || n === "BB");
  if (starts) return starts;

  const contains =
    pickFirst((n) => n.includes("BANCO DO BRASIL")) ||
    pickFirst((n) => n.endsWith(" BB") || n.includes(" BB ") || n.includes("BB "));

  return contains || list[0]?.id || "";
}
