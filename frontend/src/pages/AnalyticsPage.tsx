import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, PieChart as PieIcon, Wallet, Receipt, Calendar } from 'lucide-react';
import { api } from '../api/client';
import { Card, Skeleton, fmtMoney, EmptyState } from '../components/ui';
import { PageTitle } from '../components/Layout';
import PeriodFilter, { type PeriodValue } from '../components/PeriodFilter';

const FALLBACK_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<PeriodValue>({
    date_from: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 10),
    date_to: new Date().toISOString().slice(0, 10),
  });

  const q = useMemo(() => `date_from=${period.date_from}&date_to=${period.date_to}`, [period]);

  // 1. KPI и сравнение периодов
  const comparison = useQuery({ queryKey: ['comparison', q], queryFn: () => api.get<any>(`/reports/comparison?${q}`) });
  // 2. Прогноз
  const forecast = useQuery({ queryKey: ['forecast'], queryFn: () => api.get<any>('/reports/forecast') });
  // 3. Инсайты
  const insights = useQuery({ queryKey: ['insights', q], queryFn: () => api.get<any>(`/reports/insights?${q}`) });
  // 4. Динамика по месяцам (6 мес)
  const byMonth = useQuery({ queryKey: ['by-month'], queryFn: () => api.get<{ items: any[] }>('/reports/by-month?months=6') });
  // 5. По категориям
  const byCategory = useQuery({ queryKey: ['by-category', q], queryFn: () => api.get<{ items: any[] }>(`/reports/by-category?${q}&type=expense&top_n=8`) });
  // 6. По счетам
  const byAccount = useQuery({ queryKey: ['by-account', q], queryFn: () => api.get<{ items: any[] }>(`/reports/by-account?${q}`) });
  // 7. По чекам и магазинам
  const receipts = useQuery({ queryKey: ['receipts', q], queryFn: () => api.get<any>(`/reports/receipts?${q}`) });

  const curr = comparison.data?.current;
  const deltas = comparison.data?.deltas;

  const renderDelta = (val: number, isExpense = false) => {
    const isPositive = val > 0;
    const Icon = isPositive ? TrendingUp : val < 0 ? TrendingDown : Minus;
    const color = isExpense ? (isPositive ? 'text-red-600' : 'text-emerald-600') : (isPositive ? 'text-emerald-600' : 'text-red-600');
    return (
      <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
        <Icon size={14} />
        {Math.abs(val)}%
      </span>
    );
  };

  return (
    <>
      <PageTitle title="Углублённая аналитика" />
      <div className="mb-6"><PeriodFilter onChange={setPeriod} /></div>

      {/* --- 1. KPI Карточки --- */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-slate-500 flex items-center gap-2"><TrendingDown size={16} /> Расходы</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{curr ? fmtMoney(curr.expense) : <Skeleton className="h-8 w-24" />}</p>
          {deltas && <div className="mt-2">{renderDelta(deltas.expense_delta_pct, true)} к пред. периоду</div>}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 flex items-center gap-2"><TrendingUp size={16} /> Доходы</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{curr ? fmtMoney(curr.income) : <Skeleton className="h-8 w-24" />}</p>
          {deltas && <div className="mt-2">{renderDelta(deltas.income_delta_pct, false)} к пред. периоду</div>}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 flex items-center gap-2"><Wallet size={16} /> Баланс (Net)</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{curr ? fmtMoney(curr.net) : <Skeleton className="h-8 w-24" />}</p>
          {deltas && <div className="mt-2">{renderDelta(deltas.net_delta_pct, false)} к пред. периоду</div>}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 flex items-center gap-2"><Calendar size={16} /> Прогноз расходов</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{forecast.data ? fmtMoney(forecast.data.forecast) : <Skeleton className="h-8 w-24" />}</p>
          {forecast.data && <p className="text-xs text-slate-400 mt-2">На основе {forecast.data.months_used} мес. (тренд: {forecast.data.trend === 'up' ? '↗ рост' : '→ стабильный'})</p>}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        {/* --- 2. График тренда --- */}
        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Calendar size={18} /> Динамика за 6 месяцев</h3>
          {byMonth.isLoading ? <Skeleton className="h-64" /> : !byMonth.data?.items?.length ? (
            <EmptyState title="Недостаточно данных для графика" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={byMonth.data.items}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v/1000).toFixed(0)}к`} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Line type="monotone" dataKey="income" name="Доходы" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="expense" name="Расходы" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* --- 3. Инсайты --- */}
        <Card className="p-4">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><AlertTriangle size={18} /> Инсайты</h3>
          {insights.isLoading ? <Skeleton className="h-64" /> : (
            <div className="space-y-3">
              {insights.data?.items?.map((insight: any, i: number) => {
                const Icon = insight.icon === 'check-circle' ? CheckCircle : insight.icon === 'alert-triangle' ? AlertTriangle : PieIcon;
                const bg = insight.type === 'success' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' :
                           insight.type === 'warning' ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300' :
                           'bg-indigo-50 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300';
                return (
                  <div key={i} className={`rounded-lg p-3 ${bg}`}>
                    <div className="flex items-start gap-3">
                      <Icon size={18} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-sm">{insight.title}</p>
                        <p className="text-xs mt-1 opacity-90 leading-relaxed">{insight.text}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* --- 4. По категориям --- */}
        <Card className="p-4">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><PieIcon size={18} /> Топ расходов по категориям</h3>
          {byCategory.isLoading ? <Skeleton className="h-64" /> : !byCategory.data?.items?.length ? (
            <EmptyState title="Нет данных по категориям" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={byCategory.data.items} dataKey="amount" nameKey="category_name" outerRadius={100}>
                  {byCategory.data.items.map((_, i) => (<Cell key={i} fill={byCategory.data.items[i].color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* --- 5. По счетам --- */}
        <Card className="p-4">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Wallet size={18} /> Движение по счетам</h3>
          {byAccount.isLoading ? <Skeleton className="h-64" /> : !byAccount.data?.items?.length ? (
            <EmptyState title="Нет данных по счетам" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byAccount.data.items.filter((a: any) => !a.is_archived)}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="account_name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v/1000).toFixed(0)}к`} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Bar dataKey="inflow" name="Приход" fill="#10b981" />
                <Bar dataKey="outflow" name="Расход" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* --- 6. По чекам и магазинам --- */}
      <Card className="p-4 mb-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold"><Receipt size={18} /> Статистика по чекам и магазинам</h3>
        {receipts.isLoading ? <Skeleton className="h-40" /> : !receipts.data ? (
          <EmptyState title="Нет данных по чекам" />
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-center">
              <p className="text-sm text-slate-500">Всего чеков</p>
              <p className="text-2xl font-bold text-indigo-600">{receipts.data.count}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-center">
              <p className="text-sm text-slate-500">Общая сумма</p>
              <p className="text-2xl font-bold text-indigo-600">{fmtMoney(receipts.data.total)}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-center">
              <p className="text-sm text-slate-500">Средний чек</p>
              <p className="text-2xl font-bold text-indigo-600">{fmtMoney(receipts.data.avg)}</p>
            </div>
            {receipts.data.top_stores?.length > 0 && (
              <div className="md:col-span-3 mt-2">
                <p className="text-sm font-semibold mb-2 text-slate-600 dark:text-slate-300">Топ магазинов по сумме:</p>
                <div className="space-y-2">
                  {receipts.data.top_stores.slice(0, 5).map((store: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                      <span className="font-medium">{store.store_name || 'Не указан'}</span>
                      <div className="flex gap-4 text-slate-500">
                        <span>{store.receipts_count} чеков</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{fmtMoney(store.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
