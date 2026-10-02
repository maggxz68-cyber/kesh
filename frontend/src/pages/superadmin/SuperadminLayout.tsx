// Layout панели супер-админа: отдельный sidebar (Семьи, Пользователи, Системные категории, Метрики, Логи).
import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Users2, UserCircle, Tags, Gauge, ScrollText, LogOut, Menu, X, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/cn';

const NAV = [
  { to: '/superadmin', label: 'Семьи', icon: Users2, end: true },
  { to: '/superadmin/users', label: 'Пользователи', icon: UserCircle },
  { to: '/superadmin/categories', label: 'Системные категории', icon: Tags },
  { to: '/superadmin/metrics', label: 'Метрики', icon: Gauge },
  { to: '/superadmin/logs', label: 'Логи', icon: ScrollText },
];

export default function SuperadminLayout({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const navigate = useNavigate();

  const logout = async () => {
    try {
      await fetch('/api/superadmin/logout', { method: 'POST', credentials: 'include' });
    } finally {
      navigate('/superadmin/login');
    }
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-2">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setDrawer(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
              isActive ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800',
            )
          }
        >
          <item.icon size={17} /> {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900 md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-slate-800 px-4 font-bold">
          <ShieldCheck className="text-red-500" /> Панель платформы
        </div>
        {nav}
        <button onClick={logout} className="m-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800">
          <LogOut size={16} /> Выйти
        </button>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <aside className="relative flex h-full w-64 flex-col bg-slate-900">
            <div className="flex h-14 items-center justify-between border-b border-slate-800 px-4 font-bold">
              Панель <button onClick={() => setDrawer(false)}><X size={18} /></button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-800 bg-slate-900/90 px-4 backdrop-blur">
          <button className="md:hidden" onClick={() => setDrawer(true)}><Menu size={20} /></button>
          <span className="font-semibold">Superadmin</span>
          <span className="ml-auto rounded bg-red-900/50 px-2 py-1 text-xs text-red-300">admin</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
