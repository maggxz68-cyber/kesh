import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './store/auth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import ScanPage from './pages/ScanPage';
import AccountsPage from './pages/AccountsPage';
import CategoriesPage from './pages/CategoriesPage';
import BudgetsPage from './pages/BudgetsPage';
import ReportsPage from './pages/ReportsPage';
import FamilyPage from './pages/FamilyPage';
import SettingsPage from './pages/SettingsPage';
import SuperadminLoginPage from './pages/superadmin/SuperadminLoginPage';
import SuperadminLayout from './pages/superadmin/SuperadminLayout';
import SuperadminFamiliesPage from './pages/superadmin/SuperadminFamiliesPage';
import SuperadminUsersPage from './pages/superadmin/SuperadminUsersPage';
import SuperadminCategoriesPage from './pages/superadmin/SuperadminCategoriesPage';
import SuperadminMetricsPage from './pages/superadmin/SuperadminMetricsPage';
import SuperadminLogsPage from './pages/superadmin/SuperadminLogsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

function Centered({ text, dark }: { text: string; dark?: boolean }) {
  return (
    <div className={`flex min-h-screen items-center justify-center ${dark ? 'bg-slate-950 text-red-400' : 'bg-slate-50 text-indigo-600 dark:bg-slate-950'}`}>
      <div className="animate-pulse">{text}</div>
    </div>
  );
}

// Защита пользовательской части: ждём /auth/me, затем редирект на /login
function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <Centered text="Загружаем…" />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

// Защита панели супер-админа: отдельный sa-токен (cookie), проверка через реальный запрос
function RequireSuperadmin() {
  const [state, setState] = useState<'loading' | 'yes' | 'no'>('loading');
  useEffect(() => {
    let alive = true;
    fetch('/api/superadmin/metrics', { credentials: 'include' })
      .then((r) => alive && setState(r.ok ? 'yes' : 'no'))
      .catch(() => alive && setState('no'));
    return () => {
      alive = false;
    };
  }, []);
  if (state === 'loading') return <Centered text="Проверяем доступ…" dark />;
  if (state === 'no') return <Navigate to="/superadmin/login" replace />;
  return (
    <SuperadminLayout>
      <Outlet />
    </SuperadminLayout>
  );
}

export default function App() {
  const load = useAuth((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Публичные */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Пользовательская часть (сайдбар + топбар в Layout) */}
          <Route element={<RequireAuth />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/family" element={<FamilyPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Панель супер-администратора: отдельный вход и свой layout */}
          <Route path="/superadmin/login" element={<SuperadminLoginPage />} />
          <Route element={<RequireSuperadmin />}>
            <Route path="/superadmin" element={<SuperadminFamiliesPage />} />
            <Route path="/superadmin/users" element={<SuperadminUsersPage />} />
            <Route path="/superadmin/categories" element={<SuperadminCategoriesPage />} />
            <Route path="/superadmin/metrics" element={<SuperadminMetricsPage />} />
            <Route path="/superadmin/logs" element={<SuperadminLogsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
