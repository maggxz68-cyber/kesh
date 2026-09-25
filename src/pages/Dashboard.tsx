import React, { useMemo } from 'react';
import { useStore, formatCurrency, formatDate } from '../store';
import { TransactionType, PaymentMethod, Currency, RecurMode } from '../types';
import { TrendingUp, TrendingDown, Wallet, Target, Calendar, CreditCard, Banknote, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Dashboard() {
  const { transactions, accounts, categories, budgets, getBudgetProgress, getUpcomingPayments, convertToBase, baseCurrency } = useStore();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const monthTransactions = useMemo(() => {
    return transactions.filter(t => {
      const d = t.date.split('T')[0];
      return d >= monthStart && d <= monthEnd;
    });
  }, [transactions, monthStart, monthEnd]);

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + convertToBase(a.balance, a.currency), 0), [accounts]);

  const monthIncome = useMemo(() =>
    monthTransactions.filter(t => t.type === TransactionType.INCOME).reduce((s, t) => s + convertToBase(t.amount, t.currency), 0),
    [monthTransactions]
  );

  const monthExpense = useMemo(() =>
    monthTransactions.filter(t => t.type === TransactionType.EXPENSE).reduce((s, t) => s + convertToBase(t.amount, t.currency), 0),
    [monthTransactions]
  );

  const cashExpense = useMemo(() =>
    monthTransactions.filter(t => t.type === TransactionType.EXPENSE && t.paymentMethod === PaymentMethod.CASH).reduce((s, t) => s + convertToBase(t.amount, t.currency), 0),
    [monthTransactions]
  );

  const cashlessExpense = useMemo(() =>
    monthTransactions.filter(t => t.type === TransactionType.EXPENSE && t.paymentMethod === PaymentMethod.CASHLESS).reduce((s, t) => s + convertToBase(t.amount, t.currency), 0),
    [monthTransactions]
  );

  const categoryData = useMemo(() => {
    const map = new Map<string, { name: string; total: number; color: string }>();
    monthTransactions.filter(t => t.type === TransactionType.EXPENSE && t.categoryId).forEach(t => {
      const cat = categories.find(c => c.id === t.categoryId);
      if (!cat) return;
      const existing = map.get(cat.id) || { name: cat.name, total: 0, color: cat.color };
      existing.total += convertToBase(t.amount, t.currency);
      map.set(cat.id, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [monthTransactions, categories]);

  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; income: number; expense: number }> = {};
    const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    transactions.forEach(t => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!months[key]) {
        months[key] = { month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, income: 0, expense: 0 };
      }
      const amount = convertToBase(t.amount, t.currency);
      if (t.type === TransactionType.INCOME) months[key].income += amount;
      if (t.type === TransactionType.EXPENSE) months[key].expense += amount;
    });
    return Object.values(months).slice(-6);
  }, [transactions]);

  const recentTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  }, [transactions]);

  const budgetProgress = useMemo(() => getBudgetProgress(), [budgets, transactions]);
  const upcoming = useMemo(() => getUpcomingPayments(14), []);
  const budgetAlerts = budgetProgress.filter(b => b.status !== 'ok');

  const receiptCount = monthTransactions.filter(t => t.hasReceipt).length;
  const totalMonthTx = monthTransactions.filter(t => t.type !== TransactionType.TRANSFER).length;

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <h2 className="text-2xl font-bold">Дашборд</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Wallet size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Общий баланс</p>
              <p className="text-lg font-bold">{formatCurrency(totalBalance, baseCurrency)}</p>
              <p className="text-xs text-gray-400">{accounts.length} счетов</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <TrendingUp size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Доходы (месяц)</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(monthIncome, baseCurrency)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <TrendingDown size={20} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Расходы (месяц)</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(monthExpense, baseCurrency)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Target size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Сальдо (месяц)</p>
              <p className={`text-lg font-bold ${monthIncome - monthExpense >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(monthIncome - monthExpense, baseCurrency)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Budget alerts */}
      {budgetAlerts.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-yellow-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-yellow-700 dark:text-yellow-300">Внимание! Превышение бюджетов:</p>
            {budgetAlerts.slice(0, 3).map(b => (
              <p key={b.budgetId} className="text-yellow-600 dark:text-yellow-400 text-xs">
                {b.budgetName}: {b.percentage.toFixed(0)}% ({formatCurrency(b.actual, b.currency)} / {formatCurrency(b.planned, b.currency)})
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Budget progress bars */}
      {budgetProgress.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Target size={16} /> Бюджеты на этот месяц
          </h3>
          <div className="space-y-3">
            {budgetProgress.slice(0, 4).map(bp => (
              <div key={bp.budgetId}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm">{bp.budgetName}</span>
                  <span className={`text-xs font-medium ${bp.status === 'ok' ? 'text-green-600' : bp.status === 'warning' ? 'text-yellow-600' : 'text-red-600'}`}>
                    {formatCurrency(bp.actual, bp.currency)} / {formatCurrency(bp.planned, bp.currency)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${bp.status === 'ok' ? 'bg-green-500' : bp.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(bp.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cash vs Cashless + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Наличные vs Безналичные (расходы)</h3>
          <div className="flex gap-4">
            <div className="flex-1 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 mb-1">
                <Banknote size={16} className="text-orange-600" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Наличные</span>
              </div>
              <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{formatCurrency(cashExpense, baseCurrency)}</p>
              {monthExpense > 0 && <p className="text-xs text-gray-500">{((cashExpense / monthExpense) * 100).toFixed(1)}%</p>}
            </div>
            <div className="flex-1 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard size={16} className="text-blue-600" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Безналичные</span>
              </div>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatCurrency(cashlessExpense, baseCurrency)}</p>
              {monthExpense > 0 && <p className="text-xs text-gray-500">{((cashlessExpense / monthExpense) * 100).toFixed(1)}%</p>}
            </div>
          </div>
        </div>

        {/* Upcoming payments */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Calendar size={16} /> Ближайшие платежи
          </h3>
          {upcoming.length > 0 ? (
            <div className="space-y-2">
              {upcoming.slice(0, 4).map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-gray-50 dark:bg-gray-700/50">
                  <div>
                    <p className="font-medium">{p.ruleName}</p>
                    <p className="text-xs text-gray-500">{formatDate(p.date)} · {p.mode === RecurMode.AUTO ? '🤖' : '👤'}</p>
                  </div>
                  <span className={`font-semibold ${p.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(p.amount, p.currency)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4 text-sm">Нет предстоящих платежей</p>
          )}
        </div>
      </div>

      {/* Category pie + Monthly chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Расходы по категориям</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={categoryData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {categoryData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value, baseCurrency)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-8">Нет данных за этот месяц</p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Динамика по месяцам</h3>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
                <Tooltip formatter={(value: number) => formatCurrency(value, baseCurrency)} />
                <Legend />
                <Bar dataKey="income" name="Доходы" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Расходы" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-8">Нет данных</p>
          )}
        </div>
      </div>

      {/* Accounts & Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Счета</h3>
          <div className="space-y-2">
            {accounts.map(account => (
              <div key={account.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {account.type === 'CASH' ? '💵' : account.type === 'CARD' ? '💳' : account.type === 'SAVINGS' ? '🏦' : '🏛️'}
                  </span>
                  <div>
                    <span className="text-sm font-medium">{account.name}</span>
                    {account.currency !== baseCurrency && (
                      <span className="text-xs text-gray-400 ml-1">≈ {formatCurrency(convertToBase(account.balance, account.currency), baseCurrency)}</span>
                    )}
                  </div>
                </div>
                <span className="font-semibold text-sm">{formatCurrency(account.balance, account.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Последние операции</h3>
          <div className="space-y-2">
            {recentTransactions.map(t => {
              const cat = categories.find(c => c.id === t.categoryId);
              return (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">{cat?.icon || '💸'}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.description || cat?.name || 'Операция'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(t.date)}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold whitespace-nowrap ${
                    t.type === TransactionType.INCOME ? 'text-green-600' :
                    t.type === TransactionType.EXPENSE ? 'text-red-600' : 'text-blue-600'
                  }`}>
                    {t.type === TransactionType.INCOME ? '+' : t.type === TransactionType.EXPENSE ? '-' : '↔'}
                    {formatCurrency(t.amount, t.currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
