import React from "react";

type SidebarProps = {
  // Versão A (nova): App passa activeTab / setActiveTab
  activeTab?: string;
  setActiveTab?: (tab: string) => void;

  // Versão B (antiga): App passa activePage / onNavigate
  activePage?: string;
  onNavigate?: (page: string) => void;

  // opcionais (se quiser mostrar no rodapé)
  userLabel?: string;
  modeLabel?: string;
};

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  activePage,
  onNavigate,
  userLabel = "Usuário",
  modeLabel = "Modo",
}) => {
  // Compatibilidade: pega o “ativo” de qualquer uma das props
  const current = activeTab ?? activePage ?? "dashboard";

  // Compatibilidade: define a função de navegação que existir
  const navigate = (id: string) => {
    if (typeof setActiveTab === "function") return setActiveTab(id);
    if (typeof onNavigate === "function") return onNavigate(id);
    // se cair aqui, não tem handler -> evita crash
    console.warn("Sidebar: nenhum handler de navegação foi fornecido.");
  };

  const menuItems = [
    { id: "dashboard", label: "Painel Geral", icon: "🏠" },
    { id: "ai_advisor", label: "Consultor IA", icon: "🤖" },
    { id: "ledger", label: "Lançamentos", icon: "📑" },
    { id: "calendar", label: "Agenda Financeira", icon: "📅" },
    { id: "inss", label: "INSS Brasil", icon: "🇧🇷" },
    { id: "receipts", label: "Meus Recibos", icon: "🧾" },
    { id: "investments", label: "Investimentos", icon: "📈" },
    { id: "taxes", label: "Cálculo de IVA", icon: "⚖️" },
    { id: "import", label: "Importar/Exportar", icon: "📥" },
    { id: "settings", label: "Configurações", icon: "⚙️" },
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

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto scrollbar-hide">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.id)}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 border-l-4 ${
              current === item.id
                ? "bg-white/10 border-bb-yellow text-white font-bold"
                : "border-transparent text-blue-100 hover:bg-white/5"
            }`}
          >
            <span className="text-lg opacity-80">{item.icon}</span>
            <span className="text-[10px] font-black uppercase tracking-widest">
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      <div className="p-4 bg-black/10 m-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-bb-yellow rounded-full flex items-center justify-center text-[10px] font-bold uppercase text-bb-blue">
            UL
          </div>
          <div>
            <p className="text-[10px] font-bold text-white leading-tight uppercase">
              {userLabel}
            </p>
            <p className="text-[8px] text-blue-200 uppercase tracking-tighter italic">
              {modeLabel}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
