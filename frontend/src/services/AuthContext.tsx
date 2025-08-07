import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authAPI, User } from '../services/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateUser: (updatedUser: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    const storedToken = localStorage.getItem('access_token');
    if (storedToken) {
      try {
        const response = await authAPI.getCurrentUser();
        setUser(response.data);
        setIsAuthenticated(true);
        setToken(storedToken);
      } catch (error) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        setToken(null);
      }
    }
    setIsLoading(false);
  };

  const login = async (email: string, password: string) => {
    try {
      console.log('Attempting login with:', { email, apiUrl: 'http://localhost:8001' });
      const response = await authAPI.login({ username: email, password });
      console.log('Login response received:', { hasToken: !!response.data.access_token });
      
      const { access_token, user: userData } = response.data;
      
      if (!access_token) {
        throw new Error('No access token received');
      }
      
      localStorage.setItem('access_token', access_token);
      setToken(access_token);
      
      // If user data is in login response, use it, otherwise fetch it
      if (userData) {
        console.log('User data from login response:', userData);
        setUser(userData);
        setIsAuthenticated(true);
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        console.log('Fetching user data from /auth/me');
        // Get user info
        const userResponse = await authAPI.getCurrentUser();
        const userInfo = userResponse.data;
        
        console.log('User data from /auth/me:', userInfo);
        setUser(userInfo);
        setIsAuthenticated(true);
        localStorage.setItem('user', JSON.stringify(userInfo));
      }
      console.log('Login successful');
    } catch (error: any) {
      console.error('Login error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url
      });
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      throw new Error(error.response?.data?.detail || error.message || 'Login failed');
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
    setIsAuthenticated(false);
    setToken(null);
  };

  const refreshUser = async () => {
    if (isAuthenticated) {
      try {
        const response = await authAPI.getCurrentUser();
        setUser(response.data);
      } catch (error) {
        logout();
      }
    }
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    token,
    login,
    logout,
    refreshUser,
    updateUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
