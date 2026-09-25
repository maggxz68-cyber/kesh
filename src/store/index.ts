import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  Account, Category, Transaction, TransactionType, PaymentMethod, Currency,
  FilterState, Budget, BudgetPeriod, BudgetType, BudgetScope,
  RecurringRule, RecurFreq, RecurMode, ExchangeRate, FamilyMember, FamilyRole,
  BudgetProgress, UpcomingPayment, ForecastPoint,
} from '../types';
import {
  defaultAccounts, defaultCategories, generateSeedTransactions,
  generateSeedBudgets, generateSeedRecurring, defaultExchangeRates,
  defaultFamilyMembers, OWNER_ID,
} from '../data/seed';

interface AppState {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  exchangeRates: ExchangeRate[];
  familyMembers: FamilyMember[];
  currentUserId: string;
  baseCurrency: Currency;
  filters: FilterState;
  darkMode: boolean;
  initialized: boolean;

  init: () => void;
  setDarkMode: (v: boolean) => void;
  setCurrentUser: (id: string) => void;
  setBaseCurrency: (c: Currency) => void;
  setFilters: (f: Partial<FilterState>) => void;
  resetFilters: () => void;

  addAccount: (account: Omit<Account, 'id' | 'createdAt'>) => void;
  updateAccount: (id: string, data: Partial<Account>) => void;
  deleteAccount: (id: string) => void;

  addCategory: (category: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, data: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  updateTransaction: (id: string, data: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;

  addBudget: (budget: Omit<Budget, 'id' | 'createdAt'>) => void;
  updateBudget: (id: string, data: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;

  addRecurringRule: (rule: Omit<RecurringRule, 'id' | 'createdAt'>) => void;
  updateRecurringRule: (id: string, data: Partial<RecurringRule>) => void;
  deleteRecurringRule: (id: string) => void;
  skipRecurringRun: (id: string, date: string) => void;
  generateRecurringTransaction: (ruleId: string) => void;

  updateExchangeRate: (baseCode: string, quoteCode: string, rate: number) => void;
  refreshRates: () => void;

  addFamilyMember: (member: Omit<FamilyMember, 'id' | 'joinedAt'>) => void;
  updateMemberRole: (userId: string, role: FamilyRole) => void;
  removeFamilyMember: (userId: string) => void;

  getFilteredTransactions: () => Transaction[];
  getAccountBalance: (accountId: string) => number;
  recalcBalances: () => void;
  getExchangeRate: (from: Currency, to: Currency) => number;
  convertToBase: (amount: number, from: Currency) => number;
  getBudgetProgress: () => BudgetProgress[];
  getUpcomingPayments: (days: number) => UpcomingPayment[];
  getForecast: (months: number) => ForecastPoint[];
}

const defaultFilters: FilterState = {
  dateFrom: '', dateTo: '', type: null, paymentMethod: null,
  hasReceipt: null, categoryId: null, accountId: null, userId: null, search: '',
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      accounts: [],
      categories: [],
      transactions: [],
      budgets: [],
      recurringRules: [],
      exchangeRates: [],
      familyMembers: [],
      currentUserId: OWNER_ID,
      baseCurrency: Currency.RUB,
      filters: { ...defaultFilters },
      darkMode: false,
      initialized: false,

      init: () => {
        const state = get();
        if (state.initialized) return;
        const accounts = defaultAccounts.map(a => ({ ...a, id: uuidv4() }));
        const categories = defaultCategories.map(c => ({ ...c, id: uuidv4() }));
        const transactions = generateSeedTransactions(accounts, categories);
        const budgets = generateSeedBudgets(categories);
        const recurringRules = generateSeedRecurring(accounts, categories);
        const exchangeRates = defaultExchangeRates.map(r => ({ ...r, id: uuidv4() }));
        const familyMembers = defaultFamilyMembers.map(m => ({ ...m, id: uuidv4() }));
        set({ accounts, categories, transactions, budgets, recurringRules, exchangeRates, familyMembers, initialized: true });
        get().recalcBalances();
      },

      setDarkMode: (v) => set({ darkMode: v }),
      setCurrentUser: (id) => set({ currentUserId: id }),
      setBaseCurrency: (c) => set({ baseCurrency: c }),
      setFilters: (f) => set({ filters: { ...get().filters, ...f } }),
      resetFilters: () => set({ filters: { ...defaultFilters } }),

      addAccount: (account) => {
        const newAccount: Account = { ...account, id: uuidv4(), createdAt: new Date().toISOString() };
        set({ accounts: [...get().accounts, newAccount] });
      },
      updateAccount: (id, data) => {
        set({ accounts: get().accounts.map(a => a.id === id ? { ...a, ...data } : a) });
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
        set({ categories: get().categories.map(c => c.id === id ? { ...c, ...data } : c) });
      },
      deleteCategory: (id) => {
        set({
          categories: get().categories.filter(c => c.id !== id),
          transactions: get().transactions.map(t => t.categoryId === id ? { ...t, categoryId: null } : t),
        });
      },

      addTransaction: (tx) => {
        const newTx: Transaction = { ...tx, id: uuidv4(), createdAt: new Date().toISOString() };
        if (newTx.receipt) newTx.receipt.transactionId = newTx.id;
        set({ transactions: [...get().transactions, newTx] });
        get().recalcBalances();
      },
      updateTransaction: (id, data) => {
        const transactions = get().transactions.map(t => {
          if (t.id === id) {
            const updated = { ...t, ...data };
            if (updated.receipt) updated.receipt.transactionId = updated.id;
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

      addBudget: (budget) => {
        const newBudget: Budget = { ...budget, id: uuidv4(), createdAt: new Date().toISOString() };
        set({ budgets: [...get().budgets, newBudget] });
      },
      updateBudget: (id, data) => {
        set({ budgets: get().budgets.map(b => b.id === id ? { ...b, ...data } : b) });
      },
      deleteBudget: (id) => {
        set({ budgets: get().budgets.filter(b => b.id !== id) });
      },

      addRecurringRule: (rule) => {
        const newRule: RecurringRule = { ...rule, id: uuidv4(), createdAt: new Date().toISOString() };
        set({ recurringRules: [...get().recurringRules, newRule] });
      },
      updateRecurringRule: (id, data) => {
        set({ recurringRules: get().recurringRules.map(r => r.id === id ? { ...r, ...data } : r) });
      },
      deleteRecurringRule: (id) => {
        set({ recurringRules: get().recurringRules.filter(r => r.id !== id) });
      },
      skipRecurringRun: (id, date) => {
        set({
          recurringRules: get().recurringRules.map(r =>
            r.id === id ? { ...r, skippedDates: [...r.skippedDates, date] } : r
          ),
        });
      },
      generateRecurringTransaction: (ruleId) => {
        const rule = get().recurringRules.find(r => r.id === ruleId);
        if (!rule) return;
        const tx: Omit<Transaction, 'id' | 'createdAt'> = {
          type: rule.type, amount: rule.amount, currency: rule.currency,
          date: rule.nextRunAt, accountId: rule.accountId, toAccountId: rule.toAccountId,
          categoryId: rule.categoryId, paymentMethod: rule.paymentMethod,
          description: rule.description || rule.name, counterparty: rule.counterparty,
          hasReceipt: rule.expectsReceipt, receipt: null, tags: ['recurring'],
          isPrivate: false, createdById: rule.userId, recurringRuleId: rule.id,
        };
        get().addTransaction(tx);
        // Advance nextRunAt
        const nextDate = new Date(rule.nextRunAt);
        switch (rule.freq) {
          case RecurFreq.DAILY: nextDate.setDate(nextDate.getDate() + rule.interval); break;
          case RecurFreq.WEEKLY: nextDate.setDate(nextDate.getDate() + 7 * rule.interval); break;
          case RecurFreq.MONTHLY: nextDate.setMonth(nextDate.getMonth() + rule.interval); break;
          case RecurFreq.YEARLY: nextDate.setFullYear(nextDate.getFullYear() + rule.interval); break;
        }
        set({
          recurringRules: get().recurringRules.map(r =>
            r.id === ruleId ? { ...r, nextRunAt: nextDate.toISOString() } : r
          ),
        });
      },

      updateExchangeRate: (baseCode, quoteCode, rate) => {
        const existing = get().exchangeRates.find(r => r.baseCode === baseCode && r.quoteCode === quoteCode);
        if (existing) {
          set({
            exchangeRates: get().exchangeRates.map(r =>
              r.baseCode === baseCode && r.quoteCode === quoteCode ? { ...r, rate, date: new Date().toISOString() } : r
            ),
          });
        } else {
          set({
            exchangeRates: [...get().exchangeRates, {
              id: uuidv4(), baseCode, quoteCode, rate, date: new Date().toISOString(), source: 'MANUAL',
            }],
          });
        }
      },
      refreshRates: () => {
        // Simulate rate refresh with small random changes
        const rates = get().exchangeRates.map(r => ({
          ...r,
          rate: Math.round((r.rate * (1 + (Math.random() - 0.5) * 0.02)) * 100) / 100,
          date: new Date().toISOString(),
          source: 'CBR',
        }));
        set({ exchangeRates: rates });
      },

      addFamilyMember: (member) => {
        const newMember: FamilyMember = { ...member, id: uuidv4(), joinedAt: new Date().toISOString() };
        set({ familyMembers: [...get().familyMembers, newMember] });
      },
      updateMemberRole: (userId, role) => {
        set({ familyMembers: get().familyMembers.map(m => m.userId === userId ? { ...m, role } : m) });
      },
      removeFamilyMember: (userId) => {
        set({ familyMembers: get().familyMembers.filter(m => m.userId !== userId) });
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
          if (filters.userId && t.createdById !== filters.userId) return false;
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
        return get().accounts.find(a => a.id === accountId)?.balance || 0;
      },

      recalcBalances: () => {
        const { accounts, transactions } = get();
        const newAccounts = accounts.map(account => {
          let balance = 0;
          transactions.forEach(t => {
            if (t.type === TransactionType.INCOME && t.accountId === account.id) balance += t.amount;
            else if (t.type === TransactionType.EXPENSE && t.accountId === account.id) balance -= t.amount;
            else if (t.type === TransactionType.TRANSFER) {
              if (t.accountId === account.id) balance -= t.amount;
              if (t.toAccountId === account.id) balance += t.amount;
            }
          });
          return { ...account, balance };
        });
        set({ accounts: newAccounts });
      },

      getExchangeRate: (from, to) => {
        if (from === to) return 1;
        const { exchangeRates } = get();
        const direct = exchangeRates.find(r => r.baseCode === from && r.quoteCode === to);
        if (direct) return direct.rate;
        const reverse = exchangeRates.find(r => r.baseCode === to && r.quoteCode === from);
        if (reverse) return 1 / reverse.rate;
        // Try via RUB
        if (from !== Currency.RUB && to !== Currency.RUB) {
          const toRub = get().getExchangeRate(from, Currency.RUB);
          const fromRub = get().getExchangeRate(Currency.RUB, to);
          return toRub * fromRub;
        }
        return 1;
      },

      convertToBase: (amount, from) => {
        const { baseCurrency } = get();
        if (from === baseCurrency) return amount;
        return amount * get().getExchangeRate(from, baseCurrency);
      },

      getBudgetProgress: () => {
        const { budgets, transactions, categories } = get();
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        return budgets.filter(b => b.isActive).map(budget => {
          const cat = categories.find(c => c.id === budget.categoryId);
          const periodStart = new Date(budget.startDate);
          let periodEnd: Date;
          switch (budget.period) {
            case BudgetPeriod.WEEK:
              periodEnd = new Date(periodStart);
              periodEnd.setDate(periodEnd.getDate() + 7);
              break;
            case BudgetPeriod.MONTH:
              periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23, 59, 59);
              break;
            case BudgetPeriod.YEAR:
              periodEnd = new Date(periodStart.getFullYear() + 1, 0, 0, 23, 59, 59);
              break;
            default:
              periodEnd = new Date();
          }

          // For monthly budgets that started in past, use current month
          let effectiveStart = periodStart;
          let effectiveEnd = periodEnd;
          if (budget.period === BudgetPeriod.MONTH && periodStart < monthStart) {
            effectiveStart = monthStart;
            effectiveEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
          }

          const actual = transactions
            .filter(t =>
              t.type === TransactionType.EXPENSE &&
              t.categoryId === budget.categoryId &&
              new Date(t.date) >= effectiveStart &&
              new Date(t.date) <= effectiveEnd
            )
            .reduce((sum, t) => sum + t.amount, 0);

          const remaining = budget.amount - actual;
          const percentage = budget.amount > 0 ? (actual / budget.amount) * 100 : 0;
          let status: 'ok' | 'warning' | 'exceeded' = 'ok';
          if (percentage >= 100) status = 'exceeded';
          else if (percentage >= 80) status = 'warning';

          return {
            budgetId: budget.id,
            budgetName: budget.name,
            categoryName: cat?.name || 'Без категории',
            planned: budget.amount,
            actual,
            remaining,
            percentage: Math.min(percentage, 150),
            status,
            currency: budget.currency,
          };
        });
      },

      getUpcomingPayments: (days) => {
        const { recurringRules } = get();
        const now = new Date();
        const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const upcoming: UpcomingPayment[] = [];

        recurringRules.filter(r => r.isActive).forEach(rule => {
          let date = new Date(rule.nextRunAt);
          // Generate upcoming dates within the range
          for (let i = 0; i < 12; i++) {
            if (date > future) break;
            if (date >= now && !rule.skippedDates.includes(date.toISOString().split('T')[0])) {
              upcoming.push({
                ruleId: rule.id,
                ruleName: rule.name,
                date: date.toISOString(),
                amount: rule.amount,
                currency: rule.currency,
                type: rule.type,
                counterparty: rule.counterparty,
                mode: rule.mode,
              });
            }
            // Advance date
            const nextDate = new Date(date);
            switch (rule.freq) {
              case RecurFreq.DAILY: nextDate.setDate(nextDate.getDate() + rule.interval); break;
              case RecurFreq.WEEKLY: nextDate.setDate(nextDate.getDate() + 7 * rule.interval); break;
              case RecurFreq.MONTHLY: nextDate.setMonth(nextDate.getMonth() + rule.interval); break;
              case RecurFreq.YEARLY: nextDate.setFullYear(nextDate.getFullYear() + rule.interval); break;
            }
            date = nextDate;
          }
        });

        return upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      },

      getForecast: (months) => {
        const { accounts, transactions, recurringRules } = get();
        const currentBalance = accounts.reduce((s, a) => {
          return s + get().convertToBase(a.balance, a.currency);
        }, 0);

        const now = new Date();
        const points: ForecastPoint[] = [];
        let balance = currentBalance;
        const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

        // Calculate average monthly income/expense from last 3 months
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const recentTx = transactions.filter(t => new Date(t.date) >= threeMonthsAgo);
        const avgMonthlyIncome = recentTx
          .filter(t => t.type === TransactionType.INCOME)
          .reduce((s, t) => s + get().convertToBase(t.amount, t.currency), 0) / 3;
        const avgMonthlyExpense = recentTx
          .filter(t => t.type === TransactionType.EXPENSE)
          .reduce((s, t) => s + get().convertToBase(t.amount, t.currency), 0) / 3;

        for (let i = 1; i <= months; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
          balance += avgMonthlyIncome - avgMonthlyExpense;
          points.push({
            month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
            balance: Math.round(balance),
          });
        }

        return points;
      },
    }),
    { name: 'finance-tracker-storage' }
  )
);

export const formatCurrency = (amount: number, currency: Currency = Currency.RUB): string => {
  const symbols: Record<string, string> = { RUB: '₽', USD: '$', EUR: '€', KZT: '₸', CNY: '¥' };
  const symbol = symbols[currency] || currency;
  return `${amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${symbol}`;
};

export const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const exportToCSV = (transactions: Transaction[], accounts: Account[], categories: Category[]): string => {
  const headers = ['Дата', 'Тип', 'Сумма', 'Валюта', 'Счёт', 'Категория', 'Способ оплаты', 'Описание', 'Контрагент', 'Чек', 'Автор'];
  const rows = transactions.map(t => {
    const account = accounts.find(a => a.id === t.accountId);
    const category = categories.find(c => c.id === t.categoryId);
    return [
      formatDate(t.date), t.type === TransactionType.INCOME ? 'Доход' : t.type === TransactionType.EXPENSE ? 'Расход' : 'Перевод',
      t.amount.toString(), t.currency, account?.name || '', category?.name || '',
      t.paymentMethod === PaymentMethod.CASH ? 'Наличные' : 'Безналичные',
      t.description, t.counterparty, t.hasReceipt ? 'Да' : 'Нет', t.createdById,
    ].map(v => `"${v}"`).join(',');
  });
  return [headers.join(','), ...rows].join('\n');
};

export const exportToJSON = (data: { accounts: Account[]; categories: Category[]; transactions: Transaction[] }): string => {
  return JSON.stringify(data, null, 2);
};
