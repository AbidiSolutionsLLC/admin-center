
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from './lib/queryClient';
import { AdminShell } from './components/layout/AdminShell';
import { ROUTES } from './constants/routes';

// Pages
import OverviewPage from './pages/overview/OverviewPage';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AdminShell />}>
            <Route index element={<Navigate to={ROUTES.OVERVIEW} replace />} />
            <Route path={ROUTES.OVERVIEW} element={<OverviewPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
