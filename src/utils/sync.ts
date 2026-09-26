/**
 * Система синхронизации данных между устройствами и вкладками
 */

import { useStore } from '../store';
import { useAuthStore } from '../store/auth';

export interface FamilySyncData {
  version: string;
  familyId: string;
  timestamp: string;
  data: {
    accounts: any[];
    categories: any[];
    transactions: any[];
    budgets: any[];
    recurringRules: any[];
    familyMembers: any[];
  };
}

/**
 * Экспорт данных семьи для синхронизации
 */
export function exportFamilyData(): FamilySyncData | null {
  const { currentFamilyId } = useAuthStore.getState();
  if (!currentFamilyId) return null;

  const store = useStore.getState();
  const familyData = store.familiesData[currentFamilyId];
  
  if (!familyData) return null;

  return {
    version: '1.0',
    familyId: currentFamilyId,
    timestamp: new Date().toISOString(),
    data: {
      accounts: familyData.accounts,
      categories: familyData.categories,
      transactions: familyData.transactions,
      budgets: familyData.budgets,
      recurringRules: familyData.recurringRules,
      familyMembers: familyData.familyMembers,
    }
  };
}

/**
 * Импорт данных семьи
 */
export function importFamilyData(syncData: FamilySyncData): boolean {
  const { currentFamilyId } = useAuthStore.getState();
  if (!currentFamilyId) return false;

  if (syncData.familyId !== currentFamilyId) {
    console.error('Несоответствие ID семьи');
    return false;
  }

  const store = useStore.getState();
  
  // Обновляем данные семьи
  store.familiesData = {
    ...store.familiesData,
    [currentFamilyId]: {
      accounts: syncData.data.accounts,
      categories: syncData.data.categories,
      transactions: syncData.data.transactions,
      budgets: syncData.data.budgets,
      recurringRules: syncData.data.recurringRules,
      familyMembers: syncData.data.familyMembers,
    }
  };

  // Сохраняем в localStorage
  useStore.persist.rehydrate();

  // Обновляем время последней синхронизации
  const { families } = useAuthStore.getState();
  const updatedFamilies = families.map(f => 
    f.id === currentFamilyId 
      ? { ...f, lastSync: syncData.timestamp }
      : f
  );
  useAuthStore.setState({ families: updatedFamilies });

  return true;
}

/**
 * Синхронизация между вкладками через localStorage events
 */
export function setupCrossTabSync() {
  // Слушаем изменения в localStorage
  window.addEventListener('storage', (e) => {
    if (e.key === 'finance-tracker-storage') {
      console.log('🔄 Обнаружены изменения в другой вкладке, синхронизация...');
      // Перезагружаем данные из localStorage
      useStore.persist.rehydrate();
    }
    
    if (e.key === 'auth-storage') {
      console.log('🔄 Обнаружены изменения в auth в другой вкладке, синхронизация...');
      useAuthStore.persist.rehydrate();
    }
  });
}

/**
 * Генерация кода синхронизации
 */
export function generateSyncCode(): string {
  const data = exportFamilyData();
  if (!data) return '';
  
  // Кодируем в base64
  const json = JSON.stringify(data);
  return btoa(encodeURIComponent(json));
}

/**
 * Применение кода синхронизации
 */
export function applySyncCode(code: string): boolean {
  try {
    const json = decodeURIComponent(atob(code));
    const data = JSON.parse(json) as FamilySyncData;
    return importFamilyData(data);
  } catch (error) {
    console.error('Ошибка применения кода синхронизации:', error);
    return false;
  }
}

/**
 * Экспорт в файл для переноса между устройствами
 */
export function exportFamilyToFile() {
  const data = exportFamilyData();
  if (!data) return;

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `family-sync-${data.familyId}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Импорт из файла
 */
export function importFamilyFromFile(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as FamilySyncData;
        const success = importFamilyData(data);
        resolve(success);
      } catch (error) {
        console.error('Ошибка импорта файла:', error);
        resolve(false);
      }
    };
    
    reader.onerror = () => {
      console.error('Ошибка чтения файла');
      resolve(false);
    };
    
    reader.readAsText(file);
  });
}
