import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Alert, Spinner } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQrcode, faTimes, faCamera, faUpload } from '@fortawesome/free-solid-svg-icons';

interface QRScannerProps {
  show: boolean;
  onHide: () => void;
  onScan: (result: string) => void;
  title?: string;
}

const QRScanner: React.FC<QRScannerProps> = ({ 
  show, 
  onHide, 
  onScan, 
  title = "Scan QR Code" 
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
      setError('Unable to access camera. Please check permissions or try uploading an image.');
      setIsScanning(false);
    }
  };
  
  // Stop camera stream
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsScanning(false);
  };
  
  // Scan QR code from video frame
  const scanFromCamera = () => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    
    try {
      // Get image data from canvas
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      // This is a simplified QR detection - in production, you'd use a proper QR library
      // like jsQR or qr-scanner
      const qrResult = detectQRFromImageData(imageData);
      
      if (qrResult) {
        onScan(qrResult);
        stopCamera();
        onHide();
      }
    } catch (err) {
      console.error('QR scanning error:', err);
    }
    
    // Continue scanning
    if (isScanning) {
      setTimeout(scanFromCamera, 100);
    }
  };
  
  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      
      // Create image element
      const img = new Image();
      img.onload = () => {
        // Draw image to canvas
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');
          
          if (context) {
            canvas.width = img.width;
            canvas.height = img.height;
            context.drawImage(img, 0, 0);
            
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const qrResult = detectQRFromImageData(imageData);
            
            if (qrResult) {
              onScan(qrResult);
              onHide();
            } else {
              setError('No QR code found in the uploaded image.');
            }
          }
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };
  
  // Simplified QR detection (placeholder - replace with actual QR library)
  const detectQRFromImageData = (imageData: ImageData): string | null => {
    // This is a mock implementation
    // In production, use a library like jsQR:
    // import jsQR from 'jsqr';
    // const code = jsQR(imageData.data, imageData.width, imageData.height);
    // return code?.data || null;
    
    // For demo purposes, simulate QR detection
    const mockQRData = localStorage.getItem('mock_qr_data');
    if (mockQRData && Math.random() > 0.5) { // 50% chance of "detecting" QR
      return mockQRData;
    }
    
    return null;
  };
  
  // Effects
  useEffect(() => {
    if (show && scanMode === 'camera') {
      startCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [show, scanMode]);
  
  useEffect(() => {
    if (isScanning && videoRef.current?.readyState === 4) {
      scanFromCamera();
    }
  }, [isScanning]);
  
  const handleClose = () => {
    stopCamera();
    setError('');
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <FontAwesomeIcon icon={faQrcode} className="me-2" />
          {title}
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        
        <div className="text-center mb-3">
          <div className="btn-group" role="group">
            <Button 
              variant={scanMode === 'camera' ? 'primary' : 'outline-primary'}
              onClick={() => setScanMode('camera')}
              disabled={isScanning}
            >
              <FontAwesomeIcon icon={faCamera} className="me-1" />
              Camera
            </Button>
            <Button 
              variant={scanMode === 'upload' ? 'primary' : 'outline-primary'}
              onClick={() => setScanMode('upload')}
            >
              <FontAwesomeIcon icon={faUpload} className="me-1" />
              Upload
            </Button>
          </div>
        </div>
        
        {scanMode === 'camera' && (
          <div className="text-center">
            <div className="position-relative d-inline-block">
              <video
                ref={videoRef}
                className="img-fluid border rounded"
                style={{ maxWidth: '100%', maxHeight: '400px' }}
                muted
                playsInline
              />
              {isScanning && (
                <div className="position-absolute top-50 start-50 translate-middle">
                  <div 
                    className="border border-primary border-2" 
                    style={{
                      width: '200px',
                      height: '200px',
                      borderStyle: 'dashed',
                      backgroundColor: 'rgba(0,123,255,0.1)'
                    }}
                  >
                    <div className="position-absolute top-50 start-50 translate-middle">
                      <small className="text-primary">
                        <FontAwesomeIcon icon={faQrcode} size="2x" />
                        <br />
                        Position QR code here
                      </small>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {isScanning && (
              <div className="mt-3">
                <Spinner animation="border" size="sm" className="me-2" />
                <small className="text-muted">Scanning for QR codes...</small>
              </div>
            )}
          </div>
        )}
        
        {scanMode === 'upload' && (
          <div className="text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            
            <div 
              className="border border-dashed border-2 rounded p-5"
              style={{ cursor: 'pointer' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <FontAwesomeIcon icon={faUpload} size="3x" className="text-muted mb-3" />
              <h5>Upload QR Code Image</h5>
              <p className="text-muted">
                Click here to select an image containing a QR code
                <br />
                <small>Supports: JPG, PNG, GIF</small>
              </p>
            </div>
          </div>
        )}
        
        {/* Hidden canvas for processing */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </Modal.Body>
      
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          <FontAwesomeIcon icon={faTimes} className="me-1" />
          Cancel
        </Button>
        {scanMode === 'camera' && !isScanning && (
          <Button variant="primary" onClick={startCamera}>
            <FontAwesomeIcon icon={faCamera} className="me-1" />
            Start Scanning
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default QRScanner;
