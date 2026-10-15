import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { FileSpreadsheet, FileText, Table, Calendar, TrendingUp, Wallet, Users, Receipt, PieChart as PieChartIcon } from 'lucide-react';
import { api } from '../api/client';
import { Card, Skeleton, fmtMoney, Button } from '../components/ui';
import { PageTitle } from '../components/Layout';

const FALLBACK_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899'];

interface PeriodPreset {
  label: string;
  days?: number;
  custom?: { from: string; to: string };
}

export default function ReportsPage() {
  const [selectedPreset, setSelectedPreset] = useState('quarter');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [reportType, setReportType] = useState<'summary' | 'category' | 'account' | 'member' | 'receipts'>('summary');

  // Определяем период
  const period = useMemo(() => {
    const today = new Date();
    const presets: Record<string, PeriodPreset> = {
      month: { label: 'Месяц', days: 30 },
      quarter: { label: 'Квартал', days: 90 },
      year: { label: 'Год', days: 365 },
      custom: { label: 'Произвольный', custom: { from: customFrom, to: customTo } },
    };
    
    const p = presets[selectedPreset];
    if (p.custom && p.custom.from && p.custom.to) {
      return { from: p.custom.from, to: p.custom.to };
    }
    
    const to = today.toISOString().slice(0, 10);
    const from = new Date(today.getTime() - (p.days || 30) * 86400000).toISOString().slice(0, 10);
    return { from, to };
  }, [selectedPreset, customFrom, customTo]);

  const q = `date_from=${period.from}&date_to=${period.to}`;

  // Загружаем данные
  const summary = useQuery({ queryKey: ['summary', q], queryFn: () => api.get<any>(`/reports/summary?${q}`) });
  const byCategory = useQuery({ queryKey: ['category', q], queryFn: () => api.get<{ items: any[] }>(`/reports/by-category?${q}&top_n=20`) });
  const byAccount = useQuery({ queryKey: ['account', q], queryFn: () => api.get<{ items: any[] }>(`/reports/by-account?${q}`) });
  const byMember = useQuery({ queryKey: ['member', q], queryFn: () => api.get<{ items: any[] }>(`/reports/by-user?${q}`) });
  const receipts = useQuery({ queryKey: ['receipts', q], queryFn: () => api.get<any>(`/reports/receipts?${q}`) });
  const cashflow = useQuery({ queryKey: ['cashflow', q], queryFn: () => api.get<{ items: any[] }>(`/reports/cashflow?${q}`) });

  // Экспорт данных
  const downloadReport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    const endpoints = {
      summary: `/export/${format}?${q}`,
      category: `/export/${format}?${q}&group_by=category`,
      account: `/export/${format}?${q}&group_by=account`,
      member: `/export/${format}?${q}&group_by=member`,
      receipts: `/export/${format}?${q}&type=receipts`,
    };
    
    const response = await fetch(api.url(endpoints[reportType]), {
      headers: { 'X-CSRF-Token': localStorage.getItem('csrf_token') || '' },
    });
    
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${reportType}_${period.from}_${period.to}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  const isLoading = summary.isLoading || byCategory.isLoading || byAccount.isLoading;

  return (
    <>
      <PageTitle title="Отчёты" />
      
      {/* Фильтры периода */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            {[
              { id: 'month', label: 'Месяц' },
              { id: 'quarter', label: 'Квартал' },
              { id: 'year', label: 'Год' },
              { id: 'custom', label: 'Произвольный' },
            ].map((p) => (
              <Button
                key={p.id}
                variant={selectedPreset === p.id ? 'default' : 'outline'}
                onClick={() => setSelectedPreset(p.id)}
                className="text-sm"
              >
                {p.label}
              </Button>
            ))}
          </div>
          
          {selectedPreset === 'custom' && (
            <div className="flex gap-2 items-center">
              <Calendar size={16} className="text-slate-500" />
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
              <span className="text-slate-500">—</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
          )}
          
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadReport('csv')}>
              <Table size={16} className="mr-2" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadReport('xlsx')}>
              <FileSpreadsheet size={16} className="mr-2" /> XLSX
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadReport('pdf')}>
              <FileText size={16} className="mr-2" /> PDF
            </Button>
          </div>
        </div>
      </Card>

      {/* Выбор типа отчёта */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {[
          { id: 'summary', label: 'Общий отчёт', icon: TrendingUp },
          { id: 'category', label: 'По категориям', icon: PieChartIcon },
          { id: 'account', label: 'По счетам', icon: Wallet },
          { id: 'member', label: 'По участникам', icon: Users },
          { id: 'receipts', label: 'По чекам', icon: Receipt },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <Button
              key={t.id}
              variant={reportType === t.id ? 'default' : 'outline'}
              onClick={() => setReportType(t.id as any)}
              className="whitespace-nowrap"
            >
              <Icon size={16} className="mr-2" />
              {t.label}
            </Button>
          );
        })}
      </div>

      {/* Содержимое отчётов */}
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-6">
          {/* 1. Сводный отчёт */}
          {reportType === 'summary' && (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4">
                  <p className="text-sm text-slate-500">Доходы</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">
                    {fmtMoney(summary.data?.income || 0)}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-slate-500">Расходы</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">
                    {fmtMoney(summary.data?.expense || 0)}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-slate-500">Баланс</p>
                  <p className={`text-2xl font-bold mt-1 ${((summary.data?.net || 0) >= 0) ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmtMoney(summary.data?.net || 0)}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-slate-500">Транзакций</p>
                  <p className="text-2xl font-bold text-indigo-600 mt-1">
                    {summary.data?.transactions_count || 0}
                  </p>
                </Card>
              </div>

              <Card className="p-4">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp size={18} /> Движение средств по дням
                </h3>
                {cashflow.data?.items?.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={cashflow.data.items}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => fmtMoney(v)} />
                      <Legend />
                      <Bar dataKey="income" name="Доходы" fill="#10b981" />
                      <Bar dataKey="expense" name="Расходы" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-slate-500 text-center py-12">Нет данных за выбранный период</p>
                )}
              </Card>
            </>
          )}

          {/* 2. По категориям */}
          {reportType === 'category' && (
            <Card className="p-4">
              <h3 className="font-semibold mb-4">Расходы по категориям</h3>
              {byCategory.isLoading ? (
                <Skeleton className="h-64" />
              ) : (() => {
                // Фильтруем только расходы и конвертируем amount в число
                const expenses = (byCategory.data?.items || [])
                  .filter((item: any) => item.kind === 'expense')
                  .map((item: any) => ({
                    ...item,
                    amount: Number(item.amount) || Number(item.total) || 0,
                  }))
                  .filter((item: any) => item.amount > 0);
                  
                return expenses.length > 0 ? (
                  <div style={{ height: 400 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie 
                          data={expenses} 
                          dataKey="amount" 
                          nameKey="category_name" 
                          outerRadius={120}
                          label={({category_name, percent}) => `${category_name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {expenses.map((item: any, i: number) => (
                            <Cell key={i} fill={item.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmtMoney(v)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-12">Нет расходов за выбранный период</p>
                );
              })()}
            </Card>
          )}

          {/* 3. По счетам */}
          {reportType === 'account' && (
            <Card className="p-4">
              <h3 className="font-semibold mb-4">Движение по счетам</h3>
              {byAccount.data?.items?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Счёт</th>
                        <th className="text-right">Начальный остаток</th>
                        <th className="text-right text-emerald-600">Приход</th>
                        <th className="text-right text-red-600">Расход</th>
                        <th className="text-right">Конечный остаток</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byAccount.data.items.map((acc: any) => (
                        <tr key={acc.account_id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{acc.account_name}</td>
                          <td className="text-right">{fmtMoney(acc.opening_balance)}</td>
                          <td className="text-right text-emerald-600">{fmtMoney(acc.inflow)}</td>
                          <td className="text-right text-red-600">{fmtMoney(acc.outflow)}</td>
                          <td className="text-right font-semibold">{fmtMoney(acc.closing_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-500 text-center py-12">Нет данных</p>
              )}
            </Card>
          )}

          {/* 4. По участникам */}
          {reportType === 'member' && (
            <Card className="p-4">
              <h3 className="font-semibold mb-4">По участникам семьи</h3>
              {byMember.data?.items?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Участник</th>
                        <th className="text-right text-emerald-600">Доходы</th>
                        <th className="text-right text-red-600">Расходы</th>
                        <th className="text-right">Баланс</th>
                        <th className="text-right">Транзакций</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byMember.data.items.map((m: any) => (
                        <tr key={m.user_id || m.name} className="border-b last:border-0">
                          <td className="py-2 font-medium">{m.user_name || m.name}</td>
                          <td className="text-right text-emerald-600">{fmtMoney(m.income)}</td>
                          <td className="text-right text-red-600">{fmtMoney(m.expense)}</td>
                          <td className={`text-right ${((m.income - m.expense) >= 0) ? 'text-emerald-600' : 'text-red-600'}`}>
                            {fmtMoney(m.income - m.expense)}
                          </td>
                          <td className="text-right">{m.transactions_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-500 text-center py-12">Нет данных</p>
              )}
            </Card>
          )}

          {/* 5. По чекам */}
          {reportType === 'receipts' && (
            <Card className="p-4">
              <h3 className="font-semibold mb-4">Статистика по чекам</h3>
              {receipts.data ? (
                <div className="space-y-4">
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
                  </div>
                  
                  {receipts.data.top_stores?.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">Топ магазинов:</h4>
                      <div className="space-y-2">
                        {receipts.data.top_stores.map((store: any, i: number) => (
                          <div key={i} className="flex justify-between items-center p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                            <span className="font-medium">{store.store_name || 'Не указан'}</span>
                            <div className="flex gap-4 text-sm">
                              <span className="text-slate-500">{store.receipts_count} чеков</span>
                              <span className="font-semibold">{fmtMoney(store.total)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-12">Нет данных</p>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
