// Системные категории шаблона: CRUD (влияет на новые семьи).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Card, Input, Modal, Badge, Skeleton } from '../../components/ui';

interface SysCat { id: string; name: string; kind: string; icon: string | null; color: string | null; parent_id: string | null; is_system: boolean }

export default function SuperadminCategoriesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['sa-cats'], queryFn: () => api.get<SysCat[]>('/superadmin/system-categories') });
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<SysCat | null>(null);
  const [form, setForm] = useState({ name: '', kind: 'expense', color: '#6366f1', icon: '' });

  const save = useMutation({
    mutationFn: () =>
      edit
        ? api.patch(`/superadmin/system-categories/${edit.id}`, { name: form.name, color: form.color, icon: form.icon || null })
        : api.post('/superadmin/system-categories', { name: form.name, kind: form.kind, color: form.color, icon: form.icon || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-cats'] }); setModal(false); setEdit(null); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/superadmin/system-categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sa-cats'] }),
  });

  const renderKind = (kind: 'income' | 'expense') => (
    <Card className="p-3">
      <h3 className={`mb-2 font-semibold ${kind === 'expense' ? 'text-red-400' : 'text-emerald-400'}`}>{kind === 'expense' ? 'Расходы' : 'Доходы'}</h3>
      {list.isLoading ? <Skeleton className="h-32" /> : (
        <ul className="space-y-1 text-sm">
          {(list.data ?? []).filter((c) => c.kind === kind && !c.parent_id).map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-800">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color ?? '#64748b' }} />
              <span className="flex-1 truncate">{c.name}</span>
              {c.icon && <span className="text-xs text-slate-500">{c.icon}</span>}
              <button onClick={() => { setEdit(c); setForm({ name: c.name, kind: c.kind, color: c.color ?? '#6366f1', icon: c.icon ?? '' }); setModal(true); }}>
                <Pencil size={13} className="text-slate-400" />
              </button>
              <button onClick={() => confirm(`Удалить системную категорию «${c.name}»? Новые семьи не получат её.`) && del.mutate(c.id)}>
                <Trash2 size={13} className="text-red-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Системные категории</h1>
        <Button variant="destructive" onClick={() => { setEdit(null); setForm({ name: '', kind: 'expense', color: '#6366f1', icon: '' }); setModal(true); }}>
          <Plus size={16} /> Добавить
        </Button>
      </div>
      <p className="mb-3 text-sm text-slate-400">Эти категории копируются в каждую новую семью как шаблон.</p>
      <div className="grid gap-4 lg:grid-cols-2">{renderKind('expense')}{renderKind('income')}</div>

      <Modal open={modal} onClose={() => setModal(false)} title={edit ? 'Правка категории' : 'Новая системная категория'}>
        <div className="space-y-3">
          <Input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {!edit && (
            <div className="flex gap-2">
              {(['expense', 'income'] as const).map((k) => (
                <button key={k} onClick={() => setForm({ ...form, kind: k })}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${form.kind === k ? (k === 'expense' ? 'bg-red-600' : 'bg-emerald-600') : 'border border-slate-600'} text-white`}>
                  {k === 'expense' ? 'Расход' : 'Доход'}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-14 rounded" />
            <Input placeholder="Иконка (emoji)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} className="flex-1" />
          </div>
          {save.error && <p className="text-sm text-red-400">{String((save.error as Error).message)}</p>}
          <Button className="w-full" disabled={!form.name || save.isPending} onClick={() => save.mutate()}>Сохранить</Button>
          {edit && <Badge>правка затронет только шаблон для новых семей</Badge>}
        </div>
      </Modal>
    </>
  );
}
