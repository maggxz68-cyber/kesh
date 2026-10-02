// Этап 1: заглушка, проверяющая запуск фронтенда и доступность API.
import { useEffect, useState } from 'react';

export default function App() {
  const [status, setStatus] = useState<string>('…');
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE ?? '/api'}/health`)
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus('API недоступен'));
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="rounded-xl border p-8 text-center shadow-sm bg-white dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Семейные финансы</h1>
        <p className="mt-2 text-slate-500">Каркас собран. Страницы появятся на этапе 7.</p>
        <p className="mt-4 text-sm">Статус API: <b>{status}</b></p>
      </div>
    </div>
  );
}
