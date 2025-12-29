import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    // User not logged in, redirect to login page
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    // User does not have the required role, redirect to dashboard (or an unauthorized page)
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
