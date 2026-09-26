import React, { useRef, useState, useEffect } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, Image as ImageIcon, AlertCircle, HelpCircle, Edit3, CheckCircle } from 'lucide-react';

interface ReceiptScannerProps {
  onScan: (qrData: string) => void;
  onClose: () => void;
}

type ScanMode = 'select' | 'manual';

export default function ReceiptScanner({ onScan, onClose }: ReceiptScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>('');
  const [mode, setMode] = useState<ScanMode>('select');
  const [manualData, setManualData] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<string>('');

  // Обработка фото из камеры или галереи
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setIsProcessing(true);
    setLastResult('');

    try {
      console.log('📸 Обработка файла:', file.name, file.size, file.type);

      // Создаём сканер с максимальной поддержкой форматов
      const scanner = new Html5Qrcode('receipt-scanner-file', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.AZTEC,
          Html5QrcodeSupportedFormats.PDF_417,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
        verbose: false
      });

      // Сканируем файл с высокой точностью
      const decodedText = await scanner.scanFile(file, true);
      console.log('✅ QR-код распознан:', decodedText);
      
      setLastResult(decodedText);
      setIsProcessing(false);
      
      // Автоматически отправляем результат
      onScan(decodedText);
      
    } catch (err) {
      console.error('❌ Ошибка распознавания:', err);
      setIsProcessing(false);
      setError(
        'Не удалось распознать QR-код на фото.\n\n' +
        'Попробуйте:\n' +
        '• Сделать фото при хорошем освещении\n' +
        '• Убедиться, что QR-код полностью виден\n' +
        '• Держать телефон ровно при съёмке\n' +
        '• Или используйте "Ввести вручную"'
      );
    }

    // Сброс input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Открыть камеру через системное приложение
  const openCamera = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('capture', 'environment');
      fileInputRef.current.click();
    }
  };

  // Открыть галерею
  const openGallery = () => {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.click();
    }
  };

  // Ручной ввод данных
  const handleManualSubmit = () => {
    if (!manualData.trim()) {
      setError('Введите данные чека');
      return;
    }
    setLastResult(manualData);
    onScan(manualData);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/90 text-white">
        <button
          onClick={handleClose}
          className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          aria-label="Закрыть"
        >
          <X size={24} />
        </button>
        <h3 className="text-lg font-semibold text-center flex-1">Сканирование чека</h3>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 relative flex flex-col overflow-y-auto bg-gray-900">
        
        {/* Mode selection */}
        {mode === 'select' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-white">
            <div className="w-full max-w-md space-y-4">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mb-4">
                  <Camera size={40} className="text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Сфотографируйте чек</h2>
                <p className="text-gray-400 text-sm">
                  Как в приложении "Честный знак"
                </p>
              </div>

              {/* Camera button - MAIN ACTION */}
              <button
                onClick={openCamera}
                className="w-full p-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl flex items-center gap-4 transition-all shadow-lg"
              >
                <div className="w-14 h-14 bg-white/20 rounded-lg flex items-center justify-center">
                  <Camera size={28} className="text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-bold text-lg">Сделать фото чека</p>
                  <p className="text-sm text-white/80">Откроется камера телефона</p>
                </div>
              </button>

              {/* Gallery button */}
              <button
                onClick={openGallery}
                className="w-full p-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-xl flex items-center gap-4 transition-all"
              >
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <ImageIcon size={24} className="text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold">Выбрать из галереи</p>
                  <p className="text-xs text-white/80">Если уже сфотографировали чек</p>
                </div>
              </button>

              {/* Manual entry button */}
              <button
                onClick={() => setMode('manual')}
                className="w-full p-4 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 rounded-xl flex items-center gap-4 transition-all"
              >
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <Edit3 size={24} className="text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold">Ввести вручную</p>
                  <p className="text-xs text-white/80">Скопировать данные с чека</p>
                </div>
              </button>

              {/* Instructions */}
              <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-start gap-3">
                  <HelpCircle size={20} className="text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-300">
                    <p className="font-medium text-white mb-2">Как сфотографировать чек:</p>
                    <ol className="text-xs space-y-1 list-decimal list-inside">
                      <li>Нажмите "Сделать фото чека"</li>
                      <li>Наведите камеру на QR-код чека</li>
                      <li>Убедитесь, что QR-код полностью в кадре</li>
                      <li>Сделайте фото (как обычно)</li>
                      <li>QR-код распознается автоматически</li>
                    </ol>
                    <p className="text-xs text-yellow-300 mt-2">
                      💡 Работает так же, как в "Честном знаке"!
                    </p>
                  </div>
                </div>
              </div>

              {/* Processing indicator */}
              {isProcessing && (
                <div className="p-4 bg-blue-500/20 border border-blue-500/50 rounded-lg flex items-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
                  <p className="text-sm text-blue-200">Распознавание QR-кода...</p>
                </div>
              )}

              {/* Success result */}
              {lastResult && !isProcessing && (
                <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg flex items-start gap-3">
                  <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-200 mb-1">QR-код распознан!</p>
                    <p className="text-xs text-green-300 break-all font-mono">{lastResult}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-2">
                  <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200 whitespace-pre-line">{error}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Manual entry mode */}
        {mode === 'manual' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-white">
            <div className="w-full max-w-md">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500 to-red-500 rounded-full mb-4">
                  <Edit3 size={40} className="text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Ручной ввод</h2>
                <p className="text-gray-400 text-sm">
                  Скопируйте данные QR-кода с чека
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Данные QR-кода
                  </label>
                  <textarea
                    value={manualData}
                    onChange={(e) => setManualData(e.target.value)}
                    placeholder="t=20240115T1430&s=1500.00&fn=9280009100023456&i=12345&fp=1234567890&n=1"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    rows={6}
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    💡 Используйте приложение для чтения QR-кодов, чтобы скопировать данные
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-2">
                    <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                )}

                <button
                  onClick={handleManualSubmit}
                  disabled={!manualData.trim()}
                  className="w-full p-4 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Использовать данные
                </button>

                <button
                  onClick={() => { setMode('select'); setError(''); }}
                  className="w-full text-sm text-gray-400 hover:text-white"
                >
                  ← Назад
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Hidden scanner for file */}
      <div id="receipt-scanner-file" className="hidden" />
    </div>
  );
}
