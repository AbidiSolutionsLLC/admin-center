import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useUIStore } from '@/store/useUIStore';
import { Menu } from 'lucide-react';
import { cn } from '@/utils/cn';

export const AdminShell = () => {
  const { isSidebarOpen, toggleSidebar, closeSidebar } = useUIStore();

  return (
    <div className="flex h-screen bg-surface-base overflow-hidden">
      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <Sidebar 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-60 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 flex-shrink-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )} 
      />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="h-14 flex items-center px-4 bg-white border-b border-line lg:hidden flex-shrink-0">
          <button 
            onClick={toggleSidebar}
            className="p-1.5 rounded-md hover:bg-surface-alt text-ink-secondary"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="ml-3 font-semibold text-ink">Admin Center</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-surface-base">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
