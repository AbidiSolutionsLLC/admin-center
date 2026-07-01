import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUIStore } from '@/store/useUIStore';
import { Menu } from 'lucide-react';
import { cn } from '@/utils/cn';

export const AdminShell = ({ children }: { children?: React.ReactNode }) => {
  const { isSidebarOpen, toggleSidebar, closeSidebar } = useUIStore();

  return (
    <div 
      className="flex h-screen overflow-hidden"
      style={{ backgroundColor: '#0b0f19' }}
    >
      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar is now a glass panel floating inside padding */}
      <div className={cn(
        "p-4 pr-0 flex-shrink-0 absolute inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 h-full",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar />
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden pl-6 pr-6">
        {/* Mobile Header */}
        <header className="h-14 flex items-center px-4 border-b border-white/10 lg:hidden flex-shrink-0">
          <button 
            onClick={toggleSidebar}
            className="p-1.5 rounded-md hover:bg-white/5 text-slate-400"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="ml-3 font-semibold text-slate-200">Sowaye</span>
        </header>

        <TopBar className="hidden lg:flex" />

        <main className="flex-1 overflow-y-auto pb-8 scrollbar-hide mt-4 lg:mt-0">
          <div className="max-w-7xl mx-auto h-full">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
};
