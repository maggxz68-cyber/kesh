// Пользователи: поиск, список, сброс пароля.
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, KeyRound } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Card, Input, Modal, Skeleton } from '../../components/ui';

interface U { id: string; email: string; name: string; role: string; is_active: boolean; last_login_at?: string | null; created_at: string }

export default function SuperadminUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [resetFor, setResetFor] = useState<U | null>(null);
  const [newPass, setNewPass] = useState('');

  const list = useQuery({
    queryKey: ['sa-users', search, page],
    queryFn: () => api.get<U[]>(`/superadmin/users?page=${page}&page_size=50${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const reset = useMutation({
    mutationFn: () => api.post(`/superadmin/users/${resetFor!.id}/reset-password`, { new_password: newPass, force_change: true }),
    onSuccess: () => { setResetFor(null); setNewPass(''); qc.invalidateQueries({ queryKey: ['sa-users'] }); alert('Пароль сброшен'); },
  });

  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Пользователи</h1>
      <div className="relative mb-3 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input className="pl-8" placeholder="Email или имя…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-slate-700 text-left text-slate-400">
            <tr><th className="p-3">Имя</th><th>Email</th><th>Роль</th><th>Активен</th><th>Последний вход</th><th /></tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr><td colSpan={6} className="p-4"><Skeleton className="h-24" /></td></tr>
            ) : (
              (list.data ?? []).map((u) => (
                <tr key={u.id} className="border-b border-slate-800">
                  <td className="p-3 font-medium">{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.is_active ? '✓' : '✗'}</td>
                  <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString('ru-RU') : '—'}</td>
                  <td className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setResetFor(u)}><KeyRound size={13} /> Сброс пароля</Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Modal open={!!resetFor} onClose={() => setResetFor(null)} title={`Новый пароль для ${resetFor?.name}`}>
        <div className="space-y-3">
          <Input value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Мин. 8 символов" />
          {reset.error && <p className="text-sm text-red-400">{String((reset.error as Error).message)}</p>}
          <Button variant="destructive" className="w-full" disabled={newPass.length < 8 || reset.isPending} onClick={() => reset.mutate()}>
            Сбросить
          </Button>
        </div>
      </Modal>
    </>
  );
}
