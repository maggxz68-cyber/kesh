import React, { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { useStore } from '../store';
import { RefreshCw, Info, CheckCircle } from 'lucide-react';

export default function Sync() {
  const { currentFamilyId, families } = useAuthStore();
  const { loadData, loading } = useStore();
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const currentFamily = families.find(f => f.id === currentFamilyId);

  const handleSync = async () => {
    if (!currentFamilyId) {
      setStatus({ type: 'error', message: 'Выберите семью' });
      return;
    }
    
    setStatus({ type: 'success', message: '🔄 Загрузка данных с сервера...' });
    try {
      await loadData(currentFamilyId);
      setStatus({ type: 'success', message: '✅ Данные успешно синхронизированы с сервером!' });
      setTimeout(() => setStatus(null), 3000);
    } catch {
      setStatus({ type: 'error', message: '❌ Ошибка синхронизации' });
      setTimeout(() => setStatus(null), 3000);
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0 max-w-3xl">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <RefreshCw size={24} /> Синхронизация
      </h2>

      {/* Current family info */}
      {currentFamily && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-4 text-white">
          <p className="text-sm opacity-80">Текущая семья</p>
          <p className="text-xl font-bold mt-1">{currentFamily.name}</p>
          <p className="text-sm opacity-80 mt-2">
            Данные хранятся на сервере и доступны с любого устройства
          </p>
        </div>
      )}

      {/* Status message */}
      {status && (
        <div className={`p-4 rounded-xl flex items-start gap-3 ${
          status.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          <CheckCircle size={20} className={`shrink-0 mt-0.5 ${
            status.type === 'success' ? 'text-green-600' : 'text-red-600'
          }`} />
          <p className={`text-sm ${
            status.type === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
          }`}>
            {status.message}
          </p>
        </div>
      )}

      {/* Sync button */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <RefreshCw size={18} className="text-blue-600" /> Синхронизация данных
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Все данные автоматически сохраняются на сервере при каждом изменении. 
          Используйте эту кнопку для принудительного обновления данных.
        </p>
        <button
          onClick={handleSync}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Загрузка...' : 'Синхронизировать'}
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info size={20} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-2">Как работает синхронизация</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Все данные хранятся на сервере</li>
              <li>Изменения автоматически сохраняются при каждом действии</li>
              <li>Доступ к данным с любого устройства через интернет</li>
              <li>Не требуется ручная синхронизация между устройствами</li>
              <li>Локальные данные не хранятся (кроме токена авторизации)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Server info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Info size={18} className="text-purple-600" /> Информация о сервере
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Хранилище:</span>
            <span className="font-medium">Сервер (SQLite)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Доступ:</span>
            <span className="font-medium">Онлайн (через API)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Безопасность:</span>
            <span className="font-medium">JWT токены</span>
          </div>
        </div>
      </div>
    </div>
  );
}
