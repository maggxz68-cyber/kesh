// Layout: сайдбар (сворачиваемый desktop / burger-drawer mobile), топбар, темы, демо-баннер.
import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ArrowLeftRight, Camera, Wallet, Tags, Target, BarChart3, Users,
  Settings, Moon, Sun, Menu, X, PanelTop, LogOut, ChevronLeft, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import { useTheme } from '../hooks/useTheme';
import { cn } from '../lib/cn';

const NAV = [
  { to: '/', label: 'Дашборд', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Транзакции', icon: ArrowLeftRight },
  { to: '/scan', label: 'Сканер чеков', icon: Camera },
  { to: '/accounts', label: 'Счета', icon: Wallet },
  { to: '/categories', label: 'Категории', icon: Tags },
  { to: '/budgets', label: 'Бюджеты', icon: Target },
  { to: '/reports', label: 'Отчёты', icon: BarChart3 },
  { to: '/family', label: 'Семья', icon: Users },
  { to: '/settings', label: 'Настройки', icon: Settings },
];

function NavItems({ collapsed }: { collapsed: boolean }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 p-2">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              collapsed && 'justify-center px-2',
            )
          }
          title={item.label}
        >
          <item.icon size={18} className="shrink-0" />
          {!collapsed && <span>{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-slate-200 px-3 dark:border-slate-800">
          {!collapsed && <span className="font-bold text-indigo-600">ФинСемья</span>}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <PanelTop size={16} className={cn('transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>
        <NavItems collapsed={collapsed} />
        {!collapsed && user?.is_demo && (
          <div className="m-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            Демо-режим: изменения не повлияют на оригинал.
          </div>
        )}
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <aside className="relative flex h-full w-64 flex-col bg-white dark:bg-slate-900">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-3 dark:border-slate-800">
              <span className="font-bold text-indigo-600">ФинСемья</span>
              <button onClick={() => setDrawer(false)}>
                <X size={18} />
              </button>
            </div>
            <NavItems collapsed={false} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <button className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden" onClick={() => setDrawer(true)}>
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1 truncate font-semibold">{user?.family_name ?? '—'}</div>
          {user?.impersonated_by && (
            <span className="hidden rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 sm:inline dark:bg-red-900/40 dark:text-red-300">
              <ShieldCheck size={12} className="mr-1 inline" />
              режим отладки (админ)
            </span>
          )}
          <button onClick={toggleTheme} className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800" title="Тема">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <div className="hidden text-sm text-slate-500 sm:block">{user?.name}</div>
          <button onClick={doLogout} className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800" title="Выйти">
            <LogOut size={18} />
          </button>
        </header>

        {user?.is_demo && (
          <div className="bg-amber-500/95 px-4 py-1.5 text-center text-sm font-medium text-white">
            Вы в демо-режиме — персональная песочница семьи Ивановых (живёт 24 часа).{' '}
            <button className="underline" onClick={() => navigate('/')}>
              Понятно
            </button>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

export { ChevronLeft };
