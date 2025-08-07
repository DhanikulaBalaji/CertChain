import React, { useState, useRef, DragEvent } from 'react';
import { Card, Button, Alert, ProgressBar, ListGroup } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCloudUploadAlt, 
  faFile, 
  faCheckCircle, 
  faExclamationTriangle,
  faTrash,
  faSpinner
} from '@fortawesome/free-solid-svg-icons';

interface FileUploadProps {
  acceptedFiles: string;
  maxSize?: number; // in MB
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  uploadProgress?: number;
  isUploading?: boolean;
  error?: string;
  success?: string;
  title?: string;
  description?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  acceptedFiles,
  maxSize = 10,
  multiple = false,
  onFilesSelected,
  uploadProgress = 0,
  isUploading = false,
  error,
  success,
  title = "Upload Files",
  description = "Drag and drop files here or click to browse"
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    handleFiles(files);
  };

  const handleFiles = (files: File[]) => {
    // Validate file types and sizes
    const validFiles: File[] = [];
    const errors: string[] = [];

    files.forEach((file) => {
      // Check file type
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      const acceptedExtensions = acceptedFiles.split(',').map(ext => ext.trim());
      
      if (!acceptedExtensions.includes(fileExtension)) {
        errors.push(`${file.name}: Invalid file type. Accepted: ${acceptedFiles}`);
        return;
      }

      // Check file size
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > maxSize) {
        errors.push(`${file.name}: File too large. Max size: ${maxSize}MB`);
        return;
      }

      validFiles.push(file);
    });

    if (errors.length > 0) {
      console.error('File validation errors:', errors);
      return;
    }

    // Update selected files
    let newFiles = multiple ? [...selectedFiles, ...validFiles] : validFiles;
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    onFilesSelected([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className="mb-4">
      <Card.Body>
        <h5 className="mb-3">
          <FontAwesomeIcon icon={faCloudUploadAlt} className="me-2" />
          {title}
        </h5>

        {/* Drag and drop area */}
        <div
          className={`border-2 border-dashed rounded p-4 text-center mb-3 ${
            dragOver ? 'border-primary bg-light' : 'border-secondary'
          } ${isUploading ? 'opacity-50' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{ 
            minHeight: '120px', 
            cursor: isUploading ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease'
          }}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <FontAwesomeIcon 
            icon={dragOver ? faCheckCircle : faCloudUploadAlt} 
            size="2x" 
            className={`mb-2 ${dragOver ? 'text-primary' : 'text-muted'}`}
          />
          <p className="mb-2 text-muted">
            {description}
          </p>
          <p className="small text-muted mb-0">
            Accepted files: {acceptedFiles} | Max size: {maxSize}MB
            {multiple && ' | Multiple files allowed'}
          </p>
          
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedFiles}
            multiple={multiple}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={isUploading}
          />
        </div>

        {/* Upload progress */}
        {isUploading && (
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="small">
                <FontAwesomeIcon icon={faSpinner} spin className="me-2" />
                Uploading...
              </span>
              <span className="small text-muted">{uploadProgress}%</span>
            </div>
            <ProgressBar now={uploadProgress} variant="primary" />
          </div>
        )}

        {/* Error message */}
        {error && (
          <Alert variant="danger" className="mb-3">
            <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
            {error}
          </Alert>
        )}

        {/* Success message */}
        {success && (
          <Alert variant="success" className="mb-3">
            <FontAwesomeIcon icon={faCheckCircle} className="me-2" />
            {success}
          </Alert>
        )}

        {/* Selected files list */}
        {selectedFiles.length > 0 && (
          <>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="mb-0">Selected Files ({selectedFiles.length})</h6>
              {!isUploading && (
                <Button variant="outline-danger" size="sm" onClick={clearFiles}>
                  <FontAwesomeIcon icon={faTrash} className="me-1" />
                  Clear All
                </Button>
              )}
            </div>
            <ListGroup>
              {selectedFiles.map((file, index) => (
                <ListGroup.Item 
                  key={index} 
                  className="d-flex justify-content-between align-items-center"
                >
                  <div className="d-flex align-items-center">
                    <FontAwesomeIcon icon={faFile} className="me-2 text-primary" />
                    <div>
                      <div className="fw-bold">{file.name}</div>
                      <small className="text-muted">{formatFileSize(file.size)}</small>
                    </div>
                  </div>
                  {!isUploading && (
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => removeFile(index)}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </Button>
                  )}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </>
        )}
      </Card.Body>
    </Card>
  );
};

export default FileUpload;
