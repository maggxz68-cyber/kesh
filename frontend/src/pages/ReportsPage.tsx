// Отчёты: cashflow, по категориям/месяцам, по участникам семьи, экспорт CSV/XLSX/PDF.
import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Download, FileText, Sheet, Table2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, getCsrf } from '../api/client';
import { Card, Skeleton, fmtMoney, EmptyState } from '../components/ui';
import { PageTitle } from '../components/Layout';

interface CashflowPoint { date: string; income: number; expense: number }
interface ByUser { user_name: string; name?: string; income: number; expense: number }

async function download(path: string, filename: string) {
  const res = await fetch(api.url(path), {
    credentials: 'include',
    headers: { 'X-CSRF-Token': getCsrf() ?? '' },
  });
  if (!res.ok) throw new Error('Не удалось скачать');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ReportsPage() {
  const [days, setDays] = useState(90);
  const q = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400_000);
    return `date_from=${from.toISOString().slice(0, 10)}&date_to=${to.toISOString().slice(0, 10)}`;
  }, [days]);

  const cashflow = useQuery({
    queryKey: ['cashflow', q],
    queryFn: () => api.get<{ items: CashflowPoint[] }>('/reports/cashflow?' + q),
  });
  const byUser = useQuery({
    queryKey: ['by-user', q],
    // FIX: бэкенд возвращает {"items":[...]} — раньше фронт мог получить массив напрямую
    // (или axios-обёртку), из-за чего items.length падал и показывалось «Нет данных».
    queryFn: async () => {
      const res: any = await api.get<any>('/reports/by-user?' + q);
      const arr: ByUser[] = Array.isArray(res) ? res : (res?.items ?? []);
      return { items: arr };
    },
  });

  const cfData = (cashflow.data?.items ?? []).map((p) => ({
    ...p,
    label: new Date(p.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }),
  }));

  return (
    <>
      <PageTitle
        title="Отчёты"
        actions={
          <>
            <button className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void download(`/export/csv?${q}`, 'transactions.csv')}>
              <Table2 size={14} /> CSV
            </button>
            <button className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void download(`/export/xlsx?${q}`, 'transactions.xlsx')}>
              <Sheet size={14} /> XLSX
            </button>
            <button className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void download(`/export/pdf?${q}`, 'report.pdf')}>
              <FileText size={14} /> PDF
            </button>
          </>
        }
      />

      <div className="mb-4 flex gap-2">
        {[30, 90, 365].map((d) => (
          <button key={d} onClick={() => setDays(d)}
            className={`rounded-lg px-3 py-1.5 text-sm ${days === d ? 'bg-indigo-600 text-white' : 'border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
            {d === 30 ? 'Месяц' : d === 90 ? 'Квартал' : 'Год'}
          </button>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><Download size={16} /> Движение средств по дням</h3>
        {cashflow.isLoading ? <Skeleton className="h-72" /> : cfData.length === 0 ? <EmptyState title="Нет данных за период" /> : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cfData}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtMoney(v)} />
              <Legend />
              <Bar dataKey="income" name="Доходы" stackId="a" fill="#10b981" />
              <Bar dataKey="expense" name="Расходы" stackId="b" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="mt-4 p-4">
        <h3 className="mb-2 font-semibold">По участникам семьи</h3>
        {byUser.isLoading ? <Skeleton className="h-32" /> : byUser.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">Не удалось загрузить данные отчёта.</p>
        ) : (byUser.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">Нет транзакций участников за выбранный период.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-slate-500"><th className="py-1">Участник</th><th>Доходы</th><th>Расходы</th></tr></thead>
            <tbody>
              {(byUser.data?.items ?? []).map((u, i) => (
                <tr key={u.user_name || u.name || i} className="border-b last:border-0 dark:border-slate-800">
                  <td className="py-1.5 font-medium">{u.user_name || u.name}</td>
                  <td className="text-emerald-600">{fmtMoney(u.income)}</td>
                  <td className="text-red-600">{fmtMoney(u.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
