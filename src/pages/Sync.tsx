import React, { useState, useRef } from 'react';
import { generateSyncCode, applySyncCode, exportFamilyToFile, importFamilyFromFile } from '../utils/sync';
import { useAuthStore } from '../store/auth';
import { copyToClipboard } from '../utils/clipboard';
import { Copy, Check, Upload, Download, AlertCircle, CheckCircle } from 'lucide-react';

export default function Sync() {
  const { currentFamilyId, families } = useAuthStore();
  const [syncCode, setSyncCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFamily = families.find(f => f.id === currentFamilyId);

  const handleGenerateCode = () => {
    const code = generateSyncCode();
    if (code) {
      setSyncCode(code);
      setStatus({ type: 'success', message: 'Код синхронизации создан' });
    } else {
      setStatus({ type: 'error', message: 'Не удалось создать код' });
    }
  };

  const handleCopyCode = async () => {
    await copyToClipboard(syncCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyCode = () => {
    if (!inputCode.trim()) {
      setStatus({ type: 'error', message: 'Введите код синхронизации' });
      return;
    }

    const success = applySyncCode(inputCode);
    if (success) {
      setStatus({ type: 'success', message: 'Данные успешно синхронизированы!' });
      setInputCode('');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      setStatus({ type: 'error', message: 'Не удалось применить код. Проверьте правильность кода.' });
    }
  };

  const handleExportFile = () => {
    exportFamilyToFile();
    setStatus({ type: 'success', message: 'Файл экспортирован' });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const success = await importFamilyFromFile(file);
    if (success) {
      setStatus({ type: 'success', message: 'Данные успешно импортированы!' });
      setTimeout(() => window.location.reload(), 1500);
    } else {
      setStatus({ type: 'error', message: 'Не удалось импортировать файл' });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0 max-w-3xl">
      <h2 className="text-2xl font-bold">Синхронизация данных</h2>

      {/* Current family info */}
      {currentFamily && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-4 text-white">
          <p className="text-sm opacity-80">Текущая семья</p>
          <p className="text-xl font-bold mt-1">{currentFamily.name}</p>
          <p className="text-sm opacity-80 mt-2">
            {currentFamily.lastSync 
              ? `Последняя синхронизация: ${new Date(currentFamily.lastSync).toLocaleString('ru-RU')}`
              : 'Синхронизация не выполнялась'}
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
          {status.type === 'success' ? (
            <CheckCircle size={20} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={20} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          )}
          <p className={`text-sm ${
            status.type === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
          }`}>
            {status.message}
          </p>
        </div>
      )}

      {/* Method 1: Sync code */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Copy size={18} /> Способ 1: Код синхронизации
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Создайте код на одном устройстве и введите его на другом. Код включает данные семьи, пользователей и все финансовые данные.
        </p>

        {/* Generate code */}
        <button
          onClick={handleGenerateCode}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium mb-4"
        >
          Создать код синхронизации
        </button>

        {/* Display code */}
        {syncCode && (
          <div className="space-y-3">
            <div className="relative">
              <textarea
                readOnly
                value={syncCode}
                className="w-full h-32 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-mono resize-none"
              />
              <button
                onClick={handleCopyCode}
                className="absolute top-2 right-2 px-3 py-1 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-sm flex items-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-500"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Скопируйте этот код и введите на другом устройстве
            </p>
          </div>
        )}

        {/* Apply code */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Введите код синхронизации
          </label>
          <textarea
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            placeholder="Вставьте код сюда..."
            className="w-full h-32 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-xs font-mono resize-none mb-3"
          />
          <button
            onClick={handleApplyCode}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
          >
            Применить код
          </button>
        </div>
      </div>

      {/* Method 2: File export/import */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Download size={18} /> Способ 2: Файл синхронизации
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Экспортируйте данные в файл и импортируйте на другом устройстве
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleExportFile}
            className="p-4 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3"
          >
            <Download size={24} className="text-blue-600" />
            <div className="text-left">
              <p className="font-medium">Экспорт в файл</p>
              <p className="text-xs text-gray-500">Сохранить данные семьи</p>
            </div>
          </button>

          <label className="p-4 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 cursor-pointer">
            <Upload size={24} className="text-green-600" />
            <div className="text-left">
              <p className="font-medium">Импорт из файла</p>
              <p className="text-xs text-gray-500">Загрузить данные семьи</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <h3 className="font-semibold text-blue-700 dark:text-blue-300 mb-2">Как синхронизировать данные</h3>
        <div className="text-sm text-blue-600 dark:text-blue-400 space-y-2">
          <p><strong>Между устройствами:</strong></p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>На первом устройстве создайте код синхронизации или экспортируйте файл</li>
            <li>Передайте код или файл на второе устройство</li>
            <li>На втором устройстве введите код или импортируйте файл</li>
            <li>Данные синхронизируются автоматически</li>
          </ol>
          
          <p className="mt-3"><strong>Между вкладками:</strong></p>
          <p className="ml-2">Изменения автоматически синхронизируются между вкладками одного браузера</p>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertCircle size={18} className="text-yellow-600 mt-0.5" />
          <div className="text-sm text-yellow-700 dark:text-yellow-300">
            <p className="font-medium">Важно</p>
            <p className="mt-1">
              При синхронизации данные на текущем устройстве будут полностью заменены данными из кода/файла. 
              Рекомендуется создавать резервную копию перед синхронизацией.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
