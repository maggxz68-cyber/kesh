import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { useAuthStore } from './store/auth';
import { UserRole } from './types/auth';
import { LayoutDashboard, ArrowRightLeft, PlusCircle, Receipt, FolderTree, Wallet, BarChart3, Settings, Sun, Moon, Menu, X, Target, Repeat, Users, Shield, LogOut } from 'lucide-react';
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
import SelectFamily from './pages/SelectFamily';
import AdminPanel from './pages/AdminPanel';

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
  { to: '/admin', icon: Shield, label: 'Админ', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Настройки' },
];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, currentUser } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (currentUser?.role !== UserRole.SUPER_ADMIN) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function Layout() {
  const { darkMode, setDarkMode, init, initialized, familyMembers, currentUserId } = useStore();
  const { currentUser, currentFamilyId, families, setCurrentFamily, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showFamilySelector, setShowFamilySelector] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  if (!initialized) return null;

  const currentMember = familyMembers.find(m => m.userId === currentUserId);
  const isAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const currentFamily = families.find(f => f.id === currentFamilyId);
  const userFamilies = families.filter(f => currentUser?.familyIds.includes(f.id));

  const filteredNavItems = navItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  const handleFamilyChange = (familyId: string) => {
    setCurrentFamily(familyId);
    setShowFamilySelector(false);
    window.location.reload();
  };

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
            </div>
            <div className="flex items-center gap-2">
              {/* Family selector */}
              {userFamilies.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowFamilySelector(!showFamilySelector)}
                    className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-sm hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
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
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
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
              {currentMember && (
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
              <button
                onClick={logout}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Выйти"
              >
                <LogOut size={20} />
              </button>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
          </div>
        </header>

        <div className="flex">
          {/* Sidebar - Desktop */}
          <aside className="hidden lg:flex flex-col w-56 min-h-[calc(100vh-3.5rem)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-3 gap-1 sticky top-14 overflow-y-auto">
            {filteredNavItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
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
                {filteredNavItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
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

          {/* Main content */}
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
              <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>

        {/* Bottom nav - Mobile */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50">
          <div className="flex justify-around py-2">
            {filteredNavItems.slice(0, 5).map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 dark:text-gray-400'
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

export default function App() {
  const { isAuthenticated, currentFamilyId } = useAuthStore();

  if (!isAuthenticated) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>
    );
  }

  if (!currentFamilyId) {
    return (
      <HashRouter>
        <Routes>
          <Route path="*" element={<SelectFamily />} />
        </Routes>
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <Layout />
    </HashRouter>
  );
}
