import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw } from 'lucide-react';

interface ReceiptScannerProps {
  onScan: (qrData: string) => void;
  onClose: () => void;
}

export default function ReceiptScanner({ onScan, onClose }: ReceiptScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [currentCamera, setCurrentCamera] = useState<string>('');

  useEffect(() => {
    loadCameras();
    return () => {
      stopScanner();
    };
  }, []);

  const loadCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        // Предпочитаем заднюю камеру
        const backCamera = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('задн')
        );
        setCurrentCamera(backCamera?.id || devices[0].id);
      } else {
        setError('Камера не найдена. Проверьте разрешения.');
      }
    } catch (err) {
      console.error('Ошибка получения списка камер:', err);
      setError('Не удалось получить доступ к камере. Разрешите доступ в настройках браузера.');
    }
  };

  const startScanner = async () => {
    if (!currentCamera) {
      setError('Камера не выбрана');
      return;
    }

    try {
      setError('');
      
      // Останавливаем предыдущий сканер если есть
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
          // Успешное сканирование
          console.log('QR-код распознан:', decodedText);
          onScan(decodedText);
          stopScanner();
        },
        (errorMessage) => {
          // Ошибка сканирования (нормально при поиске QR)
          // Не показываем пользователю
        }
      );

      setIsScanning(true);
    } catch (err) {
      console.error('Ошибка запуска сканера:', err);
      setError('Не удалось запустить сканер. Попробуйте другую камеру или перезагрузите страницу.');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING
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

  const handleClose = async () => {
    await stopScanner();
    onClose();
  };

  useEffect(() => {
    if (currentCamera && !isScanning && !error) {
      startScanner();
    }
  }, [currentCamera]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80 text-white">
        <button
          onClick={handleClose}
          className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          aria-label="Закрыть"
        >
          <X size={24} />
        </button>
        <h3 className="text-lg font-semibold">Сканирование QR-кода чека</h3>
        <button
          onClick={switchCamera}
          className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          disabled={cameras.length < 2}
          aria-label="Переключить камеру"
        >
          <RefreshCw size={24} />
        </button>
      </div>

      {/* Scanner area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-center text-white p-8">
            <Camera size={64} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">Ошибка</p>
            <p className="text-sm text-gray-400 mb-4">{error}</p>
            <button
              onClick={loadCameras}
              className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Попробовать снова
            </button>
          </div>
        ) : (
          <>
            <div id="receipt-scanner" className="w-full h-full" />
            
            {/* Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-64 border-4 border-blue-500 rounded-lg relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400" />
              </div>
            </div>

            {/* Instructions */}
            <div className="absolute bottom-4 left-0 right-0 text-center text-white bg-black/50 p-4">
              <p className="text-sm mb-1">Наведите камеру на QR-код чека</p>
              <p className="text-xs text-gray-400">
                QR-код находится в правом верхнем углу чека
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
