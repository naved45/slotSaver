import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarRange, LayoutDashboard, ListChecks, Menu, Scissors, Settings, Stethoscope, Users, BarChart3, BellRing, X, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Button } from '../components/ui.jsx';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarRange },
  { to: '/app/waitlist', label: 'Waitlist', icon: ListChecks },
  { to: '/app/customers', label: 'Customers', icon: Users },
  { to: '/app/services', label: 'Services', icon: Scissors },
  { to: '/app/staff', label: 'Staff', icon: Stethoscope },
  { to: '/app/reminders', label: 'Reminders', icon: BellRing },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout() {
  const { org, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const isManager = org?.role === 'owner' || org?.role === 'admin';

  const items = NAV.filter((n) => isManager || ['/app', '/app/appointments', '/app/calendar', '/app/settings'].includes(n.to));

  const nav = (
    <nav aria-label="Business" className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 shrink-0 flex-col bg-navy-900 p-4 lg:flex">
        <p className="mb-6 px-3 text-lg font-bold text-white">SlotSaver</p>
        {nav}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 bg-navy-900/60 lg:hidden" onClick={() => setOpen(false)} role="presentation">
          <aside className="h-full w-64 bg-navy-900 p-4" onClick={(e) => e.stopPropagation()} aria-label="Menu">
            <div className="mb-6 flex items-center justify-between px-3">
              <p className="text-lg font-bold text-white">SlotSaver</p>
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="text-white"><X /></button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu /></button>
            <p className="font-semibold text-navy-900">{org?.name ?? 'Your business'}</p>
            {org && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800">{org.role}</span>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{user?.fullName}</span>
            <Button
              variant="secondary"
              onClick={async () => { await logout(); navigate('/login'); }}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </Button>
          </div>
        </header>
        <main id="main" className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
