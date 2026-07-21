import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/route-guards/ProtectedRoute';
import { Toaster } from './components/ui/toaster';
import { Loader2 } from 'lucide-react';
import { NotificationsProvider } from './contexts/NotificationsContext';

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="w-12 h-12 text-[var(--accent)] animate-spin" />
  </div>
);

const LazyRoute = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TicketsPage = lazy(() => import('./pages/TicketsPage'));
const NewTicketPage = lazy(() => import('./pages/NewTicketPage'));
const TicketDetailPage = lazy(() => import('./pages/TicketDetailPage'));
const CounterpartiesPage = lazy(() => import('./pages/CounterpartiesPage'));
const NewCounterpartyPage = lazy(() => import('./pages/NewCounterpartyPage'));
const CounterpartyDetailPage = lazy(() => import('./pages/CounterpartyDetailPage'));
const MyCompanyPage = lazy(() => import('./pages/MyCompanyPage'));
const InvitationsPage = lazy(() => import('./pages/InvitationsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const NewProjectPage = lazy(() => import('./pages/NewProjectPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const ProductsTab = lazy(() => import('./pages/ProductsPage'));
const CreateProductPage = lazy(() => import('./pages/CreateProductPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const LurvDetailPage = lazy(() => import('./pages/LurvDetailPage'));
const FeedbacksPage  = lazy(() => import('./pages/FeedbacksPage'));


export default function App() {
  return (
    <NotificationsProvider>
    <ThemeProvider>
      <>
        <Routes>
          <Route path="/login" element={<LazyRoute><LoginPage /></LazyRoute>} />
          <Route path="/auth/invite/accept" element={<LazyRoute><RegisterPage /></LazyRoute>} />
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<LazyRoute><DashboardPage /></LazyRoute>} />

            <Route path="/lurvs" element={<LazyRoute><LurvDetailPage /></LazyRoute>} />

            <Route path="/tasks" element={<LazyRoute><ProtectedRoute><TasksPage /></ProtectedRoute></LazyRoute>} />
            <Route path="/tickets" element={<LazyRoute><TicketsPage /></LazyRoute>} />
            <Route path="/tickets/new" element={<LazyRoute><NewTicketPage /></LazyRoute>} />
            <Route path="/tickets/:ticketNumber" element={<LazyRoute><TicketDetailPage /></LazyRoute>} />
            <Route path="/counterparties" element={<LazyRoute><CounterpartiesPage /></LazyRoute>} />
            <Route path="/counterparties/new" element={<LazyRoute><NewCounterpartyPage /></LazyRoute>} />
            <Route path="/counterparties/:id" element={<LazyRoute><CounterpartyDetailPage /></LazyRoute>} />
            <Route path="/projects" element={<LazyRoute><ProjectsPage /></LazyRoute>} />
            <Route path="/projects/new" element={<LazyRoute><NewProjectPage /></LazyRoute>} />
            <Route path="/projects/:id" element={<LazyRoute><ProjectDetailPage /></LazyRoute>} />
            <Route path="/my-company" element={<LazyRoute><ProtectedRoute><MyCompanyPage /></ProtectedRoute></LazyRoute>} />
            <Route path="/invitations" element={<LazyRoute><ProtectedRoute><InvitationsPage /></ProtectedRoute></LazyRoute>} />
            <Route path="/products" element={<LazyRoute><ProtectedRoute><ProductsTab /></ProtectedRoute></LazyRoute>} />
            <Route path="/products/new" element={<LazyRoute><ProtectedRoute><CreateProductPage /></ProtectedRoute></LazyRoute>} />
            <Route path="/notifications" element={<LazyRoute><NotificationsPage /></LazyRoute>} />
            <Route path="/profile" element={<LazyRoute><ProfilePage /></LazyRoute>} />


            <Route path="/feedbacks" element={<LazyRoute><FeedbacksPage /></LazyRoute>} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
        <Toaster />
      </>
    </ThemeProvider>
    </NotificationsProvider>
  );
}
