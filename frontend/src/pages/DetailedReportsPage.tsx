import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Filter, ChevronLeft, ChevronRight, Receipt, ArrowLeftRight, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, Input, Skeleton, fmtMoney } from '../components/ui';

type Tab = 'transactions' | 'receipts';

export default function DetailedReportsPage() {
  const qc = useQueryClient();
  
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/receipts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(); // Обновляем данные после удаления
    },
    onError: (e: any) => {
      alert('Ошибка при удалении: ' + (e.response?.data?.detail || e.message || 'Неизвестная ошибка'));
    }
  });

  const [activeTab, setActiveTab] = useState<Tab>('transactions');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Фильтры
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      date_from: dateFrom,
      date_to: dateTo,
      sort_by: activeTab === 'transactions' ? 'occurred_at' : 'receipt_date',
      sort_order: 'desc',
    });
    if (activeTab === 'transactions') {
      if (type) params.append('type', type);
      if (amountMin) params.append('amount_min', amountMin);
      if (amountMax) params.append('amount_max', amountMax);
      if (search) params.append('search', search);
    } else {
      if (search) params.append('store_search', search);
      if (amountMin) params.append('amount_min', amountMin);
      if (amountMax) params.append('amount_max', amountMax);
    }
    return params.toString();
  }, [activeTab, page, dateFrom, dateTo, search, type, amountMin, amountMax]);

  const endpoint = activeTab === 'transactions' ? `/reports/transactions-detail?${queryParams}` : `/reports/receipts-detail?${queryParams}`;
  
  const { data, isLoading } = useQuery({
    queryKey: ['detailed-report', activeTab, queryParams],
    queryFn: () => api.get<any>(endpoint),
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  const resetFilters = () => {
    setSearch(''); setType(''); setAmountMin(''); setAmountMax(''); setPage(1);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Детальные отчеты</h1>
        <div className="flex gap-2">
          <Button variant={activeTab === 'transactions' ? 'default' : 'outline'} onClick={() => { setActiveTab('transactions'); setPage(1); }}>
            <ArrowLeftRight size={16} className="mr-2" /> Транзакции
          </Button>
          <Button variant={activeTab === 'receipts' ? 'default' : 'outline'} onClick={() => { setActiveTab('receipts'); setPage(1); }}>
            <Receipt size={16} className="mr-2" /> Чеки
          </Button>
        </div>
      </div>

      {/* Панель фильтров */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-400">
          <Filter size={16} /> Фильтры
          <button onClick={resetFilters} className="ml-auto text-xs text-indigo-400 hover:underline">Сбросить</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-slate-500">Период с</label>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="text-xs text-slate-500">Период по</label>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="text-xs text-slate-500">{activeTab === 'transactions' ? 'Поиск по комментарию' : 'Поиск по магазину/OCR'}</label>
            <Input placeholder="Введите текст..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          {activeTab === 'transactions' && (
            <div>
              <label className="text-xs text-slate-500">Тип операции</label>
              <select className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
                <option value="">Все</option>
                <option value="income">Доход</option>
                <option value="expense">Расход</option>
                <option value="transfer">Перевод</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500">Сумма от</label>
            <Input type="number" placeholder="0" value={amountMin} onChange={(e) => { setAmountMin(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="text-xs text-slate-500">Сумма до</label>
            <Input type="number" placeholder="999999" value={amountMax} onChange={(e) => { setAmountMax(e.target.value); setPage(1); }} />
          </div>
        </div>
      </Card>

      {/* Таблица */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-left text-slate-400">
              <tr>
                {activeTab === 'transactions' ? (
                  <>
                    <th className="p-3">Дата</th>
                    <th className="p-3">Тип</th>
                    <th className="p-3">Сумма</th>
                    <th className="p-3">Категория</th>
                    <th className="p-3">Счет</th>
                    <th className="p-3">Комментарий</th>
                  </>
                ) : (
                  <>
                    <th className="p-3">Дата чека</th>
                    <th className="p-3">Магазин</th>
                    <th className="p-3">Сумма</th>
                    <th className="p-3">Статус</th>
                    <th className="p-3">Дубликат</th>
                    <th className="p-3 w-10"></th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr><td colSpan={6} className="p-8 text-center"><Skeleton className="h-32" /></td></tr>
              ) : data?.items?.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">Нет данных за выбранный период</td></tr>
              ) : (
                data?.items.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-800/50">
                    {activeTab === 'transactions' ? (
                      <>
                        <td className="p-3 whitespace-nowrap">{new Date(item.occurred_at).toLocaleDateString('ru-RU')}</td>
                        <td className="p-3">
                          <span className={`rounded px-2 py-0.5 text-xs ${item.type === 'income' ? 'bg-emerald-900/40 text-emerald-400' : item.type === 'expense' ? 'bg-red-900/40 text-red-400' : 'bg-blue-900/40 text-blue-400'}`}>
                            {item.type === 'income' ? 'Доход' : item.type === 'expense' ? 'Расход' : 'Перевод'}
                          </span>
                        </td>
                        <td className={`p-3 font-medium ${item.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {item.type === 'income' ? '+' : '-'}{fmtMoney(item.amount, item.currency)}
                        </td>
                        <td className="p-3">{item.category_name}</td>
                        <td className="p-3">{item.account_name}</td>
                        <td className="p-3 text-slate-400 truncate max-w-xs">{item.comment || '—'}</td>
                      </>
                    ) : (
                      <>
                        <td className="p-3 whitespace-nowrap">{item.receipt_date ? new Date(item.receipt_date).toLocaleDateString('ru-RU') : '—'}</td>
                        <td className="p-3 font-medium">{item.store_name}</td>
                        <td className="p-3 font-medium">{fmtMoney(item.total_amount, 'RUB')}</td>
                        <td className="p-3">
                          <span className={`rounded px-2 py-0.5 text-xs ${item.parse_status === 'PARSED' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-amber-900/40 text-amber-400'}`}>
                            {item.parse_status}
                          </span>
                        </td>
                        <td className="p-3">{item.is_duplicate ? '⚠️ Да' : 'Нет'}</td>
                        <td className="p-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50/10 p-1 h-8 w-8"
                            onClick={() => {
                              if (window.confirm('Удалить этот чек? Это действие нельзя отменить.')) {
                                deleteMutation.mutate(item.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            title="Удалить чек"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Пагинация */}
        {!isLoading && data && (
          <div className="flex items-center justify-between border-t border-slate-800 p-3 text-sm text-slate-400">
            <span>Показано {data.items.length} из {data.total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={14} /> Назад
              </Button>
              <span className="flex items-center px-2">Стр. {page} из {totalPages || 1}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Вперед <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
