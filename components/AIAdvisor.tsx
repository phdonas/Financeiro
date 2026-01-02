import React, { useMemo, useState } from "react";
import { GoogleGenAI } from "@google/genai";

type Transacao = {
  id: string;
  tipo?: "DESPESA" | "RECEITA" | string;
  valor?: number | string;
  codigo_pais?: string;
  date?: string;
  categoria_id?: string;
};

type Investimento = {
  id: string;
  current_value?: number | string;
  country_code?: string;
};

type Props = {
  transacoes?: Transacao[];
  investimentos?: Investimento[];
};

export default function AIAdvisor({ transacoes, investimentos }: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // ✅ arrays sempre seguros
  const safeTransacoes = useMemo(
    () => (Array.isArray(transacoes) ? transacoes : []),
    [transacoes]
  );

  const safeInvestimentos = useMemo(
    () => (Array.isArray(investimentos) ? investimentos : []),
    [investimentos]
  );

  // ✅ em Vite, variáveis vêm de import.meta.env (não process.env)
  // Use VITE_GEMINI_API_KEY (recomendado) ou VITE_API_KEY (fallback)
  const apiKey =
    (import.meta as any)?.env?.VITE_GEMINI_API_KEY ||
    (import.meta as any)?.env?.VITE_API_KEY ||
    "";

  const ai = useMemo(() => {
    if (!apiKey) return null;
    try {
      return new GoogleGenAI({ apiKey });
    } catch {
      return null;
    }
  }, [apiKey]);

  const summary = useMemo(() => {
    const totalGasto = safeTransacoes
      .filter((t) => t?.tipo === "DESPESA")
      .reduce((acc, t) => acc + Number(t?.valor ?? 0), 0);

    const totalRecebido = safeTransacoes
      .filter((t) => t?.tipo === "RECEITA")
      .reduce((acc, t) => acc + Number(t?.valor ?? 0), 0);

    const patrimonio = safeInvestimentos.reduce(
      (acc, a) => acc + Number(a?.current_value ?? 0),
      0
    );

    const paises = Array.from(
      new Set(safeTransacoes.map((t) => t?.codigo_pais).filter(Boolean))
    );

    return { totalGasto, totalRecebido, patrimonio, paises };
  }, [safeTransacoes, safeInvestimentos]);

  async function handleAsk() {
    if (!ai) {
      setAnswer(
        "⚠️ Chave da API (Gemini) não configurada. Configure VITE_GEMINI_API_KEY no ambiente de build."
      );
      return;
    }

    if (!question.trim()) return;

    setLoading(true);
    setAnswer("");

    try {
      const prompt = `
Você é um consultor financeiro pessoal. 
Aqui está um resumo dos meus dados:
- Total de despesas: ${summary.totalGasto}
- Total de receitas: ${summary.totalRecebido}
- Patrimônio (investimentos): ${summary.patrimonio}
- Países detectados nas transações: ${summary.paises.join(", ") || "N/A"}

Pergunta: ${question}

Responda com:
1) Diagnóstico
2) Sugestões práticas
3) Próximos passos (checklist)
`;

      const resp = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt
      });

      const text =
        (resp as any)?.text ||
        (resp as any)?.response?.text ||
        JSON.stringify(resp, null, 2);

      setAnswer(typeof text === "string" ? text : JSON.stringify(text, null, 2));
    } catch (err: any) {
      setAnswer(`Erro ao consultar IA: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        Consultor IA
      </h2>

      <div style={{ marginBottom: 12, fontSize: 14 }}>
        <div>Despesas: {summary.totalGasto}</div>
        <div>Receitas: {summary.totalRecebido}</div>
        <div>Patrimônio: {summary.patrimonio}</div>
        <div>Países: {summary.paises.join(", ") || "—"}</div>
      </div>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Escreva sua pergunta..."
        style={{ width: "100%", minHeight: 90, padding: 10 }}
      />

      <button
        onClick={handleAsk}
        disabled={loading}
        style={{ marginTop: 10, padding: "8px 12px", cursor: "pointer" }}
      >
        {loading ? "Consultando..." : "Perguntar"}
      </button>

      {answer && (
        <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{answer}</pre>
      )}
    </div>
  );
}

