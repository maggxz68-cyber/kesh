// Категории: иерархия, системные (read-only) и пользовательские, цвета/иконки.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Lock, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { PageTitle } from '../components/Layout';
import { Button, Card, Input, Modal, Skeleton, Badge } from '../components/ui';
import type { Category } from './TransactionsPage';

export default function CategoriesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories') });
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', kind: 'expense', color: '#6366f1', parent_id: '' });

  const save = useMutation({
    mutationFn: () =>
      edit
        ? api.patch(`/categories/${edit.id}`, { name: form.name, color: form.color })
        : api.post('/categories', { name: form.name, kind: form.kind, color: form.color, parent_id: form.parent_id || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setModal(false); setEdit(null); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  const renderGroup = (kind: 'income' | 'expense') => {
    const all = (list.data ?? []).filter((c) => c.kind === kind);
    const roots = all.filter((c) => !c.parent_id);
    const childrenOf = (id: string) => all.filter((c) => c.parent_id === id);
    const row = (c: Category, depth = 0) => (
      <div key={c.id} className="flex items-center gap-2 py-1.5" style={{ paddingLeft: depth * 20 }}>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? '#94a3b8' }} />
        <span className="flex-1 truncate text-sm">{c.name}</span>
        {c.is_system ? (
          <Badge><Lock size={10} className="mr-1 inline" />системная</Badge>
        ) : (
          <>
            <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setEdit(c); setForm({ name: c.name, kind: c.kind, color: c.color ?? '#6366f1', parent_id: '' }); setModal(true); }}>
              <Pencil size={13} />
            </button>
            <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800" onClick={() => del.mutate(c.id)}>
              <Trash2 size={13} />
            </button>
          </>
        )}
        {depth === 0 && childrenOf(c.id).map((ch) => row(ch, 1))}
      </div>
    );
    if (list.isLoading) return <Skeleton className="m-3 h-40" />;
    return <div className="p-3">{roots.map((c) => row(c))}</div>;
  };

  return (
    <>
      <PageTitle
        title="Категории"
        actions={
          <Button onClick={() => { setEdit(null); setForm({ name: '', kind: 'expense', color: '#6366f1', parent_id: '' }); setModal(true); }}>
            <Plus size={16} /> Категория
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="border-b p-3 font-semibold text-red-600 dark:border-slate-800">Расходы</h3>
          {renderGroup('expense')}
        </Card>
        <Card>
          <h3 className="border-b p-3 font-semibold text-emerald-600 dark:border-slate-800">Доходы</h3>
          {renderGroup('income')}
        </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={edit ? 'Редактировать категорию' : 'Новая категория'}>
        <div className="space-y-3">
          <Input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {!edit && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(['expense', 'income'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })}
                    className={`h-10 rounded-lg font-medium ${form.kind === k ? (k === 'expense' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white') : 'border border-slate-300 dark:border-slate-700'}`}>
                    {k === 'expense' ? 'Расход' : 'Доход'}
                  </button>
                ))}
              </div>
              <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
                <option value="">Без родительской</option>
                {(list.data ?? []).filter((c) => c.kind === form.kind && !c.parent_id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </>
          )}
          <div className="flex items-center gap-2">
            <label className="text-sm">Цвет:</label>
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-14 cursor-pointer rounded" />
            <span className="text-xs text-slate-500">{form.color}</span>
          </div>
          {save.error && <p className="text-sm text-red-600">{String((save.error as Error).message)}</p>}
          <Button className="w-full" disabled={!form.name || save.isPending} onClick={() => save.mutate()}>Сохранить</Button>
        </div>
      </Modal>
    </>
  );
}
