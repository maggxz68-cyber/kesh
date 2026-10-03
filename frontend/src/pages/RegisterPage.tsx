import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { Button, Input, Card } from '../components/ui';

const schema = z
  .object({
    family_name: z.string().min(2, 'Минимум 2 символа'),
    name: z.string().min(2, 'Минимум 2 символа'),
    email: z.string().email('Некорректный email'),
    password: z.string().min(6, 'Минимум 6 символов'),
    password2: z.string().min(6),
    timezone: z.string().default('Europe/Moscow'),
    currency: z.enum(['RUB', 'USD', 'EUR']).default('RUB'),
  })
  .refine((d) => d.password === d.password2, { path: ['password2'], message: 'Пароли не совпадают' });
type Form = z.infer<typeof schema>;

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const load = useAuth((s) => s.load);
  const { register, handleSubmit } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { timezone: 'Europe/Moscow', currency: 'RUB' },
  });

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    try {
      await api.post('/auth/register', {
        family_name: data.family_name,
        name: data.name,
        email: data.email,
        password: data.password,
        timezone: data.timezone,
        currency: data.currency,
      });
      await load();
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка регистрации');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-indigo-600">Регистрация семьи</h1>
        <p className="mt-1 text-sm text-slate-500">
          При создании семьи автоматически будут добавлены категории, теги, счёт «Наличные» и шаблоны бюджетов
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Название семьи</label>
            <Input placeholder="Семья Петровых" {...register('family_name')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Ваше имя</label>
            <Input placeholder="Пётр" {...register('name')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <Input type="email" {...register('email')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Пароль</label>
              <Input type="password" {...register('password')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Повтор</label>
              <Input type="password" {...register('password2')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Часовой пояс</label>
              <Input {...register('timezone')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Валюта</label>
              <select
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                {...register('currency')}
              >
                <option value="RUB">RUB ₽</option>
                <option value="USD">USD $</option>
                <option value="EUR">EUR €</option>
              </select>
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
          <Button type="submit" className="w-full">
            <UserPlus size={16} /> Создать семью
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          Уже есть семья?{' '}
          <Link to="/login" className="text-indigo-600 hover:underline">
            Войти
          </Link>
        </p>
      </Card>
    </div>
  );
}
