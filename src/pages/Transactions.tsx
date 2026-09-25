import React, { useState, useMemo } from 'react';
import { useStore, formatCurrency, formatDate } from '../store';
import { TransactionType, PaymentMethod, Transaction } from '../types';
import { Search, Filter, Trash2, Edit3, ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Transactions() {
  const {
    transactions, accounts, categories, familyMembers, filters,
    setFilters, resetFilters, getFilteredTransactions, deleteTransaction
  } = useStore();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const limit = 15;

  const filtered = useMemo(() => getFilteredTransactions(), [transactions, filters]);
  const totalPages = Math.ceil(filtered.length / limit);
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  const handleDelete = (id: string) => {
    if (confirm('Удалить операцию?')) {
      deleteTransaction(id);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Удалить ${selectedIds.size} операций?`)) {
      selectedIds.forEach(id => deleteTransaction(id));
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginated.map(t => t.id)));
    }
  };

  const getTypeLabel = (type: TransactionType) => {
    switch (type) {
      case TransactionType.INCOME: return 'Доход';
      case TransactionType.EXPENSE: return 'Расход';
      case TransactionType.TRANSFER: return 'Перевод';
    }
  };

  const getTypeColor = (type: TransactionType) => {
    switch (type) {
      case TransactionType.INCOME: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      case TransactionType.EXPENSE: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
      case TransactionType.TRANSFER: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    }
  };

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Транзакции</h2>
        <span className="text-sm text-gray-500">{filtered.length} операций</span>
      </div>

      {/* Search & Filter bar */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по описанию, контрагенту..."
            value={filters.search}
            onChange={e => { setFilters({ search: e.target.value }); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-1 ${
            showFilters ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300' : 'border-gray-300 dark:border-gray-600'
          }`}
        >
          <Filter size={16} />
          Фильтры
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Дата с</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={e => { setFilters({ dateFrom: e.target.value }); setPage(1); }}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Дата по</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={e => { setFilters({ dateTo: e.target.value }); setPage(1); }}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Тип</label>
              <select
                value={filters.type || ''}
                onChange={e => { setFilters({ type: e.target.value as TransactionType || null }); setPage(1); }}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                <option value="">Все</option>
                <option value={TransactionType.INCOME}>Доход</option>
                <option value={TransactionType.EXPENSE}>Расход</option>
                <option value={TransactionType.TRANSFER}>Перевод</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Способ оплаты</label>
              <select
                value={filters.paymentMethod || ''}
                onChange={e => { setFilters({ paymentMethod: e.target.value as PaymentMethod || null }); setPage(1); }}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                <option value="">Все</option>
                <option value={PaymentMethod.CASH}>Наличные</option>
                <option value={PaymentMethod.CASHLESS}>Безналичные</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Категория</label>
              <select
                value={filters.categoryId || ''}
                onChange={e => { setFilters({ categoryId: e.target.value || null }); setPage(1); }}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                <option value="">Все</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Счёт</label>
              <select
                value={filters.accountId || ''}
                onChange={e => { setFilters({ accountId: e.target.value || null }); setPage(1); }}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                <option value="">Все</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Чек</label>
              <select
                value={filters.hasReceipt === null ? '' : filters.hasReceipt ? 'true' : 'false'}
                onChange={e => {
                  const v = e.target.value;
                  setFilters({ hasReceipt: v === '' ? null : v === 'true' });
                  setPage(1);
                }}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                <option value="">Все</option>
                <option value="true">С чеком</option>
                <option value="false">Без чека</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Автор</label>
              <select
                value={filters.userId || ''}
                onChange={e => { setFilters({ userId: e.target.value || null }); setPage(1); }}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                <option value="">Все</option>
                {familyMembers.map(m => (
                  <option key={m.userId} value={m.userId}>{m.avatar} {m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={() => { resetFilters(); setPage(1); }}
            className="text-sm text-blue-600 hover:underline"
          >
            Сбросить фильтры
          </button>
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <span className="text-sm">Выбрано: {selectedIds.size}</span>
          <button onClick={handleBulkDelete} className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
            Удалить выбранные
          </button>
        </div>
      )}

      {/* Transactions list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="hidden sm:grid grid-cols-[40px_1fr_120px_120px_100px_80px] gap-2 p-3 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 uppercase">
          <div>
            <input
              type="checkbox"
              checked={selectedIds.size === paginated.length && paginated.length > 0}
              onChange={toggleSelectAll}
              className="rounded"
            />
          </div>
          <div>Операция</div>
          <div>Категория</div>
          <div>Счёт</div>
          <div>Сумма</div>
          <div>Действия</div>
        </div>

        {/* Rows */}
        {paginated.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            Нет операций по заданным фильтрам
          </div>
        ) : (
          paginated.map(t => {
            const cat = categories.find(c => c.id === t.categoryId);
            const account = accounts.find(a => a.id === t.accountId);
            return (
              <div
                key={t.id}
                className="grid grid-cols-1 sm:grid-cols-[40px_1fr_120px_120px_100px_80px] gap-2 p-3 border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 items-center"
              >
                <div className="hidden sm:block">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(t.id)}
                    onChange={() => toggleSelect(t.id)}
                    className="rounded"
                  />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">{cat?.icon || '💸'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.description || cat?.name || 'Операция'}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeColor(t.type)}`}>
                        {getTypeLabel(t.type)}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(t.date)}</span>
                      <span className="text-xs text-gray-400">
                        {t.paymentMethod === PaymentMethod.CASH ? '💵' : '💳'}
                      </span>
                      {t.hasReceipt && <Receipt size={12} className="text-green-600" />}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:block text-sm text-gray-600 dark:text-gray-400 truncate">
                  {cat?.name || '—'}
                </div>
                <div className="hidden sm:block text-sm text-gray-600 dark:text-gray-400 truncate">
                  {account?.name || '—'}
                </div>
                <div className={`text-sm font-semibold ${
                  t.type === TransactionType.INCOME ? 'text-green-600' :
                  t.type === TransactionType.EXPENSE ? 'text-red-600' : 'text-blue-600'
                }`}>
                  {t.type === TransactionType.INCOME ? '+' : t.type === TransactionType.EXPENSE ? '-' : '↔'}
                  {formatCurrency(t.amount)}
                </div>
                <div className="hidden sm:flex items-center gap-1">
                  <button
                    onClick={() => navigate(`/add/${t.id}`)}
                    className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="Редактировать"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                    title="Удалить"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {page} из {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
