import React, { useRef, useState } from 'react';
import { useStore, exportToCSV, exportToJSON, formatCurrency } from '../store';
import { TransactionType, PaymentMethod, Currency, Transaction } from '../types';
import { Download, Upload, Trash2, Database, RefreshCw, Check, AlertTriangle, DollarSign } from 'lucide-react';

export default function SettingsPage() {
  const { accounts, categories, transactions, addTransaction, addAccount, setDarkMode, darkMode, exchangeRates, baseCurrency, setBaseCurrency, updateExchangeRate, refreshRates, familyMembers, currentUserId, setCurrentUser } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string>('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [rateForm, setRateForm] = useState({ baseCode: 'USD', quoteCode: 'RUB', rate: 0 });

  const handleExportCSV = () => {
    const csv = exportToCSV(transactions, accounts, categories);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fintracker_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = { accounts, categories, transactions, budgets: [], recurringRules: [], exchangeRates, exportDate: new Date().toISOString(), version: '2.0' };
    const json = exportToJSON(data);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fintracker_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.transactions && Array.isArray(data.transactions)) {
          let imported = 0;
          data.transactions.forEach((tx: Transaction) => {
            addTransaction({
              type: tx.type, amount: tx.amount, currency: tx.currency || Currency.RUB,
              date: tx.date, accountId: tx.accountId, toAccountId: tx.toAccountId || null,
              categoryId: tx.categoryId || null, paymentMethod: tx.paymentMethod || PaymentMethod.CASHLESS,
              description: tx.description || '', counterparty: tx.counterparty || '',
              hasReceipt: tx.hasReceipt || false, receipt: tx.receipt || null, tags: tx.tags || [],
              isPrivate: tx.isPrivate || false, createdById: tx.createdById || '', recurringRuleId: tx.recurringRuleId || null,
            });
            imported++;
          });
          setImportStatus(`✅ Успешно импортировано ${imported} операций`);
        } else {
          setImportStatus('❌ Неверный формат файла');
        }
      } catch {
        setImportStatus('❌ Ошибка чтения файла');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { setImportStatus('❌ Файл пуст'); return; }
        let imported = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
          if (cols.length < 5) continue;
          const dateStr = cols[0]; const typeStr = cols[1]; const amount = parseFloat(cols[2]); const description = cols[6] || '';
          let type = TransactionType.EXPENSE;
          if (typeStr.includes('Доход') || typeStr === 'INCOME') type = TransactionType.INCOME;
          else if (typeStr.includes('Перевод') || typeStr === 'TRANSFER') type = TransactionType.TRANSFER;
          const defaultAccount = accounts[0];
          if (!defaultAccount) continue;
          addTransaction({
            type, amount: Math.abs(amount), currency: Currency.RUB,
            date: new Date(dateStr.split('.').reverse().join('-')).toISOString() || new Date().toISOString(),
            accountId: defaultAccount.id, toAccountId: null, categoryId: null,
            paymentMethod: PaymentMethod.CASHLESS, description, counterparty: cols[7] || '',
            hasReceipt: false, receipt: null, tags: [], isPrivate: false, createdById: '', recurringRuleId: null,
          });
          imported++;
        }
        setImportStatus(`✅ Импортировано ${imported} операций из CSV`);
      } catch {
        setImportStatus('❌ Ошибка чтения CSV файла');
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    localStorage.removeItem('finance-tracker-storage');
    window.location.reload();
  };

  const handleRefreshRates = () => {
    refreshRates();
    setImportStatus('✅ Курсы валют обновлены');
    setTimeout(() => setImportStatus(''), 3000);
  };

  const handleUpdateRate = () => {
    if (rateForm.rate > 0) {
      updateExchangeRate(rateForm.baseCode, rateForm.quoteCode, rateForm.rate);
      setRateForm({ ...rateForm, rate: 0 });
      setImportStatus('✅ Курс обновлён');
      setTimeout(() => setImportStatus(''), 3000);
    }
  };

  const stats = {
    totalTransactions: transactions.length,
    totalAccounts: accounts.length,
    totalCategories: categories.length,
    totalBalance: accounts.reduce((s, a) => s + a.balance, 0),
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0 max-w-3xl">
      <h2 className="text-2xl font-bold">Настройки</h2>

      {/* Stats */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Database size={18} /> Статистика</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <p className="text-xs text-gray-500">Операций</p>
            <p className="text-lg font-bold">{stats.totalTransactions}</p>
          </div>
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <p className="text-xs text-gray-500">Счетов</p>
            <p className="text-lg font-bold">{stats.totalAccounts}</p>
          </div>
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <p className="text-xs text-gray-500">Категорий</p>
            <p className="text-lg font-bold">{stats.totalCategories}</p>
          </div>
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <p className="text-xs text-gray-500">Общий баланс</p>
            <p className="text-lg font-bold">{formatCurrency(stats.totalBalance)}</p>
          </div>
        </div>
      </div>

      {/* Active user */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3">Активный пользователь</h3>
        <select
          value={currentUserId}
          onChange={e => setCurrentUser(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
        >
          {familyMembers.map(m => (
            <option key={m.userId} value={m.userId}>{m.avatar} {m.name} ({m.role})</option>
          ))}
        </select>
      </div>

      {/* Base currency */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><DollarSign size={18} /> Базовая валюта</h3>
        <select
          value={baseCurrency}
          onChange={e => setBaseCurrency(e.target.value as Currency)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
        >
          <option value={Currency.RUB}>RUB ₽ (Российский рубль)</option>
          <option value={Currency.USD}>USD $ (Доллар США)</option>
          <option value={Currency.EUR}>EUR € (Евро)</option>
        </select>
        <p className="text-xs text-gray-500 mt-2">Все итоги и отчёты будут пересчитаны в эту валюту</p>
      </div>

      {/* Exchange rates */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <RefreshCw size={18} /> Курсы валют
        </h3>
        <div className="space-y-2 mb-4">
          {exchangeRates.map(r => (
            <div key={r.id} className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-700/50 text-sm">
              <span className="font-medium">{r.baseCode}/{r.quoteCode}</span>
              <span>{r.rate.toFixed(4)}</span>
              <span className="text-xs text-gray-500">{r.source}</span>
            </div>
          ))}
        </div>
        <button onClick={handleRefreshRates} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700 mb-4">
          <RefreshCw size={14} /> Обновить курсы
        </button>
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <p className="text-sm text-gray-500 mb-2">Ввести курс вручную:</p>
          <div className="flex gap-2 items-end">
            <select value={rateForm.baseCode} onChange={e => setRateForm({ ...rateForm, baseCode: e.target.value })}
              className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
              <option value="USD">USD</option><option value="EUR">EUR</option><option value="KZT">KZT</option><option value="CNY">CNY</option>
            </select>
            <span className="text-sm">→</span>
            <select value={rateForm.quoteCode} onChange={e => setRateForm({ ...rateForm, quoteCode: e.target.value })}
              className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
              <option value="RUB">RUB</option><option value="USD">USD</option><option value="EUR">EUR</option>
            </select>
            <input type="number" step="0.0001" value={rateForm.rate || ''} onChange={e => setRateForm({ ...rateForm, rate: parseFloat(e.target.value) || 0 })}
              className="w-24 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" placeholder="Курс" />
            <button onClick={handleUpdateRate} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">OK</button>
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3">Тема оформления</h3>
        <div className="flex gap-3">
          <button onClick={() => setDarkMode(false)}
            className={`flex-1 p-3 rounded-lg border text-sm font-medium ${!darkMode ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300' : 'border-gray-300 dark:border-gray-600'}`}>
            ☀️ Светлая
          </button>
          <button onClick={() => setDarkMode(true)}
            className={`flex-1 p-3 rounded-lg border text-sm font-medium ${darkMode ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300' : 'border-gray-300 dark:border-gray-600'}`}>
            🌙 Тёмная
          </button>
        </div>
      </div>

      {/* Export */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Download size={18} /> Экспорт данных</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={handleExportCSV} className="p-3 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm flex items-center gap-2">
            <Download size={16} className="text-green-600" />
            <div className="text-left"><p className="font-medium">Экспорт в CSV</p><p className="text-xs text-gray-500">Таблица для Excel</p></div>
          </button>
          <button onClick={handleExportJSON} className="p-3 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm flex items-center gap-2">
            <Download size={16} className="text-blue-600" />
            <div className="text-left"><p className="font-medium">Резервная копия (JSON)</p><p className="text-xs text-gray-500">Полный бэкап данных</p></div>
          </button>
        </div>
      </div>

      {/* Import */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Upload size={18} /> Импорт данных</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="p-3 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm flex items-center gap-2 cursor-pointer">
            <Upload size={16} className="text-green-600" />
            <div><p className="font-medium">Импорт из JSON</p><p className="text-xs text-gray-500">Восстановление из бэкапа</p></div>
            <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" ref={fileInputRef} />
          </label>
          <label className="p-3 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm flex items-center gap-2 cursor-pointer">
            <Upload size={16} className="text-orange-600" />
            <div><p className="font-medium">Импорт из CSV</p><p className="text-xs text-gray-500">Загрузка из таблицы</p></div>
            <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
          </label>
        </div>
        {importStatus && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${importStatus.startsWith('✅') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
            {importStatus}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-red-200 dark:border-red-800">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-red-600"><AlertTriangle size={18} /> Опасная зона</h3>
        <p className="text-sm text-gray-500 mb-3">Сброс удалит все данные и вернёт демо-данные.</p>
        {!showResetConfirm ? (
          <button onClick={() => setShowResetConfirm(true)} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300">
            Сбросить все данные
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={handleReset} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Да, удалить всё</button>
            <button onClick={() => setShowResetConfirm(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">Отмена</button>
          </div>
        )}
      </div>

      {/* About */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-2">О приложении</h3>
        <div className="text-sm text-gray-500 space-y-1">
          <p>💰 ФинТрекер v2.0 — Семейный финансовый трекер</p>
          <p>Бюджеты · Регулярные платежи · Мультивалюта · Семейный доступ</p>
          <p>Хранение данных: localStorage браузера</p>
        </div>
      </div>
    </div>
  );
}
