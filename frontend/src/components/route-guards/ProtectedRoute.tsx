import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

type UserRole = 'customer_admin' | 'customer' | 'support_agent' | 'support_manager' | 'executor' | 'admin';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/my-company': ['customer', 'customer_admin'],
  '/invitations': ['support_agent', 'support_manager', 'executor', 'admin'],
  '/products': ['support_agent', 'support_manager', 'executor', 'admin'],
  '/products/new': ['support_agent', 'support_manager', 'executor', 'admin'],
  '/tasks': ['support_agent', 'support_manager', 'executor', 'admin'],
};

// Хелпер для проверки наличия хотя бы одной роли из списка
const hasAnyRole = (userRoles: UserRole[] | undefined, allowedRoles: UserRole[]): boolean => {
  if (!userRoles || userRoles.length === 0) return false;
  return userRoles.some(role => allowedRoles.includes(role));
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const requiredRoles = ROUTE_PERMISSIONS[location.pathname];

  if (requiredRoles && user && !hasAnyRole(user.roles as UserRole[], requiredRoles)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}