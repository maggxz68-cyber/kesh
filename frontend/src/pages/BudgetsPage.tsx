// Бюджеты: лимиты по категориям на месяц, план/факт, прогресс-бары.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import { PageTitle } from '../components/Layout';
import { Button, Card, Input, Modal, Progress, Skeleton, fmtMoney } from '../components/ui';

interface Budget {
  id: string; category_id: string; category_name?: string | null; category_color?: string | null;
  amount: number; spent?: number; period: string; year: number; month: number;
}

export default function BudgetsPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [ym] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const list = useQuery({
    queryKey: ['budgets', ym],
    queryFn: () => api.get<Budget[]>(`/budgets?year=${ym.year}&month=${ym.month}`),
  });
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ id: string; name: string; kind: string }[]>('/categories') });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ category_id: '', amount: '' });

  const save = useMutation({
    mutationFn: () =>
      api.post('/budgets', {
        category_id: form.category_id,
        amount: Number(form.amount),
        period: 'monthly',
        year: ym.year,
        month: ym.month,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); setModal(false); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/budgets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  });

  return (
    <>
      <PageTitle
        title={`Бюджеты · ${now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`}
        actions={<Button onClick={() => setModal(true)}><Plus size={16} /> Бюджет</Button>}
      />
      {list.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (list.data ?? []).length === 0 ? (
        <Card className="p-8 text-center text-slate-500">Бюджеты ещё не заданы</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(list.data ?? []).map((b) => {
            const spent = Number(b.spent ?? 0);
            const limit = Number(b.amount);
            const pct = limit > 0 ? (spent / limit) * 100 : 0;
            const over = pct > 100;
            return (
              <Card key={b.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: b.category_color ?? '#6366f1' }} />
                    {b.category_name}
                  </div>
                  <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => del.mutate(b.id)}>удалить</button>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span>{fmtMoney(spent)} из {limit > 0 ? fmtMoney(limit) : 'без лимита'}</span>
                  <span className={over ? 'font-semibold text-red-600' : 'text-slate-500'}>{limit > 0 ? `${Math.round(pct)}%` : '—'}</span>
                </div>
                <div className="mt-2"><Progress value={pct} color={over ? '#ef4444' : (b.category_color ?? '#6366f1')} /></div>
                {over && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
                    <AlertTriangle size={12} /> Превышение на {fmtMoney(spent - limit)}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Новый бюджет">
        <div className="space-y-3">
          <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            <option value="">Категория…</option>
            {(cats.data ?? []).filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Input type="number" inputMode="decimal" placeholder="Лимит на месяц, ₽" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          {save.error && <p className="text-sm text-red-600">{String((save.error as Error).message)}</p>}
          <Button className="w-full" disabled={!form.category_id || !Number(form.amount) || save.isPending} onClick={() => save.mutate()}>
            Создать
          </Button>
        </div>
      </Modal>
    </>
  );
}
