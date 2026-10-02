// Настройки: смена пароля, тема, информация о семье.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Moon, Sun } from 'lucide-react';
import { api } from '../api/client';
import { PageTitle } from '../components/Layout';
import { Button, Card, Input } from '../components/ui';
import { useAuth } from '../store/auth';
import { useTheme } from '../hooks/useTheme';

const schema = z
  .object({
    old_password: z.string().min(1, 'Введите текущий пароль'),
    new_password: z.string().min(6, 'Минимум 6 символов'),
    repeat: z.string(),
  })
  .refine((d) => d.new_password === d.repeat, { path: ['repeat'], message: 'Пароли не совпадают' });
type Form = z.infer<typeof schema>;

export default function SettingsPage() {
  const user = useAuth((s) => s.user);
  const [theme, toggleTheme] = useTheme();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  const submit = handleSubmit(async (v) => {
    setMsg(null);
    try {
      await api.post('/auth/change-password', { old_password: v.old_password, new_password: v.new_password });
      setMsg({ ok: true, text: 'Пароль изменён' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Ошибка' });
    }
  });

  return (
    <>
      <PageTitle title="Настройки" />
      <div className="grid max-w-3xl gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 font-semibold">Аккаунт</h3>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Имя</dt><dd className="font-medium">{user?.name}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd className="font-medium">{user?.email}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Роль</dt><dd>{user?.role === 'owner' ? 'владелец семьи' : 'участник'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Семья</dt><dd>{user?.family_name}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Демо-режим</dt><dd>{user?.is_demo ? 'да (песочница)' : 'нет'}</dd></div>
          </dl>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 font-semibold">Интерфейс</h3>
          <Button variant="outline" onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            Тема: {theme === 'light' ? 'светлая' : 'тёмная'} — переключить
          </Button>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><KeyRound size={16} /> Смена пароля</h3>
          <form onSubmit={submit} className="grid max-w-md gap-3 sm:grid-cols-3">
            <div>
              <Input type="password" placeholder="Текущий пароль" {...register('old_password')} />
              {errors.old_password && <p className="mt-1 text-xs text-red-600">{errors.old_password.message}</p>}
            </div>
            <div>
              <Input type="password" placeholder="Новый пароль" {...register('new_password')} />
              {errors.new_password && <p className="mt-1 text-xs text-red-600">{errors.new_password.message}</p>}
            </div>
            <div>
              <Input type="password" placeholder="Повтор" {...register('repeat')} />
              {errors.repeat && <p className="mt-1 text-xs text-red-600">{errors.repeat.message}</p>}
            </div>
            <div className="sm:col-span-3">
              {msg && <p className={`mb-2 text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>}
              <Button type="submit" disabled={isSubmitting}>Изменить пароль</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
