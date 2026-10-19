import { lazy, Suspense } from 'react';
import { Route, Routes, Navigate, useParams } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import LandingPage from './pages/public/LandingPage.jsx';
import PricingPage from './pages/public/PricingPage.jsx';
import BookingPage from './pages/public/BookingPage.jsx';
import ManageBookingPage from './pages/public/ManageBookingPage.jsx';
import OfferPage from './pages/public/OfferPage.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import SignupPage from './pages/auth/SignupPage.jsx';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/auth/ResetPasswordPage.jsx';
import VerifyEmailPage from './pages/auth/VerifyEmailPage.jsx';
import AcceptInvitationPage from './pages/auth/AcceptInvitationPage.jsx';
import DashboardPage from './pages/app/DashboardPage.jsx';
import OnboardingPage from './pages/app/OnboardingPage.jsx';
import AppointmentsPage from './pages/app/AppointmentsPage.jsx';
import NewAppointmentPage from './pages/app/NewAppointmentPage.jsx';
import AppointmentDetailPage from './pages/app/AppointmentDetailPage.jsx';
import CalendarPage from './pages/app/CalendarPage.jsx';
import WaitlistPage from './pages/app/WaitlistPage.jsx';
import CustomersPage from './pages/app/CustomersPage.jsx';
import CustomerDetailPage from './pages/app/CustomerDetailPage.jsx';
import ServicesPage from './pages/app/ServicesPage.jsx';
import StaffPage from './pages/app/StaffPage.jsx';
import RemindersPage from './pages/app/RemindersPage.jsx';
const AnalyticsPage = lazy(() => import('./pages/app/AnalyticsPage.jsx'));
import SettingsPage from './pages/app/SettingsPage.jsx';
import { NotFoundPage, ForbiddenPage, ServerErrorPage } from './pages/errors/ErrorPages.jsx';

/** Old short link /book/:slug/:serviceSlug is kept; this forwards any unknown book path. */
function BookRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/book/${slug}`} replace />;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />
          <Route path="accept-invitation" element={<AcceptInvitationPage />} />
          <Route path="book/:slug" element={<BookingPage />} />
          <Route path="book/:slug/:serviceSlug" element={<BookingPage />} />
          <Route path="manage/:token" element={<ManageBookingPage />} />
          <Route path="offers/:token" element={<OfferPage />} />
          <Route path="privacy" element={<PolicyPage title="Privacy Policy" />} />
          <Route path="terms" element={<PolicyPage title="Terms of Service" />} />
          <Route path="403" element={<ForbiddenPage />} />
          <Route path="500" element={<ServerErrorPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="app" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="appointments" element={<AppointmentsPage />} />
            <Route path="appointments/new" element={<NewAppointmentPage />} />
            <Route path="appointments/:id" element={<AppointmentDetailPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="waitlist" element={<WaitlistPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="services" element={<ServicesPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="reminders" element={<RemindersPage />} />
            <Route path="analytics" element={<Suspense fallback={<p className="p-6 text-sm">Loading analytics…</p>}><AnalyticsPage /></Suspense>} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="book" element={<Navigate to="/" replace />} />
        <Route path="book/*" element={<BookRedirect />} />
      </Routes>
    </AppErrorBoundary>
  );
}

function PolicyPage({ title }) {
  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-12">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-slate-700">This is a placeholder. Replace it with your reviewed legal text before launch. SlotSaver has not undergone a legal review or compliance assessment.</p>
    </div>
  );
}
