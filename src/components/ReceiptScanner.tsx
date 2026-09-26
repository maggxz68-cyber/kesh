import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, RotateCw, Check } from 'lucide-react';

interface ReceiptScannerProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
}

export default function ReceiptScanner({ onCapture, onClose }: ReceiptScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode]);

  const startCamera = async () => {
    try {
      setError('');
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
    } catch (err) {
      setError('Не удалось получить доступ к камере. Проверьте разрешения.');
      console.error('Camera error:', err);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    onCapture(imageData);
  };

  const switchCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setFacingMode(facingMode === 'user' ? 'environment' : 'user');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80">
        <button
          onClick={() => {
            if (stream) stream.getTracks().forEach(track => track.stop());
            onClose();
          }}
          className="p-2 text-white hover:bg-white/20 rounded-lg"
        >
          <X size={24} />
        </button>
        <h3 className="text-white font-medium">Сканирование чека</h3>
        <button
          onClick={switchCamera}
          className="p-2 text-white hover:bg-white/20 rounded-lg"
        >
          <RotateCw size={24} />
        </button>
      </div>

      {/* Video */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-center text-white p-8">
            <Camera size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">Камера недоступна</p>
            <p className="text-sm text-gray-400">{error}</p>
            <button
              onClick={startCamera}
              className="mt-4 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Попробовать снова
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Overlay guide */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-black/30" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-80 border-2 border-white rounded-lg">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
              </div>
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded">
                Расположите чек в рамке
              </p>
            </div>
          </>
        )}
      </div>

      {/* Capture button */}
      {!error && (
        <div className="p-6 bg-black/80 flex justify-center">
          <button
            onClick={capturePhoto}
            className="w-16 h-16 bg-white rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors shadow-lg"
          >
            <Camera size={32} className="text-gray-900" />
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
