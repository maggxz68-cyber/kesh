// Общие UI-примитивы в духе shadcn/ui (Tailwind + cva-free).
import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, forwardRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'success';
    size?: 'sm' | 'md' | 'lg';
  }
>(({ className, variant = 'default', size = 'md', ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500',
      size === 'sm' && 'h-8 px-3 text-sm',
      size === 'md' && 'h-10 px-4 text-sm',
      size === 'lg' && 'h-14 px-6 text-base',
      variant === 'default' && 'bg-indigo-600 text-white hover:bg-indigo-700',
      variant === 'outline' &&
        'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800',
      variant === 'ghost' && 'hover:bg-slate-100 dark:hover:bg-slate-800',
      variant === 'destructive' && 'bg-red-600 text-white hover:bg-red-700',
      variant === 'success' && 'bg-emerald-600 text-white hover:bg-emerald-700',
      className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  className,
  children,
  color,
}: {
  className?: string;
  children: ReactNode;
  color?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        !color && 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        className,
      )}
      style={color ? { backgroundColor: `${color}22`, color } : undefined}
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          'relative m-2 w-full rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xl max-h-[90vh] overflow-y-auto',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200 dark:bg-slate-800', className)} />;
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: color ?? '#6366f1' }}
      />
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-500">
      {icon}
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm">{hint}</p>}
    </div>
  );
}

export const fmtMoney = (v: number, currency = 'RUB') =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v);

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
