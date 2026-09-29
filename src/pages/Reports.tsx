import React, { useMemo, useState } from 'react';
import { useStore, formatCurrency, formatDate, exportToCSV } from '../store';
import { TransactionType, PaymentMethod } from '../types';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LineChart, Line
} from 'recharts';
import { Download, FileSpreadsheet, Users, CreditCard, Wallet, Receipt, Filter } from 'lucide-react';

export default function Reports() {
  const { transactions, accounts, categories, familyMembers, convertToBase, baseCurrency, getBudgetProgress } = useStore();
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().split('T')[0]);
  
  // Новые фильтры
  const [filterMember, setFilterMember] = useState<string>('');
  const [filterAccount, setFilterAccount] = useState<string>('');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('');
  const [filterHasReceipt, setFilterHasReceipt] = useState<string>('');

  const filteredTx = useMemo(() => {
    return transactions.filter(t => {
      const d = t.date.split('T')[0];
      if (d < periodFrom || d > periodTo) return false;
      if (filterMember && t.createdById !== filterMember) return false;
      if (filterAccount && t.accountId !== filterAccount) return false;
      if (filterPaymentMethod && t.paymentMethod !== filterPaymentMethod) return false;
      if (filterHasReceipt === 'yes' && !t.hasReceipt) return false;
      if (filterHasReceipt === 'no' && t.hasReceipt) return false;
      return true;
    });
  }, [transactions, periodFrom, periodTo, filterMember, filterAccount, filterPaymentMethod, filterHasReceipt]);

  // Summary
  const summary = useMemo(() => {
    const income = filteredTx.filter(t => t.type === TransactionType.INCOME).reduce((s, t) => s + t.amount, 0);
    const expense = filteredTx.filter(t => t.type === TransactionType.EXPENSE).reduce((s, t) => s + t.amount, 0);
    const cashIncome = filteredTx.filter(t => t.type === TransactionType.INCOME && t.paymentMethod === PaymentMethod.CASH).reduce((s, t) => s + t.amount, 0);
    const cashExpense = filteredTx.filter(t => t.type === TransactionType.EXPENSE && t.paymentMethod === PaymentMethod.CASH).reduce((s, t) => s + t.amount, 0);
    const cashlessIncome = filteredTx.filter(t => t.type === TransactionType.INCOME && t.paymentMethod === PaymentMethod.CASHLESS).reduce((s, t) => s + t.amount, 0);
    const cashlessExpense = filteredTx.filter(t => t.type === TransactionType.EXPENSE && t.paymentMethod === PaymentMethod.CASHLESS).reduce((s, t) => s + t.amount, 0);
    return { income, expense, balance: income - expense, cashIncome, cashExpense, cashlessIncome, cashlessExpense };
  }, [filteredTx]);

  // By category
  const categoryReport = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; color: string }>();
    filteredTx.filter(t => t.type === TransactionType.EXPENSE && t.categoryId).forEach(t => {
      const cat = categories.find(c => c.id === t.categoryId);
      if (!cat) return;
      const existing = map.get(cat.id) || { name: cat.name, total: 0, count: 0, color: cat.color };
      existing.total += t.amount;
      existing.count += 1;
      map.set(cat.id, existing);
    });
    const total = Array.from(map.values()).reduce((s, v) => s + v.total, 0);
    return Array.from(map.values())
      .map(v => ({ ...v, percentage: total > 0 ? (v.total / total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [filteredTx, categories]);

  // Monthly
  const monthlyReport = useMemo(() => {
    const months: Record<string, { month: string; income: number; expense: number }> = {};
    const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    filteredTx.forEach(t => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!months[key]) {
        months[key] = { month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, income: 0, expense: 0 };
      }
      if (t.type === TransactionType.INCOME) months[key].income += t.amount;
      if (t.type === TransactionType.EXPENSE) months[key].expense += t.amount;
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [filteredTx]);

  // Receipts vs no receipts
  const receiptReport = useMemo(() => {
    const withReceipt = filteredTx.filter(t => t.type === TransactionType.EXPENSE && t.hasReceipt);
    const withoutReceipt = filteredTx.filter(t => t.type === TransactionType.EXPENSE && !t.hasReceipt);
    return {
      withReceipt: { count: withReceipt.length, total: withReceipt.reduce((s, t) => s + t.amount, 0) },
      withoutReceipt: { count: withoutReceipt.length, total: withoutReceipt.reduce((s, t) => s + t.amount, 0) },
    };
  }, [filteredTx]);

  // By account
  const accountReport = useMemo(() => {
    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    const map = new Map<string, { name: string; income: number; expense: number; count: number; color: string }>();
    let colorIdx = 0;
    filteredTx.forEach(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      if (!acc) return;
      const existing = map.get(acc.id);
      if (existing) {
        const amount = convertToBase(t.amount, t.currency);
        if (t.type === TransactionType.INCOME) existing.income += amount;
        if (t.type === TransactionType.EXPENSE) existing.expense += amount;
        existing.count += 1;
      } else {
        const amount = convertToBase(t.amount, t.currency);
        map.set(acc.id, {
          name: acc.name,
          income: t.type === TransactionType.INCOME ? amount : 0,
          expense: t.type === TransactionType.EXPENSE ? amount : 0,
          count: 1,
          color: colors[colorIdx % colors.length]
        });
        colorIdx++;
      }
    });
    return Array.from(map.values()).sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
  }, [filteredTx, accounts, convertToBase]);

  // By member (для графика)
  const memberReport = useMemo(() => {
    const map = new Map<string, { name: string; income: number; expense: number; count: number; avatar: string; color: string }>();
    filteredTx.forEach(t => {
      const member = familyMembers.find(m => m.userId === t.createdById);
      if (!member) return;
      const existing = map.get(t.createdById) || { name: member.name, income: 0, expense: 0, count: 0, avatar: member.avatar, color: member.color };
      const amount = convertToBase(t.amount, t.currency);
      if (t.type === TransactionType.INCOME) existing.income += amount;
      if (t.type === TransactionType.EXPENSE) existing.expense += amount;
      existing.count += 1;
      map.set(t.createdById, existing);
    });
    return Array.from(map.values());
  }, [filteredTx, familyMembers, convertToBase]);

  // By payment method
  const paymentMethodReport = useMemo(() => {
    const map = new Map<string, { name: string; income: number; expense: number; count: number }>();
    filteredTx.forEach(t => {
      const methodName = t.paymentMethod === PaymentMethod.CASH ? '💵 Наличные' : '💳 Карта';
      const existing = map.get(t.paymentMethod) || { name: methodName, income: 0, expense: 0, count: 0 };
      const amount = convertToBase(t.amount, t.currency);
      if (t.type === TransactionType.INCOME) existing.income += amount;
      if (t.type === TransactionType.EXPENSE) existing.expense += amount;
      existing.count += 1;
      map.set(t.paymentMethod, existing);
    });
    return Array.from(map.values());
  }, [filteredTx, convertToBase]);

  // By day (для графика по дням)
  const dailyReport = useMemo(() => {
    const days: Record<string, { day: string; income: number; expense: number }> = {};
    filteredTx.forEach(t => {
      const d = t.date.split('T')[0];
      if (!days[d]) {
        days[d] = { day: d, income: 0, expense: 0 };
      }
      const amount = convertToBase(t.amount, t.currency);
      if (t.type === TransactionType.INCOME) days[d].income += amount;
      if (t.type === TransactionType.EXPENSE) days[d].expense += amount;
    });
    return Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        ...v,
        day: new Date(v.day).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
      }));
  }, [filteredTx, convertToBase]);

  // Top 5 categories
  const topCategories = categoryReport.slice(0, 5);

  const handleExportCSV = () => {
    const csv = exportToCSV(filteredTx, accounts, categories);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${periodFrom}_${periodTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = { accounts, categories, transactions: filteredTx, exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${periodFrom}_${periodTo}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Отчёты и аналитика</h2>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm flex items-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Download size={14} /> CSV
          </button>
          <button onClick={handleExportJSON} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm flex items-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-700">
            <FileSpreadsheet size={14} /> JSON
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">С</label>
            <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">По</label>
            <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
          </div>
          <div className="flex gap-1">
            {[
              { label: 'Неделя', days: 7 },
              { label: 'Месяц', days: 30 },
              { label: '3 мес', days: 90 },
              { label: 'Год', days: 365 },
            ].map(preset => (
              <button
                key={preset.label}
                onClick={() => {
                  const to = new Date();
                  const from = new Date();
                  from.setDate(from.getDate() - preset.days);
                  setPeriodFrom(from.toISOString().split('T')[0]);
                  setPeriodTo(to.toISOString().split('T')[0]);
                }}
                className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Advanced filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-gray-500" />
          <h3 className="font-semibold text-sm">Дополнительные фильтры</h3>
          {(filterMember || filterAccount || filterPaymentMethod || filterHasReceipt) && (
            <button
              onClick={() => {
                setFilterMember('');
                setFilterAccount('');
                setFilterPaymentMethod('');
                setFilterHasReceipt('');
              }}
              className="ml-auto text-xs text-blue-600 hover:text-blue-700"
            >
              Сбросить
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <Users size={12} /> Член семьи
            </label>
            <select
              value={filterMember}
              onChange={e => setFilterMember(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
            >
              <option value="">Все</option>
              {familyMembers.map(m => (
                <option key={m.userId} value={m.userId}>{m.avatar} {m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <Wallet size={12} /> Счёт
            </label>
            <select
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
            >
              <option value="">Все</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <CreditCard size={12} /> Способ оплаты
            </label>
            <select
              value={filterPaymentMethod}
              onChange={e => setFilterPaymentMethod(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
            >
              <option value="">Все</option>
              <option value={PaymentMethod.CASH}>💵 Наличные</option>
              <option value={PaymentMethod.CASHLESS}>💳 Карта</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <Receipt size={12} /> Чек
            </label>
            <select
              value={filterHasReceipt}
              onChange={e => setFilterHasReceipt(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
            >
              <option value="">Все</option>
              <option value="yes">✅ С чеком</option>
              <option value="no">❌ Без чека</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500">Доходы</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.income)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500">Расходы</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.expense)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500">Сальдо</p>
          <p className={`text-2xl font-bold ${summary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(summary.balance)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500">Операций</p>
          <p className="text-2xl font-bold text-blue-600">{filteredTx.length}</p>
        </div>
      </div>

      {/* Cash vs Cashless */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3">Наличные vs Безналичные</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
            <p className="text-xs text-gray-500">💵 Нал. доходы</p>
            <p className="font-bold text-green-700 dark:text-green-300">{formatCurrency(summary.cashIncome)}</p>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <p className="text-xs text-gray-500">💳 Безнал. доходы</p>
            <p className="font-bold text-blue-700 dark:text-blue-300">{formatCurrency(summary.cashlessIncome)}</p>
          </div>
          <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20">
            <p className="text-xs text-gray-500">💵 Нал. расходы</p>
            <p className="font-bold text-orange-700 dark:text-orange-300">{formatCurrency(summary.cashExpense)}</p>
          </div>
          <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
            <p className="text-xs text-gray-500">💳 Безнал. расходы</p>
            <p className="font-bold text-purple-700 dark:text-purple-300">{formatCurrency(summary.cashlessExpense)}</p>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category pie */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Расходы по категориям</h3>
          {categoryReport.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={categoryReport} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {categoryReport.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1">
                {categoryReport.slice(0, 5).map(cat => (
                  <div key={cat.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span>{cat.name}</span>
                    </div>
                    <span className="font-medium">{formatCurrency(cat.total)} ({cat.percentage.toFixed(1)}%)</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-gray-400 text-center py-8">Нет данных</p>
          )}
        </div>

        {/* Monthly bar chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Динамика по месяцам</h3>
          {monthlyReport.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyReport}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
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
      </div>

      {/* Daily dynamics */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3">Динамика по дням</h3>
        {dailyReport.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dailyReport}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={(label) => `Дата: ${label}`} />
              <Legend />
              <Line type="monotone" dataKey="income" name="Доходы" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="expense" name="Расходы" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-center py-8">Нет данных</p>
        )}
      </div>

      {/* Top 5 + Receipts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 5 categories */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Топ-5 категорий расходов</h3>
          {topCategories.length > 0 ? (
            <div className="space-y-3">
              {topCategories.map((cat, i) => (
                <div key={cat.name} className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-400 w-6">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{cat.name}</span>
                      <span className="text-sm font-semibold">{formatCurrency(cat.total)}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">Нет данных</p>
          )}
        </div>

        {/* Receipts report */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-3">Чеки: с чеком vs без чека</h3>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">✅ С чеком</p>
                  <p className="text-xs text-gray-500">{receiptReport.withReceipt.count} операций</p>
                </div>
                <p className="text-xl font-bold text-green-700 dark:text-green-300">{formatCurrency(receiptReport.withReceipt.total)}</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">❌ Без чека</p>
                  <p className="text-xs text-gray-500">{receiptReport.withoutReceipt.count} операций</p>
                </div>
                <p className="text-xl font-bold text-red-700 dark:text-red-300">{formatCurrency(receiptReport.withoutReceipt.total)}</p>
              </div>
            </div>
            {summary.expense > 0 && (
              <div className="text-center">
                <p className="text-sm text-gray-500">
                  Покрытие чеками: {((receiptReport.withReceipt.total / summary.expense) * 100).toFixed(1)}%
                </p>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mt-2">
                  <div
                    className="h-3 rounded-full bg-green-500"
                    style={{ width: `${(receiptReport.withReceipt.total / summary.expense) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* By member report */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Users size={16} /> Отчёт по членам семьи
        </h3>
        {memberReport.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={memberReport}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="income" name="Доходы" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Расходы" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-2">
              {memberReport.map(m => (
                <div key={m.name} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <span className="text-2xl">{m.avatar}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.count} операций</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-green-600">+{formatCurrency(m.income, baseCurrency)}</p>
                    <p className="text-red-600">-{formatCurrency(m.expense, baseCurrency)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-center py-4">Нет данных</p>
        )}
      </div>

      {/* By account report */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Wallet size={16} /> Отчёт по счетам
        </h3>
        {accountReport.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={accountReport} dataKey="expense" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {accountReport.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-2">
              {accountReport.map(acc => (
                <div key={acc.name} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{acc.name}</p>
                    <p className="text-xs text-gray-500">{acc.count} операций</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-green-600">+{formatCurrency(acc.income, baseCurrency)}</p>
                    <p className="text-red-600">-{formatCurrency(acc.expense, baseCurrency)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-center py-4">Нет данных</p>
        )}
      </div>

      {/* By payment method report */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <CreditCard size={16} /> Отчёт по способам оплаты
        </h3>
        {paymentMethodReport.length > 0 ? (
          <div className="space-y-3">
            {paymentMethodReport.map(pm => (
              <div key={pm.name} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">{pm.name}</p>
                  <p className="text-xs text-gray-500">{pm.count} операций</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-green-50 dark:bg-green-900/20">
                    <p className="text-xs text-gray-500">Доходы</p>
                    <p className="text-sm font-bold text-green-600">{formatCurrency(pm.income, baseCurrency)}</p>
                  </div>
                  <div className="p-2 rounded bg-red-50 dark:bg-red-900/20">
                    <p className="text-xs text-gray-500">Расходы</p>
                    <p className="text-sm font-bold text-red-600">{formatCurrency(pm.expense, baseCurrency)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4">Нет данных</p>
        )}
      </div>

      {/* Budget report */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3">Отчёт по бюджетам (план/факт)</h3>
        {(() => {
          const progress = getBudgetProgress();
          if (progress.length === 0) return <p className="text-gray-400 text-center py-4">Нет бюджетов</p>;
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    <th className="pb-2 font-medium text-gray-500">Категория</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">План</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Факт</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Остаток</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.map(p => (
                    <tr key={p.budgetId} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="py-2">{p.budgetName}</td>
                      <td className="py-2 text-right">{formatCurrency(p.planned, p.currency)}</td>
                      <td className="py-2 text-right">{formatCurrency(p.actual, p.currency)}</td>
                      <td className={`py-2 text-right ${p.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(p.remaining, p.currency)}
                      </td>
                      <td className={`py-2 text-right font-medium ${p.status === 'ok' ? 'text-green-600' : p.status === 'warning' ? 'text-yellow-600' : 'text-red-600'}`}>
                        {p.percentage.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
