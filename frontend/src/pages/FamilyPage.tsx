// Семья: участники, приглашения (код), вход по коду, удаление участника (owner).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Copy, Check, LogIn, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { PageTitle } from '../components/Layout';
import { Button, Card, Input, Badge, Skeleton } from '../components/ui';
import { useAuth } from '../store/auth';

interface FamilyUser { id: string; email: string; name: string; role: string; created_at?: string }
interface Invite { id: string; email: string; code: string; expires_at: string }

export default function FamilyPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [inviteForm, setInviteForm] = useState({ email: '', name: '' });
  const [joinForm, setJoinForm] = useState({ code: '', email: '', name: '', password: '' });
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<'members' | 'join'>('members');

  const me = useQuery({ queryKey: ['family-me'], queryFn: () => api.get<{ family: { name: string; currency: string }; users: FamilyUser[] }>('/families/me').catch(() => null) });
  const users = useQuery({
    queryKey: ['family-users'],
    queryFn: () => api.get<FamilyUser[]>('/families/users'),
  });
  const invites = useQuery({
    queryKey: ['family-invites'],
    queryFn: () => api.get<Invite[]>('/families/invites'),
    enabled: user?.role === 'owner',
  });

  const invite = useMutation({
    mutationFn: () => api.post<Invite>('/families/invite', inviteForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['family-invites'] }); setInviteForm({ email: '', name: '' }); },
  });
  const removeUser = useMutation({
    mutationFn: (id: string) => api.del(`/families/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family-users'] }),
  });
  const join = useMutation({
    mutationFn: () => api.post('/families/join', joinForm),
    onSuccess: async () => {
      await useAuth.getState().load();
      qc.invalidateQueries();
    },
  });

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <>
      <PageTitle title="Семья" />
      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab('members')} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'members' ? 'bg-indigo-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>Участники</button>
        {!user?.family_id && (
          <button onClick={() => setTab('join')} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'join' ? 'bg-indigo-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>Войти по коду</button>
        )}
      </div>

      {tab === 'members' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h3 className="mb-3 font-semibold">Участники {me.data?.family ? `· ${me.data.family.name}` : ''}</h3>
            {users.isLoading ? (
              <Skeleton className="h-24" />
            ) : (
              <ul className="space-y-2">
                {(users.data ?? []).map((u) => (
                  <li key={u.id} className="flex items-center gap-3 rounded-lg border p-2.5 dark:border-slate-800">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      {u.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{u.name} {u.id === user?.id && <span className="text-xs text-slate-400">(вы)</span>}</div>
                      <div className="truncate text-xs text-slate-500">{u.email}</div>
                    </div>
                    <Badge color={u.role === 'owner' ? '#6366f1' : undefined}>{u.role === 'owner' ? 'владелец' : 'участник'}</Badge>
                    {user?.role === 'owner' && u.id !== user.id && (
                      <button className="text-slate-400 hover:text-red-600" onClick={() => confirm(`Удалить ${u.name}?`) && removeUser.mutate(u.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="space-y-4">
            {user?.role === 'owner' && (
              <Card className="p-4">
                <h3 className="mb-3 font-semibold">Пригласить участника</h3>
                <div className="space-y-2">
                  <Input placeholder="Email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} />
                  <Input placeholder="Имя (необязательно)" value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} />
                  {invite.error && <p className="text-sm text-red-600">{String((invite.error as Error).message)}</p>}
                  <Button disabled={!inviteForm.email || invite.isPending} onClick={() => invite.mutate()}>
                    <UserPlus size={16} /> Создать приглашение
                  </Button>
                </div>
                {!!(invites.data ?? []).length && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {(invites.data ?? []).map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5 dark:bg-slate-800">
                        <span className="truncate">{i.email}</span>
                        <code className="shrink-0 rounded bg-white px-1.5 py-0.5 text-xs dark:bg-slate-900">{i.code}</code>
                        <button onClick={() => copy(i.code)} className="text-slate-400 hover:text-indigo-600">
                          {copied === i.code ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </div>
      ) : (
        <Card className="max-w-md space-y-3 p-4">
          <h3 className="font-semibold">Присоединиться к семье по коду приглашения</h3>
          <Input placeholder="Код приглашения" value={joinForm.code} onChange={(e) => setJoinForm({ ...joinForm, code: e.target.value })} />
          <Input placeholder="Email" value={joinForm.email} onChange={(e) => setJoinForm({ ...joinForm, email: e.target.value })} />
          <Input placeholder="Имя" value={joinForm.name} onChange={(e) => setJoinForm({ ...joinForm, name: e.target.value })} />
          <Input type="password" placeholder="Пароль (мин. 6 символов)" value={joinForm.password} onChange={(e) => setJoinForm({ ...joinForm, password: e.target.value })} />
          {join.error && <p className="text-sm text-red-600">{String((join.error as Error).message)}</p>}
          <Button className="w-full" disabled={!joinForm.code || !joinForm.email || join.isPending} onClick={() => join.mutate()}>
            <LogIn size={16} /> Присоединиться
          </Button>
        </Card>
      )}
    </>
  );
}
