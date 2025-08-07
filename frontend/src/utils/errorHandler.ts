// Utility functions for handling API errors

export interface ValidationError {
  type: string;
  loc: (string | number)[];
  msg: string;
  input?: any;
  url?: string;
}

export const getErrorMessage = (error: any): string => {
  if (typeof error === 'string') {
    return error;
  }
  
  // Handle FastAPI validation errors
  if (error?.response?.data?.detail) {
    const detail = error.response.data.detail;
    
    if (typeof detail === 'string') {
      return detail;
    }
    
    // Handle array of validation errors
    if (Array.isArray(detail)) {
      return detail.map((err: ValidationError) => {
        if (typeof err === 'string') return err;
        if (err?.msg) {
          const location = err.loc?.join(' -> ') || 'field';
          return `${location}: ${err.msg}`;
        }
        return String(err);
      }).join(', ');
    }
    
    // Handle object detail
    if (typeof detail === 'object') {
      if (detail.msg) return detail.msg;
      if (detail.message) return detail.message;
      return JSON.stringify(detail);
    }
    
    return String(detail);
  }
  
  // Handle direct error messages
  if (error?.message) {
    return error.message;
  }
  
  // Handle response data messages
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  
  // Fallback
  return String(error);
};

export const formatValidationErrors = (errors: ValidationError[]): string[] => {
  return errors.map(err => {
    const location = err.loc?.join(' -> ') || 'field';
    return `${location}: ${err.msg}`;
  });
};

export const isValidationError = (error: any): boolean => {
  return (
    error?.response?.data?.detail &&
    Array.isArray(error.response.data.detail) &&
    error.response.data.detail.length > 0 &&
    error.response.data.detail[0]?.type &&
    error.response.data.detail[0]?.msg
  );
};

export const handleApiError = (error: any): string => {
  console.error('API Error:', error);
  return getErrorMessage(error);
};
