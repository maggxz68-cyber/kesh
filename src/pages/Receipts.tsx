import React, { useMemo } from 'react';
import { useStore, formatCurrency, formatDate } from '../store';
import { TransactionType } from '../types';
import { Receipt, Search, Eye, X } from 'lucide-react';
import { useState } from 'react';

export default function Receipts() {
  const { transactions, categories, accounts } = useStore();
  const [search, setSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<string | null>(null);

  const receiptTransactions = useMemo(() => {
    return transactions
      .filter(t => t.hasReceipt && t.receipt)
      .filter(t => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          t.description.toLowerCase().includes(q) ||
          t.counterparty.toLowerCase().includes(q) ||
          (t.receipt?.storeName?.toLowerCase().includes(q) || false) ||
          (t.receipt?.receiptNumber?.toLowerCase().includes(q) || false) ||
          (t.receipt?.items.some(i => i.name.toLowerCase().includes(q)) || false)
        );
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, search]);

  const totalReceipts = receiptTransactions.length;
  const totalAmount = receiptTransactions.reduce((s, t) => s + (t.receipt?.totalAmount || 0), 0);

  const selectedTransaction = selectedTx ? transactions.find(t => t.id === selectedTx) : null;

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Чеки</h2>
        <div className="text-sm text-gray-500">
          {totalReceipts} чеков · {formatCurrency(totalAmount)}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Поиск по магазину, номеру чека, позициям..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Receipts grid */}
      {receiptTransactions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Receipt size={48} className="mx-auto mb-3 opacity-50" />
          <p>Чеки не найдены</p>
          <p className="text-sm mt-1">Добавьте операции с чеками через форму добавления</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {receiptTransactions.map(t => {
            const cat = categories.find(c => c.id === t.categoryId);
            return (
              <div
                key={t.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedTx(t.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm">{t.receipt?.storeName || 'Без названия'}</p>
                    <p className="text-xs text-gray-500">{formatDate(t.date)}</p>
                  </div>
                  <span className="text-lg font-bold text-red-600">
                    {formatCurrency(t.receipt?.totalAmount || 0)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  {t.receipt?.receiptNumber && <p>№ {t.receipt.receiptNumber}</p>}
                  <p>{t.receipt?.items.length || 0} позиций</p>
                  {cat && <p>{cat.icon} {cat.name}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Receipt detail modal */}
      {selectedTransaction && selectedTransaction.receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedTx(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 shadow-xl">
            <button
              onClick={() => setSelectedTx(null)}
              className="absolute top-3 right-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-bold mb-4">Детали чека</h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Магазин:</span>
                  <p className="font-medium">{selectedTransaction.receipt.storeName || '—'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Номер чека:</span>
                  <p className="font-medium">{selectedTransaction.receipt.receiptNumber || '—'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Дата:</span>
                  <p className="font-medium">{formatDate(selectedTransaction.receipt.receiptDate)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Сумма:</span>
                  <p className="font-medium text-red-600">{formatCurrency(selectedTransaction.receipt.totalAmount)}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <p className="text-sm font-medium mb-2">Позиции:</p>
                <div className="space-y-2">
                  {selectedTransaction.receipt.items.map(item => (
                    <div key={item.id} className="flex justify-between items-center text-sm p-2 rounded bg-gray-50 dark:bg-gray-700/50">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.quantity} × {formatCurrency(item.price)}</p>
                      </div>
                      <span className="font-semibold">{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedTransaction.description && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <span className="text-sm text-gray-500">Комментарий:</span>
                  <p className="text-sm">{selectedTransaction.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
