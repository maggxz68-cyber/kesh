import { useStore } from '../store';
import { useAuthStore } from '../store/auth';
import { Currency } from '../types';

export interface FullBackup {
  version: string;
  timestamp: string;
  auth: {
    users: any[];
    families: any[];
  };
  finance: {
    familiesData: Record<string, any>;
    exchangeRates: any[];
    baseCurrency: Currency;
    darkMode: boolean;
  };
}

/**
 * Создать полный бэкап всех данных
 */
export function createFullBackup(): FullBackup {
  const authStore = useAuthStore.getState();
  const financeStore = useStore.getState();

  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    auth: {
      users: authStore.users,
      families: authStore.families,
    },
    finance: {
      familiesData: financeStore.familiesData,
      exchangeRates: financeStore.exchangeRates,
      baseCurrency: financeStore.baseCurrency,
      darkMode: financeStore.darkMode,
    },
  };
}

/**
 * Скачать бэкап как файл
 */
export function downloadBackup() {
  const backup = createFullBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `family-budget-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Восстановить данные из бэкапа
 */
export function restoreFromBackup(backup: FullBackup): boolean {
  try {
    // Проверяем версию
    if (backup.version !== '1.0') {
      console.error('Неподдерживаемая версия бэкапа');
      return false;
    }

    // Восстанавливаем auth данные
    useAuthStore.setState({
      users: backup.auth.users,
      families: backup.auth.families,
    });

    // Восстанавливаем finance данные
    useStore.setState({
      familiesData: backup.finance.familiesData,
      exchangeRates: backup.finance.exchangeRates,
      baseCurrency: backup.finance.baseCurrency,
      darkMode: backup.finance.darkMode,
    });

    // Сохраняем в localStorage
    useAuthStore.persist.rehydrate();
    useStore.persist.rehydrate();

    return true;
  } catch (error) {
    console.error('Ошибка восстановления из бэкапа:', error);
    return false;
  }
}

/**
 * Загрузить бэкап из файла
 */
export function loadBackupFromFile(file: File): Promise<FullBackup | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const backup = JSON.parse(content) as FullBackup;
        resolve(backup);
      } catch (error) {
        console.error('Ошибка чтения файла бэкапа:', error);
        resolve(null);
      }
    };
    
    reader.onerror = () => {
      console.error('Ошибка чтения файла');
      resolve(null);
    };
    
    reader.readAsText(file);
  });
}
