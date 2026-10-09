// Общий фильтр периода для всех отчётов. Синхронизирован с URL (query params),
// чтобы ссылкой на конкретный разрез можно было поделиться.
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface PeriodValue {
  date_from: string; // YYYY-MM-DD
  date_to: string;   // YYYY-MM-DD
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function presetRange(preset: string): PeriodValue | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'this-month':
      return { date_from: iso(new Date(y, m, 1)), date_to: iso(new Date(y, m + 1, 0)) };
    case 'prev-month':
      return { date_from: iso(new Date(y, m - 1, 1)), date_to: iso(new Date(y, m, 0)) };
    case 'last-7': {
      const to = new Date();
      const from = new Date(to.getTime() - 6 * 86400_000);
      return { date_from: iso(from), date_to: iso(to) };
    }
    case 'last-90': {
      const to = new Date();
      const from = new Date(to.getTime() - 89 * 86400_000);
      return { date_from: iso(from), date_to: iso(to) };
    }
    case 'this-year':
      return { date_from: iso(new Date(y, 0, 1)), date_to: iso(new Date(y, 11, 31)) };
    default:
      return null;
  }
}

const PRESETS = [
  ['last-7', '7 дней'],
  ['this-month', 'Этот месяц'],
  ['prev-month', 'Прошлый месяц'],
  ['last-90', 'Квартал'],
  ['this-year', 'Этот год'],
] as const;

export default function PeriodFilter({ onChange }: { onChange: (p: PeriodValue) => void }) {
  const [sp, setSp] = useSearchParams();
  const value = useMemo<PeriodValue>(
    () => ({
      date_from: sp.get('date_from') ?? presetRange('this-month')!.date_from,
      date_to: sp.get('date_to') ?? presetRange('this-month')!.date_to,
    }),
    [sp],
  );

  // нормализуем дефолт в URL при первом рендере
  useEffect(() => {
    if (!sp.get('date_from') || !sp.get('date_to')) {
      const n = new URLSearchParams(sp);
      n.set('date_from', value.date_from);
      n.set('date_to', value.date_to);
      setSp(n, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (v: PeriodValue) => {
    const n = new URLSearchParams(sp);
    n.set('date_from', v.date_from);
    n.set('date_to', v.date_to);
    n.delete('preset');
    setSp(n, { replace: true });
    onChange(v);
  };

  const activePreset = sp.get('preset');

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {PRESETS.map(([key, label]) => (
        <button
          key={key}
          onClick={() => {
            const p = presetRange(key)!;
            const n = new URLSearchParams(sp);
            n.set('date_from', p.date_from);
            n.set('date_to', p.date_to);
            n.set('preset', key);
            setSp(n, { replace: true });
            onChange(p);
          }}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            activePreset === key
              ? 'bg-indigo-600 text-white'
              : 'border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
          }`}
        >
          {label}
        </button>
      ))}
      <span className="ml-1 flex items-center gap-1 text-sm">
        <input
          type="date"
          value={value.date_from}
          max={value.date_to}
          onChange={(e) => apply({ ...value, date_from: e.target.value })}
          className="rounded-lg border px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          aria-label="Дата начала"
        />
        <span className="text-slate-400">—</span>
        <input
          type="date"
          value={value.date_to}
          min={value.date_from}
          onChange={(e) => apply({ ...value, date_to: e.target.value })}
          className="rounded-lg border px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          aria-label="Дата окончания"
        />
      </span>
    </div>
  );
}
