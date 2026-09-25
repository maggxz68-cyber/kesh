import React, { useState, useMemo } from 'react';
import { useStore, formatCurrency } from '../store';
import { BudgetPeriod, BudgetType, BudgetScope, Currency, TransactionType } from '../types';
import { Plus, Trash2, Edit3, Save, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export default function Budgets() {
  const { budgets, categories, getBudgetProgress, addBudget, updateBudget, deleteBudget } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', categoryId: '' as string | null, amount: 0, currency: Currency.RUB,
    period: BudgetPeriod.MONTH, type: BudgetType.HARD, scope: BudgetScope.FAMILY,
    alertAt80: true, alertAt100: true,
  });

  const progress = useMemo(() => getBudgetProgress(), [budgets, categories]);

  const expenseCategories = categories.filter(c => c.type === TransactionType.EXPENSE);

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    if (editingId) {
      updateBudget(editingId, { ...form, categoryId: form.categoryId || null });
      setEditingId(null);
    } else {
      addBudget({ ...form, categoryId: form.categoryId || null, startDate, userId: null, isActive: true });
    }
    setForm({ name: '', categoryId: null, amount: 0, currency: Currency.RUB, period: BudgetPeriod.MONTH, type: BudgetType.HARD, scope: BudgetScope.FAMILY, alertAt80: true, alertAt100: true });
    setShowForm(false);
  };

  const startEdit = (id: string) => {
    const b = budgets.find(x => x.id === id);
    if (!b) return;
    setForm({ name: b.name, categoryId: b.categoryId, amount: b.amount, currency: b.currency, period: b.period, type: b.type, scope: b.scope, alertAt80: b.alertAt80, alertAt100: b.alertAt100 });
    setEditingId(id);
    setShowForm(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <CheckCircle size={16} className="text-green-500" />;
      case 'warning': return <AlertTriangle size={16} className="text-yellow-500" />;
      case 'exceeded': return <XCircle size={16} className="text-red-500" />;
      default: return null;
    }
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'ok': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'exceeded': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const totalPlanned = progress.reduce((s, p) => s + p.planned, 0);
  const totalActual = progress.reduce((s, p) => s + p.actual, 0);
  const alerts = progress.filter(p => p.status !== 'ok');

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Бюджеты</h2>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', categoryId: null, amount: 0, currency: Currency.RUB, period: BudgetPeriod.MONTH, type: BudgetType.HARD, scope: BudgetScope.FAMILY, alertAt80: true, alertAt100: true }); }}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700"
        >
          <Plus size={16} /> Новый бюджет
        </button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <h3 className="font-semibold text-yellow-700 dark:text-yellow-300 flex items-center gap-2 mb-2">
            <AlertTriangle size={18} /> Предупреждения по бюджетам
          </h3>
          <div className="space-y-1">
            {alerts.map(a => (
              <p key={a.budgetId} className="text-sm text-yellow-700 dark:text-yellow-300">
                ⚠️ {a.budgetName}: {a.percentage.toFixed(0)}% использовано ({formatCurrency(a.actual)} из {formatCurrency(a.planned)})
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500">Всего запланировано</p>
          <p className="text-xl font-bold">{formatCurrency(totalPlanned)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500">Потрачено</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(totalActual)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500">Остаток</p>
          <p className={`text-xl font-bold ${totalPlanned - totalActual >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(totalPlanned - totalActual)}
          </p>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-4">
          <h3 className="font-semibold">{editingId ? 'Редактировать бюджет' : 'Новый бюджет'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Название *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" placeholder="Например: Продукты" />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Категория</label>
              <select value={form.categoryId || ''} onChange={e => setForm({ ...form, categoryId: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <option value="">Без категории (общий)</option>
                {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Сумма лимита</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Валюта</label>
              <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value as Currency })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <option value={Currency.RUB}>RUB ₽</option>
                <option value={Currency.USD}>USD $</option>
                <option value={Currency.EUR}>EUR €</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Период</label>
              <select value={form.period} onChange={e => setForm({ ...form, period: e.target.value as BudgetPeriod })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <option value={BudgetPeriod.WEEK}>Неделя</option>
                <option value={BudgetPeriod.MONTH}>Месяц</option>
                <option value={BudgetPeriod.YEAR}>Год</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Тип</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as BudgetType })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <option value={BudgetType.HARD}>Жёсткий (HARD)</option>
                <option value={BudgetType.SOFT}>Мягкий (SOFT)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Область</label>
              <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value as BudgetScope })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <option value={BudgetScope.FAMILY}>Семейный</option>
                <option value={BudgetScope.PERSONAL}>Личный</option>
              </select>
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.alertAt80} onChange={e => setForm({ ...form, alertAt80: e.target.checked })} />
              Алерт при 80%
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.alertAt100} onChange={e => setForm({ ...form, alertAt100: e.target.checked })} />
              Алерт при 100%
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700">
              <Save size={14} /> {editingId ? 'Сохранить' : 'Создать'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">Отмена</button>
          </div>
        </div>
      )}

      {/* Budget progress list */}
      <div className="space-y-3">
        {progress.map(p => (
          <div key={p.budgetId} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                {getStatusIcon(p.status)}
                <div>
                  <p className="font-semibold text-sm">{p.budgetName}</p>
                  <p className="text-xs text-gray-500">{p.categoryName} · {p.status === 'ok' ? 'В норме' : p.status === 'warning' ? 'Внимание' : 'Превышен'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{p.percentage.toFixed(0)}%</span>
                <button onClick={() => startEdit(p.budgetId)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><Edit3 size={14} /></button>
                <button onClick={() => { if (confirm('Удалить бюджет?')) deleteBudget(p.budgetId); }} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
              <div className={`h-3 rounded-full transition-all ${getProgressColor(p.status)}`} style={{ width: `${Math.min(p.percentage, 100)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Потрачено: {formatCurrency(p.actual, p.currency)}</span>
              <span>Лимит: {formatCurrency(p.planned, p.currency)}</span>
              <span className={p.remaining >= 0 ? 'text-green-600' : 'text-red-600'}>
                Остаток: {formatCurrency(p.remaining, p.currency)}
              </span>
            </div>
          </div>
        ))}
        {progress.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>Нет активных бюджетов</p>
            <p className="text-sm mt-1">Создайте бюджет для контроля расходов</p>
          </div>
        )}
      </div>
    </div>
  );
}
