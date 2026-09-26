import React, { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { useAuthStore } from '../store/auth';
import { TransactionType, PaymentMethod, Currency } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, Save, ArrowLeft, Camera, CheckCircle } from 'lucide-react';
import ReceiptScanner from '../components/ReceiptScanner';
import { parseReceiptQR, formatReceiptSum, formatReceiptDate, getOperationTypeLabel } from '../utils/receiptParser';

const transactionSchema = z.object({
  type: z.nativeEnum(TransactionType),
  amount: z.number().positive('Сумма должна быть больше 0'),
  currency: z.nativeEnum(Currency),
  date: z.string().min(1, 'Укажите дату'),
  accountId: z.string().min(1, 'Выберите счёт'),
  toAccountId: z.string().nullable(),
  categoryId: z.string().nullable(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  description: z.string(),
  counterparty: z.string(),
  hasReceipt: z.boolean(),
  receiptNumber: z.string(),
  storeName: z.string(),
  receiptDate: z.string(),
  receiptTotal: z.number().optional(),
  items: z.array(z.object({
    name: z.string().min(1, 'Название обязательно'),
    quantity: z.number().positive(),
    price: z.number().positive(),
  })),
});

type FormData = z.infer<typeof transactionSchema>;

export default function AddTransaction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accounts, categories, transactions, addTransaction, updateTransaction } = useStore();
  const { currentUser } = useAuthStore();
  const isEdit = !!id;
  const existingTx = isEdit ? transactions.find(t => t.id === id) : null;
  const [showScanner, setShowScanner] = useState(false);
  const [scannedReceipt, setScannedReceipt] = useState<{
    dateTime: Date;
    totalSum: number;
    fiscalDriveNumber: string;
    fiscalDocumentNumber: string;
    fiscalSign: string;
    operationType: number;
    raw: string;
  } | null>(null);

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: TransactionType.EXPENSE,
      amount: 0,
      currency: Currency.RUB,
      date: new Date().toISOString().split('T')[0],
      accountId: '',
      toAccountId: null,
      categoryId: null,
      paymentMethod: PaymentMethod.CASHLESS,
      description: '',
      counterparty: '',
      hasReceipt: false,
      receiptNumber: '',
      storeName: '',
      receiptDate: '',
      receiptTotal: 0,
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const type = watch('type');
  const hasReceipt = watch('hasReceipt');

  useEffect(() => {
    if (existingTx) {
      setValue('type', existingTx.type);
      setValue('amount', existingTx.amount);
      setValue('currency', existingTx.currency);
      setValue('date', existingTx.date.split('T')[0]);
      setValue('accountId', existingTx.accountId);
      setValue('toAccountId', existingTx.toAccountId);
      setValue('categoryId', existingTx.categoryId);
      setValue('paymentMethod', existingTx.paymentMethod);
      setValue('description', existingTx.description);
      setValue('counterparty', existingTx.counterparty);
      setValue('hasReceipt', existingTx.hasReceipt);
      if (existingTx.receipt) {
        setValue('receiptNumber', existingTx.receipt.receiptNumber);
        setValue('storeName', existingTx.receipt.storeName);
        setValue('receiptDate', existingTx.receipt.receiptDate.split('T')[0]);
        setValue('receiptTotal', existingTx.receipt.totalAmount);
        setValue('items', existingTx.receipt.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })));
      }
    }
  }, [existingTx, setValue]);

  const filteredCategories = categories.filter(c => {
    if (type === TransactionType.INCOME) return c.type === TransactionType.INCOME;
    if (type === TransactionType.EXPENSE) return c.type === TransactionType.EXPENSE;
    return false;
  });

  const onSubmit = (data: FormData) => {
    const txData = {
      type: data.type,
      amount: data.amount,
      currency: data.currency,
      date: new Date(data.date).toISOString(),
      accountId: data.accountId,
      toAccountId: data.type === TransactionType.TRANSFER ? data.toAccountId : null,
      categoryId: data.type !== TransactionType.TRANSFER ? data.categoryId : null,
      paymentMethod: data.paymentMethod,
      description: data.description,
      counterparty: data.counterparty,
      hasReceipt: data.hasReceipt,
      receipt: data.hasReceipt ? {
        id: existingTx?.receipt?.id || uuidv4(),
        transactionId: existingTx?.id || '',
        receiptNumber: data.receiptNumber,
        storeName: data.storeName,
        receiptDate: new Date(data.receiptDate || data.date).toISOString(),
        totalAmount: data.receiptTotal || data.amount,
        filePath: existingTx?.receipt?.filePath || null,
        items: data.items.map(item => ({
          id: uuidv4(),
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.quantity * item.price,
        })),
      } : null,
      tags: [],
      isPrivate: false,
      createdById: currentUser?.id || '',
      recurringRuleId: null,
    };

    if (isEdit && existingTx) {
      updateTransaction(existingTx.id, txData);
    } else {
      addTransaction(txData);
    }
    navigate('/transactions');
  };

  const addItem = () => {
    append({ name: '', quantity: 1, price: 0 });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 lg:pb-0">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-2xl font-bold">{isEdit ? 'Редактировать операцию' : 'Новая операция'}</h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Type selector */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Тип операции</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: TransactionType.INCOME, label: 'Доход', icon: '📈' },
              { value: TransactionType.EXPENSE, label: 'Расход', icon: '📉' },
              { value: TransactionType.TRANSFER, label: 'Перевод', icon: '↔️' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setValue('type', opt.value)}
                className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                  type === opt.value
                    ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className="text-lg">{opt.icon}</span>
                <p className="mt-1">{opt.label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Main fields */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Сумма *</label>
              <input
                type="number"
                step="0.01"
                {...register('amount', { valueAsNumber: true })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-lg font-semibold focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
              {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Валюта</label>
              <select
                {...register('currency')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                <option value={Currency.RUB}>RUB ₽</option>
                <option value={Currency.USD}>USD $</option>
                <option value={Currency.EUR}>EUR €</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Дата *</label>
              <input
                type="date"
                {...register('date')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Способ оплаты *</label>
              <select
                {...register('paymentMethod')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                <option value={PaymentMethod.CASH}>💵 Наличные</option>
                <option value={PaymentMethod.CASHLESS}>💳 Безналичные</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
              {type === TransactionType.TRANSFER ? 'Счёт источника *' : 'Счёт *'}
            </label>
            <select
              {...register('accountId')}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
            >
              <option value="">Выберите счёт</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.balance.toLocaleString()} {a.currency})</option>
              ))}
            </select>
            {errors.accountId && <p className="text-xs text-red-500 mt-1">{errors.accountId.message}</p>}
          </div>

          {type === TransactionType.TRANSFER && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Счёт назначения *</label>
              <select
                {...register('toAccountId')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                <option value="">Выберите счёт</option>
                {accounts.filter(a => a.id !== watch('accountId')).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {type !== TransactionType.TRANSFER && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Категория</label>
              <select
                {...register('categoryId')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                <option value="">Без категории</option>
                {filteredCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Описание</label>
              <input
                type="text"
                {...register('description')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                placeholder="Комментарий к операции"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Контрагент</label>
              <input
                type="text"
                {...register('counterparty')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                placeholder="Магазин, компания..."
              />
            </div>
          </div>
        </div>

        {/* Receipt section (only for expenses) */}
        {type === TransactionType.EXPENSE && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Чек</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasReceipt}
                  onChange={e => setValue('hasReceipt', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Есть чек</span>
              </label>
              {'mediaDevices' in navigator && (
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg flex items-center gap-1 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300"
                >
                  <Camera size={14} /> Сканировать
                </button>
              )}
            </div>

            {hasReceipt && (
              <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Номер чека</label>
                    <input
                      type="text"
                      {...register('receiptNumber')}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      placeholder="№ чека"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Магазин</label>
                    <input
                      type="text"
                      {...register('storeName')}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      placeholder="Название магазина"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Дата чека</label>
                    <input
                      type="date"
                      {...register('receiptDate')}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Сумма по чеку</label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('receiptTotal', { valueAsNumber: true })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Receipt items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Позиции чека</label>
                    <button
                      type="button"
                      onClick={addItem}
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Plus size={14} /> Добавить
                    </button>
                  </div>
                  <div className="space-y-2">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex gap-2 items-start">
                        <input
                          type="text"
                          {...register(`items.${index}.name`)}
                          placeholder="Название"
                          className="flex-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                        />
                        <input
                          type="number"
                          step="0.01"
                          {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                          placeholder="Кол-во"
                          className="w-20 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                        />
                        <input
                          type="number"
                          step="0.01"
                          {...register(`items.${index}.price`, { valueAsNumber: true })}
                          placeholder="Цена"
                          className="w-24 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {fields.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-2">Нет позиций. Нажмите "Добавить"</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Save size={18} />
          {isEdit ? 'Сохранить изменения' : 'Добавить операцию'}
        </button>
      </form>

      {/* Receipt Scanner */}
      {showScanner && (
        <ReceiptScanner
          onScan={(qrData) => {
            const parsed = parseReceiptQR(qrData);
            if (parsed) {
              setScannedReceipt(parsed);
              // Автоматически заполняем поля формы
              setValue('amount', parsed.totalSum);
              setValue('date', parsed.dateTime.toISOString().split('T')[0]);
              setValue('hasReceipt', true);
              setValue('receiptNumber', parsed.fiscalDocumentNumber);
              setValue('receiptTotal', parsed.totalSum);
              setValue('receiptDate', parsed.dateTime.toISOString().split('T')[0]);
              setValue('storeName', `Чек №${parsed.fiscalDocumentNumber}`);
            }
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Scanned receipt info */}
      {scannedReceipt && (
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={20} className="text-green-600" />
              <p className="font-medium text-green-800 dark:text-green-200">Чек распознан</p>
            </div>
            <button
              onClick={() => setScannedReceipt(null)}
              className="text-xs text-red-500 hover:underline"
            >
              Удалить
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Дата и время:</span>
              <span className="font-medium">{formatReceiptDate(scannedReceipt.dateTime)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Сумма:</span>
              <span className="font-bold text-lg">{formatReceiptSum(scannedReceipt.totalSum)} ₽</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Операция:</span>
              <span className="font-medium">{getOperationTypeLabel(scannedReceipt.operationType)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">ФН:</span>
              <span className="font-mono text-xs">{scannedReceipt.fiscalDriveNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">ФД:</span>
              <span className="font-mono text-xs">{scannedReceipt.fiscalDocumentNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">ФП:</span>
              <span className="font-mono text-xs">{scannedReceipt.fiscalSign}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
