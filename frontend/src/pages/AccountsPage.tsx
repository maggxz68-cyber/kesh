// Счета: список с балансами, создание/редактирование/архив, переводы между счетами.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet, Banknote, CreditCard, Landmark, CreditCard as CreditIcon, ArrowLeftRight, Archive } from 'lucide-react';
import { api } from '../api/client';
import { PageTitle } from '../components/Layout';
import { Button, Card, Input, Modal, Skeleton, fmtMoney } from '../components/ui';
import type { Account } from './TransactionsPage';

const TYPE_META: Record<string, { label: string; icon: typeof Wallet }> = {
  cash: { label: 'Наличные', icon: Banknote },
  card: { label: 'Карта', icon: CreditCard },
  bank: { label: 'Банковский счёт', icon: Landmark },
  credit: { label: 'Кредит', icon: CreditIcon },
};

export default function AccountsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Account[]>('/accounts') });
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Account | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'card', currency: 'RUB', initial_balance: '0' });
  const [tr, setTr] = useState({ from_account_id: '', to_account_id: '', amount: '', comment: '' });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  };

  const save = useMutation({
    mutationFn: () =>
      edit
        ? api.patch(`/accounts/${edit.id}`, { name: form.name, archived: false })
        : api.post('/accounts', { ...form, initial_balance: Number(form.initial_balance) }),
    onSuccess: () => { invalidate(); setModal(false); setEdit(null); },
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.patch(`/accounts/${id}`, { archived: true }),
    onSuccess: invalidate,
  });

  const transfer = useMutation({
    mutationFn: () => api.post('/transfers', { ...tr, amount: Number(tr.amount) }),
    onSuccess: () => { invalidate(); setTransferOpen(false); setTr({ from_account_id: '', to_account_id: '', amount: '', comment: '' }); },
  });

  const total = (list.data ?? []).filter((a) => !a.archived).reduce((s, a) => s + Number(a.balance), 0);

  return (
    <>
      <PageTitle
        title="Счета"
        actions={
          <>
            <Button variant="outline" onClick={() => setTransferOpen(true)}><ArrowLeftRight size={16} /> Перевод</Button>
            <Button onClick={() => { setEdit(null); setForm({ name: '', type: 'card', currency: 'RUB', initial_balance: '0' }); setModal(true); }}>
              <Plus size={16} /> Счёт
            </Button>
          </>
        }
      />
      <p className="mb-3 text-sm text-slate-500">Итого по всем счетам: <b className="text-base text-slate-900 dark:text-white">{fmtMoney(total)}</b></p>

      {list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(list.data ?? []).map((a) => {
            const meta = TYPE_META[a.type] ?? { label: a.type, icon: Wallet };
            return (
              <Card key={a.id} className={`p-4 ${a.archived ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <span className="rounded-lg bg-indigo-100 p-2 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                    <meta.icon size={18} />
                  </span>
                  <div className="flex gap-1">
                    <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setEdit(a); setForm({ name: a.name, type: a.type, currency: a.currency, initial_balance: '0' }); setModal(true); }}>✎</button>
                    {!a.archived && (
                      <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" title="В архив" onClick={() => archive.mutate(a.id)}>
                        <Archive size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 truncate font-medium">{a.name}</div>
                <div className="text-xs text-slate-500">{meta.label} · {a.currency}{a.archived ? ' · архив' : ''}</div>
                <div className={`mt-1 text-xl font-bold ${Number(a.balance) < 0 ? 'text-red-600' : ''}`}>{fmtMoney(Number(a.balance), a.currency)}</div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={edit ? 'Редактировать счёт' : 'Новый счёт'}>
        <div className="space-y-3">
          <Input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {!edit && (
            <>
              <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <Input type="number" placeholder="Начальный баланс" value={form.initial_balance}
                onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} />
            </>
          )}
          {save.error && <p className="text-sm text-red-600">{String((save.error as Error).message)}</p>}
          <Button className="w-full" onClick={() => save.mutate()} disabled={!form.name || save.isPending}>Сохранить</Button>
        </div>
      </Modal>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Перевод между счетами">
        <div className="space-y-3">
          <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={tr.from_account_id} onChange={(e) => setTr({ ...tr, from_account_id: e.target.value })}>
            <option value="">Откуда…</option>
            {(list.data ?? []).filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name} ({fmtMoney(Number(a.balance))})</option>)}
          </select>
          <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={tr.to_account_id} onChange={(e) => setTr({ ...tr, to_account_id: e.target.value })}>
            <option value="">Куда…</option>
            {(list.data ?? []).filter((a) => !a.archived && a.id !== tr.from_account_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Input type="number" inputMode="decimal" placeholder="Сумма" value={tr.amount} onChange={(e) => setTr({ ...tr, amount: e.target.value })} />
          <Input placeholder="Комментарий" value={tr.comment} onChange={(e) => setTr({ ...tr, comment: e.target.value })} />
          {transfer.error && <p className="text-sm text-red-600">{String((transfer.error as Error).message)}</p>}
          <Button className="w-full" disabled={!tr.from_account_id || !tr.to_account_id || !Number(tr.amount) || transfer.isPending}
            onClick={() => transfer.mutate()}>
            <ArrowLeftRight size={16} /> Перевести
          </Button>
        </div>
      </Modal>
    </>
  );
}
