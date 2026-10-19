import { Link } from 'react-router-dom';
import { CalendarCheck, Clock, ListChecks, ShieldCheck, Smartphone, BarChart3, Users, Bell } from 'lucide-react';

const FEATURES = [
  [CalendarCheck, 'Online booking and cancellation', 'Customers book, reschedule, and cancel from a link, within the rules you set.'],
  [ListChecks, 'Smart waitlists and automatic slot offers', 'When a slot opens, the best eligible waitlisted customer is offered it first. Only one person can take it.'],
  [Bell, 'Email reminders and confirmation tracking', 'Reminders go out at times you choose. Delivery status is shown honestly, never assumed.'],
  [Clock, 'Calendar and staff availability', 'Working hours, breaks, closures and staff schedules, all in your business timezone.'],
  [BarChart3, 'Cancellation and no-show analytics', 'See cancellations, no-shows and recovered bookings, computed from your real records.'],
  [Users, 'Customer management', 'Customer history and contact consent in one place, with only the details needed to schedule.'],
  [Smartphone, 'Mobile-friendly booking', 'The booking page works well on a phone, with a keyboard-friendly flow.'],
  [ShieldCheck, 'Secure organization and staff access', 'Roles limit what staff can see. Each business is kept separate from every other.'],
];

export default function LandingPage() {
  return (
    <>
      <section className="bg-navy-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-purple-500">Get more bookings. Less no-shows.</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight">Smart Appointment Scheduling for Your Business.</h1>
            <p className="mt-4 text-lg text-slate-300">Automatically recover cancelled slots, manage your team, and keep your schedule full — all in one place.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup" className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold hover:bg-indigo-700">Start Free Trial</Link>
              <Link to="/book/maple-dental-studio" className="rounded-lg bg-white/10 px-5 py-3 font-semibold ring-1 ring-white/30 hover:bg-white/20">Explore Demo</Link>
            </div>
            <p className="mt-4 text-xs text-slate-400">The demo uses fictional business data.</p>
          </div>
          <div aria-label="Dashboard preview" className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
            <div className="grid grid-cols-3 gap-3 text-center text-navy-900">
              <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-600">Upcoming</p><p className="text-xl font-bold">—</p></div>
              <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-600">Recovered</p><p className="text-xl font-bold text-green-700">—</p></div>
              <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-600">Open slots</p><p className="text-xl font-bold">—</p></div>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {['10:00 · Dental cleaning · Dr. Meera', '11:00 · Check-up · Dr. Ravi', '12:30 · Cleaning · offered from waitlist'].map((t) => (
                <li key={t} className="rounded-lg bg-white px-3 py-2 text-navy-900">{t}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-400">Layout preview only. Real figures appear once your business is set up.</p>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-bold">Everything your front desk needs</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([Icon, title, body]) => (
            <article key={title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <Icon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-slate-700">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-4">
            {['Set up services, staff, and availability.', 'Let customers book appointments.', 'Fill cancelled slots from the waitlist.', 'Track bookings and recovery performance.'].map((s, i) => (
              <li key={s} className="rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200"><p className="text-sm font-bold text-indigo-700">Step {i + 1}</p><p className="mt-2">{s}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-2xl font-bold">Questions</h2>
        <dl className="mt-6 space-y-5">
          <div><dt className="font-semibold">Can two customers book the same time?</dt><dd className="mt-1 text-slate-700">No. The server checks every booking against the live schedule, and a database rule stops two bookings for the same staff member and time.</dd></div>
          <div><dt className="font-semibold">Are the prices final?</dt><dd className="mt-1 text-slate-700">The plans on the pricing page are proposed prices to validate. They are not proven market prices.</dd></div>
          <div><dt className="font-semibold">Is this a medical records system?</dt><dd className="mt-1 text-slate-700">No. SlotSaver is for scheduling only. It does not store medical records.</dd></div>
        </dl>
      </section>
    </>
  );
}
