
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const AdminShell = () => {
  return (
    <div className="flex h-screen bg-[#F7F8FA]">
      <Sidebar className="w-60 flex-shrink-0" />
      <div className="flex flex-col flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
