import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sparkles, LogIn } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { Button, Input, Card } from '../components/ui';

const schema = z.object({
  // Принимаем любую непустую строку: вход может быть по email ИЛИ по логину (admin).
  // Жёсткая проверка на "@" блокировала браузерную/zod-валидацию — убрана.
  email: z.string().min(1, 'Введите email или логин'),
  password: z.string().min(1, 'Введите пароль'),
});
type Form = z.infer<typeof schema>;

// Понятные сообщения об ошибках демо-входа вместо «ничего не происходит»
function demoErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'status' in e) {
    const st = (e as { status: number }).status;
    if (st === 404) return 'Демо-режим отключён на сервере (DEMO_MODE=false)';
    if (st === 429) return 'Слишком много попыток — подождите минуту и повторите';
    if (st >= 500) return 'Ошибка сервера при создании демо-песочницы. Попробуйте позже';
  }
  if (e instanceof TypeError) return 'Сервер недоступен. Проверьте подключение и обновите страницу';
  return e instanceof Error ? e.message : 'Не удалось войти в демо';
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const navigate = useNavigate();
  const load = useAuth((s) => s.load);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    try {
      await api.post('/auth/login', data);
      await load();
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка входа');
    }
  });

  const demoLogin = async () => {
    setDemoLoading(true);
    setError(null);
    try {
      await api.post('/auth/demo-login');
      await load();
      navigate('/');
    } catch (e) {
      setError(demoErrorMessage(e));
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-indigo-600">ФинСемья</h1>
        <p className="mt-1 text-sm text-slate-500">Учёт семейных доходов и расходов</p>

        <Button
          size="lg"
          variant="success"
          className="mt-6 w-full"
          onClick={demoLogin}
          disabled={demoLoading}
        >
          <Sparkles size={18} />
          {demoLoading ? 'Создаём песочницу…' : 'Войти в демо-семью без пароля'}
        </Button>
        <p className="mt-1 text-center text-xs text-slate-400">
          Семья Ивановых: 3 месяца данных, чеки, бюджеты — персональная копия на 24 часа
        </p>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          или войдите в свою семью
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Email или логин</label>
            <Input type="text" inputMode="email" autoComplete="username" placeholder="you@example.com" {...register('email')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Пароль</label>
            <Input type="password" autoComplete="current-password" {...register('password')} />
          </div>
          {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            <LogIn size={16} /> Войти
          </Button>
        </form>

        <div className="mt-4 flex justify-between text-sm">
          <Link to="/register" className="text-indigo-600 hover:underline">
            Создать семью
          </Link>
          <Link to="/forgot-password" className="text-slate-500 hover:underline">
            Забыли пароль?
          </Link>
        </div>
        <div className="mt-2 text-right text-xs">
          <Link to="/superadmin/login" className="text-slate-400 hover:underline">
            Вход для администратора платформы
          </Link>
        </div>
      </Card>
    </div>
  );
}
