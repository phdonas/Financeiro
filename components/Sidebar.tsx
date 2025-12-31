
import React from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Painel Geral', icon: '🏠' },
    { id: 'ledger', label: 'Lançamentos', icon: '📑' },
    { id: 'calendar', label: 'Agenda Financeira', icon: '📅' },
    { id: 'inss', label: 'INSS Brasil', icon: '🇧🇷' },
    { id: 'receipts', label: 'Meus Recibos', icon: '🧾' },
    { id: 'investments', label: 'Investimentos', icon: '📈' },
    { id: 'taxes', label: 'Cálculo de IVA', icon: '⚖️' },
    { id: 'import', label: 'Importar/Exportar', icon: '📥' },
    { id: 'settings', label: 'Configurações', icon: '⚙️' },
  ];

  return (
    <div className="w-64 bg-bb-blue h-screen text-white flex flex-col sticky top-0 shadow-2xl shrink-0">
      <div className="p-8 mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <div className="w-8 h-8 bg-bb-yellow rounded-lg flex items-center justify-center">
             <span className="text-bb-blue font-black text-xs">FF</span>
          </div>
          <span className="tracking-tighter italic">FinanceFamily</span>
        </h1>
      </div>
      
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 border-l-4 ${
              activeTab === item.id 
                ? 'bg-white/10 border-bb-yellow text-white font-bold' 
                : 'border-transparent text-blue-100 hover:bg-white/5'
            }`}
          >
            <span className="text-lg opacity-80">{item.icon}</span>
            <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 bg-black/10 m-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center text-[10px] font-bold uppercase">P</div>
          <div>
            <p className="text-[10px] font-bold text-white leading-tight uppercase">Paulo S.</p>
            <p className="text-[8px] text-blue-200 uppercase tracking-tighter">Administrador</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
