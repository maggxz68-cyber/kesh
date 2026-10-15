import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, Trash2, Play, Pause } from 'lucide-react';
import { api } from '../api/client';
import { Card, Skeleton, fmtMoney, Button, Input } from '../components/ui';
import { PageTitle } from '../components/Layout';
import { useAccounts, useCategories } from './TransactionsPage';

interface RecurringPayment {
  id: string;
  name: string;
  amount: number;
  currency: string;
  period_type: string;
  period_days: number | null;
  next_due_date: string;
  last_paid_date: string | null;
  is_active: boolean;
  account_id: string | null;
  category_id: string | null;
  comment: string | null;
  transaction_type: string;
  days_until_due: number;
}

const PERIOD_LABELS: Record<string, string> = {
  daily: 'Ежедневно',
  weekly: 'Еженедельно',
  monthly: 'Ежемесячно',
  yearly: 'Ежегодно',
  custom: 'Каждые N дней',
};

export default function SubscriptionsPage() {
  const qc = useQueryClient();
  const accounts = useAccounts();
  const categories = useCategories();
  
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    account_id: '',
    category_id: '',
    period_type: 'monthly',
    period_days: '',
    next_due_date: new Date().toISOString().slice(0, 10),
    transaction_type: 'expense',
    comment: '',
  });

  const { data: payments, isLoading } = useQuery({
    queryKey: ['recurring-payments'],
    queryFn: () => api.get<RecurringPayment[]>('/recurring?active_only=false'),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/recurring', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-payments'] });
      setShowForm(false);
      setFormData({
        name: '',
        amount: '',
        account_id: '',
        category_id: '',
        period_type: 'monthly',
        period_days: '',
        next_due_date: new Date().toISOString().slice(0, 10),
        transaction_type: 'expense',
        comment: '',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/recurring/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-payments'] }),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => api.post(`/recurring/${id}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-payments'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/recurring/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-payments'] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      amount: parseFloat(formData.amount),
      period_days: formData.period_type === 'custom' ? parseInt(formData.period_days) : null,
      start_date: formData.next_due_date,
    });
  };

  const getPeriodLabel = (p: RecurringPayment) => {
    if (p.period_type === 'custom' && p.period_days) {
      return `Каждые ${p.period_days} дн.`;
    }
    return PERIOD_LABELS[p.period_type] || p.period_type;
  };

  const getDaysLabel = (days: number) => {
    if (days < 0) return `Просрочено на ${Math.abs(days)} дн.`;
    if (days === 0) return 'Сегодня';
    if (days === 1) return 'Завтра';
    return `Через ${days} дн.`;
  };

  const selectClass = "h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900";

  return (
    <>
      <PageTitle 
        title="Подписки и регулярные платежи"
        actions={
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus size={16} className="mr-2" />
            {showForm ? 'Отмена' : 'Добавить'}
          </Button>
        }
      />

      {showForm && (
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Новый регулярный платёж</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Название *</label>
                <Input
                  value={formData.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Например: Netflix, ЖКХ, Кредит"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Сумма *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Счёт</label>
                <select
                  className={selectClass}
                  value={formData.account_id}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, account_id: e.target.value })}
                >
                  <option value="">Выберите счёт</option>
                  {(accounts.data ?? []).map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Категория</label>
                <select
                  className={selectClass}
                  value={formData.category_id}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, category_id: e.target.value })}
                >
                  <option value="">Выберите категорию</option>
                  {(categories.data ?? []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Периодичность *</label>
                <select
                  className={selectClass}
                  value={formData.period_type}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, period_type: e.target.value })}
                >
                  <option value="daily">Ежедневно</option>
                  <option value="weekly">Еженедельно</option>
                  <option value="monthly">Ежемесячно</option>
                  <option value="yearly">Ежегодно</option>
                  <option value="custom">Каждые N дней</option>
                </select>
              </div>
              {formData.period_type === 'custom' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Количество дней *</label>
                  <Input
                    type="number"
                    value={formData.period_days}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, period_days: e.target.value })}
                    placeholder="30"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Дата первого платежа *</label>
                <Input
                  type="date"
                  value={formData.next_due_date}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, next_due_date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Тип операции</label>
                <select
                  className={selectClass}
                  value={formData.transaction_type}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, transaction_type: e.target.value })}
                >
                  <option value="expense">Расход</option>
                  <option value="income">Доход</option>
                  <option value="transfer">Перевод</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Комментарий</label>
              <Input
                value={formData.comment}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, comment: e.target.value })}
                placeholder="Опционально"
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Создание...' : 'Создать'}
            </Button>
          </form>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : !payments?.length ? (
        <Card className="p-12 text-center">
          <CreditCard size={48} className="mx-auto text-slate-400 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Нет регулярных платежей</h3>
          <p className="text-slate-500 mb-4">Добавьте подписки, ЖКХ, кредиты и другие регулярные платежи</p>
          <Button onClick={() => setShowForm(true)}>
            <Plus size={16} className="mr-2" /> Добавить первый платёж
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {payments.map((p) => (
            <Card key={p.id} className={`p-4 ${!p.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-lg">{p.name}</h4>
                  <p className="text-sm text-slate-500">{getPeriodLabel(p)}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => toggleMutation.mutate({ id: p.id, is_active: !p.is_active })}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                    title={p.is_active ? 'Приостановить' : 'Активировать'}
                  >
                    {p.is_active ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(p.id)}
                    className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                    title="Удалить"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <p className="text-2xl font-bold text-indigo-600">{fmtMoney(p.amount)}</p>
                <p className="text-xs text-slate-500">{p.currency}</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Следующий платёж:</span>
                  <span className={`font-medium ${p.days_until_due < 0 ? 'text-red-600' : p.days_until_due <= 3 ? 'text-amber-600' : ''}`}>
                    {new Date(p.next_due_date).toLocaleDateString('ru-RU')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Статус:</span>
                  <span className={p.days_until_due < 0 ? 'text-red-600 font-medium' : ''}>
                    {getDaysLabel(p.days_until_due)}
                  </span>
                </div>
                {p.last_paid_date && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Последняя оплата:</span>
                    <span>{new Date(p.last_paid_date).toLocaleDateString('ru-RU')}</span>
                  </div>
                )}
              </div>

              {p.comment && (
                <p className="mt-3 text-xs text-slate-500 italic border-t pt-2 dark:border-slate-700">
                  {p.comment}
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runMutation.mutate(p.id)}
                  disabled={runMutation.isPending}
                >
                  <Play size={14} className="mr-1" /> Запустить сейчас
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
