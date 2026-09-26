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
 * Генерация кода синхронизации (включая auth-данные для кросс-девайса)
 */
export function generateSyncCode(): string {
  const familyData = exportFamilyData();
  if (!familyData) return '';
  
  // Также включаем auth-данные (семья и пользователи)
  const { families, users } = useAuthStore.getState();
  const currentFamilyId = useAuthStore.getState().currentFamilyId;
  
  const family = families.find(f => f.id === currentFamilyId);
  const familyUsers = users.filter(u => u.familyIds.includes(currentFamilyId || ''));
  
  const fullSyncData = {
    version: '2.0',
    type: 'full-family-sync',
    familyId: familyData.familyId,
    timestamp: familyData.timestamp,
    auth: {
      family: family,
      users: familyUsers,
    },
    data: familyData.data,
  };
  
  // Кодируем в base64
  const json = JSON.stringify(fullSyncData);
  return btoa(encodeURIComponent(json));
}

/**
 * Применение кода синхронизации
 */
export function applySyncCode(code: string): boolean {
  try {
    const json = decodeURIComponent(atob(code));
    const data = JSON.parse(json);
    
    // Проверяем версию
    if (data.version === '2.0' && data.type === 'full-family-sync') {
      return applyFullSyncCode(data);
    }
    
    // Старый формат — только данные семьи
    return importFamilyData(data as FamilySyncData);
  } catch (error) {
    console.error('Ошибка применения кода синхронизации:', error);
    return false;
  }
}

/**
 * Применение полного кода синхронизации (с auth-данными)
 */
function applyFullSyncCode(syncData: any): boolean {
  const { currentFamilyId, families, users } = useAuthStore.getState();
  const familyId = syncData.familyId;
  const store = useStore.getState();
  
  // Проверяем существует ли семья на этом устройстве
  const existingFamily = families.find(f => f.id === familyId);
  
  let updatedFamilies = [...families];
  let updatedUsers = [...users];
  
  if (!existingFamily && syncData.auth?.family) {
    // Создаём семью из синхронизации
    const newFamily = {
      ...syncData.auth.family,
      lastSync: syncData.timestamp,
    };
    updatedFamilies = [...updatedFamilies, newFamily];
    
    // Добавляем пользователей из синхронизации
    const newUsers = syncData.auth.users || [];
    updatedUsers = [...updatedUsers, ...newUsers.filter((u: any) => !users.some((existing: any) => existing.id === u.id))];
  } else if (existingFamily) {
    // Обновляем lastSync существующей семьи
    updatedFamilies = updatedFamilies.map(f => 
      f.id === familyId ? { ...f, lastSync: syncData.timestamp } : f
    );
  }
  
  // Обновляем auth store
  useAuthStore.setState({
    families: updatedFamilies,
    users: updatedUsers,
    currentFamilyId: familyId,
  });
  
  // Напрямую импортируем финансовые данные
  store.familiesData = {
    ...store.familiesData,
    [familyId]: {
      accounts: syncData.data.accounts || [],
      categories: syncData.data.categories || [],
      transactions: syncData.data.transactions || [],
      budgets: syncData.data.budgets || [],
      recurringRules: syncData.data.recurringRules || [],
      familyMembers: syncData.data.familyMembers || [],
    }
  };
  
  // Сохраняем в localStorage
  useStore.persist.rehydrate();
  
  return true;
}

/**
 * Экспорт в файл для переноса между устройствами (включая auth-данные)
 */
export function exportFamilyToFile() {
  const familyData = exportFamilyData();
  if (!familyData) return;

  // Также включаем auth-данные
  const { families, users } = useAuthStore.getState();
  const currentFamilyId = useAuthStore.getState().currentFamilyId;
  const family = families.find(f => f.id === currentFamilyId);
  const familyUsers = users.filter(u => u.familyIds.includes(currentFamilyId || ''));

  const fullData = {
    version: '2.0',
    type: 'full-family-sync',
    familyId: familyData.familyId,
    timestamp: familyData.timestamp,
    auth: {
      family: family,
      users: familyUsers,
    },
    data: familyData.data,
  };

  const json = JSON.stringify(fullData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `family-sync-${familyData.familyId}-${Date.now()}.json`;
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
        const data = JSON.parse(content);
        
        // Поддержка обоих форматов
        if (data.version === '2.0' && data.type === 'full-family-sync') {
          const code = btoa(encodeURIComponent(JSON.stringify(data)));
          const success = applySyncCode(code);
          resolve(success);
        } else {
          const success = importFamilyData(data as FamilySyncData);
          resolve(success);
        }
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
