import React, { useRef, useState, useEffect } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, Upload, Image as ImageIcon, AlertCircle, HelpCircle } from 'lucide-react';

interface ReceiptScannerProps {
  onScan: (qrData: string) => void;
  onClose: () => void;
}

type ScanMode = 'select' | 'camera' | 'upload';

export default function ReceiptScanner({ onScan, onClose }: ReceiptScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [currentCamera, setCurrentCamera] = useState<string>('');
  const [mode, setMode] = useState<ScanMode>('select');
  const [cameraSupported, setCameraSupported] = useState<boolean | null>(null);

  useEffect(() => {
    checkCameraSupport();
    return () => {
      stopScanner();
    };
  }, []);

  const checkCameraSupport = async () => {
    // Проверка поддержки камеры
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraSupported(false);
      return;
    }

    // Проверка HTTPS (камера работает только на HTTPS или localhost)
    const isSecure = window.location.protocol === 'https:' || 
                     window.location.hostname === 'localhost' ||
                     window.location.hostname === '127.0.0.1';
    
    if (!isSecure) {
      setCameraSupported(false);
      setError('Камера требует HTTPS-соединение. Используйте загрузку фото из галереи.');
      return;
    }

    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        const backCamera = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('задн') ||
          d.label.toLowerCase().includes('environment')
        );
        setCurrentCamera(backCamera?.id || devices[0].id);
        setCameraSupported(true);
      } else {
        setCameraSupported(false);
        setError('Камера не найдена на устройстве');
      }
    } catch (err) {
      console.error('Ошибка получения списка камер:', err);
      setCameraSupported(false);
      setError('Не удалось получить доступ к камере. Используйте загрузку фото.');
    }
  };

  const startScanner = async () => {
    if (!currentCamera) {
      setError('Камера не выбрана');
      return;
    }

    try {
      setError('');
      
      if (scannerRef.current) {
        await stopScanner();
      }

      const scanner = new Html5Qrcode('receipt-scanner', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false
      });

      scannerRef.current = scanner;

      await scanner.start(
        currentCamera,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          console.log('QR-код распознан:', decodedText);
          onScan(decodedText);
          stopScanner();
        },
        () => {
          // Игнорируем ошибки при поиске QR
        }
      );

      setIsScanning(true);
    } catch (err) {
      console.error('Ошибка запуска сканера:', err);
      setError('Не удалось запустить камеру. Попробуйте загрузить фото из галереи.');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.error('Ошибка остановки сканера:', err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const switchCamera = async () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex(c => c.id === currentCamera);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex].id;
    setCurrentCamera(nextCamera);
    if (isScanning) {
      await stopScanner();
      setTimeout(() => startScanner(), 100);
    }
  };

  // Обработка загрузки файла (фото из галереи или камеры)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    try {
      // Создаём сканер для файла
      const scanner = new Html5Qrcode('receipt-scanner-file', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false
      });

      const decodedText = await scanner.scanFile(file, true);
      console.log('QR-код из файла распознан:', decodedText);
      onScan(decodedText);
    } catch (err) {
      console.error('Ошибка распознавания QR из файла:', err);
      setError('Не удалось найти QR-код на изображении. Убедитесь, что QR-код чёткий и хорошо виден.');
    }

    // Сброс input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = async () => {
    await stopScanner();
    onClose();
  };

  useEffect(() => {
    if (mode === 'camera' && currentCamera && !isScanning && !error && cameraSupported) {
      startScanner();
    }
  }, [mode, currentCamera, cameraSupported]);

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
        <h3 className="text-lg font-semibold text-center flex-1">Сканирование QR-кода</h3>
        {mode === 'camera' && cameras.length > 1 && (
          <button
            onClick={switchCamera}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Переключить камеру"
          >
            <RefreshCw size={24} />
          </button>
        )}
        {mode !== 'camera' && <div className="w-10" />}
      </div>

      {/* Content */}
      <div className="flex-1 relative flex flex-col overflow-hidden bg-gray-900">
        {/* Mode selection */}
        {mode === 'select' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-white">
            <div className="w-full max-w-md space-y-4">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mb-4">
                  <Camera size={40} className="text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Выберите способ</h2>
                <p className="text-gray-400 text-sm">
                  Отсканируйте QR-код чека или загрузите фото
                </p>
              </div>

              {/* Camera option */}
              {cameraSupported && (
                <button
                  onClick={() => setMode('camera')}
                  className="w-full p-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl flex items-center gap-4 transition-all"
                >
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                    <Camera size={24} className="text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold">Сканировать камерой</p>
                    <p className="text-xs text-white/80">Наведите камеру на QR-код чека</p>
                  </div>
                </button>
              )}

              {/* Upload from gallery option */}
              <button
                onClick={() => {
                  setMode('upload');
                  setTimeout(() => fileInputRef.current?.click(), 100);
                }}
                className="w-full p-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-xl flex items-center gap-4 transition-all"
              >
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <ImageIcon size={24} className="text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold">Загрузить фото</p>
                  <p className="text-xs text-white/80">Выберите фото чека из галереи</p>
                </div>
              </button>

              {/* Help */}
              <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-start gap-3">
                  <HelpCircle size={20} className="text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-300">
                    <p className="font-medium text-white mb-1">Где найти QR-код?</p>
                    <p className="text-xs">
                      QR-код находится в правом верхнем углу фискального чека. 
                      Это квадратный чёрно-белый код с тремя квадратными метками в углах.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-2">
                  <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Camera mode */}
        {mode === 'camera' && (
          <>
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              {error ? (
                <div className="text-center text-white p-8">
                  <Camera size={64} className="mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">Ошибка</p>
                  <p className="text-sm text-gray-400 mb-4">{error}</p>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setError('');
                        startScanner();
                      }}
                      className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors block mx-auto"
                    >
                      Попробовать снова
                    </button>
                    <button
                      onClick={() => {
                        setMode('upload');
                        setTimeout(() => fileInputRef.current?.click(), 100);
                      }}
                      className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition-colors block mx-auto"
                    >
                      Загрузить фото
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div id="receipt-scanner" className="w-full h-full" />
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-64 border-4 border-blue-500 rounded-lg relative">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400" />
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400" />
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400" />
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 text-center text-white bg-black/50 p-4">
                    <p className="text-sm mb-1">Наведите камеру на QR-код чека</p>
                    <p className="text-xs text-gray-400">QR-код находится в правом верхнем углу чека</p>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 bg-black/90 flex justify-center gap-4">
              <button
                onClick={() => { stopScanner(); setMode('select'); }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Назад
              </button>
              <button
                onClick={() => {
                  setMode('upload');
                  stopScanner();
                  setTimeout(() => fileInputRef.current?.click(), 100);
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2"
              >
                <ImageIcon size={16} /> Загрузить фото
              </button>
            </div>
          </>
        )}

        {/* Upload mode */}
        {mode === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-white">
            <div className="w-full max-w-md text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full mb-4">
                <ImageIcon size={40} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Загрузите фото чека</h2>
              <p className="text-gray-400 text-sm mb-6">
                Выберите фото с QR-кодом чека из галереи или сделайте снимок
              </p>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-xl flex items-center justify-center gap-3 transition-all mb-4"
              >
                <Upload size={24} />
                <span className="font-semibold">Выбрать фото</span>
              </button>

              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-2 mt-4 text-left">
                  <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              )}

              <button
                onClick={() => { setMode('select'); setError(''); }}
                className="mt-4 text-sm text-gray-400 hover:text-white"
              >
                ← Назад к выбору способа
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Hidden scanner for file */}
      <div id="receipt-scanner-file" className="hidden" />
    </div>
  );
}
