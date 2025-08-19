import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './services/AuthContext';
import Navbar from './components/Navbar';
import NotificationToast from './components/NotificationToast';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import MyCertificates from './pages/MyCertificates';
import ForgotPassword from './pages/ForgotPassword';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import AdminDashboard from './pages/AdminDashboard';
import UserDashboard from './pages/UserDashboard';
import CertificateValidation from './pages/CertificateValidation';
import CertificateDetailsPage from './pages/CertificateDetailsPage';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './App.css';
import './EnhancedAnimations.css';

// Protected Route Component
const ProtectedRoute: React.FC<{ 
  children: React.ReactNode; 
  allowedRoles?: string[];
}> = ({ children, allowedRoles = [] }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && user && !allowedRoles.includes(user.role)) {
    // Redirect to dashboard for all authenticated users
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

// Public Route Component (redirect if already logged in)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    // Redirect to dashboard for all authenticated users
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

// Dashboard Router Component
const DashboardRouter: React.FC = () => {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  
  switch (user.role) {
    case 'super_admin':
      return <SuperAdminDashboard />;
    case 'admin':
      return <AdminDashboard />;
    case 'user':
      return <UserDashboard />;
    default:
      return <UserDashboard />;
  }
};

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="App">
      {isAuthenticated && <Navbar />}
      <NotificationToast />
      <main>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } />
          <Route path="/register" element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          } />
          <Route path="/forgot-password" element={
            <PublicRoute>
              <ForgotPassword />
            </PublicRoute>
          } />

          {/* Protected Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute allowedRoles={['user', 'admin', 'super_admin']}>
              <DashboardRouter />
            </ProtectedRoute>
          } />
          
          <Route path="/super-admin-dashboard" element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <SuperAdminDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/admin-dashboard" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/user-dashboard" element={
            <ProtectedRoute allowedRoles={['user']}>
              <UserDashboard />
            </ProtectedRoute>
          } />

          <Route path="/my-certificates" element={
            <ProtectedRoute allowedRoles={['user', 'admin', 'super_admin']}>
              <MyCertificates />
            </ProtectedRoute>
          } />

          <Route path="/profile" element={
            <ProtectedRoute allowedRoles={['user', 'admin', 'super_admin']}>
              <Profile />
            </ProtectedRoute>
          } />

          <Route path="/validate-certificate" element={
            <CertificateValidation />
          } />

          <Route path="/certificate/:certificateId" element={
            <CertificateDetailsPage />
          } />

          {/* Default Route */}
          <Route path="/" element={
            <Navigate to={isAuthenticated ? "/user-dashboard" : "/login"} replace />
          } />

          {/* Catch All Route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
};

export default App;
