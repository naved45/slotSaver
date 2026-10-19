import { Link } from 'react-router-dom';
import { Card, Button } from '../../components/ui.jsx';

const PLANS = [
  { name: 'Free', price: '₹0', limits: ['1 staff member', '50 appointments a month', 'Email reminders in development preview only'] },
  { name: 'Starter', price: '₹799/mo', note: 'Proposed price to validate', limits: ['5 staff members', 'Unlimited appointments', 'Email reminders (requires SMTP)'] },
  { name: 'Growth', price: '₹2,499/mo', note: 'Proposed price to validate', limits: ['25 staff members', 'Analytics export', 'Priority support (placeholder)'] },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold">Pricing</h1>
      <p className="mt-2 max-w-2xl text-slate-700">Prices below are proposed to validate with real businesses. Payment collection is not available yet, so no card is charged.</p>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.name} title={p.name} className="flex flex-col">
            <p className="text-2xl font-bold">{p.price}</p>
            {p.note && <p className="text-xs text-slate-600">{p.note}</p>}
            <ul className="mt-4 flex-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {p.limits.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <Link to="/signup" className="mt-6"><Button className="w-full">Get started</Button></Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
