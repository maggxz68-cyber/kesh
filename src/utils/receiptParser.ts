/**
 * Парсер QR-кодов чеков по стандарту ФНС России
 * Формат: t=20240115T1430&s=1500.00&fn=9280009100023456&i=12345&fp=1234567890&n=1
 */

export interface ReceiptQRData {
  dateTime: Date;
  totalSum: number;
  fiscalDriveNumber: string;
  fiscalDocumentNumber: string;
  fiscalSign: string;
  operationType: number;
  raw: string;
}

/**
 * Парсит QR-код чека
 */
export function parseReceiptQR(qrData: string): ReceiptQRData | null {
  try {
    const params = new URLSearchParams(qrData);
    
    const t = params.get('t');
    const s = params.get('s');
    const fn = params.get('fn');
    const i = params.get('i');
    const fp = params.get('fp');
    const n = params.get('n');

    if (!t || !s || !fn || !i || !fp) {
      console.warn('Не все обязательные поля найдены в QR-коде');
      return null;
    }

    // Парсим дату и время: формат 20240115T1430
    const dateTime = parseReceiptDate(t);
    
    // Парсим сумму
    const totalSum = parseFloat(s);
    if (isNaN(totalSum)) {
      console.warn('Неверный формат суммы');
      return null;
    }

    return {
      dateTime,
      totalSum,
      fiscalDriveNumber: fn,
      fiscalDocumentNumber: i,
      fiscalSign: fp,
      operationType: n ? parseInt(n) : 1,
      raw: qrData
    };
  } catch (error) {
    console.error('Ошибка парсинга QR-кода:', error);
    return null;
  }
}

/**
 * Парсит дату из QR-кода
 * Формат: 20240115T1430 -> Date
 */
function parseReceiptDate(dateStr: string): Date {
  // Формат: YYYYMMDDTHHMM
  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/);
  
  if (!match) {
    // Пробуем альтернативный формат
    const altMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (altMatch) {
      const [, year, month, day] = altMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return new Date();
  }

  const [, year, month, day, hour, minute] = match;
  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute)
  );
}

/**
 * Определяет тип операции
 * 1 - приход (доход)
 * 2 - расход
 * 3 - возврат прихода
 * 4 - возврат расхода
 */
export function getOperationTypeLabel(operationType: number): string {
  switch (operationType) {
    case 1: return 'Приход';
    case 2: return 'Расход';
    case 3: return 'Возврат прихода';
    case 4: return 'Возврат расхода';
    default: return 'Неизвестно';
  }
}

/**
 * Форматирует сумму из QR-кода
 */
export function formatReceiptSum(sum: number): string {
  return sum.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Форматирует дату из QR-кода
 */
export function formatReceiptDate(date: Date): string {
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
