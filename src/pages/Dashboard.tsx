import React, { useMemo } from 'react';
import { useStore, formatCurrency } from '../store';
import { TransactionType, PaymentMethod, Currency } from '../types';
import { TrendingUp, TrendingDown, Wallet, ArrowRightLeft, Receipt, CreditCard, Banknote } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Dashboard() {
  const { transactions, accounts, categories, getFilteredTransactions } = useStore();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const monthTransactions = useMemo(() => {
    return transactions.filter(t => {
      const d = t.date.split('T')[0];
      return d >= monthStart && d <= monthEnd;
    });
  }, [transactions, monthStart, monthEnd]);

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts]);

  const monthIncome = useMemo(() =>
    monthTransactions.filter(t => t.type === TransactionType.INCOME).reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );

  const monthExpense = useMemo(() =>
    monthTransactions.filter(t => t.type === TransactionType.EXPENSE).reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );

  const cashExpense = useMemo(() =>
    monthTransactions.filter(t => t.type === TransactionType.EXPENSE && t.paymentMethod === PaymentMethod.CASH).reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );

  const cashlessExpense = useMemo(() =>
    monthTransactions.filter(t => t.type === TransactionType.EXPENSE && t.paymentMethod === PaymentMethod.CASHLESS).reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );

  const categoryData = useMemo(() => {
    const map = new Map<string, { name: string; total: number; color: string }>();
    monthTransactions.filter(t => t.type === TransactionType.EXPENSE && t.categoryId).forEach(t => {
      const cat = categories.find(c => c.id === t.categoryId);
      if (!cat) return;
      const existing = map.get(cat.id) || { name: cat.name, total: 0, color: cat.color };
      existing.total += t.amount;
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
      if (t.type === TransactionType.INCOME) months[key].income += t.amount;
      if (t.type === TransactionType.EXPENSE) months[key].expense += t.amount;
    });
    return Object.values(months).slice(-6);
  }, [transactions]);

  const recentTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  }, [transactions]);

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
              <p className="text-lg font-bold">{formatCurrency(totalBalance)}</p>
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
              <p className="text-lg font-bold text-green-600">{formatCurrency(monthIncome)}</p>
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
              <p className="text-lg font-bold text-red-600">{formatCurrency(monthExpense)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <ArrowRightLeft size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Сальдо (месяц)</p>
              <p className={`text-lg font-bold ${monthIncome - monthExpense >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(monthIncome - monthExpense)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cash vs Cashless */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Наличные vs Безналичные (расходы)</h3>
          <div className="flex gap-4">
            <div className="flex-1 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 mb-1">
                <Banknote size={16} className="text-orange-600" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Наличные</span>
              </div>
              <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{formatCurrency(cashExpense)}</p>
              {monthExpense > 0 && (
                <p className="text-xs text-gray-500">{((cashExpense / monthExpense) * 100).toFixed(1)}%</p>
              )}
            </div>
            <div className="flex-1 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard size={16} className="text-blue-600" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Безналичные</span>
              </div>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatCurrency(cashlessExpense)}</p>
              {monthExpense > 0 && (
                <p className="text-xs text-gray-500">{((cashlessExpense / monthExpense) * 100).toFixed(1)}%</p>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Receipt size={14} />
            <span>Чеков: {receiptCount} из {totalMonthTx} операций</span>
          </div>
        </div>

        {/* Category pie chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Расходы по категориям</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-8">Нет данных за этот месяц</p>
          )}
        </div>
      </div>

      {/* Monthly chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3">Динамика по месяцам</h3>
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="income" name="Доходы" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Расходы" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-center py-8">Нет данных</p>
        )}
      </div>

      {/* Accounts & Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Accounts */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Счета</h3>
          <div className="space-y-2">
            {accounts.map(account => (
              <div key={account.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {account.type === 'CASH' ? '💵' : account.type === 'CARD' ? '💳' : account.type === 'SAVINGS' ? '🏦' : '🏛️'}
                  </span>
                  <span className="text-sm font-medium">{account.name}</span>
                </div>
                <span className="font-semibold">{formatCurrency(account.balance, account.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent transactions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Последние операции</h3>
          <div className="space-y-2">
            {recentTransactions.map(t => {
              const cat = categories.find(c => c.id === t.categoryId);
              return (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">{cat?.icon || (t.type === TransactionType.TRANSFER ? '↔️' : '💸')}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.description || cat?.name || 'Операция'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(t.date).toLocaleDateString('ru-RU')}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold whitespace-nowrap ${
                    t.type === TransactionType.INCOME ? 'text-green-600' :
                    t.type === TransactionType.EXPENSE ? 'text-red-600' : 'text-blue-600'
                  }`}>
                    {t.type === TransactionType.INCOME ? '+' : t.type === TransactionType.EXPENSE ? '-' : '↔'}
                    {formatCurrency(t.amount)}
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
