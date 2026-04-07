
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from './lib/queryClient';
import { AdminShell } from './components/layout/AdminShell';
import { AuthGuard, GuestGuard } from './components/layout/AuthGuard';
import { ROUTES } from './constants/routes';

// Pages
import LoginPage from './pages/auth/LoginPage';
import OverviewPage from './pages/overview/OverviewPage';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestGuard />}>
            <Route path={ROUTES.LOGIN} element={<LoginPage />} />
          </Route>
          
          <Route element={<AuthGuard />}>
            <Route path="/" element={<AdminShell />}>
              <Route index element={<Navigate to={ROUTES.OVERVIEW} replace />} />
              <Route path={ROUTES.OVERVIEW} element={<OverviewPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
