import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Transacao, CategoriaContabil, FormaPagamento, Fornecedor, TipoTransacao, StatusTransacao, Receipt } from '../types';

interface ImportSectionProps {
  categorias: CategoriaContabil[];
  formasPagamento: FormaPagamento[];
  fornecedores: Fornecedor[];
  onSaveTx: (t: Transacao) => void;
  onSaveReceipt: (r: Receipt) => void;
}

type ImportType = 'RECIBOS' | 'LANCAMENTOS_BR' | 'LANCAMENTOS_PT';
type ImportStep = 'TYPE_SELECT' | 'UPLOAD' | 'REVIEW';

interface ParsedRow {
  id: string;
  data: any; 
  isValid: boolean;
  errors: string[];
  displayInfo: {
    data: string;
    identificador: string;
    categoria: string;
    valor: number;
    detalhe?: string;
  };
}

const ImportSection: React.FC<ImportSectionProps> = ({ 
  categorias, formasPagamento, fornecedores, onSaveTx, onSaveReceipt
}) => {
  const [currentStep, setCurrentStep] = useState<ImportStep>('TYPE_SELECT');
  const [importType, setImportType] = useState<ImportType | null>(null);
  const [importResults, setImportResults] = useState<ParsedRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const convertToISODate = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'number') {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      return date.toISOString().split('T')[0];
    }
    const s = String(val).trim();
    const parts = s.split(/[/-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return s;
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return '';
  };

  const processFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !importType) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result;
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
      
      // Versão Base: Pula rigorosamente 3 linhas de cabeçalho informativo
      if (rows.length >= 4) {
        parseRows(rows.slice(3));
      } else {
        alert("A planilha não atende ao layout Premium PHD (3 linhas de header).");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseRows = (rows: any[][]) => {
    const results: ParsedRow[] = rows.map((row) => {
      // Ignora linhas totalmente vazias ou sem data
      if (!row[0] || String(row[0]).trim() === '') return null;

      const errors: string[] = [];
      const isoDate = convertToISODate(row[0]);
      if (!isoDate) errors.push("Formato de data inválido na Coluna A");

      if (importType === 'RECIBOS') {
        /**
         * MAPEAMENTO RECIBOS PT (VERSÃO BASE):
         * A:Data | B:Nº Recibo | C:Fornecedor | D:Categoria | E:Item | F:Descrição | G:Base | H:IRS% | I:IVA% | J:Status(S/N)
         */
        const rId = String(row[1] || '').trim();
        const supName = String(row[2] || '').trim();
        const catName = String(row[3] || '').trim();
        const itemName = String(row[4] || '').trim();
        const baseVal = parseFloat(String(row[6] || '0').replace(',', '.'));
        
        const foundSup = fornecedores.find(f => f.nome.toUpperCase() === supName.toUpperCase());
        const foundCat = categorias.find(c => c.nome.toUpperCase() === catName.toUpperCase());
        const foundItem = foundCat?.contas.find(i => i.nome.toUpperCase() === itemName.toUpperCase());

        if (!foundCat) errors.push(`Categoria '${catName}' inexistente`);
        if (!rId) errors.push("Nº do Recibo não informado");

        const irsP = parseFloat(String(row[7] || '11.5').replace(',', '.'));
        const ivaP = parseFloat(String(row[8] || '23').replace(',', '.'));
        const irsA = (baseVal * irsP) / 100;
        const ivaA = (baseVal * ivaP) / 100;

        const receipt: Partial<Receipt> = {
          internal_id: Math.random().toString(36).substr(2, 9),
          id: rId,
          issue_date: isoDate,
          country_code: 'PT',
          fornecedor_id: foundSup?.id || '',
          categoria_id: foundCat?.id || '',
          conta_contabil_id: foundItem?.id || '',
          description: String(row[5] || itemName || 'Emissão Fiscal'),
          base_amount: baseVal,
          irs_rate: irsP,
          iva_rate: ivaP,
          irs_amount: irsA,
          iva_amount: ivaA,
          net_amount: baseVal - irsA,
          received_amount: (baseVal - irsA) + ivaA,
          is_paid: String(row[9]).toUpperCase() === 'S',
          workspace_id: 'fam_01'
        };

        return {
          id: receipt.internal_id!,
          data: receipt,
          isValid: errors.length === 0,
          errors,
          displayInfo: {
            data: isoDate,
            identificador: `REC #${rId}`,
            categoria: catName,
            valor: receipt.received_amount!,
            detalhe: supName
          }
        };

      } else {
        /**
         * MAPEAMENTO LANÇAMENTOS (VERSÃO BASE):
         * A:Data | B:Tipo | C:Conta/Banco | D:Categoria | E:Item | F:Descrição | G:Valor | H:Status(S/N)
         */
        const country = importType === 'LANCAMENTOS_BR' ? 'BR' : 'PT';
        const tipoStr = String(row[1]).toUpperCase();
        const banco = String(row[2] || '').trim();
        const catName = String(row[3] || '').trim();
        const itemName = String(row[4] || '').trim();
        const val = parseFloat(String(row[6] || '0').replace(',', '.'));

        const foundFP = formasPagamento.find(f => f.nome.toUpperCase() === banco.toUpperCase());
        const foundCat = categorias.find(c => c.nome.toUpperCase() === catName.toUpperCase());
        const foundItem = foundCat?.contas.find(i => i.nome.toUpperCase() === itemName.toUpperCase());

        if (!foundCat) errors.push(`Categoria '${catName}' não mapeada`);

        const tx: Partial<Transacao> = {
          id: Math.random().toString(36).substr(2, 9),
          codigo_pais: country,
          tipo: tipoStr.includes('RECEITA') ? TipoTransacao.RECEITA : TipoTransacao.DESPESA,
          data_competencia: isoDate,
          data_prevista_pagamento: isoDate,
          description: String(row[5] || itemName || 'Transação Importada'),
          valor: val,
          status: String(row[7]).toUpperCase() === 'S' ? 'PAGO' : 'PENDENTE',
          forma_pagamento_id: foundFP?.id || '',
          categoria_id: foundCat?.id || '',
          conta_contabil_id: foundItem?.id || '',
          origem: 'IMPORTACAO',
          workspace_id: 'fam_01'
        };

        return {
          id: tx.id!,
          data: tx,
          isValid: errors.length === 0,
          errors,
          displayInfo: {
            data: isoDate,
            identificador: tx.description!,
            categoria: catName,
            valor: val,
            detalhe: banco
          }
        };
      }
    }).filter(r => r !== null) as ParsedRow[];

    setImportResults(results);
    setCurrentStep('REVIEW');
  };

  const confirmSync = () => {
    const validOnes = importResults.filter(r => r.isValid);
    if (validOnes.length === 0) return alert("Nenhum dado válido processado.");

    if (!confirm(`Sincronizar ${validOnes.length} registros com a Nuvem Firebase?`)) return;

    validOnes.forEach(res => {
      if (importType === 'RECIBOS') {
        const r = res.data as Receipt;
        onSaveReceipt(r);
        
        // Sincronia Relacional Versão Base: Recibo gera Transação Automática
        onSaveTx({
          id: `TX_${r.internal_id}`,
          workspace_id: 'fam_01',
          codigo_pais: r.country_code,
          categoria_id: r.categoria_id,
          conta_contabil_id: r.conta_contabil_id,
          forma_pagamento_id: r.forma_pagamento_id,
          tipo: TipoTransacao.RECEITA,
          data_competencia: r.issue_date,
          data_prevista_pagamento: r.issue_date,
          description: `${r.description} (Recibo #${r.id})`,
          valor: r.received_amount,
          status: r.is_paid ? 'PAGO' : 'PENDENTE',
          origem: 'IMPORTACAO',
          receipt_id: r.internal_id
        } as Transacao);
      } else {
        onSaveTx(res.data as Transacao);
      }
    });

    alert("Mapeamento concluído e sincronizado com sucesso.");
    setCurrentStep('TYPE_SELECT');
    setImportType(null);
    setImportResults([]);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 pb-24 animate-in fade-in duration-700">
      {currentStep === 'TYPE_SELECT' && (
        <div className="space-y-12 text-center">
          <div>
            <h2 className="text-5xl font-black text-bb-blue italic uppercase tracking-tighter leading-none mb-4">Mapeamento Premium PHD</h2>
            <p className="text-[12px] text-gray-400 font-bold uppercase tracking-[0.4em] italic opacity-60">Sincronia Total Versão Base x Firebase</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
             {[
               { id: 'RECIBOS', title: 'Recibos Portugal', icon: '🧾', desc: 'Colunas A-J (Header 3)', color: 'border-bb-blue' },
               { id: 'LANCAMENTOS_PT', title: 'Ledger Portugal', icon: '🇵🇹', desc: 'Layout Euro (A-H)', color: 'border-blue-400' },
               { id: 'LANCAMENTOS_BR', title: 'Ledger Brasil', icon: '🇧🇷', desc: 'Layout Real (A-H)', color: 'border-emerald-500' }
             ].map(opt => (
               <button 
                 key={opt.id}
                 onClick={() => { setImportType(opt.id as ImportType); setCurrentStep('UPLOAD'); }}
                 className={`bg-white p-12 rounded-[4.5rem] border-4 border-transparent hover:${opt.color} shadow-sm hover:shadow-2xl transition-all group flex flex-col items-center gap-6`}
               >
                 <div className="w-24 h-24 bg-gray-50 rounded-[3rem] flex items-center justify-center text-5xl group-hover:scale-110 transition-transform">{opt.icon}</div>
                 <div>
                   <h3 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">{opt.title}</h3>
                   <p className="text-[9px] text-gray-400 font-bold uppercase mt-2 italic tracking-widest">{opt.desc}</p>
                 </div>
               </button>
             ))}
          </div>
        </div>
      )}

      {currentStep === 'UPLOAD' && (
        <div className="flex flex-col items-center justify-center min-h-[500px] animate-in zoom-in duration-300">
           <div 
             className="bg-white p-24 rounded-[6rem] border-4 border-dashed border-gray-100 hover:border-bb-blue transition-all cursor-pointer text-center group shadow-xl max-w-3xl w-full"
             onClick={() => fileInputRef.current?.click()}
           >
              <div className="w-32 h-32 bg-bb-blue/5 rounded-[4rem] flex items-center justify-center mx-auto mb-10">
                 <span className="text-6xl animate-bounce">📂</span>
              </div>
              <h3 className="text-4xl font-black text-bb-blue italic uppercase mb-3 tracking-tighter">Carregar Planilha</h3>
              <p className="text-[11px] text-gray-400 font-bold uppercase italic tracking-[0.3em] opacity-50">Localize o arquivo de {importType} .xlsx</p>
              <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx" onChange={processFile} />
           </div>
           <button onClick={() => setCurrentStep('TYPE_SELECT')} className="mt-10 text-[10px] font-black uppercase text-gray-300 hover:text-red-500 italic transition-colors">← Voltar ao Menu</button>
        </div>
      )}

      {currentStep === 'REVIEW' && (
        <div className="bg-white p-14 rounded-[5rem] shadow-2xl space-y-12 animate-in slide-in-from-bottom-10 duration-700 border border-gray-100">
           <div className="flex justify-between items-end border-b border-gray-50 pb-12">
              <div>
                 <h3 className="text-4xl font-black text-bb-blue italic uppercase tracking-tighter leading-none">Auditoria de Dados</h3>
                 <p className="text-[11px] text-gray-400 font-bold uppercase mt-3 italic tracking-widest">{importResults.length} Registros Processados • Mapeamento Ativo</p>
              </div>
              <div className="flex gap-8">
                 <button onClick={() => setCurrentStep('TYPE_SELECT')} className="px-10 py-5 text-[11px] font-black uppercase text-gray-300 hover:text-red-500 italic transition-all">Cancelar</button>
                 <button onClick={confirmSync} className="bg-bb-blue text-white px-20 py-6 rounded-[3.5rem] text-[12px] font-black uppercase shadow-2xl tracking-[0.3em] hover:scale-105 active:scale-95 transition-all">Sincronizar Agora</button>
              </div>
           </div>

           <div className="overflow-x-auto max-h-[600px] border border-gray-100 rounded-[3.5rem] scrollbar-hide">
              <table className="w-full text-left text-[11px]">
                 <thead className="bg-gray-50 text-bb-blue font-black uppercase italic sticky top-0 z-10 border-b">
                    <tr>
                       <th className="px-12 py-8">Validação</th>
                       <th className="px-12 py-8">Data Compet.</th>
                       <th className="px-12 py-8">Identificação</th>
                       <th className="px-12 py-8">Cat./Item</th>
                       <th className="px-12 py-8 text-right">Valor Final</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                    {importResults.map((res, i) => (
                      <tr key={i} className={`hover:bg-gray-50/50 transition-colors ${!res.isValid ? 'bg-red-50/40' : ''}`}>
                         <td className="px-12 py-6">
                            {res.isValid ? (
                               <div className="flex items-center gap-3">
                                  <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                  <span className="text-emerald-600 font-black italic uppercase text-[10px] tracking-widest">OK</span>
                               </div>
                            ) : (
                               <div className="flex flex-col gap-1" title={res.errors.join(', ')}>
                                  <div className="flex items-center gap-3">
                                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                                    <span className="text-red-500 font-black italic uppercase text-[10px]">ERRO</span>
                                  </div>
                                  <p className="text-[7px] text-red-400 font-bold uppercase italic">{res.errors[0]}</p>
                               </div>
                            )}
                         </td>
                         <td className="px-12 py-6 font-bold text-gray-400 italic">{res.displayInfo.data.split('-').reverse().join('/')}</td>
                         <td className="px-12 py-6">
                            <span className="font-black block uppercase text-bb-blue leading-none mb-1 text-xs">{res.displayInfo.identificador}</span>
                            <span className="text-[8px] font-bold text-gray-400 uppercase italic">{res.displayInfo.detalhe}</span>
                         </td>
                         <td className="px-12 py-6">
                            <span className="font-black uppercase text-gray-700 italic block">{res.displayInfo.categoria}</span>
                         </td>
                         <td className="px-12 py-6 text-right font-black text-bb-blue text-xs italic">
                            {importType === 'LANCAMENTOS_BR' ? 'R$' : '€'} {res.displayInfo.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      )}
    </div>
  );
};

export default ImportSection;