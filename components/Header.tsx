import React from 'react';

interface HeaderProps {
  viewMode: 'BR' | 'PT' | 'GLOBAL';
  setViewMode: (mode: 'BR' | 'PT' | 'GLOBAL') => void;
  title: string;
}

const Header: React.FC<HeaderProps> = ({ viewMode, setViewMode, title }) => {
  return (
    <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold text-bb-blue tracking-tight uppercase italic">{title}</h2>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 rounded-full border border-blue-100">
           <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
           <span className="text-[7px] font-black text-blue-600 uppercase tracking-widest">Modo Local Ativo</span>
        </div>
      </div>
      
      <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
        <button 
          onClick={() => setViewMode('BR')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'BR' ? 'bg-bb-blue text-white shadow-md' : 'text-gray-500 hover:text-bb-blue'}`}
        >
          🇧🇷 BR
        </button>
        <button 
          onClick={() => setViewMode('PT')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'PT' ? 'bg-bb-blue text-white shadow-md' : 'text-gray-500 hover:text-bb-blue'}`}
        >
          🇵🇹 PT
        </button>
        <button 
          onClick={() => setViewMode('GLOBAL')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'GLOBAL' ? 'bg-bb-blue text-white shadow-md' : 'text-gray-500 hover:text-bb-blue'}`}
        >
          🌍 GLOBAL
        </button>
      </div>
    </header>
  );
};

export default Header;