// Отчёт по счетам: движение (начальный остаток/приход/расход/конечный) + bar-график.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import PeriodFilter, { type PeriodValue } from '../PeriodFilter';
import { Card, Skeleton, EmptyState, fmtMoney } from '../ui';

interface AccountRow {
  account_id: string;
  account_name: string;
  type: string;
  currency: string;
  is_archived?: boolean;
  opening_balance: number;
  inflow: number;
  outflow: number;
  closing_balance: number;
}

export default function AccountReport() {
  const [sp] = useSearchParams();
  const [period, setPeriod] = useState<PeriodValue>({
    date_from: sp.get('date_from') ?? '',
    date_to: sp.get('date_to') ?? '',
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-by-account', period],
    queryFn: () => api.get<{ items: AccountRow[] }>(`/reports/by-account?date_from=${period.date_from}&date_to=${period.date_to}`),
    enabled: !!period.date_from && !!period.date_to,
  });

  const rows = data?.items ?? [];

  return (
    <>
      <PeriodFilter onChange={setPeriod} />
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : isError ? (
        <Card className="p-4 text-sm text-red-600">Не удалось загрузить отчёт по счетам.</Card>
      ) : rows.length === 0 ? (
        <EmptyState title="Нет счетов" hint="Добавьте счёт на странице «Счета»." />
      ) : (
        <>
          <Card className="overflow-x-auto p-4">
            <h3 className="mb-2 font-semibold">Движение по счетам</h3>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-1">Счёт</th><th>Начальный</th><th>Приход</th><th>Расход</th><th>Конечный</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.account_id} className="border-b last:border-0">
                    <td className="py-1.5 font-medium">{a.account_name}{a.is_archived ? ' (архив)' : ''}</td>
                    <td>{fmtMoney(Number(a.opening_balance), a.currency)}</td>
                    <td className="text-emerald-600">{fmtMoney(Number(a.inflow), a.currency)}</td>
                    <td className="text-red-600">{fmtMoney(Number(a.outflow), a.currency)}</td>
                    <td className="font-semibold">{fmtMoney(Number(a.closing_balance), a.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="mt-4 p-4">
            <h3 className="mb-2 font-semibold">Приход/расход по счетам</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={rows.map((r) => ({ name: r.account_name, inflow: Number(r.inflow), outflow: Number(r.outflow) }))}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Bar dataKey="inflow" name="Приход" fill="#10b981" />
                <Bar dataKey="outflow" name="Расход" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </>
  );
}
