import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  Account, Category, Transaction, Budget, RecurringRule, FamilyMember, Receipt,
  TransactionType, PaymentMethod, Currency, FilterState, AccountType, RecurFreq
} from '../types';
import { useAuthStore } from './auth';
import api from '../api/client';

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

  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  familyMembers: FamilyMember[];

  init: () => Promise<void>;
  loadData: (familyId: string) => Promise<void>;
  setDarkMode: (v: boolean) => void;
  setCurrentUser: (id: string) => void;
  setBaseCurrency: (c: Currency) => void;
  setFilters: (f: Partial<FilterState>) => void;
  resetFilters: () => void;

  addAccount: (account: Omit<Account, 'id' | 'createdAt' | 'familyId'>) => Promise<void>;
  updateAccount: (id: string, changes: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;

  addCategory: (category: Omit<Category, 'id' | 'familyId'>) => Promise<void>;
  updateCategory: (id: string, changes: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt' | 'familyId'>) => Promise<void>;
  updateTransaction: (id: string, changes: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  addBudget: (budget: Omit<Budget, 'id' | 'createdAt'>) => Promise<void>;
  updateBudget: (id: string, changes: Partial<Budget>) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;

  addRecurringRule: (rule: Omit<RecurringRule, 'id' | 'createdAt'>) => Promise<void>;
  updateRecurringRule: (id: string, changes: Partial<RecurringRule>) => Promise<void>;
  deleteRecurringRule: (id: string) => Promise<void>;
  skipRecurringRun: (id: string, date: string) => void;
  generateRecurringTransaction: (ruleId: string) => void;

  addFamilyMember: (member: any) => Promise<void>;
  updateMemberRole: (userId: string, role: any) => Promise<void>;
  removeFamilyMember: (userId: string) => Promise<void>;

  addReceipt: (receipt: Omit<Receipt, 'id'>) => Promise<void>;
  updateReceipt: (id: string, changes: Partial<Receipt>) => Promise<void>;
  deleteReceipt: (id: string) => Promise<void>;

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
  'USD_RUB': 90, 'EUR_RUB': 98, 'KZT_RUB': 0.19, 'CNY_RUB': 12.5, 'GBP_RUB': 113,
};

// Проверяем доступность backend
const checkBackend = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/health', { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
};

// Создаём демо-данные для offline режима
const createDemoData = (familyId: string, userId: string): FamilyData => {
  const now = new Date();
  const accounts: Account[] = [
    {
      id: 'acc-demo-001',
      familyId,
      name: 'Наличные',
      type: AccountType.CASH,
      currency: Currency.RUB,
      balance: 15000,
      isShared: true,
      createdAt: now.toISOString(),
    },
    {
      id: 'acc-demo-002',
      familyId,
      name: 'Основная карта',
      type: AccountType.CARD,
      currency: Currency.RUB,
      balance: 85000,
      isShared: true,
      createdAt: now.toISOString(),
    },
  ];

  const categories: Category[] = [
    { id: 'cat-001', familyId, name: 'Продукты', type: TransactionType.EXPENSE, icon: '🛒', color: '#22c55e', parentId: null },
    { id: 'cat-002', familyId, name: 'Транспорт', type: TransactionType.EXPENSE, icon: '🚗', color: '#f59e0b', parentId: null },
    { id: 'cat-003', familyId, name: 'Развлечения', type: TransactionType.EXPENSE, icon: '🎬', color: '#8b5cf6', parentId: null },
    { id: 'cat-004', familyId, name: 'Зарплата', type: TransactionType.INCOME, icon: '💼', color: '#22c55e', parentId: null },
    { id: 'cat-005', familyId, name: 'Коммунальные', type: TransactionType.EXPENSE, icon: '🏠', color: '#ef4444', parentId: null },
    { id: 'cat-006', familyId, name: 'Здоровье', type: TransactionType.EXPENSE, icon: '💊', color: '#ec4899', parentId: null },
    { id: 'cat-007', familyId, name: 'Одежда', type: TransactionType.EXPENSE, icon: '👕', color: '#06b6d4', parentId: null },
    { id: 'cat-008', familyId, name: 'Кафе', type: TransactionType.EXPENSE, icon: '🍽️', color: '#f97316', parentId: null },
  ];

  // Генерируем демо-транзакции
  const transactions: Transaction[] = [];
  for (let i = 0; i < 20; i++) {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 30));
    const isIncome = Math.random() > 0.7;
    
    transactions.push({
      id: `tx-demo-${i}`,
      familyId,
      type: isIncome ? TransactionType.INCOME : TransactionType.EXPENSE,
      amount: Math.floor(Math.random() * 5000) + 100,
      currency: Currency.RUB,
      date: date.toISOString(),
      categoryId: isIncome ? 'cat-004' : categories[Math.floor(Math.random() * 3) + (Math.random() > 0.5 ? 0 : 1)].id,
      accountId: Math.random() > 0.5 ? 'acc-demo-001' : 'acc-demo-002',
      toAccountId: null,
      paymentMethod: Math.random() > 0.5 ? PaymentMethod.CASH : PaymentMethod.CASHLESS,
      description: '',
      counterparty: '',
      hasReceipt: false,
      receipt: null,
      tags: [],
      isPrivate: false,
      createdById: userId,
      recurringRuleId: null,
      createdAt: date.toISOString(),
    });
  }

  const familyMembers: FamilyMember[] = [
    {
      id: 'fm-001',
      userId,
      name: 'Демо Пользователь',
      email: 'demo@example.com',
      role: 'FAMILY_ADMIN' as any,
      avatar: '👨',
      color: '#3b82f6',
      joinedAt: now.toISOString(),
    },
  ];

  return {
    accounts,
    categories,
    transactions,
    budgets: [],
    recurringRules: [],
    familyMembers,
    receipts: [],
  };
};

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

      init: async () => {
        const { currentFamilyId, currentUser } = useAuthStore.getState();
        if (currentFamilyId) {
          await get().loadData(currentFamilyId);
        }
        set({ initialized: true });
      },

      loadData: async (familyId: string) => {
        set({ loading: true });
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          try {
            const data = await api.getFamilyData(familyId);
            
            const familyData: FamilyData = {
              accounts: data.accounts || [],
              categories: data.categories || [],
              transactions: (data.transactions || []).map((t: any) => ({
                ...t, familyId, createdById: t.created_by_id || '', categoryId: t.category_id || null,
                accountId: t.account_id || '', toAccountId: null, paymentMethod: t.payment_method || 'CASHLESS',
                description: t.note || t.description || '', counterparty: '', hasReceipt: !!t.has_receipt,
                receipt: null, tags: [], isPrivate: false, recurringRuleId: null,
              })),
              budgets: (data.budgets || []).map((b: any) => ({
                ...b, familyId, categoryId: b.category_id, startDate: b.start_date, endDate: b.end_date,
              })),
              recurringRules: (data.recurring || []).map((r: any) => ({
                ...r, familyId, categoryId: r.category_id, accountId: r.account_id,
                paymentMethod: r.payment_method, nextRunAt: r.next_run, isActive: !!r.is_active, userId: r.created_by_id,
              })),
              familyMembers: (data.family.members || []).map((m: any) => ({
                id: m.id, userId: m.user_id, name: m.name, email: m.email,
                role: m.role, avatar: m.avatar, color: m.color, joinedAt: m.joined_at,
              })),
              receipts: [],
            };

            try {
              const receipts = await api.getReceipts(familyId);
              familyData.receipts = receipts.map((r: any) => ({
                id: r.id, transactionId: r.transaction_id, receiptNumber: r.receipt_number || '',
                storeName: r.store_name || '', receiptDate: r.receipt_date || '',
                totalAmount: r.total_amount || 0, filePath: r.file_path || null,
                items: (r.items || []).map((item: any) => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.price, total: item.total })),
              }));
              familyData.transactions = familyData.transactions.map(t => {
                const receipt = familyData.receipts.find(r => r.transactionId === t.id);
                return receipt ? { ...t, receipt } : t;
              });
            } catch (e) { 
              console.warn('Чеки не поддерживаются сервером, продолжаем без них');
            }

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
        } else {
          // Offline режим: используем localStorage или создаём демо-данные
          const { currentUser } = useAuthStore.getState();
          const existingData = get().familiesData[familyId];
          
          if (existingData) {
            set({
              accounts: existingData.accounts,
              categories: existingData.categories,
              transactions: existingData.transactions,
              budgets: existingData.budgets,
              recurringRules: existingData.recurringRules,
              familyMembers: existingData.familyMembers,
              loading: false,
            });
          } else if (currentUser) {
            // Создаём демо-данные
            const demoData = createDemoData(familyId, currentUser.id);
            set({
              familiesData: { ...get().familiesData, [familyId]: demoData },
              accounts: demoData.accounts,
              categories: demoData.categories,
              transactions: demoData.transactions,
              budgets: demoData.budgets,
              recurringRules: demoData.recurringRules,
              familyMembers: demoData.familyMembers,
              loading: false,
            });
          } else {
            set({ loading: false });
          }
        }
      },

      setDarkMode: (v) => set({ darkMode: v }),
      setCurrentUser: (id) => set({ currentUserId: id }),
      setBaseCurrency: (c) => set({ baseCurrency: c }),
      setFilters: (f) => set({ filters: { ...get().filters, ...f } }),
      resetFilters: () => set({ filters: defaultFilters }),

      addAccount: async (account) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          const result = await api.createAccount(currentFamilyId, account);
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = [...fd.accounts, { ...result, familyId: currentFamilyId }];
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, accounts: updated } }, accounts: updated });
          }
        } else {
          // Offline режим
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const newAccount: Account = {
              ...account,
              id: uuidv4(),
              familyId: currentFamilyId,
              createdAt: new Date().toISOString(),
            } as Account;
            const updated = [...fd.accounts, newAccount];
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, accounts: updated } }, accounts: updated });
          }
        }
      },

      updateAccount: async (id, changes) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.updateAccount(currentFamilyId, id, changes);
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.accounts.map(a => a.id === id ? { ...a, ...changes } : a);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, accounts: updated } }, accounts: updated });
          }
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.accounts.map(a => a.id === id ? { ...a, ...changes } : a);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, accounts: updated } }, accounts: updated });
          }
        }
      },

      deleteAccount: async (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.deleteAccount(currentFamilyId, id);
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.accounts.filter(a => a.id !== id);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, accounts: updated } }, accounts: updated });
          }
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.accounts.filter(a => a.id !== id);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, accounts: updated } }, accounts: updated });
          }
        }
      },

      addCategory: async (category) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          const result = await api.createCategory(currentFamilyId, category);
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = [...fd.categories, { ...result, familyId: currentFamilyId }];
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, categories: updated } }, categories: updated });
          }
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const newCategory: Category = {
              ...category,
              id: uuidv4(),
              familyId: currentFamilyId,
            } as Category;
            const updated = [...fd.categories, newCategory];
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, categories: updated } }, categories: updated });
          }
        }
      },

      updateCategory: async (id, changes) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.updateCategory(currentFamilyId, id, changes);
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.categories.map(c => c.id === id ? { ...c, ...changes } : c);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, categories: updated } }, categories: updated });
          }
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.categories.map(c => c.id === id ? { ...c, ...changes } : c);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, categories: updated } }, categories: updated });
          }
        }
      },

      deleteCategory: async (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.deleteCategory(currentFamilyId, id);
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.categories.filter(c => c.id !== id);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, categories: updated } }, categories: updated });
          }
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.categories.filter(c => c.id !== id);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, categories: updated } }, categories: updated });
          }
        }
      },

      addTransaction: async (tx) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          const { receipt, ...txData } = tx as any;
          
          const serverData = {
            ...txData,
            note: txData.description || '',
          };
          delete serverData.description;
          delete serverData.counterparty;
          delete serverData.tags;
          delete serverData.isPrivate;
          delete serverData.createdById;
          delete serverData.recurringRuleId;
          delete serverData.toAccountId;
          
          const result = await api.createTransaction(currentFamilyId, serverData);
          
          if (receipt && tx.hasReceipt) {
            try {
              await api.createReceipt(currentFamilyId, {
                transactionId: result.id, receiptNumber: receipt.receiptNumber, storeName: receipt.storeName,
                receiptDate: receipt.receiptDate, totalAmount: receipt.totalAmount, filePath: receipt.filePath, items: receipt.items,
              });
            } catch (error) {
              console.warn('Чеки не поддерживаются сервером, транзакция сохранена без чека');
            }
          }
          
          await get().loadData(currentFamilyId);
        } else {
          // Offline режим
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const txId = uuidv4();
            const newTx: Transaction = {
              ...tx,
              id: txId,
              familyId: currentFamilyId,
              createdAt: new Date().toISOString(),
            } as Transaction;
            
            // Обновляем баланс счёта
            let updatedAccounts = fd.accounts;
            if (newTx.accountId) {
              updatedAccounts = fd.accounts.map(a => {
                if (a.id === newTx.accountId) {
                  const delta = newTx.type === TransactionType.INCOME ? newTx.amount : -newTx.amount;
                  return { ...a, balance: a.balance + delta };
                }
                return a;
              });
            }
            
            // Сохраняем чек если есть
            let updatedReceipts = fd.receipts;
            const { receipt } = tx as any;
            if (receipt && tx.hasReceipt) {
              const newReceipt: Receipt = {
                ...receipt,
                id: receipt.id || uuidv4(),
                transactionId: txId,
              } as Receipt;
              updatedReceipts = [...fd.receipts, newReceipt];
              newTx.receipt = newReceipt;
            }
            
            const updated = {
              ...fd,
              transactions: [newTx, ...fd.transactions],
              accounts: updatedAccounts,
              receipts: updatedReceipts,
            };
            
            set({
              familiesData: { ...get().familiesData, [currentFamilyId]: updated },
              transactions: updated.transactions,
              accounts: updatedAccounts,
            });
          }
        }
      },

      updateTransaction: async (id, changes) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          const { receipt, ...txData } = changes as any;
          
          const serverData = {
            ...txData,
            note: txData.description || '',
          };
          delete serverData.description;
          delete serverData.counterparty;
          delete serverData.tags;
          delete serverData.isPrivate;
          delete serverData.createdById;
          delete serverData.recurringRuleId;
          delete serverData.toAccountId;
          
          await api.updateTransaction(currentFamilyId, id, serverData);
          
          if (receipt && changes.hasReceipt) {
            try {
              const fd = get().familiesData[currentFamilyId];
              const existing = fd?.receipts.find(r => r.transactionId === id);
              if (existing) {
                await api.updateReceipt(currentFamilyId, existing.id, {
                  receiptNumber: receipt.receiptNumber, storeName: receipt.storeName,
                  receiptDate: receipt.receiptDate, totalAmount: receipt.totalAmount, filePath: receipt.filePath, items: receipt.items,
                });
              } else {
                await api.createReceipt(currentFamilyId, {
                  transactionId: id, receiptNumber: receipt.receiptNumber, storeName: receipt.storeName,
                  receiptDate: receipt.receiptDate, totalAmount: receipt.totalAmount, filePath: receipt.filePath, items: receipt.items,
                });
              }
            } catch (error) {
              console.warn('Не удалось обновить чек, но транзакция сохранена:', error);
            }
          } else if (changes.hasReceipt === false) {
            try {
              const fd = get().familiesData[currentFamilyId];
              const existing = fd?.receipts.find(r => r.transactionId === id);
              if (existing) await api.deleteReceipt(currentFamilyId, existing.id);
            } catch (error) {
              console.warn('Не удалось удалить чек, но транзакция сохранена:', error);
            }
          }
          
          await get().loadData(currentFamilyId);
        } else {
          // Offline режим
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            let updatedTransactions = fd.transactions.map(t => t.id === id ? { ...t, ...changes } : t);
            
            // Обновляем чек если есть
            let updatedReceipts = fd.receipts;
            const { receipt } = changes as any;
            if (receipt && changes.hasReceipt) {
              const existingIdx = updatedReceipts.findIndex(r => r.transactionId === id);
              if (existingIdx >= 0) {
                updatedReceipts = updatedReceipts.map((r, i) => i === existingIdx ? { ...r, ...receipt } : r);
              } else {
                const newReceipt: Receipt = {
                  ...receipt,
                  id: receipt.id || uuidv4(),
                  transactionId: id,
                } as Receipt;
                updatedReceipts = [...updatedReceipts, newReceipt];
              }
              const foundReceipt = updatedReceipts.find(r => r.transactionId === id);
              updatedTransactions = updatedTransactions.map(t => t.id === id ? { ...t, receipt: foundReceipt || null } : t) as Transaction[];
            } else if (changes.hasReceipt === false) {
              updatedReceipts = updatedReceipts.filter(r => r.transactionId !== id);
              updatedTransactions = updatedTransactions.map(t => t.id === id ? { ...t, receipt: null } : t) as Transaction[];
            }
            
            set({
              familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, transactions: updatedTransactions, receipts: updatedReceipts } },
              transactions: updatedTransactions,
            });
          }
        }
      },

      deleteTransaction: async (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          const fd = get().familiesData[currentFamilyId];
          const receipt = fd?.receipts.find(r => r.transactionId === id);
          if (receipt) {
            try {
              await api.deleteReceipt(currentFamilyId, receipt.id);
            } catch (error) {
              console.warn('Не удалось удалить чек:', error);
            }
          }
          
          await api.deleteTransaction(currentFamilyId, id);
          await get().loadData(currentFamilyId);
        } else {
          // Offline режим
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const tx = fd.transactions.find(t => t.id === id);
            let updatedAccounts = fd.accounts;
            
            if (tx && tx.accountId) {
              updatedAccounts = fd.accounts.map(a => {
                if (a.id === tx.accountId) {
                  const delta = tx.type === TransactionType.INCOME ? -tx.amount : tx.amount;
                  return { ...a, balance: a.balance + delta };
                }
                return a;
              });
            }
            
            const updated = {
              ...fd,
              transactions: fd.transactions.filter(t => t.id !== id),
              accounts: updatedAccounts,
              receipts: fd.receipts.filter(r => r.transactionId !== id),
            };
            
            set({
              familiesData: { ...get().familiesData, [currentFamilyId]: updated },
              transactions: updated.transactions,
              accounts: updatedAccounts,
            });
          }
        }
      },

      addBudget: async (budget) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          const result = await api.createBudget(currentFamilyId, budget);
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = [...fd.budgets, { ...result, familyId: currentFamilyId }];
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, budgets: updated } }, budgets: updated });
          }
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const newBudget: Budget = {
              ...budget,
              id: uuidv4(),
              createdAt: new Date().toISOString(),
            } as Budget;
            const updated = [...fd.budgets, newBudget];
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, budgets: updated } }, budgets: updated });
          }
        }
      },

      updateBudget: async (id, changes) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.updateBudget(currentFamilyId, id, changes);
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.budgets.map(b => b.id === id ? { ...b, ...changes } : b);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, budgets: updated } }, budgets: updated });
          }
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.budgets.map(b => b.id === id ? { ...b, ...changes } : b);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, budgets: updated } }, budgets: updated });
          }
        }
      },

      deleteBudget: async (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.deleteBudget(currentFamilyId, id);
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.budgets.filter(b => b.id !== id);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, budgets: updated } }, budgets: updated });
          }
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.budgets.filter(b => b.id !== id);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, budgets: updated } }, budgets: updated });
          }
        }
      },

      addRecurringRule: async (rule) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          const result = await api.createRecurring(currentFamilyId, rule);
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = [...fd.recurringRules, { ...result, familyId: currentFamilyId }];
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, recurringRules: updated } }, recurringRules: updated });
          }
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const newRule: RecurringRule = {
              ...rule,
              id: uuidv4(),
              createdAt: new Date().toISOString(),
            } as RecurringRule;
            const updated = [...fd.recurringRules, newRule];
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, recurringRules: updated } }, recurringRules: updated });
          }
        }
      },

      updateRecurringRule: async (id, changes) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const fd = get().familiesData[currentFamilyId];
        if (fd) {
          const updated = fd.recurringRules.map(r => r.id === id ? { ...r, ...changes } : r);
          set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, recurringRules: updated } }, recurringRules: updated });
        }
      },

      deleteRecurringRule: async (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.deleteRecurring(currentFamilyId, id);
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.recurringRules.filter(r => r.id !== id);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, recurringRules: updated } }, recurringRules: updated });
          }
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.recurringRules.filter(r => r.id !== id);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, recurringRules: updated } }, recurringRules: updated });
          }
        }
      },

      skipRecurringRun: () => {},
      generateRecurringTransaction: () => {},

      addFamilyMember: async (member) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.addFamilyMember(currentFamilyId, member.name, member.email, member.password || 'default123', member.role);
          await get().loadData(currentFamilyId);
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const newMember: FamilyMember = {
              ...member,
              id: uuidv4(),
              userId: member.userId || uuidv4(),
              joinedAt: new Date().toISOString(),
            } as FamilyMember;
            const updated = [...fd.familyMembers, newMember];
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, familyMembers: updated } }, familyMembers: updated });
          }
        }
      },

      updateMemberRole: async () => {},

      removeFamilyMember: async (userId) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.removeFamilyMember(currentFamilyId, userId);
          await get().loadData(currentFamilyId);
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.familyMembers.filter(m => m.userId !== userId);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, familyMembers: updated } }, familyMembers: updated });
          }
        }
      },

      addReceipt: async (receipt) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.createReceipt(currentFamilyId, receipt);
          await get().loadData(currentFamilyId);
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const newReceipt: Receipt = {
              ...receipt,
              id: uuidv4(),
            } as Receipt;
            const updated = [...fd.receipts, newReceipt];
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, receipts: updated } } });
          }
        }
      },

      updateReceipt: async (id, changes) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.updateReceipt(currentFamilyId, id, changes);
          await get().loadData(currentFamilyId);
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.receipts.map(r => r.id === id ? { ...r, ...changes } : r);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, receipts: updated } } });
          }
        }
      },

      deleteReceipt: async (id) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return;
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          await api.deleteReceipt(currentFamilyId, id);
          await get().loadData(currentFamilyId);
        } else {
          const fd = get().familiesData[currentFamilyId];
          if (fd) {
            const updated = fd.receipts.filter(r => r.id !== id);
            set({ familiesData: { ...get().familiesData, [currentFamilyId]: { ...fd, receipts: updated } } });
          }
        }
      },

      getFilteredTransactions: () => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return [];
        const fd = get().familiesData[currentFamilyId];
        if (!fd) return [];
        const { filters } = get();
        return fd.transactions.filter(t => {
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
        return get().familiesData[currentFamilyId]?.accounts.find(a => a.id === accountId)?.balance || 0;
      },

      recalcBalances: () => {},

      getExchangeRate: (from, to) => {
        if (from === to) return 1;
        const { exchangeRates } = get();
        if (exchangeRates[`${from}_${to}`]) return exchangeRates[`${from}_${to}`];
        if (exchangeRates[`${to}_${from}`]) return 1 / exchangeRates[`${to}_${from}`];
        return 1;
      },

      convertToBase: (amount, from) => {
        if (from === get().baseCurrency) return amount;
        return amount * get().getExchangeRate(from, get().baseCurrency);
      },

      getBudgetProgress: () => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return [];
        const fd = get().familiesData[currentFamilyId];
        if (!fd) return [];
        
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
        
        return fd.budgets.map(b => {
          const monthTxs = fd.transactions.filter(t => t.type === TransactionType.EXPENSE && t.date >= monthStart && t.date <= monthEnd && (!b.categoryId || t.categoryId === b.categoryId));
          const actual = monthTxs.reduce((sum, t) => sum + get().convertToBase(t.amount, t.currency), 0);
          const percentage = b.amount > 0 ? (actual / b.amount) * 100 : 0;
          const status = percentage >= 100 ? 'danger' : percentage >= 80 ? 'warning' : 'ok';
          return { budgetId: b.id, budgetName: b.name, planned: b.amount, actual, remaining: b.amount - actual, percentage, status, currency: b.currency };
        });
      },

      getUpcomingPayments: (days) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return [];
        const fd = get().familiesData[currentFamilyId];
        if (!fd) return [];
        
        const now = new Date();
        const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        
        return fd.recurringRules
          .filter(r => r.isActive && r.nextRunAt)
          .filter(r => { const d = new Date(r.nextRunAt); return d >= now && d <= future; })
          .map(r => ({ ruleId: r.id, name: r.name, amount: r.amount, currency: r.currency, nextRunAt: r.nextRunAt, freq: r.freq }))
          .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime());
      },

      getForecast: (months) => {
        const { currentFamilyId } = useAuthStore.getState();
        if (!currentFamilyId) return [];
        const fd = get().familiesData[currentFamilyId];
        if (!fd) return [];
        
        const result: any[] = [];
        const now = new Date();
        
        for (let i = 0; i < months; i++) {
          const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
          const monthName = monthDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
          
          const last3Months = fd.transactions.filter(t => {
            const d = new Date(t.date);
            const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);
            return diff <= 3;
          });
          
          const avgExpense = last3Months.filter(t => t.type === TransactionType.EXPENSE).reduce((s, t) => s + t.amount, 0) / 3;
          const avgIncome = last3Months.filter(t => t.type === TransactionType.INCOME).reduce((s, t) => s + t.amount, 0) / 3;
          
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

      refreshRates: () => {},
      resetDemoData: () => {},
    }),
    {
      name: 'budget-storage',
      partialize: (state) => ({
        familiesData: state.familiesData,
        currentUserId: state.currentUserId,
        baseCurrency: state.baseCurrency,
        darkMode: state.darkMode,
        filters: state.filters,
        exchangeRates: state.exchangeRates,
      }),
    }
  )
);

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
    return [formatDate(t.date), t.type === 'INCOME' ? 'Доход' : 'Расход', t.amount, t.currency, cat?.name || '', acc?.name || '', t.paymentMethod === 'CASH' ? 'Наличные' : 'Карта', t.description || ''].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}
