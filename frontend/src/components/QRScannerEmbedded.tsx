import React, { useEffect, useRef, useState } from 'react';
import { Alert, Spinner, Button } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQrcode, faTimes, faCamera, faUpload } from '@fortawesome/free-solid-svg-icons';

interface QRScannerEmbeddedProps {
  onScan: (result: string) => void;
  onError?: (error: string) => void;
}

const QRScannerEmbedded: React.FC<QRScannerEmbeddedProps> = ({ 
  onScan, 
  onError 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [scanMode, setScanMode] = useState<'camera' | 'upload'>('camera');
  
  // Start camera stream
  const startCamera = async () => {
    try {
      setError('');
      setIsScanning(true);
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      
    } catch (err) {
      console.error('Error accessing camera:', err);
      const errorMsg = 'Unable to access camera. Please check permissions.';
      setError(errorMsg);
      if (onError) onError(errorMsg);
      setIsScanning(false);
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
        });
        setStream(null);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.pause();
      }
      setIsScanning(false);
    } catch (error) {
      console.log('Error stopping camera:', error);
      setIsScanning(false);
    }
  };

  // Handle file upload for QR scanning
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      // For demo purposes, we'll simulate QR code detection
      // In a real implementation, you'd use a QR code detection library
      if (result) {
        // Mock QR code detection - in real implementation use jsQR or similar
        const mockQRResult = "CERT-087EF428246A"; // This would be extracted from the image
        onScan(mockQRResult);
      }
    };
    reader.readAsDataURL(file);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        stopCamera();
      } catch (error) {
        console.log('Cleanup error:', error);
      }
    };
  }, []);

  // Mock QR scanning (in real implementation, you'd use jsQR library)
  const mockScanQR = () => {
    // Simulate QR code detection
    setTimeout(() => {
      onScan("CERT-087EF428246A");
      stopCamera();
    }, 2000);
  };

  return (
    <div className="qr-scanner-embedded">
      {error && (
        <Alert variant="danger" className="mb-3">
          <FontAwesomeIcon icon={faTimes} className="me-2" />
          {error}
        </Alert>
      )}

      <div className="d-flex gap-2 mb-3">
        <Button
          variant={scanMode === 'camera' ? 'primary' : 'outline-primary'}
          onClick={() => setScanMode('camera')}
          size="sm"
        >
          <FontAwesomeIcon icon={faCamera} className="me-1" />
          Camera
        </Button>
        <Button
          variant={scanMode === 'upload' ? 'primary' : 'outline-primary'}
          onClick={() => setScanMode('upload')}
          size="sm"
        >
          <FontAwesomeIcon icon={faUpload} className="me-1" />
          Upload Image
        </Button>
      </div>

      {scanMode === 'camera' && (
        <div className="camera-section">
          {!isScanning ? (
            <div className="text-center">
              <Button variant="success" onClick={startCamera}>
                <FontAwesomeIcon icon={faCamera} className="me-2" />
                Start Camera
              </Button>
            </div>
          ) : (
            <div className="scanner-container">
              <div className="position-relative">
                <video 
                  ref={videoRef} 
                  className="w-100 rounded"
                  style={{ maxHeight: '300px', objectFit: 'cover' }}
                  autoPlay 
                  playsInline 
                />
                <canvas 
                  ref={canvasRef} 
                  style={{ display: 'none' }} 
                />
                
                {/* Scanner overlay */}
                <div 
                  className="position-absolute border border-2 border-success rounded"
                  style={{
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '200px',
                    height: '200px',
                    pointerEvents: 'none'
                  }}
                />
              </div>
              
              <div className="text-center mt-3">
                <div className="d-flex gap-2 justify-content-center">
                  <Button variant="success" onClick={mockScanQR}>
                    <FontAwesomeIcon icon={faQrcode} className="me-2" />
                    Simulate Scan
                  </Button>
                  <Button variant="secondary" onClick={stopCamera}>
                    Stop Camera
                  </Button>
                </div>
                <div className="mt-2">
                  <Spinner animation="border" size="sm" className="me-2" />
                  <small className="text-muted">Position QR code within the frame</small>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {scanMode === 'upload' && (
        <div className="upload-section">
          <div className="border border-dashed border-secondary rounded p-4 text-center">
            <FontAwesomeIcon icon={faUpload} size="3x" className="text-muted mb-3" />
            <div>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileUpload}
                className="d-none"
              />
              <Button
                variant="outline-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose Image File
              </Button>
              <div className="mt-2">
                <small className="text-muted">Upload an image containing a QR code</small>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRScannerEmbedded;
