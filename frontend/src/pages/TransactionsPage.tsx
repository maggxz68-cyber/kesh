// Транзакции: фильтры, поиск, пагинация, массовые операции, быстрый ввод (mobile-first).
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, Trash2, ReceiptText, ArrowLeftRight, Banknote, CreditCard } from 'lucide-react';
import { api } from '../api/client';
import { PageTitle } from '../components/Layout';
import { Button, Card, Input, Modal, Skeleton, Badge, EmptyState, fmtMoney, fmtDate } from '../components/ui';

export interface Tx {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: string;
  date: string;
  comment: string | null;
  account_id: string;
  account_name?: string | null;
  account_type?: string | null;
  category_id: string | null;
  category_name?: string | null;
  category_color?: string | null;
  counterparty_name?: string | null;
  author_name?: string | null;
  tags?: { id: string; name: string; color?: string | null }[];
  has_receipt?: boolean;
}
interface TxPage { items: Tx[]; total: number; page: number; size: number; pages: number }
export interface Account { id: string; name: string; type: string; balance: number; currency: string; archived?: boolean }
export interface Category { id: string; name: string; kind: string; color: string | null; icon: string | null; parent_id: string | null; is_system?: boolean }

const txSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.coerce.number().positive('Сумма > 0'),
  account_id: z.string().min(1, 'Выберите счёт'),
  category_id: z.string().optional(),
  comment: z.string().optional(),
});
type TxForm = z.infer<typeof txSchema>;

export function useAccounts() {
  return useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Account[]>('/accounts') });
}
export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories') });
}

export default function TransactionsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [edit, setEdit] = useState<Tx | null>(null);

  const accounts = useAccounts();
  const categories = useCategories();

  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), size: '25' });
    if (search) p.set('search', search);
    if (typeFilter) p.set('type', typeFilter);
    if (accountFilter) p.set('account_id', accountFilter);
    if (categoryFilter) p.set('category_id', categoryFilter);
    return p.toString();
  }, [page, search, typeFilter, accountFilter, categoryFilter]);

  const list = useQuery({
    queryKey: ['transactions', qs],
    queryFn: () => api.get<TxPage>(`/transactions?${qs}`),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const bulkDelete = async () => {
    if (!confirm(`Удалить ${selected.size} транзакций?`)) return;
    await api.post('/transactions/bulk-delete', { ids: [...selected] });
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['accounts'] });
  };

  const form = useForm<TxForm>({
    resolver: zodResolver(txSchema),
    defaultValues: { type: 'expense', amount: undefined, account_id: '', comment: '' },
  });
  useEffect(() => {
    if (edit)
      form.reset({
        type: edit.type === 'transfer' ? 'expense' : edit.type,
        amount: edit.amount,
        account_id: edit.account_id,
        category_id: edit.category_id ?? undefined,
        comment: edit.comment ?? '',
      });
    else form.reset({ type: 'expense', amount: undefined, account_id: '', comment: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, modalOpen]);

  const save = useMutation({
    mutationFn: (v: TxForm) =>
      edit
        ? api.patch(`/transactions/${edit.id}`, { ...v, category_id: v.category_id || null })
        : api.post('/transactions', { ...v, category_id: v.category_id || null, date: new Date().toISOString() }),
    onSuccess: () => {
      setModalOpen(false);
      setEdit(null);
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const cats = (categories.data ?? []).filter((c) => c.kind === form.watch('type'));
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageTitle
        title="Транзакции"
        actions={
          <>
            {selected.size > 0 && (
              <Button variant="destructive" size="sm" onClick={bulkDelete}>
                <Trash2 size={14} /> Удалить ({selected.size})
              </Button>
            )}
            <Button onClick={() => { setEdit(null); setModalOpen(true); }}>
              <Plus size={16} /> Добавить
            </Button>
          </>
        }
      />

      {/* Фильтры */}
      <Card className="mb-3 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-8"
              placeholder="Поиск: комментарий, контрагент…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="">Все типы</option>
            <option value="income">Доход</option>
            <option value="expense">Расход</option>
            <option value="transfer">Перевод</option>
          </select>
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={accountFilter} onChange={(e) => { setAccountFilter(e.target.value); setPage(1); }}>
            <option value="">Все счета</option>
            {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
            <option value="">Все категории</option>
            {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </Card>

      {/* Список */}
      <Card>
        {list.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : list.data?.items.length === 0 ? (
          <EmptyState title="Нет транзакций" hint="Добавьте первую — кнопка справа сверху" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.data?.items.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)} className="accent-indigo-600" />
                <span className={`shrink-0 rounded-full p-1.5 ${t.type === 'income' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40' : t.type === 'transfer' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40' : 'bg-red-100 text-red-600 dark:bg-red-900/40'}`}>
                  {t.type === 'transfer' ? <ArrowLeftRight size={14} /> : t.account_type === 'cash' ? <Banknote size={14} /> : <CreditCard size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-sm font-medium">
                    {t.category_name ?? (t.type === 'transfer' ? 'Перевод' : 'Без категории')}
                    {t.has_receipt && <ReceiptText size={13} className="text-indigo-500" />}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {fmtDate(t.date)} · {t.account_name}
                    {t.counterparty_name ? ` · ${t.counterparty_name}` : ''}
                    {t.comment ? ` · ${t.comment}` : ''}
                  </div>
                  {!!t.tags?.length && (
                    <div className="mt-0.5 flex gap-1">{t.tags.map((tg) => <Badge key={tg.id} color={tg.color ?? undefined}>{tg.name}</Badge>)}</div>
                  )}
                </div>
                <div className={`shrink-0 text-right text-sm font-semibold ${t.type === 'income' ? 'text-emerald-600' : t.type === 'transfer' ? 'text-blue-600' : 'text-red-600'}`}>
                  {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '⇄'} {fmtMoney(t.amount, t.currency)}
                </div>
                <div className="hidden shrink-0 text-xs text-slate-400 sm:block">{t.author_name}</div>
                <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800" onClick={() => del.mutate(t.id)}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* Пагинация */}
        {!!list.data && list.data.pages > 1 && (
          <div className="flex items-center justify-between border-t p-3 text-sm dark:border-slate-800">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</Button>
            <span className="text-slate-500">стр. {list.data.page} из {list.data.pages} · всего {list.data.total}</span>
            <Button size="sm" variant="outline" disabled={page >= list.data.pages} onClick={() => setPage((p) => p + 1)}>→</Button>
          </div>
        )}
      </Card>

      {/* Модалка добавления/редактирования */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEdit(null); }} title={edit ? 'Редактировать' : 'Новая транзакция'}>
        <form onSubmit={() => void save.mutateAsync(form.getValues())} className="space-y-3">
          {/* Быстрый выбор типа — крупные кнопки (mobile ТЗ 7.3) */}
          <div className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as const).map((tp) => (
              <button
                type="button"
                key={tp}
                onClick={() => { form.setValue('type', tp); form.setValue('category_id', undefined); }}
                className={`h-12 rounded-xl font-semibold ${
                  form.watch('type') === tp
                    ? tp === 'expense' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                    : 'border border-slate-300 dark:border-slate-700'
                }`}
              >
                {tp === 'expense' ? '− Расход' : '+ Доход'}
              </button>
            ))}
          </div>
          <Input
            type="number" inputMode="decimal" step="0.01" placeholder="0.00"
            className="h-14 text-center text-2xl font-bold tabular-nums"
            {...form.register('amount')}
          />
          <div className="grid grid-cols-2 gap-2">
            <select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900" {...form.register('account_id')}>
              <option value="">Счёт…</option>
              {(accounts.data ?? []).filter((a) => !a.archived).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({fmtMoney(a.balance)})</option>
              ))}
            </select>
            <select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900" {...form.register('category_id')}>
              <option value="">Категория…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Input placeholder="Комментарий" {...form.register('comment')} />
          {save.error && <p className="text-sm text-red-600">{String((save.error as Error).message)}</p>}
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </form>
      </Modal>
    </>
  );
}
