import React from "react";

type SidebarVariant = "static" | "drawer";

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

  // Controle do menu Administração (somente ADMIN)
  showAdmin?: boolean;

  // Responsividade: permite renderizar como Drawer no mobile
  variant?: SidebarVariant;
  isOpen?: boolean;
  onClose?: () => void;
};

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  activePage,
  onNavigate,
  userLabel = "Usuário",
  modeLabel = "Modo",
  showAdmin = false,
  variant = "static",
  isOpen = false,
  onClose,
}) => {
  const isDrawer = variant === "drawer";
  const open = isDrawer ? Boolean(isOpen) : true;

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
    { id: "ledger", label: "Lançamentos", icon: "📑" },
    { id: "calendar", label: "Agenda Financeira", icon: "📅" },
    { id: "inss", label: "INSS Brasil", icon: "🇧🇷" },
    { id: "receipts", label: "Meus Recibos", icon: "🧾" },
    { id: "investments", label: "Investimentos", icon: "📈" },
    { id: "taxes", label: "Cálculo de IVA", icon: "⚖️" },
    { id: "import", label: "Importar/Exportar", icon: "📥" },
    ...(showAdmin ? [{ id: "admin", label: "Administração", icon: "🛡️" }] : []),
    { id: "settings", label: "Configurações", icon: "⚙️" },
  ];

  const handleNavigate = (id: string) => {
    navigate(id);
    // no drawer, fecha automaticamente após navegar
    if (isDrawer && typeof onClose === "function") onClose();
  };

  const panel = (
    <div
      className={
        isDrawer
          ? "bg-bb-blue text-white flex flex-col shadow-2xl shrink-0 h-full w-72 max-w-[85vw]"
          : "w-64 bg-bb-blue h-screen text-white flex flex-col sticky top-0 shadow-2xl shrink-0"
      }
    >
      <div className={isDrawer ? "p-6 mb-2 flex items-center justify-between" : "p-8 mb-4"}>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <div className="w-8 h-8 bg-bb-yellow rounded-lg flex items-center justify-center">
            <span className="text-bb-blue font-black text-xs">FF</span>
          </div>
          <span className="tracking-tighter italic">FinanceFamily</span>
        </h1>

        {isDrawer && (
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="rounded-xl px-3 py-2 text-white/90 hover:text-white hover:bg-white/10 transition"
            type="button"
          >
            ✕
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto scrollbar-hide">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavigate(item.id)}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 border-l-4 ${
              current === item.id
                ? "bg-white/10 border-bb-yellow text-white font-bold"
                : "border-transparent text-blue-100 hover:bg-white/5"
            }`}
            type="button"
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

  if (!isDrawer) return panel;

  // Drawer: overlay + painel (apenas em telas menores)
  return (
    <div
      className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`absolute left-0 top-0 h-full transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {panel}
      </div>
    </div>
  );
};

export default Sidebar;
