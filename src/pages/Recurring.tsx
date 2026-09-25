import React, { useState, useMemo } from 'react';
import { useStore, formatCurrency, formatDate } from '../store';
import { TransactionType, PaymentMethod, Currency, RecurFreq, RecurMode } from '../types';
import { Plus, Trash2, Edit3, Save, Play, SkipForward, Pause, Calendar, Clock, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Recurring() {
  const { recurringRules, accounts, categories, transactions, getUpcomingPayments, getForecast, addRecurringRule, updateRecurringRule, deleteRecurringRule, skipRecurringRun, generateRecurringTransaction } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rules' | 'upcoming' | 'forecast'>('rules');
  const [form, setForm] = useState({
    name: '', type: TransactionType.EXPENSE, amount: 0, currency: Currency.RUB,
    accountId: '', toAccountId: null as string | null, categoryId: null as string | null,
    paymentMethod: PaymentMethod.CASHLESS, counterparty: '', description: '',
    expectsReceipt: false, freq: RecurFreq.MONTHLY, interval: 1, byMonthDay: null as number | null,
    startDate: new Date().toISOString().split('T')[0], endDate: null as string | null,
    count: null as number | null, mode: RecurMode.AUTO, notifyDaysBefore: 1,
  });

  const upcoming = useMemo(() => getUpcomingPayments(30), [recurringRules]);
  const forecast = useMemo(() => getForecast(6), [accounts, transactions]);

  const handleSubmit = () => {
    if (!form.name.trim() || !form.accountId) return;
    const nextRun = new Date(form.startDate);
    if (form.freq === RecurFreq.MONTHLY && form.byMonthDay) {
      nextRun.setDate(form.byMonthDay);
    }
    const ruleData = {
      ...form,
      nextRunAt: nextRun.toISOString(),
      isActive: true,
      userId: '',
      skippedDates: [],
    };
    if (editingId) {
      updateRecurringRule(editingId, ruleData);
      setEditingId(null);
    } else {
      addRecurringRule(ruleData);
    }
    setForm({ name: '', type: TransactionType.EXPENSE, amount: 0, currency: Currency.RUB, accountId: '', toAccountId: null, categoryId: null, paymentMethod: PaymentMethod.CASHLESS, counterparty: '', description: '', expectsReceipt: false, freq: RecurFreq.MONTHLY, interval: 1, byMonthDay: null, startDate: new Date().toISOString().split('T')[0], endDate: null, count: null, mode: RecurMode.AUTO, notifyDaysBefore: 1 });
    setShowForm(false);
  };

  const startEdit = (id: string) => {
    const r = recurringRules.find(x => x.id === id);
    if (!r) return;
    setForm({
      name: r.name, type: r.type, amount: r.amount, currency: r.currency,
      accountId: r.accountId, toAccountId: r.toAccountId, categoryId: r.categoryId,
      paymentMethod: r.paymentMethod, counterparty: r.counterparty, description: r.description,
      expectsReceipt: r.expectsReceipt, freq: r.freq, interval: r.interval, byMonthDay: r.byMonthDay,
      startDate: r.startDate.split('T')[0], endDate: r.endDate ? r.endDate.split('T')[0] : null,
      count: r.count, mode: r.mode, notifyDaysBefore: r.notifyDaysBefore,
    });
    setEditingId(id);
    setShowForm(true);
  };

  const getFreqLabel = (freq: RecurFreq, interval: number) => {
    const base: Record<RecurFreq, string> = {
      [RecurFreq.DAILY]: 'дней',
      [RecurFreq.WEEKLY]: 'недель',
      [RecurFreq.MONTHLY]: 'месяцев',
      [RecurFreq.YEARLY]: 'лет',
    };
    return interval === 1 ? base[freq].slice(0, -2) || base[freq] : `каждые ${interval} ${base[freq]}`;
  };

  const getCategoryIcon = (id: string | null) => {
    const cat = categories.find(c => c.id === id);
    return cat?.icon || '💸';
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Регулярные платежи</h2>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700"
        >
          <Plus size={16} /> Новое правило
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {[
          { key: 'rules', label: 'Правила', icon: Clock },
          { key: 'upcoming', label: 'Предстоящие', icon: Calendar },
          { key: 'forecast', label: 'Прогноз', icon: AlertCircle },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-4">
          <h3 className="font-semibold">{editingId ? 'Редактировать правило' : 'Новое регулярное правило'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Название *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" placeholder="Аренда, Netflix..." />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Тип</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as TransactionType })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <option value={TransactionType.EXPENSE}>Расход</option>
                <option value={TransactionType.INCOME}>Доход</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Сумма</label>
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
              <label className="text-sm text-gray-500 mb-1 block">Счёт *</label>
              <select value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <option value="">Выберите</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Категория</label>
              <select value={form.categoryId || ''} onChange={e => setForm({ ...form, categoryId: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <option value="">Без категории</option>
                {categories.filter(c => c.type === form.type).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Частота</label>
              <select value={form.freq} onChange={e => setForm({ ...form, freq: e.target.value as RecurFreq })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <option value={RecurFreq.DAILY}>Ежедневно</option>
                <option value={RecurFreq.WEEKLY}>Еженедельно</option>
                <option value={RecurFreq.MONTHLY}>Ежемесячно</option>
                <option value={RecurFreq.YEARLY}>Ежегодно</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Интервал</label>
              <input type="number" min={1} value={form.interval} onChange={e => setForm({ ...form, interval: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
            </div>
            {form.freq === RecurFreq.MONTHLY && (
              <div>
                <label className="text-sm text-gray-500 mb-1 block">День месяца</label>
                <input type="number" min={1} max={31} value={form.byMonthDay || ''} onChange={e => setForm({ ...form, byMonthDay: parseInt(e.target.value) || null })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" placeholder="1-31" />
              </div>
            )}
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Режим</label>
              <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as RecurMode })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <option value={RecurMode.AUTO}>Авто (создавать автоматически)</option>
                <option value={RecurMode.MANUAL}>Ручной (напоминание)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Контрагент</label>
              <input type="text" value={form.counterparty} onChange={e => setForm({ ...form, counterparty: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" placeholder="Компания, человек..." />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Дата начала</label>
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700">
              <Save size={14} /> {editingId ? 'Сохранить' : 'Создать'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">Отмена</button>
          </div>
        </div>
      )}

      {/* Rules tab */}
      {activeTab === 'rules' && (
        <div className="space-y-3">
          {recurringRules.map(rule => {
            const account = accounts.find(a => a.id === rule.accountId);
            return (
              <div key={rule.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getCategoryIcon(rule.categoryId)}</span>
                    <div>
                      <p className="font-semibold">{rule.name}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${rule.mode === RecurMode.AUTO ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
                          {rule.mode === RecurMode.AUTO ? '🤖 Авто' : '👤 Ручной'}
                        </span>
                        <span className="text-xs text-gray-500">{getFreqLabel(rule.freq, rule.interval)}</span>
                        <span className="text-xs text-gray-500">→ {account?.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{formatCurrency(rule.amount, rule.currency)}</p>
                    <p className="text-xs text-gray-500">След: {formatDate(rule.nextRunAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={() => generateRecurringTransaction(rule.id)}
                    className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded flex items-center gap-1 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300">
                    <Play size={12} /> Выполнить
                  </button>
                  <button onClick={() => { skipRecurringRun(rule.id, rule.nextRunAt.split('T')[0]); }}
                    className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded flex items-center gap-1 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300">
                    <SkipForward size={12} /> Пропустить
                  </button>
                  <button onClick={() => startEdit(rule.id)} className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1">
                    <Edit3 size={12} /> Изменить
                  </button>
                  <button onClick={() => { if (confirm('Удалить правило?')) deleteRecurringRule(rule.id); }}
                    className="px-2 py-1 text-xs text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1">
                    <Trash2 size={12} /> Удалить
                  </button>
                  <button onClick={() => updateRecurringRule(rule.id, { isActive: !rule.isActive })}
                    className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${rule.isActive ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>
                    <Pause size={12} /> {rule.isActive ? 'Пауза' : 'Возобновить'}
                  </button>
                </div>
              </div>
            );
          })}
          {recurringRules.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Clock size={48} className="mx-auto mb-3 opacity-50" />
              <p>Нет регулярных правил</p>
            </div>
          )}
        </div>
      )}

      {/* Upcoming tab */}
      {activeTab === 'upcoming' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-semibold mb-3">Предстоящие платежи (30 дней)</h3>
          {upcoming.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Нет предстоящих платежей</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="flex items-center gap-3">
                    <div className="text-center min-w-[40px]">
                      <p className="text-xs text-gray-500">{new Date(p.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{p.ruleName}</p>
                      <p className="text-xs text-gray-500">{p.counterparty} · {p.mode === RecurMode.AUTO ? '🤖' : '👤'}</p>
                    </div>
                  </div>
                  <span className={`font-semibold ${p.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-600'}`}>
                    {p.type === TransactionType.INCOME ? '+' : '-'}{formatCurrency(p.amount, p.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Forecast tab */}
      {activeTab === 'forecast' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-semibold mb-3">Прогноз баланса на 6 месяцев</h3>
          {forecast.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={forecast}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Line type="monotone" dataKey="balance" name="Баланс" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-8">Недостаточно данных для прогноза</p>
          )}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {forecast.map((f, i) => (
              <div key={i} className="p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-center">
                <p className="text-xs text-gray-500">{f.month}</p>
                <p className={`font-bold ${f.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(f.balance)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
