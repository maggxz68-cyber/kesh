import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { useAuthStore } from './store/auth';
import { UserRole } from './types/auth';
import { setupCrossTabSync } from './utils/sync';
import { autoUpdateExchangeRates } from './utils/exchangeRates';
import { LayoutDashboard, ArrowRightLeft, PlusCircle, Receipt, FolderTree, Wallet, BarChart3, Settings, Sun, Moon, Menu, X, Target, Repeat, Users, Shield, LogOut, RefreshCw } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import AddTransaction from './pages/AddTransaction';
import Receipts from './pages/Receipts';
import Categories from './pages/Categories';
import Accounts from './pages/Accounts';
import Reports from './pages/Reports';
import SettingsPage from './pages/Settings';
import Budgets from './pages/Budgets';
import Recurring from './pages/Recurring';
import Family from './pages/Family';
import Login from './pages/Login';
import Register from './pages/Register';
import SelectFamily from './pages/SelectFamily';
import AdminPanel from './pages/AdminPanel';
import Sync from './pages/Sync';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Дашборд' },
  { to: '/transactions', icon: ArrowRightLeft, label: 'Транзакции' },
  { to: '/add', icon: PlusCircle, label: 'Добавить' },
  { to: '/budgets', icon: Target, label: 'Бюджеты' },
  { to: '/recurring', icon: Repeat, label: 'Регулярные' },
  { to: '/receipts', icon: Receipt, label: 'Чеки' },
  { to: '/categories', icon: FolderTree, label: 'Категории' },
  { to: '/accounts', icon: Wallet, label: 'Счета' },
  { to: '/reports', icon: BarChart3, label: 'Отчёты' },
  { to: '/family', icon: Users, label: 'Семья' },
  { to: '/sync', icon: RefreshCw, label: 'Синхронизация' },
  { to: '/admin', icon: Shield, label: 'Админ', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Настройки' },
];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, currentUser } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (currentUser?.role !== UserRole.SUPER_ADMIN) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const { isAuthenticated, currentFamilyId } = useAuthStore();

  if (isAuthenticated && currentFamilyId) {
    return <Navigate to="/" replace />;
  }
  if (isAuthenticated && !currentFamilyId) {
    return <Navigate to="/select-family" replace />;
  }

  return mode === 'login'
    ? <Login onRegister={() => setMode('register')} />
    : <Register onBack={() => setMode('login')} onSuccess={() => window.location.href = '/'} />;
}

function Layout() {
  const { darkMode, setDarkMode, init, initialized, familyMembers, currentUserId } = useStore();
  const { currentUser, currentFamilyId, families, setCurrentFamily, logout, isDemoMode } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showFamilySelector, setShowFamilySelector] = useState(false);

  useEffect(() => { 
    init();
    setupCrossTabSync(); // Инициализация синхронизации между вкладками
    autoUpdateExchangeRates(); // Автоматическое обновление курсов валют с ЦБ РФ
  }, [init]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  if (!initialized) return null;

  const currentMember = familyMembers.find(m => m.userId === currentUserId);
  const isAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const currentFamily = families.find(f => f.id === currentFamilyId);
  const userFamilies = families.filter(f => currentUser?.familyIds.includes(f.id));

  const filteredNavItems = navItems.filter(item => !(item.adminOnly && !isAdmin));

  const handleFamilyChange = (familyId: string) => {
    setCurrentFamily(familyId);
    setShowFamilySelector(false);
    window.location.reload();
  };

  // Для супер-админа показываем только админ-панель и настройки
  const visibleNavItems = isAdmin
    ? filteredNavItems.filter(item => item.to === '/admin' || item.to === '/settings')
    : filteredNavItems;

  return (
    <div className={`min-h-screen ${darkMode ? 'dark' : ''}`}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
        {/* Top bar */}
        <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                💰 Семейный бюджет
              </h1>
              {isDemoMode && (
                <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">ДЕМО</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {userFamilies.length > 1 && !isAdmin && (
                <div className="relative">
                  <button
                    onClick={() => setShowFamilySelector(!showFamilySelector)}
                    className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-sm hover:bg-purple-200 dark:hover:bg-purple-900/50"
                  >
                    <Users size={14} className="text-purple-600 dark:text-purple-300" />
                    <span className="text-xs text-purple-600 dark:text-purple-300">{currentFamily?.name || 'Семья'}</span>
                  </button>
                  {showFamilySelector && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50">
                      <p className="px-3 py-1 text-xs text-gray-500 font-medium">Выберите семью</p>
                      {userFamilies.map(family => (
                        <button
                          key={family.id}
                          onClick={() => handleFamilyChange(family.id)}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                            family.id === currentFamilyId ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' : ''
                          }`}
                        >
                          {family.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {currentMember && !isAdmin && (
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm">
                  <span>{currentMember.avatar}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{currentMember.name.split(' ')[0]}</span>
                </div>
              )}
              {currentUser && (
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-sm">
                  <span className="text-xs text-blue-600 dark:text-blue-300">{currentUser.name}</span>
                  {isAdmin && <Shield size={12} className="text-blue-600 dark:text-blue-300" />}
                </div>
              )}
              <button onClick={logout} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" title="Выйти">
                <LogOut size={20} />
              </button>
              <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
          </div>
        </header>

        <div className="flex">
          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col w-56 min-h-[calc(100vh-3.5rem)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-3 gap-1 sticky top-14 overflow-y-auto">
            {visibleNavItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
          </aside>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden fixed inset-0 z-40 top-14">
              <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
              <aside className="relative w-64 h-full bg-white dark:bg-gray-800 p-3 flex flex-col gap-1 overflow-y-auto">
                {visibleNavItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`
                    }
                  >
                    <item.icon size={18} />
                    {item.label}
                  </NavLink>
                ))}
              </aside>
            </div>
          )}

          <main className="flex-1 p-4 lg:p-6 min-h-[calc(100vh-3.5rem)] overflow-y-auto pb-20 lg:pb-6">
            <Routes>
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
              <Route path="/add" element={<ProtectedRoute><AddTransaction /></ProtectedRoute>} />
              <Route path="/add/:id" element={<ProtectedRoute><AddTransaction /></ProtectedRoute>} />
              <Route path="/budgets" element={<ProtectedRoute><Budgets /></ProtectedRoute>} />
              <Route path="/recurring" element={<ProtectedRoute><Recurring /></ProtectedRoute>} />
              <Route path="/receipts" element={<ProtectedRoute><Receipts /></ProtectedRoute>} />
              <Route path="/categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
              <Route path="/accounts" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/family" element={<ProtectedRoute><Family /></ProtectedRoute>} />
              <Route path="/sync" element={<ProtectedRoute><Sync /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>

        {/* Bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50">
          <div className="flex justify-around py-2">
            {visibleNavItems.slice(0, 5).map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs ${
                    isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                  }`
                }
              >
                <item.icon size={18} />
                <span className="truncate max-w-[48px]">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function MainRouter() {
  const { isAuthenticated, currentFamilyId, currentUser } = useAuthStore();

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  // Супер-админ всегда идёт в админ-панель
  if (currentUser?.role === UserRole.SUPER_ADMIN) {
    return (
      <Routes>
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }

  if (!currentFamilyId) {
    return (
      <Routes>
        <Route path="*" element={<SelectFamily />} />
      </Routes>
    );
  }

  return <Layout />;
}

export default function App() {
  return (
    <HashRouter>
      <MainRouter />
    </HashRouter>
  );
}
