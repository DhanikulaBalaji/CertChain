import '@fortawesome/fontawesome-free/css/all.min.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import React from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import './App.css';
import './design-system.css';
import Navbar from './components/Navbar';
import NotificationToast from './components/NotificationToast';
import './EnhancedAnimations.css';
import AdminDashboard from './pages/AdminDashboard';
import CertificateDetailsPage from './pages/CertificateDetailsPage';
import CertificateValidation from './pages/CertificateValidation';
import CertificateWallet from './pages/CertificateWallet';
import ForgotPassword from './pages/ForgotPassword';
import Login from './pages/Login';
import MyCertificates from './pages/MyCertificates';
import Profile from './pages/Profile';
import PublicCertificateView from './pages/PublicCertificateView';
import VerifyPage from './pages/VerifyPage';
import Register from './pages/Register';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import UserDashboard from './pages/UserDashboard';
import { AuthProvider, useAuth } from './services/AuthContext';

// Protected Route Component
const ProtectedRoute: React.FC<{ 
  children: React.ReactNode; 
  allowedRoles?: string[];
}> = ({ children, allowedRoles = [] }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight:'100vh', background:'var(--grad-bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span className="ds-spinner ds-spinner-lg" />
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
      <div style={{ minHeight:'100vh', background:'var(--grad-bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span className="ds-spinner ds-spinner-lg" />
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
  // /verify pages: hide navbar for unauthenticated visitors (QR scan public view)
  // but SHOW navbar for logged-in users so they can navigate back
  const isUnauthPublicVerify = !isAuthenticated && (
    window.location.pathname.startsWith('/verify') ||
    window.location.pathname.startsWith('/cert/')
  );

  return (
    <div className="App">
      {isAuthenticated && !isUnauthPublicVerify && <Navbar />}
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

          {/* Wallet and Certificates — USER only */}
          <Route path="/my-certificates" element={
            <ProtectedRoute allowedRoles={['user']}>
              <MyCertificates />
            </ProtectedRoute>
          } />

          <Route path="/wallet" element={
            <ProtectedRoute allowedRoles={['user']}>
              <CertificateWallet />
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

          {/* Unified certificate verification route — role-aware (Public / User / Admin) */}
          <Route path="/verify/:certificateId" element={<VerifyPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/cert/:certificateId" element={<VerifyPage />} />

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
