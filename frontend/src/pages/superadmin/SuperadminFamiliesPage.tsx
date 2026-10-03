// Семьи: список + детали (read-only), блок/разблок, soft/hard delete, impersonate, reset password.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, Eye, Ban, Unlock, Trash2, UserCog, KeyRound, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Card, Input, Modal, Badge, Skeleton } from '../../components/ui';

interface Family {
  id: string; name: string; registered_at: string; timezone: string; currency: string;
  is_blocked: boolean; blocked_reason?: string | null; deleted_at?: string | null;
  is_demo: boolean; is_sandbox: boolean; users_count: number; transactions_count: number;
}
interface FamilyList { items: Family[]; total: number; page: number; page_size: number }
interface Detail {
  family: Family;
  users: { id: string; email: string; name: string; role: string; is_active: boolean }[];
  accounts: { id: string; name: string; type: string; balance: number }[];
  recent_transactions: { id: string; amount: number; type: string; occurred_at: string; comment?: string | null }[];
  receipts: { id: string; store_name?: string | null; total_amount?: number | null }[];
}

export default function SuperadminFamiliesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<{ userId: string; name: string } | null>(null);
  const [newPass, setNewPass] = useState('');

  const list = useQuery({
    queryKey: ['sa-families', page, search],
    queryFn: () => api.get<FamilyList>(`/superadmin/families?page=${page}&page_size=20${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const detail = useQuery({
    queryKey: ['sa-family', detailId],
    queryFn: () => api.get<Detail>(`/superadmin/families/${detailId}`),
    enabled: !!detailId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['sa-families'] });
  const block = useMutation({
    mutationFn: ({ id, blocked, reason }: { id: string; blocked: boolean; reason?: string }) =>
      api.patch(`/superadmin/families/${id}`, { is_blocked: blocked, reason: reason ?? null }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, hard }: { id: string; hard: boolean }) =>
      api.del(`/superadmin/families/${id}${hard ? '?hard=true' : ''}`),
    onSuccess: () => { invalidate(); setDetailId(null); },
  });
  const impersonate = useMutation({
    mutationFn: ({ fid, uid }: { fid: string; uid: string }) =>
      api.post<{ access_token: string }>(`/superadmin/families/${fid}/impersonate/${uid}`),
    onSuccess: (r) => {
      // токен в memory-хранилище не держим — backend сам выставил cookie; перезагружаем приложение
      window.open('/', '_blank');
      void r;
    },
  });
  const resetPass = useMutation({
    mutationFn: () => api.post(`/superadmin/users/${resetFor!.userId}/reset-password`, { new_password: newPass, force_change: true }),
    onSuccess: () => { setResetFor(null); setNewPass(''); alert('Пароль сброшен'); },
  });

  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Семьи</h1>
      <div className="relative mb-3 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input className="pl-8" placeholder="Поиск по названию…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-700 text-left text-slate-400">
            <tr>
              <th className="p-3">Название</th><th>Регистрация</th><th>Юзеры</th><th>Транзакции</th>
              <th>Статус</th><th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr><td colSpan={6} className="p-4"><Skeleton className="h-24" /></td></tr>
            ) : (
              (list.data?.items ?? []).map((f) => (
                <tr key={f.id} className={`border-b border-slate-800 ${f.deleted_at ? 'opacity-40' : ''}`}>
                  <td className="p-3 font-medium">
                    {f.name}
                    {f.is_demo && <Badge color="#f59e0b" className="ml-2">демо{f.is_sandbox ? '/sandbox' : ''}</Badge>}
                  </td>
                  <td>{new Date(f.registered_at).toLocaleDateString('ru-RU')}</td>
                  <td>{f.users_count}</td>
                  <td>{f.transactions_count}</td>
                  <td>
                    {f.deleted_at ? <Badge color="#64748b">удалена</Badge>
                      : f.is_blocked ? <Badge color="#ef4444">заблокирована</Badge>
                      : <Badge color="#10b981">активна</Badge>}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button title="Детали" onClick={() => setDetailId(f.id)} className="rounded p-1.5 hover:bg-slate-800"><Eye size={15} /></button>
                      <button title={f.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                        onClick={() => {
                          if (!f.is_blocked) {
                            const reason = prompt('Причина блокировки?') ?? null;
                            block.mutate({ id: f.id, blocked: true, reason: reason ?? undefined });
                          } else block.mutate({ id: f.id, blocked: false });
                        }}
                        className="rounded p-1.5 hover:bg-slate-800">
                        {f.is_blocked ? <Unlock size={15} className="text-emerald-400" /> : <Ban size={15} className="text-amber-400" />}
                      </button>
                      <button title="Удалить (soft)" onClick={() => confirm(`Soft-delete семьи «${f.name}»?`) && remove.mutate({ id: f.id, hard: false })}
                        className="rounded p-1.5 hover:bg-slate-800"><Trash2 size={15} className="text-red-400" /></button>
                      <button title="Hard delete (безвозвратно)"
                        onClick={() => confirm(`HARD DELETE семьи «${f.name}» со ВСЕМИ данными и файлами чеков?!`) && remove.mutate({ id: f.id, hard: true })}
                        className="rounded p-1.5 text-xs text-red-500 hover:bg-slate-800">!!</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!!list.data && (
          <div className="flex items-center justify-between border-t border-slate-800 p-2 text-sm text-slate-400">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
            <span>{list.data.total} семей · стр. {list.data.page}</span>
            <Button size="sm" variant="ghost" disabled={page * 20 >= list.data.total} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
          </div>
        )}
      </Card>

      {/* Детали семьи */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={detail.data?.family.name ?? 'Семья'} wide>
        {!detail.data ? <Skeleton className="h-40" /> : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><div className="text-slate-400">Валюта</div>{detail.data.family.currency}</div>
              <div><div className="text-slate-400">TZ</div>{detail.data.family.timezone}</div>
              <div><div className="text-slate-400">Счетов</div>{detail.data.accounts.length}</div>
              <div><div className="text-slate-400">Чеков</div>{detail.data.receipts.length}</div>
            </div>
            <div>
              <h4 className="mb-1 font-semibold">Пользователи</h4>
              <ul className="space-y-1">
                {detail.data.users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between rounded bg-slate-100 px-2 py-1.5 dark:bg-slate-800">
                    <span>{u.name} <span className="text-slate-400">({u.email})</span> · {u.role}{!u.is_active ? ' · неактивен' : ''}</span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => impersonate.mutate({ fid: detail.data!.family.id, uid: u.id })}>
                        <UserCog size={13} /> Зайти как
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setResetFor({ userId: u.id, name: u.name })}>
                        <KeyRound size={13} /> Сброс пароля
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-1 font-semibold">Счета (read-only)</h4>
              <ul className="list-inside list-disc text-slate-300">
                {detail.data.accounts.map((a) => <li key={a.id}>{a.name} ({a.type}): {Number(a.balance).toLocaleString('ru-RU')}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="mb-1 font-semibold">Последние транзакции</h4>
              <ul className="space-y-0.5 text-slate-300">
                {detail.data.recent_transactions.slice(0, 10).map((t) => (
                  <li key={t.id} className="flex justify-between border-b border-slate-800 py-1">
                    <span>{new Date(t.occurred_at).toLocaleDateString('ru-RU')} · {t.comment ?? t.type}</span>
                    <span className={t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}>{t.type === 'income' ? '+' : '−'}{Number(t.amount).toLocaleString('ru-RU')}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>

      {/* Reset password */}
      <Modal open={!!resetFor} onClose={() => setResetFor(null)} title={`Новый пароль: ${resetFor?.name}`}>
        <div className="space-y-3">
          <Input type="text" placeholder="Мин. 8 символов" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          {resetPass.error && <p className="text-sm text-red-400">{String((resetPass.error as Error).message)}</p>}
          <Button variant="destructive" className="w-full" disabled={newPass.length < 8 || resetPass.isPending} onClick={() => resetPass.mutate()}>
            Сбросить (с принудительной сменой при входе)
          </Button>
        </div>
      </Modal>
    </>
  );
}
