export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CASHLESS = 'CASHLESS',
}

export enum AccountType {
  CASH = 'CASH',
  CARD = 'CARD',
  BANK = 'BANK',
  SAVINGS = 'SAVINGS',
}

export enum Currency {
  RUB = 'RUB',
  USD = 'USD',
  EUR = 'EUR',
  KZT = 'KZT',
  CNY = 'CNY',
}

export enum BudgetPeriod {
  WEEK = 'WEEK',
  MONTH = 'MONTH',
  YEAR = 'YEAR',
}

export enum BudgetType {
  HARD = 'HARD',
  SOFT = 'SOFT',
}

export enum BudgetScope {
  FAMILY = 'FAMILY',
  PERSONAL = 'PERSONAL',
}

export enum RecurFreq {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export enum RecurMode {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
}

export enum FamilyRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export interface Account {
  id: string;
  familyId?: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;
  isShared: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  familyId?: string;
  name: string;
  type: TransactionType;
  parentId: string | null;
  icon: string;
  color: string;
}

export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Receipt {
  id: string;
  transactionId: string;
  receiptNumber: string;
  storeName: string;
  receiptDate: string;
  totalAmount: number;
  filePath: string | null;
  items: ReceiptItem[];
}

export interface Transaction {
  id: string;
  familyId?: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  date: string;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  paymentMethod: PaymentMethod;
  description: string;
  counterparty: string;
  hasReceipt: boolean;
  receipt: Receipt | null;
  tags: string[];
  isPrivate: boolean;
  createdById: string;
  recurringRuleId: string | null;
  createdAt: string;
}

export interface Budget {
  id: string;
  name: string;
  categoryId: string | null;
  amount: number;
  currency: Currency;
  period: BudgetPeriod;
  startDate: string;
  type: BudgetType;
  scope: BudgetScope;
  userId: string | null;
  alertAt80: boolean;
  alertAt100: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface RecurringRule {
  id: string;
  name: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  paymentMethod: PaymentMethod;
  counterparty: string;
  description: string;
  expectsReceipt: boolean;
  freq: RecurFreq;
  interval: number;
  byMonthDay: number | null;
  startDate: string;
  endDate: string | null;
  count: number | null;
  nextRunAt: string;
  mode: RecurMode;
  notifyDaysBefore: number;
  isActive: boolean;
  userId: string;
  skippedDates: string[];
  createdAt: string;
}

export interface ExchangeRate {
  id: string;
  baseCode: string;
  quoteCode: string;
  rate: number;
  date: string;
  source: string;
}

export interface FamilyMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: FamilyRole;
  avatar: string;
  color: string;
  joinedAt: string;
}

export interface Invite {
  id: string;
  email: string;
  token: string;
  role: FamilyRole;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface FilterState {
  dateFrom: string;
  dateTo: string;
  type: TransactionType | null;
  paymentMethod: PaymentMethod | null;
  hasReceipt: boolean | null;
  categoryId: string | null;
  accountId: string | null;
  userId: string | null;
  search: string;
}

export interface SummaryReport {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  cashIncome: number;
  cashExpense: number;
  cashlessIncome: number;
  cashlessExpense: number;
}

export interface CategoryReport {
  categoryId: string;
  categoryName: string;
  total: number;
  count: number;
  percentage: number;
}

export interface MonthlyReport {
  month: string;
  income: number;
  expense: number;
}

export interface BudgetProgress {
  budgetId: string;
  budgetName: string;
  categoryName: string;
  planned: number;
  actual: number;
  remaining: number;
  percentage: number;
  status: 'ok' | 'warning' | 'exceeded';
  currency: Currency;
}

export interface MemberReport {
  userId: string;
  userName: string;
  income: number;
  expense: number;
  count: number;
}

export interface UpcomingPayment {
  ruleId: string;
  ruleName: string;
  date: string;
  amount: number;
  currency: Currency;
  type: TransactionType;
  counterparty: string;
  mode: RecurMode;
}

export interface ForecastPoint {
  month: string;
  balance: number;
}
