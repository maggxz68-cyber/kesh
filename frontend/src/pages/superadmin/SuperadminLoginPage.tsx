import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Input, Card } from '../../components/ui';

export default function SuperadminLoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/superadmin/login', { login, password });
      navigate('/superadmin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <Card className="w-full max-w-sm border-slate-700 bg-slate-800 p-6 text-slate-100 sm:p-8">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-red-400" />
          <h1 className="text-xl font-bold">Панель платформы</h1>
        </div>
        <p className="mt-1 text-sm text-slate-400">Вход супер-администратора</p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <Input
            placeholder="Логин"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            className="border-slate-600 bg-slate-700 text-slate-100"
          />
          <Input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-slate-600 bg-slate-700 text-slate-100"
          />
          {error && <p className="rounded-lg bg-red-900/40 p-2 text-sm text-red-300">{error}</p>}
          <Button type="submit" variant="destructive" className="w-full">
            Войти
          </Button>
        </form>
        <p className="mt-4 text-center text-xs">
          <Link to="/login" className="text-slate-400 hover:underline">
            ← Вернуться в приложение
          </Link>
        </p>
      </Card>
    </div>
  );
}
