// Аудит-логи: действия супер-админа, impersonate, блокировки/удаления.
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Card, Skeleton } from '../../components/ui';

interface LogItem { id: number; ts: string; action: string; actor_type: string; actor_label?: string | null; ip?: string | null; target_family_id?: string | null }

const ACTIONS = ['', 'family.block', 'family.unblock', 'family.soft_delete', 'family.hard_delete', 'impersonate.start', 'password.reset', 'login'];

export default function SuperadminLogsPage() {
  const [limit] = useState(100);
  const [action, setAction] = useState('');
  const q = useQuery({
    queryKey: ['sa-logs', action],
    queryFn: () => api.get<{ items: LogItem[]; total: number }>(`/superadmin/logs?limit=${limit}${action ? `&action=${action}` : ''}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Журнал действий</h1>
        <select value={action} onChange={(e) => setAction(e.target.value)}
          className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm">
          <option value="">Все действия</option>
          {ACTIONS.filter(Boolean).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-slate-700 text-left text-slate-400">
            <tr><th className="p-3">Когда</th><th>Действие</th><th>Кто</th><th>IP</th><th>Семья</th></tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={5} className="p-4"><Skeleton className="h-24" /></td></tr>
            ) : (
              (q.data?.items ?? []).map((l) => (
                <tr key={l.id} className="border-b border-slate-800">
                  <td className="p-3 whitespace-nowrap">{new Date(l.ts).toLocaleString('ru-RU')}</td>
                  <td><code className={`rounded px-1.5 py-0.5 text-xs ${l.action.includes('delete') || l.action.includes('block') ? 'bg-red-900/40 text-red-300' : l.action.includes('impersonate') ? 'bg-amber-900/40 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>{l.action}</code></td>
                  <td>{l.actor_label ?? l.actor_type}</td>
                  <td className="text-slate-400">{l.ip ?? '—'}</td>
                  <td className="font-mono text-xs text-slate-500">{l.target_family_id ? l.target_family_id.slice(0, 8) + '…' : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!!q.data && (
          <div className="flex items-center justify-between border-t border-slate-800 p-2 text-sm text-slate-400">
            <span>показано {q.data.items.length} из {q.data.total}</span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" disabled><ChevronLeft size={14} /></Button>
              <Button size="sm" variant="ghost" disabled><ChevronRight size={14} /></Button>
            </span>
          </div>
        )}
      </Card>
    </>
  );
}
