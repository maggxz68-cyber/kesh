// Отчёт по категориям: pie-диаграмма + таблица с долями; клик по категории — переход к транзакциям.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import PeriodFilter, { type PeriodValue } from '../PeriodFilter';
import { Card, Skeleton, EmptyState, fmtMoney } from '../ui';

interface CatRow {
  category_id: string;
  category_name: string;
  kind: string;
  color: string | null;
  amount: number;
  share: number;
  count: number;
}

const FALLBACK_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];

export default function CategoryReport() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [period, setPeriod] = useState<PeriodValue>({
    date_from: sp.get('date_from') ?? '',
    date_to: sp.get('date_to') ?? '',
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-by-category', period],
    queryFn: () =>
      api.get<{ items: CatRow[] }>(`/reports/by-category?date_from=${period.date_from}&date_to=${period.date_to}&type=expense&top_n=20`),
    enabled: !!period.date_from && !!period.date_to,
  });

  const rows = data?.items ?? [];
  const chartData = rows.map((r) => ({ name: r.category_name, value: Number(r.amount) }));

  return (
    <>
      <PeriodFilter onChange={setPeriod} />
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : isError ? (
        <Card className="p-4 text-sm text-red-600">Не удалось загрузить отчёт по категориям. Попробуйте обновить страницу.</Card>
      ) : rows.length === 0 ? (
        <EmptyState title="Нет расходов за период" hint="Добавьте транзакции или расширьте период." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h3 className="mb-2 font-semibold">Распределение расходов</h3>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={110}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={rows[i].color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card className="overflow-x-auto p-4">
            <h3 className="mb-2 font-semibold">Топ категорий</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-1">Категория</th><th>Сумма</th><th>К-во</th><th>%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.category_id}
                    onClick={() => nav(`/reports/transactions?category_id=${r.category_id}&date_from=${period.date_from}&date_to=${period.date_to}`)}
                    className="cursor-pointer border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <td className="py-1.5 font-medium">{r.category_name}</td>
                    <td>{fmtMoney(Number(r.amount))}</td>
                    <td>{r.count}</td>
                    <td>{(r.share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
