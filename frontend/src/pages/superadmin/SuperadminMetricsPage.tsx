// Метрики платформы: семьи/пользователи/транзакции/чеки + размер БД и хранилища чеков.
import { useQuery } from '@tanstack/react-query';
import { Users2, UserCircle, ArrowLeftRight, ReceiptText, Database, HardDrive } from 'lucide-react';
import { api } from '../../api/client';
import { Card, Skeleton } from '../../components/ui';

interface Metrics {
  families_total: number; families_active: number; families_blocked: number; families_sandbox: number;
  users_total: number; transactions_total: number; receipts_total: number;
  db_size?: string | null; receipts_volume_bytes?: number | null; receipts_volume_human?: string | null;
}

export default function SuperadminMetricsPage() {
  const m = useQuery({ queryKey: ['sa-metrics'], queryFn: () => api.get<Metrics>('/superadmin/metrics') });
  const tiles = [
    { label: 'Семей всего', value: m.data?.families_total, icon: Users2, hint: `активных ${m.data?.families_active ?? '—'} · блок ${m.data?.families_blocked ?? '—'} · песочниц ${m.data?.families_sandbox ?? '—'}` },
    { label: 'Пользователей', value: m.data?.users_total, icon: UserCircle },
    { label: 'Транзакций', value: m.data?.transactions_total, icon: ArrowLeftRight },
    { label: 'Чеков', value: m.data?.receipts_total, icon: ReceiptText, hint: m.data?.receipts_volume_human ? `объём файлов: ${m.data.receipts_volume_human}` : undefined },
    { label: 'Размер БД', value: m.data?.db_size ?? '—', icon: Database },
    { label: 'Хранилище чеков', value: m.data?.receipts_volume_human ?? '—', icon: HardDrive },
  ];
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Метрики платформы</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {m.isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : tiles.map((t) => (
              <Card key={t.label} className="p-4">
                <div className="flex items-center gap-2 text-sm text-slate-400"><t.icon size={15} /> {t.label}</div>
                <div className="mt-1 text-2xl font-bold">{typeof t.value === 'number' ? t.value.toLocaleString('ru-RU') : t.value}</div>
                {t.hint && <div className="mt-1 text-xs text-slate-500">{t.hint}</div>}
              </Card>
            ))}
      </div>
      {m.isError && <p className="mt-4 text-red-400">Не удалось загрузить метрики.</p>}
    </>
  );
}
