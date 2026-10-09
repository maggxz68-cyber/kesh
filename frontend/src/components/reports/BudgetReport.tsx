// Отчёт по бюджетам: план vs факт с прогресс-барами и цветовой индикацией превышения.
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Card, Skeleton, EmptyState, Progress, fmtMoney } from '../ui';

interface BudgetRow {
  id: string;
  category: { id: string; name: string; color: string | null };
  period: string;
  period_start: string;
  period_end: string;
  limit_amount: number;
  spent: number;
  remaining: number;
  over_limit: boolean;
  active_now: boolean;
}

export default function BudgetReport() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-budgets'],
    queryFn: () => api.get<BudgetRow[]>('/reports/budgets'),
  });
  const rows = data ?? [];
  return (
    <Card className="p-4">
      <h3 className="mb-3 font-semibold">План / факт по бюджетам</h3>
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : isError ? (
        <p className="text-sm text-red-600">Не удалось загрузить бюджеты.</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Бюджеты не настроены" hint="Создайте бюджет на странице «Бюджеты»." />
      ) : (
        <div className="space-y-4">
          {rows.map((b) => {
            const pct = b.limit_amount > 0 ? Math.min(100, (b.spent / b.limit_amount) * 100) : 0;
            return (
              <div key={b.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {b.category.name}{' '}
                    {!b.active_now && <span className="text-xs text-slate-400">(не активен)</span>}
                  </span>
                  <span className={b.over_limit ? 'font-semibold text-red-600' : 'text-slate-600 dark:text-slate-300'}>
                    {fmtMoney(Number(b.spent))} / {fmtMoney(Number(b.limit_amount))}
                  </span>
                </div>
                <Progress value={pct} color={b.over_limit ? '#ef4444' : '#10b981'} />
                {b.over_limit && (
                  <p className="mt-1 text-xs text-red-600">Превышение на {fmtMoney(Number(b.spent) - Number(b.limit_amount))}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
