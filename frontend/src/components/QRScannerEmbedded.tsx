import React, { useEffect, useRef, useState } from 'react';
import { Alert, Spinner, Button } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQrcode, faTimes, faCamera, faUpload } from '@fortawesome/free-solid-svg-icons';
import jsQR from 'jsqr';

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
  const [scanInterval, setScanInterval] = useState<NodeJS.Timeout | null>(null);
  const [scanCount, setScanCount] = useState(0);
  
  // Vibration function for QR scan feedback
  const triggerVibration = () => {
    if ('vibrate' in navigator) {
      // Vibrate for 200ms to signal successful QR scan
      navigator.vibrate(200);
      console.log('📳 Device vibration triggered');
    } else {
      console.log('📳 Vibration not supported on this device');
    }
  };
  
  // Validate that QR data contains a certificate reference
  const isValidCertQR = (qrData: string): boolean => {
    if (qrData.startsWith('CERT-')) return true;
    if (qrData.includes('certificate_id')) return true;
    if (qrData.match(/^CERT-[A-Z0-9]+$/i)) return true;
    return false;
  };

  // Scan QR code from camera
  const scanQRFromCamera = () => {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) {
      return;
    }
    
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }
    
    setScanCount(prev => prev + 1);
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    if (canvas.width === 0 || canvas.height === 0) {
      return;
    }
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
      console.log('🎯 QR Code detected! Raw data:', code.data);
      triggerVibration();
      
      if (isValidCertQR(code.data)) {
        // Pass the full raw QR data string to parent - parent will handle parsing
        onScan(code.data);
        stopCamera();
      } else {
        console.log('❌ QR Code found but not a certificate QR:', code.data);
        setError('QR code does not appear to be a certificate QR code.');
      }
    }
  };
  
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
        
        // Add event listeners for proper video loading
        videoRef.current.onloadedmetadata = () => {
          console.log('📹 Video metadata loaded');
        };
        
        videoRef.current.oncanplay = () => {
          console.log('📹 Video can start playing');
          if (videoRef.current) {
            videoRef.current.play().then(() => {
              console.log('▶️ Video started playing, beginning QR scan');
              setScanCount(0);
              // Start scanning for QR codes after video starts
              const interval = setInterval(scanQRFromCamera, 200); // Scan every 200ms
              setScanInterval(interval);
            }).catch(error => {
              console.error('❌ Error playing video:', error);
              setError('Failed to start video playback');
            });
          }
        };
        
        // Start loading the video
        videoRef.current.load();
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
      
      if (scanInterval) {
        clearInterval(scanInterval);
        setScanInterval(null);
      }
      
      setScanCount(0);
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
      if (result) {
        // Create image element to extract QR code
        const img = new Image();
        img.onload = () => {
          // Create canvas to process the image
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (context) {
            canvas.width = img.width;
            canvas.height = img.height;
            context.drawImage(img, 0, 0);
            
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
              console.log('🎯 QR Code found in uploaded image:', code.data);
              triggerVibration();
              
              if (isValidCertQR(code.data)) {
                console.log('✅ Certificate QR found in image:', code.data);
                onScan(code.data);
              } else {
                setError('QR code found but does not appear to be a certificate QR code');
              }
            } else {
              setError('No QR code found in the uploaded image');
            }
          }
        };
        img.src = result;
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

  // Manual test scan function (for testing purposes)
  const testScanQR = () => {
    const testQRData = JSON.stringify({
      certificate_id: "CERT-TEST000001",
      recipient_name: "Test User",
      event_name: "Test Event",
      timestamp: new Date().toISOString()
    });
    console.log('Manual test scan triggered:', testQRData);
    triggerVibration();
    onScan(testQRData);
    stopCamera();
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
                  <Button variant="success" onClick={testScanQR}>
                    <FontAwesomeIcon icon={faQrcode} className="me-2" />
                    Test Scan (Alice Johnson)
                  </Button>
                  <Button variant="secondary" onClick={stopCamera}>
                    Stop Camera
                  </Button>
                </div>
                <div className="mt-2">
                  <Spinner animation="border" size="sm" className="me-2" />
                  <small className="text-muted">
                    Position QR code within the frame - scanning automatically... (Scans: {scanCount})
                    <br />
                    📳 Device will vibrate when QR code is detected
                  </small>
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
