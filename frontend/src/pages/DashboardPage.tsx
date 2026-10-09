// Дашборд: доходы/расходы за период, баланс, топ-категории, графики (Recharts).
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from 'recharts';
import { TrendingUp, TrendingDown, Wallet, Banknote, CreditCard } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Card, Skeleton, fmtMoney, EmptyState } from '../components/ui';
import { PageTitle } from '../components/Layout';

interface Summary {
  income: number; expense: number; balance: number;
  cash_income?: number; cash_expense?: number; card_income?: number; card_expense?: number;
}
// amount — поле, которое реально возвращает backend (services/reports.by_category);
// total оставлен как опциональный fallback на случай старого контракта.
interface ByCat { category_name: string; color: string | null; amount: number; total?: number }
interface ByMonth { month: string; income: number; expense: number }

const PERIODS = [
  { label: 'Месяц', days: 30 },
  { label: 'Квартал', days: 90 },
  { label: 'Год', days: 365 },
];

function periodParams(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  return `date_from=${from.toISOString().slice(0, 10)}&date_to=${to.toISOString().slice(0, 10)}`;
}

export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const q = useMemo(() => periodParams(days), [days]);

  const summary = useQuery({
    queryKey: ['summary', q],
    queryFn: () => api.get<Summary>(`/reports/summary?${q}`),
  });
  const byCategory = useQuery({
    queryKey: ['by-category', q],
    queryFn: () => api.get<{ items: ByCat[] }>(`/reports/by-category?${q}&type=expense&limit=8`),
  });
  const byMonth = useQuery({
    queryKey: ['by-month', q],
    queryFn: () => api.get<{ items: ByMonth[] }>(`/reports/by-month?${q}`),
  });

  const s = summary.data;
  // FIX: backend возвращает поле `amount`, а не `total` — из-за этого value был undefined,
  // pieData получался пустым и дашборд показывал «Нет расходов за период» при наличии данных.
  const catItems = byCategory.data?.items ?? [];
  console.log('Category data:', byCategory.data);
  const pieData = catItems.map((c) => ({ name: c.category_name, value: Number(c.amount ?? c.total ?? 0) }))
    .filter((p) => p.value > 0);
  const lineData = (byMonth.data?.items ?? []).map((m) => ({
    ...m,
    net: m.income - m.expense,
    month: new Date(m.month + '-01').toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
  }));

  return (
    <>
      <PageTitle
        title="Дашборд"
        actions={
          <div className="flex rounded-lg border border-slate-300 dark:border-slate-700">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={`px-3 py-1.5 text-sm first:rounded-l-lg last:rounded-r-lg ${
                  days === p.days ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500"><TrendingUp size={16} className="text-emerald-500" /> Доходы</div>
              <div className="mt-1 text-xl font-bold text-emerald-600">{fmtMoney(s?.income ?? 0)}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500"><TrendingDown size={16} className="text-red-500" /> Расходы</div>
              <div className="mt-1 text-xl font-bold text-red-600">{fmtMoney(s?.expense ?? 0)}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500"><Wallet size={16} className="text-indigo-500" /> Баланс счетов</div>
              <div className="mt-1 text-xl font-bold">{fmtMoney(s?.balance ?? 0)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-slate-500">Наличные / Безнал (расход)</div>
              <div className="mt-1 flex gap-3 text-sm font-semibold">
                <span className="flex items-center gap-1"><Banknote size={14} />{fmtMoney(s?.cash_expense ?? 0)}</span>
                <span className="flex items-center gap-1"><CreditCard size={14} />{fmtMoney((s?.card_expense ?? 0))}</span>
              </div>
            </Card>
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-2 font-semibold">Топ расходов по категориям</h3>
          {byCategory.isLoading ? (
            <Skeleton className="h-64" />
          ) : pieData.length === 0 ? (
            <EmptyState title="Нет расходов за период" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={95} label={(e: any) => `${e.name}: ${Math.round(e.percent * 100)}%`}>
                  {catItems.map((c, i) => (
                    <Cell key={i} fill={c.color ?? '#6366f1'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 font-semibold">По месяцам</h3>
          {byMonth.isLoading ? (
            <Skeleton className="h-64" />
          ) : lineData.length === 0 ? (
            <EmptyState title="Нет данных" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Bar dataKey="income" name="Доходы" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Расходы" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-2 font-semibold">Тренд (накопительный итог месяца)</h3>
          {lineData.length === 0 ? (
            <EmptyState title="Нет данных" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Line type="monotone" dataKey="net" name="Итог" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </>
  );
}
