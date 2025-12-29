import * as React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Customers from './pages/Customers';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Returns from './pages/Returns'; // Import the new Returns component
import { UserRole } from './types';
import { ToastProvider } from './contexts/ToastContext'; // Import ToastProvider
import { createAppDirectories } from './services/directoryService';
import { startSyncService } from './services/syncService'; // Import the sync service
import { SyncProvider } from './contexts/SyncContext'; // Import SyncProvider

// Top-level function for one-time application initialization
const initializeAppServices = async () => {
  await createAppDirectories();
};

function AppRoutes() {
  const { currentUser } = useAuth();

  React.useEffect(() => {
    // Start sync service only when a user is logged in
    if (currentUser) {
      startSyncService();
    }
  }, [currentUser]); // Dependency array: run when currentUser changes

  return (
    <Routes>
      <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" />} />

      {/* Protected Routes */}
      <Route
        path="/*"
        element={currentUser ? (
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/settings" element={<Settings />} />

              {/* Admin Only Routes */}
              <Route element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]} />}>
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/returns" element={<Returns />} /> {/* New Returns Route */}
              </Route>

              {/* Redirect any other paths to dashboard */}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Layout>
        ) : (
          <Navigate to="/login" />
        )}
      />
    </Routes>
  );
}

function App() {
  React.useEffect(() => {
    // Run global app initialization services once when the App component mounts
    initializeAppServices();
  }, []);

  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <SyncProvider>
            <AppRoutes />
          </SyncProvider>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
