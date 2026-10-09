// Детальный отчёт по транзакциям: фильтры (счёт, категория, тип, поиск), сортировка, пагинация, CSV.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import PeriodFilter, { type PeriodValue } from '../PeriodFilter';
import { Card, Skeleton, EmptyState, fmtMoney, fmtDate } from '../ui';

interface TxRow {
  id: string;
  date: string;
  type: string;
  amount: number;
  currency: string;
  account_name: string;
  category_name: string;
  counterparty: string;
  author_name: string;
  comment: string;
}

const PAGE = 50;

export default function TransactionsReport() {
  const [sp] = useSearchParams();
  const [period, setPeriod] = useState<PeriodValue>({
    date_from: sp.get('date_from') ?? '',
    date_to: sp.get('date_to') ?? '',
  });
  const [accountId, setAccountId] = useState(sp.get('account_id') ?? '');
  const [categoryId, setCategoryId] = useState(sp.get('category_id') ?? '');
  const [type, setType] = useState(sp.get('type') ?? '');
  const [search, setSearch] = useState(sp.get('search') ?? '');
  const [searchInput, setSearchInput] = useState(search);
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  const accountsQ = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<{ id: string; name: string }[]>('/accounts') });
  const catsQ = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ id: string; name: string }[]>('/categories') });

  const qs = new URLSearchParams({ date_from: period.date_from, date_to: period.date_to, limit: String(PAGE), skip: String(page * PAGE) });
  if (accountId) qs.set('account_id', accountId);
  if (categoryId) qs.set('category_id', categoryId);
  if (type) qs.set('type', type);
  if (search) qs.set('search', search);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-txs', period, accountId, categoryId, type, search, page],
    queryFn: () => api.get<{ total: number; items: TxRow[] }>('/reports/transactions?' + qs.toString()),
    enabled: !!period.date_from && !!period.date_to,
  });

  const rows = [...(data?.items ?? [])].sort((a, b) => (sortDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const exportCsv = () => {
    const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
    const head = ['Дата', 'Тип', 'Сумма', 'Счёт', 'Категория', 'Контрагент', 'Автор', 'Комментарий'];
    const lines = [head.join(',')];
    for (const r of rows) {
      lines.push([r.date, r.type, r.amount, r.account_name, r.category_name, r.counterparty, r.author_name, r.comment].map(esc).join(','));
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transactions_${period.date_from}_${period.date_to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PeriodFilter onChange={(p) => { setPeriod(p); setPage(0); }} />
      <Card className="mb-4 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setPage(0); }} className="rounded-lg border px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="">Все счета</option>
            {(accountsQ.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(0); }} className="rounded-lg border px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="">Все категории</option>
            {(catsQ.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} className="rounded-lg border px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="">Любой тип</option>
            <option value="income">Приход</option>
            <option value="expense">Расход</option>
            <option value="transfer">Перевод</option>
          </select>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по описанию…"
            className="rounded-lg border px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button onClick={exportCsv} className="flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
            <Download size={14} /> Экспорт CSV
          </button>
        </div>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : isError ? (
        <Card className="p-4 text-sm text-red-600">Не удалось загрузить транзакции.</Card>
      ) : rows.length === 0 ? (
        <EmptyState title="Нет транзакций по выбранным фильтрам" />
      ) : (
        <Card className="overflow-x-auto p-4">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="cursor-pointer py-1" onClick={() => setSortDesc((v) => !v)}>Дата {sortDesc ? '↓' : '↑'}</th>
                <th>Тип</th>
                <th className="cursor-pointer" onClick={() => setSortDesc((v) => !v)}>Сумма</th>
                <th>Счёт</th><th>Категория</th><th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-1.5 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td>{r.type === 'income' ? 'Приход' : r.type === 'expense' ? 'Расход' : 'Перевод'}</td>
                  <td className={r.type === 'income' ? 'text-emerald-600' : 'text-red-600'}>{fmtMoney(Number(r.amount), r.currency)}</td>
                  <td>{r.account_name}</td>
                  <td>{r.category_name || '—'}</td>
                  <td className="max-w-[220px] truncate" title={r.comment}>{r.counterparty || r.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
            <span>Всего: {total}</span>
            <span className="flex items-center gap-2">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded border px-2 py-1 disabled:opacity-40">←</button>
              <span>{page + 1} / {pages}</span>
              <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border px-2 py-1 disabled:opacity-40">→</button>
            </span>
          </div>
        </Card>
      )}
    </>
  );
}
