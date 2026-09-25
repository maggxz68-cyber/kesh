import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  Account,
  Category,
  Transaction,
  TransactionType,
  PaymentMethod,
  Currency,
  FilterState,
} from '../types';
import { defaultAccounts, defaultCategories, generateSeedTransactions } from '../data/seed';

interface AppState {
  // Data
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  filters: FilterState;
  darkMode: boolean;
  initialized: boolean;

  // Actions
  init: () => void;
  setDarkMode: (v: boolean) => void;
  setFilters: (f: Partial<FilterState>) => void;
  resetFilters: () => void;

  // Account actions
  addAccount: (account: Omit<Account, 'id' | 'createdAt'>) => void;
  updateAccount: (id: string, data: Partial<Account>) => void;
  deleteAccount: (id: string) => void;

  // Category actions
  addCategory: (category: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, data: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  // Transaction actions
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  updateTransaction: (id: string, data: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;

  // Helpers
  getFilteredTransactions: () => Transaction[];
  getAccountBalance: (accountId: string) => number;
  recalcBalances: () => void;
}

const defaultFilters: FilterState = {
  dateFrom: '',
  dateTo: '',
  type: null,
  paymentMethod: null,
  hasReceipt: null,
  categoryId: null,
  accountId: null,
  search: '',
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      accounts: [],
      categories: [],
      transactions: [],
      filters: { ...defaultFilters },
      darkMode: false,
      initialized: false,

      init: () => {
        const state = get();
        if (state.initialized) return;
        const accounts = defaultAccounts.map(a => ({ ...a, id: uuidv4() }));
        const categories = defaultCategories.map(c => ({ ...c, id: uuidv4() }));
        const transactions = generateSeedTransactions(accounts, categories);
        set({ accounts, categories, transactions, initialized: true });
      },

      setDarkMode: (v) => set({ darkMode: v }),

      setFilters: (f) => set({ filters: { ...get().filters, ...f } }),
      resetFilters: () => set({ filters: { ...defaultFilters } }),

      addAccount: (account) => {
        const newAccount: Account = {
          ...account,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
        };
        set({ accounts: [...get().accounts, newAccount] });
      },

      updateAccount: (id, data) => {
        set({
          accounts: get().accounts.map(a => a.id === id ? { ...a, ...data } : a),
        });
      },

      deleteAccount: (id) => {
        set({
          accounts: get().accounts.filter(a => a.id !== id),
          transactions: get().transactions.filter(t => t.accountId !== id && t.toAccountId !== id),
        });
      },

      addCategory: (category) => {
        const newCategory: Category = { ...category, id: uuidv4() };
        set({ categories: [...get().categories, newCategory] });
      },

      updateCategory: (id, data) => {
        set({
          categories: get().categories.map(c => c.id === id ? { ...c, ...data } : c),
        });
      },

      deleteCategory: (id) => {
        set({
          categories: get().categories.filter(c => c.id !== id),
          transactions: get().transactions.map(t =>
            t.categoryId === id ? { ...t, categoryId: null } : t
          ),
        });
      },

      addTransaction: (tx) => {
        const newTx: Transaction = {
          ...tx,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
        };
        if (newTx.receipt) {
          newTx.receipt.transactionId = newTx.id;
        }
        const transactions = [...get().transactions, newTx];
        set({ transactions });
        get().recalcBalances();
      },

      updateTransaction: (id, data) => {
        const transactions = get().transactions.map(t => {
          if (t.id === id) {
            const updated = { ...t, ...data };
            if (updated.receipt) {
              updated.receipt.transactionId = updated.id;
            }
            return updated;
          }
          return t;
        });
        set({ transactions });
        get().recalcBalances();
      },

      deleteTransaction: (id) => {
        set({ transactions: get().transactions.filter(t => t.id !== id) });
        get().recalcBalances();
      },

      getFilteredTransactions: () => {
        const { transactions, filters } = get();
        return transactions.filter(t => {
          if (filters.dateFrom && new Date(t.date) < new Date(filters.dateFrom)) return false;
          if (filters.dateTo && new Date(t.date) > new Date(filters.dateTo + 'T23:59:59')) return false;
          if (filters.type && t.type !== filters.type) return false;
          if (filters.paymentMethod && t.paymentMethod !== filters.paymentMethod) return false;
          if (filters.hasReceipt !== null && filters.hasReceipt !== undefined && t.hasReceipt !== filters.hasReceipt) return false;
          if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
          if (filters.accountId && t.accountId !== filters.accountId) return false;
          if (filters.search) {
            const q = filters.search.toLowerCase();
            const inDesc = t.description.toLowerCase().includes(q);
            const inCounter = t.counterparty.toLowerCase().includes(q);
            const inReceiptItems = t.receipt?.items.some(i => i.name.toLowerCase().includes(q)) || false;
            if (!inDesc && !inCounter && !inReceiptItems) return false;
          }
          return true;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      },

      getAccountBalance: (accountId) => {
        const account = get().accounts.find(a => a.id === accountId);
        return account?.balance || 0;
      },

      recalcBalances: () => {
        const { accounts, transactions } = get();
        const newAccounts = accounts.map(account => {
          let balance = 0;
          transactions.forEach(t => {
            if (t.type === TransactionType.INCOME && t.accountId === account.id) {
              balance += t.amount;
            } else if (t.type === TransactionType.EXPENSE && t.accountId === account.id) {
              balance -= t.amount;
            } else if (t.type === TransactionType.TRANSFER) {
              if (t.accountId === account.id) balance -= t.amount;
              if (t.toAccountId === account.id) balance += t.amount;
            }
          });
          return { ...account, balance };
        });
        set({ accounts: newAccounts });
      },
    }),
    {
      name: 'finance-tracker-storage',
    }
  )
);

// Helper selectors
export const getCategoriesByType = (type: TransactionType) => {
  return useStore.getState().categories.filter(c => c.type === type);
};

export const getAccountById = (id: string) => {
  return useStore.getState().accounts.find(a => a.id === id);
};

export const getCategoryById = (id: string) => {
  return useStore.getState().categories.find(c => c.id === id);
};

export const formatCurrency = (amount: number, currency: Currency = Currency.RUB): string => {
  const symbols: Record<string, string> = { RUB: '₽', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || currency;
  return `${amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${symbol}`;
};

export const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export const exportToCSV = (transactions: Transaction[], accounts: Account[], categories: Category[]): string => {
  const headers = ['Дата', 'Тип', 'Сумма', 'Валюта', 'Счёт', 'Категория', 'Способ оплаты', 'Описание', 'Контрагент', 'Чек'];
  const rows = transactions.map(t => {
    const account = accounts.find(a => a.id === t.accountId);
    const category = categories.find(c => c.id === t.categoryId);
    return [
      formatDate(t.date),
      t.type === TransactionType.INCOME ? 'Доход' : t.type === TransactionType.EXPENSE ? 'Расход' : 'Перевод',
      t.amount.toString(),
      t.currency,
      account?.name || '',
      category?.name || '',
      t.paymentMethod === PaymentMethod.CASH ? 'Наличные' : 'Безналичные',
      t.description,
      t.counterparty,
      t.hasReceipt ? 'Да' : 'Нет',
    ].map(v => `"${v}"`).join(',');
  });
  return [headers.join(','), ...rows].join('\n');
};

export const exportToJSON = (data: { accounts: Account[]; categories: Category[]; transactions: Transaction[] }): string => {
  return JSON.stringify(data, null, 2);
};
