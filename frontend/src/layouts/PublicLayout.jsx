import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function PublicLayout() {
  const { status, user } = useAuth();
  const signedIn = status === 'ready' && user;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 bg-navy-900 text-white">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-bold">SlotSaver</Link>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <a href="/#features" className="hover:underline">Features</a>
            <a href="/#how" className="hover:underline">How it works</a>
            <NavLink to="/pricing" className="hover:underline">Pricing</NavLink>
            <a href="/#faq" className="hover:underline">FAQ</a>
            {signedIn ? (
              <Link to="/app" className="rounded-lg bg-white px-3 py-1.5 font-semibold text-navy-900">Open app</Link>
            ) : (
              <>
                <Link to="/login" className="hover:underline">Sign in</Link>
                <Link to="/signup" className="rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700">Get started</Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main id="main"><Outlet /></main>
      <footer className="mt-16 bg-navy-900 text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:grid-cols-3">
          <div>
            <p className="font-semibold text-white">SlotSaver</p>
            <p className="mt-2">Smart Appointment Scheduling for Your Business.</p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-white">Support</p>
            <p>Email: <span className="underline">support@example.com</span> (placeholder)</p>
            <p>Phone: +91 90000 00000 (placeholder)</p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-white">Legal</p>
            <p><Link className="underline" to="/privacy">Privacy Policy</Link></p>
            <p><Link className="underline" to="/terms">Terms of Service</Link></p>
            <p><Link className="underline" to="/login">Sign in</Link> · <Link className="underline" to="/signup">Get started</Link></p>
          </div>
        </div>
      </footer>
    </div>
  );
}

