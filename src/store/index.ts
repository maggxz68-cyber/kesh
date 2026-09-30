import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  Account, Category, Transaction, Budget, RecurringRule, FamilyMember, Receipt,
  TransactionType, PaymentMethod, Currency, FilterState, AccountType, RecurFreq
} from '../types';
import { useAuthStore } from './auth';

interface FamilyData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  familyMembers: FamilyMember[];
  receipts: Receipt[];
}

interface AppState {
  familiesData: Record<string, FamilyData>;
  currentUserId: string;
  baseCurrency: Currency;
  darkMode: boolean;
  initialized: boolean;
  loading: boolean;
  filters: FilterState;
  exchangeRates: Record<string, number>;

  // Derived
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  familyMembers: FamilyMember[];

  init: () => void;
  ensureFamilyData: (familyId: string) => FamilyData;
  setDarkMode: (v: boolean) => void;
  setCurrentUser: (id: string) => void;
  setBaseCurrency: (c: Currency) => void;
  setFilters: (f: Partial<FilterState>) => void;
  resetFilters: () => void;

  // Accounts
  addAccount: (account: Omit<Account, 'id' | 'createdAt' | 'familyId'>) => void;
  updateAccount: (id: string, data: Partial<Account>) => void;
  deleteAccount: (id: string) => void;

  // Categories
  addCategory: (category: Omit<Category, 'id' | 'familyId'>) => void;
  updateCategory: (id: string, data: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  // Transactions
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt' | 'familyId'>) => void;
  updateTransaction: (id: string, data: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;

  // Budgets
  addBudget: (budget: Omit<Budget, 'id' | 'createdAt'>) => void;
  updateBudget: (id: string, data: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;

  // Recurring
  addRecurringRule: (rule: Omit<RecurringRule, 'id' | 'createdAt'>) => void;
  updateRecurringRule: (id: string, data: Partial<RecurringRule>) => void;
  deleteRecurringRule: (id: string) => void;
  skipRecurringRun: (id: string, date: string) => void;
  generateRecurringTransaction: (ruleId: string) => void;

  // Family members
  addFamilyMember: (member: Omit<FamilyMember, 'id' | 'joinedAt' | 'userId'> & { userId?: string; password?: string }) => void;
  updateMemberRole: (userId: string, role: any) => void;
  removeFamilyMember: (userId: string) => void;

  // Receipts
  addReceipt: (receipt: Omit<Receipt, 'id'>) => void;
  updateReceipt: (id: string, data: Partial<Receipt>) => void;
  deleteReceipt: (id: string) => void;

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

const defaultExchangeRates: Record<string, number> = {
  'USD_RUB': 90,
  'EUR_RUB': 98,
  'KZT_RUB': 0.19,
  'CNY_RUB': 12.5,
  'GBP_RUB': 113,
};

function createDefaultFamilyData(familyId: string, userId: string): FamilyData {
  const now = new Date().toISOString();
  
  const accounts: Account[] = [
    { id: uuidv4(), familyId, name: 'Наличные', type: AccountType.CASH, currency: Currency.RUB, balance: 15000, isShared: true, createdAt: now },
    { id: uuidv4(), familyId, name: 'Основная карта', type: AccountType.CARD, currency: Currency.RUB, balance: 85000, isShared: true, createdAt: now },
  ];

  const categories: Category[] = [
    { id: uuidv4(), familyId, name: 'Продукты', type: TransactionType.EXPENSE, color: '#22c55e', icon: '🛒', parentId: null },
    { id: uuidv4(), familyId, name: 'Транспорт', type: TransactionType.EXPENSE, color: '#f59e0b', icon: '🚗', parentId: null },
    { id: uuidv4(), familyId, name: 'Развлечения', type: TransactionType.EXPENSE, color: '#8b5cf6', icon: '🎬', parentId: null },
    { id: uuidv4(), familyId, name: 'Зарплата', type: TransactionType.INCOME, color: '#22c55e', icon: '💼', parentId: null },
    { id: uuidv4(), familyId, name: 'Коммунальные', type: TransactionType.EXPENSE, color: '#ef4444', icon: '🏠', parentId: null },
    { id: uuidv4(), familyId, name: 'Здоровье', type: TransactionType.EXPENSE, color: '#ec4899', icon: '💊', parentId: null },
    { id: uuidv4(), familyId, name: 'Одежда', type: TransactionType.EXPENSE, color: '#06b6d4', icon: '👕', parentId: null },
    { id: uuidv4(), familyId, name: 'Кафе', type: TransactionType.EXPENSE, color: '#f97316', icon: '🍽️', parentId: null },
  ];

  return {
    accounts,
    categories,
    transactions: [],
    budgets: [],
    recurringRules: [],
    familyMembers: [],
    receipts: [],
  };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      familiesData: {},
      currentUserId: '',
      baseCurrency: Currency.RUB,
      darkMode: false,
      initialized: false,
      loading: false,
      filters: defaultFilters,
      exchangeRates: defaultExchangeRates,
      accounts: [],
      categories: [],
      transactions: [],
      budgets: [],
      recurringRules: [],
      familyMembers: [],

      init: () => {
        const { currentFamilyId, currentUser } = useAuthStore.getState();
        if (currentFamilyId && currentUser) {
          get().ensureFamilyData(currentFamilyId);
          set({ currentUserId: currentUser.id, initialized: true });
          updateDerivedData(set, get, currentFamilyId);
        } else {
          set({ initialized: true });
        }
      },

      ensureFamilyData: (familyId: string) => {
        const { familiesData } = get();
        if (!familiesData[familyId]) {
          const { currentUser } = useAuthStore.getState();
          const newData = createDefaultFamilyData(familyId, currentUser?.id || '');
          set({
            familiesData: { ...familiesData, [familyId]: newData },
          });
          return newData;
        }
        return familiesData[familyId];
      },

      setDarkMode: (v) => set({ darkMode: v }),
      setCurrentUser: (id) => set({ currentUserId: id }),
      setBaseCurrency: (c) => set({ baseCurrency: c }),
      setFilters: (f) => set({ filters: { ...get().filters, ...f } }),
      resetFilters: () => set({ filters: defaultFilters }),

      // Accounts
      addAccount: (account) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().ensureFamilyData(currentFamilyId);
        const newAccount: Account = { ...account, id: uuidv4(), familyId: currentFamilyId, createdAt: new Date().toISOString() } as Account;
        const updated = { ...familyData, accounts: [...familyData.accounts, newAccount] };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      updateAccount: (id, data) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, accounts: familyData.accounts.map(a => a.id === id ? { ...a, ...data } : a) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      deleteAccount: (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, accounts: familyData.accounts.filter(a => a.id !== id) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      // Categories
      addCategory: (category) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().ensureFamilyData(currentFamilyId);
        const newCat: Category = { ...category, id: uuidv4(), familyId: currentFamilyId } as Category;
        const updated = { ...familyData, categories: [...familyData.categories, newCat] };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      updateCategory: (id, data) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, categories: familyData.categories.map(c => c.id === id ? { ...c, ...data } : c) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      deleteCategory: (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, categories: familyData.categories.filter(c => c.id !== id) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      // Transactions
      addTransaction: (tx) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().ensureFamilyData(currentFamilyId);
        const newTx: Transaction = { ...tx, id: uuidv4(), familyId: currentFamilyId, createdAt: new Date().toISOString() } as Transaction;
        
        // Обновить баланс счёта
        let updatedAccounts = familyData.accounts;
        if (newTx.accountId) {
          updatedAccounts = familyData.accounts.map(a => {
            if (a.id === newTx.accountId) {
              const delta = newTx.type === TransactionType.INCOME ? newTx.amount : -newTx.amount;
              return { ...a, balance: a.balance + delta };
            }
            return a;
          });
        }

        // Сохранить чек если есть
        let updatedReceipts = familyData.receipts;
        if (newTx.hasReceipt && newTx.receipt) {
          const receipt: Receipt = { ...newTx.receipt, id: newTx.receipt.id || uuidv4(), transactionId: newTx.id };
          updatedReceipts = [...familyData.receipts, receipt];
        }

        const updated = { 
          ...familyData, 
          transactions: [newTx, ...familyData.transactions],
          accounts: updatedAccounts,
          receipts: updatedReceipts,
        };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      updateTransaction: (id, data) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        
        const oldTx = familyData.transactions.find(t => t.id === id);
        
        // Откатить старый баланс
        let updatedAccounts = familyData.accounts;
        if (oldTx && oldTx.accountId) {
          updatedAccounts = updatedAccounts.map(a => {
            if (a.id === oldTx.accountId) {
              const delta = oldTx.type === TransactionType.INCOME ? -oldTx.amount : oldTx.amount;
              return { ...a, balance: a.balance + delta };
            }
            return a;
          });
        }
        
        // Применить новый баланс
        const newTx = { ...oldTx, ...data } as Transaction;
        if (newTx.accountId) {
          updatedAccounts = updatedAccounts.map(a => {
            if (a.id === newTx.accountId) {
              const delta = newTx.type === TransactionType.INCOME ? newTx.amount : -newTx.amount;
              return { ...a, balance: a.balance + delta };
            }
            return a;
          });
        }

        // Обновить чек
        let updatedReceipts = familyData.receipts;
        if (data.receipt) {
          const existingIdx = updatedReceipts.findIndex(r => r.transactionId === id);
          if (existingIdx >= 0) {
            updatedReceipts = updatedReceipts.map((r, i) => i === existingIdx ? { ...r, ...data.receipt } : r);
          } else if (data.hasReceipt) {
            updatedReceipts = [...updatedReceipts, { ...data.receipt, id: data.receipt.id || uuidv4(), transactionId: id } as Receipt];
          }
        } else if (data.hasReceipt === false) {
          updatedReceipts = updatedReceipts.filter(r => r.transactionId !== id);
        }

        const updated = { 
          ...familyData, 
          transactions: familyData.transactions.map(t => t.id === id ? newTx : t),
          accounts: updatedAccounts,
          receipts: updatedReceipts,
        };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      deleteTransaction: (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        
        const tx = familyData.transactions.find(t => t.id === id);
        let updatedAccounts = familyData.accounts;
        if (tx && tx.accountId) {
          updatedAccounts = familyData.accounts.map(a => {
            if (a.id === tx.accountId) {
              const delta = tx.type === TransactionType.INCOME ? -tx.amount : tx.amount;
              return { ...a, balance: a.balance + delta };
            }
            return a;
          });
        }

        const updated = { 
          ...familyData, 
          transactions: familyData.transactions.filter(t => t.id !== id),
          accounts: updatedAccounts,
          receipts: familyData.receipts.filter(r => r.transactionId !== id),
        };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      // Budgets
      addBudget: (budget) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().ensureFamilyData(currentFamilyId);
        const newBudget: Budget = { ...budget, id: uuidv4(), createdAt: new Date().toISOString() } as Budget;
        const updated = { ...familyData, budgets: [...familyData.budgets, newBudget] };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      updateBudget: (id, data) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, budgets: familyData.budgets.map(b => b.id === id ? { ...b, ...data } : b) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      deleteBudget: (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, budgets: familyData.budgets.filter(b => b.id !== id) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      // Recurring
      addRecurringRule: (rule) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().ensureFamilyData(currentFamilyId);
        const newRule: RecurringRule = { ...rule, id: uuidv4(), createdAt: new Date().toISOString() } as RecurringRule;
        const updated = { ...familyData, recurringRules: [...familyData.recurringRules, newRule] };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      updateRecurringRule: (id, data) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, recurringRules: familyData.recurringRules.map(r => r.id === id ? { ...r, ...data } : r) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      deleteRecurringRule: (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, recurringRules: familyData.recurringRules.filter(r => r.id !== id) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      skipRecurringRun: (id, date) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const rule = familyData.recurringRules.find(r => r.id === id);
        if (!rule) return;
        
        // Вычислить следующую дату
        const nextDate = new Date(date);
        if (rule.freq === RecurFreq.DAILY) nextDate.setDate(nextDate.getDate() + 1);
        else if (rule.freq === RecurFreq.WEEKLY) nextDate.setDate(nextDate.getDate() + 7);
        else if (rule.freq === RecurFreq.MONTHLY) nextDate.setMonth(nextDate.getMonth() + 1);
        else if (rule.freq === RecurFreq.YEARLY) nextDate.setFullYear(nextDate.getFullYear() + 1);
        
        const updated = { ...familyData, recurringRules: familyData.recurringRules.map(r => r.id === id ? { ...r, nextRunAt: nextDate.toISOString() } : r) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      generateRecurringTransaction: (ruleId) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const rule = familyData.recurringRules.find(r => r.id === ruleId);
        if (!rule) return;

        const newTx = {
          id: uuidv4(),
          familyId: currentFamilyId,
          type: rule.type,
          amount: rule.amount,
          currency: rule.currency,
          date: new Date().toISOString(),
          categoryId: rule.categoryId,
          accountId: rule.accountId,
          paymentMethod: rule.paymentMethod,
          description: `[Авто] ${rule.name}`,
          counterparty: rule.counterparty || '',
          hasReceipt: rule.expectsReceipt || false,
          receipt: null,
          tags: [],
          isPrivate: false,
          createdById: rule.userId,
          recurringRuleId: rule.id,
          createdAt: new Date().toISOString(),
          toAccountId: rule.toAccountId || null,
        } as unknown as Transaction;

        // Обновить баланс
        let updatedAccounts = familyData.accounts;
        if (newTx.accountId) {
          updatedAccounts = familyData.accounts.map(a => {
            if (a.id === newTx.accountId) {
              const delta = newTx.type === TransactionType.INCOME ? newTx.amount : -newTx.amount;
              return { ...a, balance: a.balance + delta };
            }
            return a;
          });
        }

        // Следующая дата
        const nextDate = new Date();
        if (rule.freq === RecurFreq.DAILY) nextDate.setDate(nextDate.getDate() + 1);
        else if (rule.freq === RecurFreq.WEEKLY) nextDate.setDate(nextDate.getDate() + 7);
        else if (rule.freq === RecurFreq.MONTHLY) nextDate.setMonth(nextDate.getMonth() + 1);
        else if (rule.freq === RecurFreq.YEARLY) nextDate.setFullYear(nextDate.getFullYear() + 1);

        const updated = {
          ...familyData,
          transactions: [newTx, ...familyData.transactions],
          accounts: updatedAccounts,
          recurringRules: familyData.recurringRules.map(r => r.id === ruleId ? { ...r, nextRunAt: nextDate.toISOString() } : r),
        };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      // Family members
      addFamilyMember: (member) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().ensureFamilyData(currentFamilyId);
        const userId = member.userId || `user-${Date.now()}`;
        const newMember: FamilyMember = {
          ...member,
          id: uuidv4(),
          userId,
          joinedAt: new Date().toISOString(),
        } as FamilyMember;
        const updated = { ...familyData, familyMembers: [...familyData.familyMembers, newMember] };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      updateMemberRole: (userId, role) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, familyMembers: familyData.familyMembers.map(m => m.userId === userId ? { ...m, role } : m) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      removeFamilyMember: (userId) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, familyMembers: familyData.familyMembers.filter(m => m.userId !== userId) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      // Receipts
      addReceipt: (receipt) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().ensureFamilyData(currentFamilyId);
        const newReceipt: Receipt = { ...receipt, id: uuidv4() } as Receipt;
        const updated = { ...familyData, receipts: [...familyData.receipts, newReceipt] };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      updateReceipt: (id, data) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, receipts: familyData.receipts.map(r => r.id === id ? { ...r, ...data } : r) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      deleteReceipt: (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        const updated = { ...familyData, receipts: familyData.receipts.filter(r => r.id !== id) };
        set({ familiesData: { ...get().familiesData, [currentFamilyId]: updated } });
        updateDerivedData(set, get, currentFamilyId);
      },

      // Helpers
      getFilteredTransactions: () => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return [];
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return [];
        const { filters } = get();
        return familyData.transactions.filter(t => {
          if (filters.dateFrom && t.date < filters.dateFrom) return false;
          if (filters.dateTo && t.date > filters.dateTo) return false;
          if (filters.type && t.type !== filters.type) return false;
          if (filters.paymentMethod && t.paymentMethod !== filters.paymentMethod) return false;
          if (filters.hasReceipt !== null && t.hasReceipt !== filters.hasReceipt) return false;
          if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
          if (filters.accountId && t.accountId !== filters.accountId) return false;
          if (filters.userId && t.createdById !== filters.userId) return false;
          if (filters.search && !(t.description || '').toLowerCase().includes(filters.search.toLowerCase())) return false;
          return true;
        });
      },

      getAccountBalance: (accountId) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return 0;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return 0;
        return familyData.accounts.find(a => a.id === accountId)?.balance || 0;
      },

      recalcBalances: () => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return;
        // Пересчёт не нужен — балансы обновляются при каждой транзакции
      },

      getExchangeRate: (from, to) => {
        if (from === to) return 1;
        const { exchangeRates } = get();
        const key = `${from}_${to}`;
        const reverseKey = `${to}_${from}`;
        if (exchangeRates[key]) return exchangeRates[key];
        if (exchangeRates[reverseKey]) return 1 / exchangeRates[reverseKey];
        return 1;
      },

      convertToBase: (amount, from) => {
        if (from === get().baseCurrency) return amount;
        return amount * get().getExchangeRate(from, get().baseCurrency);
      },

      getBudgetProgress: () => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return [];
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return [];
        
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
        
        return familyData.budgets.map(b => {
          const monthTxs = familyData.transactions.filter(t => {
            if (t.type !== TransactionType.EXPENSE) return false;
            if (t.date < monthStart || t.date > monthEnd) return false;
            if (b.categoryId && t.categoryId !== b.categoryId) return false;
            return true;
          });
          
          const actual = monthTxs.reduce((sum, t) => sum + get().convertToBase(t.amount, t.currency), 0);
          const planned = b.amount;
          const remaining = planned - actual;
          const percentage = planned > 0 ? (actual / planned) * 100 : 0;
          
          let status: 'ok' | 'warning' | 'danger' = 'ok';
          if (percentage >= 100) status = 'danger';
          else if (percentage >= 80) status = 'warning';
          
          return {
            budgetId: b.id,
            budgetName: b.name,
            planned,
            actual,
            remaining,
            percentage,
            status,
            currency: b.currency,
          };
        });
      },

      getUpcomingPayments: (days) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return [];
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return [];
        
        const now = new Date();
        const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        
        return familyData.recurringRules
          .filter(r => r.isActive && r.nextRunAt)
          .filter(r => {
            const nextDate = new Date(r.nextRunAt);
            return nextDate >= now && nextDate <= future;
          })
          .map(r => ({
            ruleId: r.id,
            name: r.name,
            amount: r.amount,
            currency: r.currency,
            nextRunAt: r.nextRunAt,
            freq: r.freq,
          }))
          .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime());
      },

      getForecast: (months) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return [];
        const familyData = get().familiesData[currentFamilyId];
        if (!familyData) return [];
        
        const result: any[] = [];
        const now = new Date();
        
        for (let i = 0; i < months; i++) {
          const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
          const monthName = monthDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
          
          // Средние расходы за последние 3 месяца
          const last3Months = familyData.transactions.filter(t => {
            const d = new Date(t.date);
            const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);
            return diff <= 3 && t.type === TransactionType.EXPENSE;
          });
          
          const avgExpense = last3Months.length > 0 
            ? last3Months.reduce((s, t) => s + t.amount, 0) / 3 
            : 0;
          
          const avgIncome = familyData.transactions
            .filter(t => {
              const d = new Date(t.date);
              const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);
              return diff <= 3 && t.type === TransactionType.INCOME;
            })
            .reduce((s, t) => s + t.amount, 0) / 3;
          
          result.push({
            month: monthName,
            income: avgIncome,
            expense: avgExpense,
            balance: avgIncome - avgExpense,
          });
        }
        
        return result;
      },

      updateExchangeRate: (base, quote, rate) => {
        set({ exchangeRates: { ...get().exchangeRates, [`${base}_${quote}`]: rate } });
      },

      refreshRates: () => {
        // В реальном приложении здесь был бы запрос к API ЦБ РФ
        // Пока оставляем дефолтные курсы
      },

      resetDemoData: () => {
        const { currentFamilyId, currentUser } = useAuthStore.getState();
        if (!currentFamilyId || !currentUser) return;
        const newData = createDefaultFamilyData(currentFamilyId, currentUser.id);
        set({
          familiesData: { ...get().familiesData, [currentFamilyId]: newData },
        });
        updateDerivedData(set, get, currentFamilyId);
      },
    }),
    { name: 'budget-storage' }
  )
);

function updateDerivedData(set: any, get: any, familyId: string) {
  const familyData = get().familiesData[familyId];
  if (!familyData) return;
  set({
    accounts: familyData.accounts,
    categories: familyData.categories,
    transactions: familyData.transactions,
    budgets: familyData.budgets,
    recurringRules: familyData.recurringRules,
    familyMembers: familyData.familyMembers,
  });
}

// Helper functions
export function formatCurrency(amount: number, currency: Currency = Currency.RUB): string {
  const symbols: Record<string, string> = { RUB: '₽', USD: '$', EUR: '€', KZT: '₸', CNY: '¥', GBP: '£' };
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
