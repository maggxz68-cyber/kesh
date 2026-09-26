import { ExchangeRate } from '../types';

/**
 * Получение курсов валют с ЦБ РФ
 * API: https://www.cbr.ru/scripts/XML_daily.asp
 */

interface CBRValute {
  CharCode: string;
  Nominal: string;
  Value: string;
}

interface CBRResponse {
  Valute: Record<string, CBRValute>;
}

/**
 * Парсинг XML ответа ЦБ РФ
 */
function parseCBRXml(xmlText: string): Record<string, number> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  const valutes = xmlDoc.querySelectorAll('Valute');
  
  const rates: Record<string, number> = {};
  
  valutes.forEach(valute => {
    const charCode = valute.querySelector('CharCode')?.textContent || '';
    const nominal = parseFloat(valute.querySelector('Nominal')?.textContent?.replace(',', '.') || '1');
    const value = parseFloat(valute.querySelector('Value')?.textContent?.replace(',', '.') || '0');
    
    if (charCode && value > 0) {
      // Курс за единицу валюты в рублях
      rates[charCode] = value / nominal;
    }
  });
  
  return rates;
}

/**
 * Получение курсов валют с ЦБ РФ
 */
export async function fetchExchangeRatesFromCBR(): Promise<ExchangeRate[]> {
  try {
    // Используем CORS-прокси для обхода ограничений
    const proxyUrl = 'https://corsproxy.io/?';
    const cbrUrl = 'https://www.cbr.ru/scripts/XML_daily.asp';
    const url = `${proxyUrl}${encodeURIComponent(cbrUrl)}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const xmlText = await response.text();
    const rates = parseCBRXml(xmlText);
    
    const exchangeRates: ExchangeRate[] = [];
    const now = new Date().toISOString();
    
    // Добавляем курсы валют
    Object.entries(rates).forEach(([currency, rate]) => {
      if (currency !== 'RUB') {
        exchangeRates.push({
          id: `rate-${currency}-RUB-${Date.now()}`,
          baseCode: currency,
          quoteCode: 'RUB',
          rate: rate,
          date: now,
          source: 'CBR'
        });
      }
    });
    
    // Добавляем обратные курсы (RUB -> валюта)
    Object.entries(rates).forEach(([currency, rate]) => {
      if (currency !== 'RUB') {
        exchangeRates.push({
          id: `rate-RUB-${currency}-${Date.now()}`,
          baseCode: 'RUB',
          quoteCode: currency,
          rate: 1 / rate,
          date: now,
          source: 'CBR'
        });
      }
    });
    
    // Добавляем кросс-курсы между валютами
    const currencies = Object.keys(rates).filter(c => c !== 'RUB');
    for (let i = 0; i < currencies.length; i++) {
      for (let j = 0; j < currencies.length; j++) {
        if (i !== j) {
          const fromCurrency = currencies[i];
          const toCurrency = currencies[j];
          const crossRate = rates[fromCurrency] / rates[toCurrency];
          
          exchangeRates.push({
            id: `rate-${fromCurrency}-${toCurrency}-${Date.now()}-${i}-${j}`,
            baseCode: fromCurrency,
            quoteCode: toCurrency,
            rate: crossRate,
            date: now,
            source: 'CBR'
          });
        }
      }
    }
    
    console.log('✅ Курсы валют получены с ЦБ РФ:', exchangeRates.length, 'курсов');
    return exchangeRates;
    
  } catch (error) {
    console.error('❌ Ошибка получения курсов с ЦБ РФ:', error);
    
    // Fallback на резервный API
    try {
      return await fetchExchangeRatesFromBackup();
    } catch (backupError) {
      console.error('❌ Ошибка резервного API:', backupError);
      return [];
    }
  }
}

/**
 * Резервный API для получения курсов
 */
async function fetchExchangeRatesFromBackup(): Promise<ExchangeRate[]> {
  const response = await fetch('https://api.exchangerate-api.com/v4/latest/RUB');
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const data = await response.json();
  const rates = data.rates;
  const now = new Date().toISOString();
  
  const exchangeRates: ExchangeRate[] = [];
  
  Object.entries(rates).forEach(([currency, rate]) => {
    if (currency !== 'RUB') {
      // API возвращает курсы валют, нужно инвертировать
      const invertedRate = 1 / (rate as number);
      
      exchangeRates.push({
        id: `rate-${currency}-RUB-${Date.now()}`,
        baseCode: currency,
        quoteCode: 'RUB',
        rate: invertedRate,
        date: now,
        source: 'EXCHANGERATE_API'
      });
      
      exchangeRates.push({
        id: `rate-RUB-${currency}-${Date.now()}`,
        baseCode: 'RUB',
        quoteCode: currency,
        rate: rate as number,
        date: now,
        source: 'EXCHANGERATE_API'
      });
    }
  });
  
  console.log('✅ Курсы валют получены из резервного API:', exchangeRates.length, 'курсов');
  return exchangeRates;
}

/**
 * Обновление курсов валют в хранилище
 */
export function updateExchangeRatesInStore(rates: ExchangeRate[]): void {
  // Динамический импорт для избежания циклических зависимостей
  import('../store').then(({ useStore }) => {
    const store = useStore.getState();
    
    // Заменяем все курсы на новые
    store.exchangeRates = rates;
    
    console.log('✅ Курсы валют обновлены в хранилище');
  });
}

/**
 * Автоматическое обновление курсов при старте приложения
 */
export async function autoUpdateExchangeRates(): Promise<void> {
  console.log('🔄 Автоматическое обновление курсов валют...');
  
  try {
    const rates = await fetchExchangeRatesFromCBR();
    
    if (rates.length > 0) {
      updateExchangeRatesInStore(rates);
      console.log('✅ Курсы валют успешно обновлены');
    } else {
      console.warn('⚠️ Не удалось получить курсы валют');
    }
  } catch (error) {
    console.error('❌ Ошибка автоматического обновления курсов:', error);
  }
}
