import { create } from 'zustand';
import api from '../api/client';
import { useAuthStore } from './auth';
import {
  Account, Category, Transaction, Budget, RecurringRule, FamilyMember,
  TransactionType, PaymentMethod, Currency, FilterState
} from '../types';

interface FamilyData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  familyMembers: FamilyMember[];
}

interface AppState {
  familiesData: Record<string, FamilyData>;
  currentUserId: string;
  baseCurrency: Currency;
  darkMode: boolean;
  initialized: boolean;
  loading: boolean;
  filters: FilterState;
  
  // Derived data (обновляются при loadData)
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  familyMembers: FamilyMember[];
  exchangeRates: any[];

  init: () => Promise<void>;
  loadData: (familyId: string) => Promise<void>;
  setDarkMode: (v: boolean) => void;
  setCurrentUser: (id: string) => void;
  setBaseCurrency: (c: Currency) => void;
  setFilters: (f: Partial<FilterState>) => void;
  resetFilters: () => void;

  getCurrentFamilyData: () => FamilyData | null;
  
  // Accounts
  addAccount: (account: Omit<Account, 'id' | 'createdAt' | 'familyId'>) => Promise<void>;
  updateAccount: (id: string, data: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;

  // Categories
  addCategory: (category: Omit<Category, 'id' | 'familyId'>) => Promise<void>;
  updateCategory: (id: string, data: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  // Transactions
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt' | 'familyId'>) => Promise<void>;
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  // Budgets
  addBudget: (budget: Omit<Budget, 'id' | 'createdAt'>) => Promise<void>;
  updateBudget: (id: string, data: Partial<Budget>) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;

  // Recurring
  addRecurringRule: (rule: Omit<RecurringRule, 'id' | 'createdAt'>) => Promise<void>;
  updateRecurringRule: (id: string, data: Partial<RecurringRule>) => Promise<void>;
  deleteRecurringRule: (id: string) => Promise<void>;
  skipRecurringRun: (id: string, date: string) => void;
  generateRecurringTransaction: (ruleId: string) => void;

  // Family members
  addFamilyMember: (member: any) => Promise<void>;
  updateMemberRole: (userId: string, role: any) => Promise<void>;
  removeFamilyMember: (userId: string) => Promise<void>;

  // Helpers
  getFilteredTransactions: () => Transaction[];
  getAccountBalance: (accountId: string) => number;
  recalcBalances: () => void;
  getExchangeRate: (from: Currency, to: Currency) => number;
  convertToBase: (amount: number, from: Currency) => number;
  getBudgetProgress: () => any[];
  getUpcomingPayments: (days: number) => any[];
  getForecast: (months: number) => any[];
  updateExchangeRate: (base: string, quote: string, rate: number) => void;
  refreshRates: () => void;
  resetDemoData: () => void;
}

const defaultFilters: FilterState = {
  dateFrom: '', dateTo: '', type: null, paymentMethod: null,
  hasReceipt: null, categoryId: null, accountId: null, userId: null, search: '',
};

export const useStore = create<AppState>()((set, get) => ({
  familiesData: {},
  currentUserId: '',
  baseCurrency: Currency.RUB,
  darkMode: false,
  initialized: false,
  loading: false,
  filters: defaultFilters,
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  recurringRules: [],
  familyMembers: [],
  exchangeRates: [],

  init: async () => {
    const { currentFamilyId } = useAuthStore.getState();
    if (currentFamilyId) {
      await get().loadData(currentFamilyId);
    }
    set({ initialized: true });
  },

  loadData: async (familyId: string) => {
    set({ loading: true });
    try {
      const data = await api.getFamilyData(familyId);
      
      const familyData: FamilyData = {
        accounts: data.accounts || [],
        categories: data.categories || [],
        transactions: (data.transactions || []).map((t: any) => ({
          ...t,
          familyId: familyId,
          createdById: t.created_by_id || '',
          categoryId: t.category_id || null,
          accountId: t.account_id || '',
          toAccountId: null,
          paymentMethod: t.payment_method || 'CASHLESS',
          description: t.note || t.description || '',
          counterparty: '',
          hasReceipt: !!t.has_receipt,
          receipt: null,
          tags: [],
          isPrivate: false,
          recurringRuleId: null,
        })),
        budgets: (data.budgets || []).map((b: any) => ({
          ...b,
          familyId: familyId,
          categoryId: b.category_id,
          startDate: b.start_date,
          endDate: b.end_date,
        })),
        recurringRules: (data.recurring || []).map((r: any) => ({
          ...r,
          familyId: familyId,
          categoryId: r.category_id,
          accountId: r.account_id,
          paymentMethod: r.payment_method,
          nextRun: r.next_run,
          isActive: !!r.is_active,
          createdById: r.created_by_id,
        })),
        familyMembers: (data.family.members || []).map((m: any) => ({
          id: m.id,
          userId: m.user_id,
          name: m.name,
          email: m.email,
          role: m.role,
          avatar: m.avatar,
          color: m.color,
          joinedAt: m.joined_at,
        })),
      };

      set({
        familiesData: { ...get().familiesData, [familyId]: familyData },
        accounts: familyData.accounts,
        categories: familyData.categories,
        transactions: familyData.transactions,
        budgets: familyData.budgets,
        recurringRules: familyData.recurringRules,
        familyMembers: familyData.familyMembers,
        loading: false,
      });
    } catch (e) {
      console.error('Load data error:', e);
      set({ loading: false });
    }
  },

  setDarkMode: (v) => set({ darkMode: v }),
  setCurrentUser: (id) => set({ currentUserId: id }),
  setBaseCurrency: (c) => set({ baseCurrency: c }),
  setFilters: (f) => set({ filters: { ...get().filters, ...f } }),
  resetFilters: () => set({ filters: defaultFilters }),

  getCurrentFamilyData: () => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return null;
    return get().familiesData[currentFamilyId] || null;
  },

  // Accounts
  addAccount: async (account) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    const result = await api.createAccount(currentFamilyId, account);
    const familyData = get().familiesData[currentFamilyId];
    if (familyData) {
      set({
        familiesData: {
          ...get().familiesData,
          [currentFamilyId]: {
            ...familyData,
            accounts: [...familyData.accounts, { ...result, familyId: currentFamilyId }],
          },
        },
      });
    }
  },

  updateAccount: async (id, data) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.updateAccount(currentFamilyId, id, data);
    const familyData = get().familiesData[currentFamilyId];
    if (familyData) {
      set({
        familiesData: {
          ...get().familiesData,
          [currentFamilyId]: {
            ...familyData,
            accounts: familyData.accounts.map(a => a.id === id ? { ...a, ...data } : a),
          },
        },
      });
    }
  },

  deleteAccount: async (id) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.deleteAccount(currentFamilyId, id);
    const familyData = get().familiesData[currentFamilyId];
    if (familyData) {
      set({
        familiesData: {
          ...get().familiesData,
          [currentFamilyId]: {
            ...familyData,
            accounts: familyData.accounts.filter(a => a.id !== id),
          },
        },
      });
    }
  },

  // Categories
  addCategory: async (category) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    const result = await api.createCategory(currentFamilyId, category);
    const familyData = get().familiesData[currentFamilyId];
    if (familyData) {
      set({
        familiesData: {
          ...get().familiesData,
          [currentFamilyId]: {
            ...familyData,
            categories: [...familyData.categories, { ...result, familyId: currentFamilyId }],
          },
        },
      });
    }
  },

  updateCategory: async (id, data) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.updateCategory(currentFamilyId, id, data);
    const familyData = get().familiesData[currentFamilyId];
    if (familyData) {
      set({
        familiesData: {
          ...get().familiesData,
          [currentFamilyId]: {
            ...familyData,
            categories: familyData.categories.map(c => c.id === id ? { ...c, ...data } : c),
          },
        },
      });
    }
  },

  deleteCategory: async (id) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.deleteCategory(currentFamilyId, id);
    const familyData = get().familiesData[currentFamilyId];
    if (familyData) {
      set({
        familiesData: {
          ...get().familiesData,
          [currentFamilyId]: {
            ...familyData,
            categories: familyData.categories.filter(c => c.id !== id),
          },
        },
      });
    }
  },

  // Transactions
  addTransaction: async (tx) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.createTransaction(currentFamilyId, tx);
    await get().loadData(currentFamilyId);
  },

  updateTransaction: async (id, data) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.updateTransaction(currentFamilyId, id, data);
    await get().loadData(currentFamilyId);
  },

  deleteTransaction: async (id) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.deleteTransaction(currentFamilyId, id);
    await get().loadData(currentFamilyId);
  },

  // Budgets
  addBudget: async (budget) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    const result = await api.createBudget(currentFamilyId, budget);
    const familyData = get().familiesData[currentFamilyId];
    if (familyData) {
      set({
        familiesData: {
          ...get().familiesData,
          [currentFamilyId]: {
            ...familyData,
            budgets: [...familyData.budgets, { ...result, familyId: currentFamilyId }],
          },
        },
      });
    }
  },

  updateBudget: async (id, data) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.updateBudget(currentFamilyId, id, data);
    const familyData = get().familiesData[currentFamilyId];
    if (familyData) {
      set({
        familiesData: {
          ...get().familiesData,
          [currentFamilyId]: {
            ...familyData,
            budgets: familyData.budgets.map(b => b.id === id ? { ...b, ...data } : b),
          },
        },
      });
    }
  },

  deleteBudget: async (id) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.deleteBudget(currentFamilyId, id);
    const familyData = get().familiesData[currentFamilyId];
    if (familyData) {
      set({
        familiesData: {
          ...get().familiesData,
          [currentFamilyId]: {
            ...familyData,
            budgets: familyData.budgets.filter(b => b.id !== id),
          },
        },
      });
    }
  },

  // Recurring
  addRecurringRule: async (rule) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    const result = await api.createRecurring(currentFamilyId, rule);
    const familyData = get().familiesData[currentFamilyId];
    if (familyData) {
      set({
        familiesData: {
          ...get().familiesData,
          [currentFamilyId]: {
            ...familyData,
            recurringRules: [...familyData.recurringRules, { ...result, familyId: currentFamilyId }],
          },
        },
      });
    }
  },

  updateRecurringRule: async (id, data) => {},
  deleteRecurringRule: async (id) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.deleteRecurring(currentFamilyId, id);
    const familyData = get().familiesData[currentFamilyId];
    if (familyData) {
      set({
        familiesData: {
          ...get().familiesData,
          [currentFamilyId]: {
            ...familyData,
            recurringRules: familyData.recurringRules.filter(r => r.id !== id),
          },
        },
      });
    }
  },

  skipRecurringRun: () => {},
  generateRecurringTransaction: () => {},

  // Family members
  addFamilyMember: async (member) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.addFamilyMember(currentFamilyId, member.name, member.email, member.password || 'default123', member.role);
    await get().loadData(currentFamilyId);
  },

  updateMemberRole: async () => {},

  removeFamilyMember: async (userId) => {
    const { currentFamilyId } = useAuthStore.getState();
    if (!currentFamilyId) return;
    await api.removeFamilyMember(currentFamilyId, userId);
    await get().loadData(currentFamilyId);
  },

  // Helpers
  getFilteredTransactions: () => {
    const data = get().getCurrentFamilyData();
    if (!data) return [];
    const { filters } = get();
    return data.transactions.filter(t => {
      if (filters.dateFrom && t.date < filters.dateFrom) return false;
      if (filters.dateTo && t.date > filters.dateTo) return false;
      if (filters.type && t.type !== filters.type) return false;
      if (filters.paymentMethod && t.paymentMethod !== filters.paymentMethod) return false;
      if (filters.hasReceipt !== null && t.hasReceipt !== filters.hasReceipt) return false;
      if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
      if (filters.accountId && t.accountId !== filters.accountId) return false;
      if (filters.userId && t.createdById !== filters.userId) return false;
      if (filters.search && !t.description?.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  },

  getAccountBalance: (accountId) => {
    const data = get().getCurrentFamilyData();
    if (!data) return 0;
    const account = data.accounts.find(a => a.id === accountId);
    return account?.balance || 0;
  },

  recalcBalances: () => {},

  getExchangeRate: (from, to) => {
    if (from === to) return 1;
    return 1;
  },

  convertToBase: (amount, from) => {
    if (from === get().baseCurrency) return amount;
    return amount;
  },

  getBudgetProgress: () => {
    const data = get().getCurrentFamilyData();
    if (!data) return [];
    return data.budgets.map(b => ({
      budgetId: b.id,
      budgetName: b.name,
      planned: b.amount,
      actual: 0,
      remaining: b.amount,
      percentage: 0,
      status: 'ok' as const,
      currency: b.currency,
    }));
  },

  getUpcomingPayments: () => [],
  getForecast: () => [],
  updateExchangeRate: () => {},
  refreshRates: () => {},
  resetDemoData: () => {},
}));

// Helper functions
export function formatCurrency(amount: number, currency: Currency = Currency.RUB): string {
  const symbols: Record<Currency, string> = {
    [Currency.RUB]: '₽',
    [Currency.USD]: '$',
    [Currency.EUR]: '€',
    [Currency.KZT]: '₸',
    [Currency.CNY]: '¥',
  };
  return `${amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${symbols[currency] || currency}`;
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ru-RU');
}

export function exportToCSV(transactions: Transaction[], accounts: Account[], categories: Category[]): string {
  const headers = ['Дата', 'Тип', 'Сумма', 'Валюта', 'Категория', 'Счёт', 'Способ оплаты', 'Заметка'];
  const rows = transactions.map(t => {
    const cat = categories.find(c => c.id === t.categoryId);
    const acc = accounts.find(a => a.id === t.accountId);
    return [
      formatDate(t.date),
      t.type === 'INCOME' ? 'Доход' : 'Расход',
      t.amount,
      t.currency,
      cat?.name || '',
      acc?.name || '',
      t.paymentMethod === 'CASH' ? 'Наличные' : 'Карта',
      t.description || '',
    ].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}
