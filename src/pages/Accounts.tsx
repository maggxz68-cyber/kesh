import React, { useState } from 'react';
import { useStore, formatCurrency } from '../store';
import { useAuthStore } from '../store/auth';
import { AccountType, Currency, Account } from '../types';
import { Plus, Edit3, Trash2, Save, X } from 'lucide-react';

interface AccountForm {
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;
}

export default function Accounts() {
  const { accounts, transactions, addAccount, updateAccount, deleteAccount } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>({
    name: '',
    type: AccountType.CARD,
    currency: Currency.RUB,
    balance: 0,
  });

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      updateAccount(editingId, { name: form.name, type: form.type, currency: form.currency });
      setEditingId(null);
    } else {
      const { currentFamilyId } = useAuthStore.getState();
      addAccount({ name: form.name, familyId: currentFamilyId || 'family-001', type: form.type, currency: form.currency, balance: form.balance, isShared: true });
    }
    setForm({ name: '', type: AccountType.CARD, currency: Currency.RUB, balance: 0 });
    setShowForm(false);
  };

  const startEdit = (account: Account) => {
    setForm({ name: account.name, type: account.type, currency: account.currency, balance: account.balance });
    setEditingId(account.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    const txCount = transactions.filter(t => t.accountId === id || t.toAccountId === id).length;
    if (txCount > 0) {
      if (!confirm(`На этом счёте ${txCount} операций. Они будут удалены. Продолжить?`)) return;
    } else {
      if (!confirm('Удалить счёт?')) return;
    }
    deleteAccount(id);
  };

  const getTypeIcon = (type: AccountType) => {
    switch (type) {
      case AccountType.CASH: return '💵';
      case AccountType.CARD: return '💳';
      case AccountType.BANK: return '🏛️';
      case AccountType.SAVINGS: return '🏦';
    }
  };

  const getTypeLabel = (type: AccountType) => {
    switch (type) {
      case AccountType.CASH: return 'Наличные';
      case AccountType.CARD: return 'Карта';
      case AccountType.BANK: return 'Банковский счёт';
      case AccountType.SAVINGS: return 'Вклад';
    }
  };

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Счета и кошельки</h2>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', type: AccountType.CARD, currency: Currency.RUB, balance: 0 }); }}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700"
        >
          <Plus size={16} /> Добавить счёт
        </button>
      </div>

      {/* Total balance */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white">
        <p className="text-sm opacity-80">Общий баланс</p>
        <p className="text-3xl font-bold mt-1">{formatCurrency(totalBalance)}</p>
        <p className="text-sm opacity-80 mt-2">{accounts.length} счетов</p>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-4">
          <h3 className="font-semibold">{editingId ? 'Редактировать счёт' : 'Новый счёт'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Название *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                placeholder="Например: Карта Сбербанк"
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Тип</label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as AccountType })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                <option value={AccountType.CASH}>💵 Наличные</option>
                <option value={AccountType.CARD}>💳 Карта</option>
                <option value={AccountType.BANK}>🏛️ Банковский счёт</option>
                <option value={AccountType.SAVINGS}>🏦 Вклад</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Валюта</label>
              <select
                value={form.currency}
                onChange={e => setForm({ ...form, currency: e.target.value as Currency })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                <option value={Currency.RUB}>RUB ₽</option>
                <option value={Currency.USD}>USD $</option>
                <option value={Currency.EUR}>EUR €</option>
              </select>
            </div>
            {!editingId && (
              <div>
                <label className="text-sm text-gray-500 mb-1 block">Начальный баланс</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.balance}
                  onChange={e => setForm({ ...form, balance: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700">
              <Save size={14} /> {editingId ? 'Сохранить' : 'Создать'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Accounts list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {accounts.map(account => {
          const txCount = transactions.filter(t => t.accountId === account.id || t.toAccountId === account.id).length;
          return (
            <div key={account.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{getTypeIcon(account.type)}</span>
                  <div>
                    <p className="font-semibold">{account.name}</p>
                    <p className="text-xs text-gray-500">{getTypeLabel(account.type)} · {account.currency}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(account)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleDelete(account.id)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <p className="text-2xl font-bold">{formatCurrency(account.balance, account.currency)}</p>
                <p className="text-xs text-gray-500 mt-1">{txCount} операций</p>
              </div>
            </div>
          );
        })}
      </div>

      {accounts.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Нет счетов</p>
          <p className="text-sm mt-1">Добавьте первый счёт для начала учёта</p>
        </div>
      )}
    </div>
  );
}
