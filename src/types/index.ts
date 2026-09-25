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
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;
  createdAt: string;
}

export interface Category {
  id: string;
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
  createdAt: string;
}

export interface FilterState {
  dateFrom: string;
  dateTo: string;
  type: TransactionType | null;
  paymentMethod: PaymentMethod | null;
  hasReceipt: boolean | null;
  categoryId: string | null;
  accountId: string | null;
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
