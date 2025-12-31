
import React, { useState, useMemo } from 'react';
import { Transacao } from '../types';

interface CalendarProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  transacoes: Transacao[];
}

const Calendar: React.FC<CalendarProps> = ({ viewMode, transacoes }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const lancamentosAbertos = useMemo(() => {
    return transacoes.filter(t => {
      const d = new Date(t.data_prevista_pagamento + 'T12:00:00');
      const matchMonth = d.getMonth() === month && d.getFullYear() === year;
      const matchCountry = viewMode === 'GLOBAL' || t.codigo_pais === viewMode;
      const isAberto = t.status !== 'PAGO';
      return matchMonth && matchCountry && isAberto;
    });
  }, [transacoes, month, year, viewMode]);

  const exportToICS = () => {
    if (lancamentosAbertos.length === 0) {
      alert("Não há lançamentos pendentes para exportar neste mês.");
      return;
    }

    let icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FinanceFamily//PT",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ].join("\n") + "\n";

    lancamentosAbertos.forEach(t => {
      const dateStr = t.data_prevista_pagamento.replace(/-/g, "");
      const symbol = t.codigo_pais === 'PT' ? 'EUR' : 'BRL';
      const typeLabel = t.tipo === 'RECEITA' ? 'RECEITA' : 'DESPESA';
      
      icsContent += [
        "BEGIN:VEVENT",
        `UID:${t.id}@financefamily.app`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `SUMMARY:[${typeLabel}] ${t.description} (${symbol} ${t.valor.toFixed(2)})`,
        `DESCRIPTION:FinanceFamily Agenda: ${t.description}\\nValor: ${symbol} ${t.valor.toFixed(2)}\\nStatus: ${t.status}\\nPais: ${t.codigo_pais}`,
        "STATUS:CONFIRMED",
        "TRANSP:TRANSPARENT",
        "END:VEVENT"
      ].join("\n") + "\n";
    });

    icsContent += "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `agenda_financeira_${monthNames[month]}_${year}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="h-40 bg-gray-50/30 border border-gray-100"></div>);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dayTxs = lancamentosAbertos.filter(t => new Date(t.data_prevista_pagamento + 'T12:00:00').getDate() === d);

    days.push(
      <div key={d} className="h-40 bg-white border border-gray-100 p-2 hover:bg-bb-yellow/5 transition-colors group relative overflow-hidden flex flex-col">
        <span className="text-[10px] font-black text-gray-300 group-hover:text-bb-blue mb-1">{d}</span>
        
        <div className="flex-1 overflow-y-auto space-y-1 scrollbar-hide">
          {dayTxs.map((t) => (
            <div key={t.id} className={`text-[7px] p-1 rounded font-bold border-l-2 uppercase tracking-tighter truncate shadow-sm ${
              t.tipo === 'RECEITA' 
                ? 'bg-emerald-50 text-emerald-600 border-emerald-400' 
                : 'bg-red-50 text-red-600 border-red-400'
            }`}>
              <div className="flex justify-between items-center gap-1">
                <span className="truncate">{t.tipo === 'RECEITA' ? '💰' : '💸'} {t.description}</span>
              </div>
              <span className="block text-[6px] font-black mt-0.5 opacity-80">
                {t.codigo_pais === 'PT' ? '€' : 'R$'} {t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
        <div className="flex items-center gap-6">
          <button onClick={() => setCurrentDate(new Date(year, month - 1))} className="w-10 h-10 bg-gray-50 flex items-center justify-center rounded-2xl hover:bg-bb-yellow transition-all shadow-sm">⬅️</button>
          <div className="text-center min-w-[120px]">
             <h2 className="text-xl font-black text-bb-blue italic uppercase tracking-tighter leading-tight">{monthNames[month]}</h2>
            <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{year}</p>
          </div>
          <button onClick={() => setCurrentDate(new Date(year, month + 1))} className="w-10 h-10 bg-gray-50 flex items-center justify-center rounded-2xl hover:bg-bb-yellow transition-all shadow-sm">➡️</button>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
             <p className="text-[8px] font-black text-gray-400 uppercase">Obrigações Pendentes</p>
             <p className="text-xs font-black text-red-500 uppercase italic">⚠️ {lancamentosAbertos.length} Itens</p>
          </div>
          <button 
            onClick={exportToICS}
            className="bg-bb-blue text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all flex items-center gap-2"
          >
            <span>📅 Exportar Google</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-7 bg-bb-blue text-white py-3 text-center text-[9px] font-black uppercase tracking-[0.2em]">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 px-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-emerald-50 border border-emerald-400"></div>
          <span className="text-[8px] font-black uppercase text-gray-500">Receitas Pendentes</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-50 border border-red-400"></div>
          <span className="text-[8px] font-black uppercase text-gray-500">Despesas Pendentes</span>
        </div>
      </div>
    </div>
  );
};

export default Calendar;
