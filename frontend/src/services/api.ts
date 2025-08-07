import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = 'http://localhost:8001';

// Create axios instance with default config
const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 60000, // 60 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error: any) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle token expiration
interface ErrorResponse {
    response?: {
        status?: number;
        [key: string]: any;
    };
    [key: string]: any;
}

api.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: ErrorResponse) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: 'user' | 'admin' | 'super_admin';
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
}

export interface LoginRequest {
  username: string;  // Note: API expects username field but it's actually email
  password: string;
}

export interface RegisterRequest {
  email: string;
  full_name: string;
  password: string;
  role: 'user' | 'admin';
}

export interface Certificate {
  id: number;
  certificate_id: string;
  recipient_name: string;
  event_id: number;
  recipient_id?: number;
  sha256_hash: string;
  blockchain_tx_hash?: string;
  qr_code_data?: string;
  pdf_path?: string;
  status: 'active' | 'revoked' | 'suspended';
  is_verified: boolean;
  issued_at: string;
  revoked_at?: string;
}

export interface Event {
  id: number;
  name: string;
  description?: string;
  date: string;
  admin_id: number;
  is_approved: boolean;
  approved_by?: number;
  template_path?: string;
  created_at: string;
}

export interface ValidationResult {
  status: 'valid' | 'tampered' | 'suspicious' | 'not_found';
  certificate?: Certificate;
  details: any;
  timestamp: string;
}

// Auth API
export interface LoginResponse {
    access_token: string;
    token_type: string;
    user: User;
}

export interface RegisterResponse {
    user: User;
    message: string;
}

export interface ApproveUserResponse {
    user: User;
    message: string;
}

export interface UpdateUserResponse {
    user: User;
    message: string;
}

export interface DeactivateUserResponse {
    message: string;
}

export const authAPI = {
    login: (credentials: LoginRequest) =>
        api.post<LoginResponse>('/auth/login', credentials, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            transformRequest: [(data: LoginRequest) => {
                const params = new URLSearchParams();
                params.append('username', data.username);
                params.append('password', data.password);
                return params;
            }]
        }),

    register: (userData: RegisterRequest) =>
        api.post<RegisterResponse>('/auth/register', userData),

    getCurrentUser: () =>
        api.get<User>('/auth/me'),

    getUsers: (skip = 0, limit = 100) =>
        api.get<User[]>(`/auth/users?skip=${skip}&limit=${limit}`),

    approveUser: (userId: number) =>
        api.put<ApproveUserResponse>(`/auth/users/${userId}/approve`),

    updateUser: (userId: number, updates: Partial<User>) =>
        api.put<UpdateUserResponse>(`/auth/users/${userId}`, updates),

    deactivateUser: (userId: number) =>
        api.delete<DeactivateUserResponse>(`/auth/users/${userId}/deactivate`),
};

// Events API
export const eventsAPI = {
  getEvents: (skip = 0, limit = 100, approvedOnly = true) => 
    api.get<Event[]>(`/events?skip=${skip}&limit=${limit}&approved_only=${approvedOnly}`),
  
  getEvent: (eventId: number) => 
    api.get<Event>(`/events/${eventId}`),
  
  createEvent: (eventData: Omit<Event, 'id' | 'admin_id' | 'is_approved' | 'created_at'>) => {
    const formData = new FormData();
    formData.append('name', eventData.name || '');
    formData.append('description', eventData.description || '');
    formData.append('date', eventData.date || '');
    return api.post('/events/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  updateEvent: (eventId: number, updates: Partial<Event>) => 
    api.put(`/events/${eventId}`, updates),
  
  approveEvent: (eventId: number) => 
    api.put(`/events/${eventId}/approve`),
  
  disapproveEvent: (eventId: number, reason: string) => {
    const formData = new FormData();
    formData.append('reason', reason);
    return api.put(`/events/${eventId}/disapprove`, formData);
  },
  
  deleteEvent: (eventId: number, force: boolean = false, permanent: boolean = false) => 
    api.delete(`/events/${eventId}${force ? '?force=true' : ''}${permanent && force ? '&permanent=true' : ''}`),
  
  deleteEventPermanent: (eventId: number) => 
    api.delete(`/events/${eventId}/permanent`),
  
  uploadTemplate: (eventId: number, file: File) => {
    const formData = new FormData();
    formData.append('template_file', file);
    return api.post(`/events/${eventId}/template`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  getPendingApprovals: (skip = 0, limit = 100) => 
    api.get<Event[]>(`/events/pending/approvals?skip=${skip}&limit=${limit}`),
};

// Certificates API
export const certificatesAPI = {
  getCertificates: (skip = 0, limit = 100, eventId?: number, status?: string) => {
    let url = `/certificates?skip=${skip}&limit=${limit}`;
    if (eventId) url += `&event_id=${eventId}`;
    if (status) url += `&status_filter=${status}`;
    return api.get<Certificate[]>(url);
  },
  
  getCertificate: (certificateId: string) => 
    api.get<Certificate>(`/certificates/${certificateId}`),
  
  generateSingleCertificate: (data: {
    certificate_id: string;
    recipient_name: string;
    event_id: number;
    recipient_id?: number;
  }) => 
    api.post('/certificates/generate', data),
  
  generateBulkCertificates: (eventId: number, csvFile: File) => {
    const formData = new FormData();
    formData.append('event_id', eventId.toString());
    formData.append('csv_file', csvFile);
    return api.post('/certificates/generate-bulk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  validateCertificate: (data: {
    certificate_id?: string;
    qr_code_data?: string;
  }) => 
    api.post<ValidationResult>('/certificates/validate', data),
  
  revokeCertificate: (certificateId: string, reason: string) => {
    const formData = new FormData();
    formData.append('reason', reason);
    return api.put(`/certificates/${certificateId}/revoke`, formData);
  },
  
  downloadCertificate: (certificateId: string) => 
    api.get(`/certificates/download/${certificateId}/pdf`, {
      responseType: 'blob'
    }),
};

// System API
export const systemAPI = {
  getHealth: () => 
    api.get('/health'),
  
  getSystemInfo: () => 
    api.get('/system/info'),
};

export default api;
