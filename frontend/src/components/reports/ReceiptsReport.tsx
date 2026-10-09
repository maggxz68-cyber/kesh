// Отчёт по чекам: статистика, топ магазинов (bar), список последних чеков.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import PeriodFilter, { type PeriodValue } from '../PeriodFilter';
import { Card, Skeleton, EmptyState, fmtMoney, fmtDate } from '../ui';

interface ReceiptRow {
  id: string;
  store_name: string | null;
  inn: string | null;
  date: string;
  total_amount: number;
  parse_status: string;
}

export default function ReceiptsReport() {
  const [sp] = useSearchParams();
  const [period, setPeriod] = useState<PeriodValue>({
    date_from: sp.get('date_from') ?? '',
    date_to: sp.get('date_to') ?? '',
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-receipts', period],
    queryFn: () =>
      api.get<{ count: number; total: number; avg: number; top_stores: { store_name: string; receipts_count: number; total: number }[]; receipts: ReceiptRow[] }>(
        `/reports/receipts?date_from=${period.date_from}&date_to=${period.date_to}`,
      ),
    enabled: !!period.date_from && !!period.date_to,
  });

  return (
    <>
      <PeriodFilter onChange={setPeriod} />
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : isError ? (
        <Card className="p-4 text-sm text-red-600">Не удалось загрузить статистику по чекам.</Card>
      ) : !data || data.count === 0 ? (
        <EmptyState title="Нет чеков за период" hint="Отсканируйте чек на странице «Сканер»." />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card className="p-4"><p className="text-xs text-slate-500">Количество чеков</p><p className="text-2xl font-bold">{data.count}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500">Общая сумма</p><p className="text-2xl font-bold">{fmtMoney(Number(data.total))}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500">Средний чек</p><p className="text-2xl font-bold">{fmtMoney(Number(data.avg))}</p></Card>
          </div>
          <Card className="mb-4 p-4">
            <h3 className="mb-2 font-semibold">Топ магазинов по сумме</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart layout="vertical" data={data.top_stores.map((s) => ({ name: s.store_name, total: Number(s.total) }))}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Bar dataKey="total" name="Сумма" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card className="overflow-x-auto p-4">
            <h3 className="mb-2 font-semibold">Список чеков</h3>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-1">Дата</th><th>Магазин</th><th>ИНН</th><th>Сумма</th><th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {data.receipts.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-1.5 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td>{r.store_name ?? '—'}</td>
                    <td>{r.inn ?? '—'}</td>
                    <td className="font-medium">{fmtMoney(Number(r.total_amount))}</td>
                    <td>{r.parse_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
