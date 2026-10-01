import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import api from '../api';

export default function Dashboard() {
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, [period]);

  const loadSummary = async () => {
    try {
      const res = await api.get(`/summary?period=${period}`);
      setSummary(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Обзор финансов</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="week">Неделя</option>
          <option value="month">Месяц</option>
          <option value="year">Год</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className="h-6 w-6 text-green-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Доходы</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {summary.income.toLocaleString('ru-RU')} ₽
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingDown className="h-6 w-6 text-red-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Расходы</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {summary.expense.toLocaleString('ru-RU')} ₽
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Wallet className="h-6 w-6 text-blue-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Баланс</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {summary.balance.toLocaleString('ru-RU')} ₽
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Быстрые действия</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <a
            href="/transactions"
            className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 transition-colors"
          >
            <TrendingUp className="h-8 w-8 text-green-500 mr-3" />
            <div>
              <p className="font-medium text-gray-900">Добавить доход</p>
              <p className="text-sm text-gray-500">Записать поступление</p>
            </div>
          </a>
          <a
            href="/transactions"
            className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 transition-colors"
          >
            <TrendingDown className="h-8 w-8 text-red-500 mr-3" />
            <div>
              <p className="font-medium text-gray-900">Добавить расход</p>
              <p className="text-sm text-gray-500">Записать трату</p>
            </div>
          </a>
          <a
            href="/accounts"
            className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 transition-colors"
          >
            <Wallet className="h-8 w-8 text-blue-500 mr-3" />
            <div>
              <p className="font-medium text-gray-900">Управление счетами</p>
              <p className="text-sm text-gray-500">Добавить или изменить</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
