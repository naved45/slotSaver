import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorInfo } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, PageHeader, PasswordInput, Select, Skeleton } from '../../components/ui.jsx';

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];

export default function SettingsPage() {
  const { org, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const isOwner = org.role === 'owner';
  const isManager = isOwner || org.role === 'admin';
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [accountPassword, setAccountPassword] = useState('');
  const [archiveName, setArchiveName] = useState('');
  const [dialog, setDialog] = useState(null);

  const orgData = useApi(() => api.get(`/orgs/${org.id}`).then((r) => r.data.data), [org.id]);
  const members = useApi(() => (isManager ? api.get(`/orgs/${org.id}/members`).then((r) => r.data.data) : Promise.resolve([])), [org.id, isManager]);
  const sessions = useApi(() => api.get('/auth/sessions').then((r) => r.data.data), []);

  const flash = (text) => { setErr(null); setMsg(text); };
  const fail = (e) => { setMsg(null); setErr(errorInfo(e).message); };

  const saveProfile = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api.patch(`/orgs/${org.id}`, {
        name: f.get('name'),
        timezone: f.get('timezone'),
        bookingPolicy: { cancelCutoffMinutes: Number(f.get('cutoff')) },
      });
      flash('Business profile saved.'); orgData.reload(); refresh();
    } catch (x) { fail(x); }
  };

  const invite = async (e) => {
    e.preventDefault();
    try { const { data } = await api.post(`/orgs/${org.id}/invitations`, { email: inviteEmail, role: inviteRole }); flash(data.data.message); setInviteEmail(''); }
    catch (x) { fail(x); }
  };

  const changeRole = async (m, role) => {
    try { await api.patch(`/orgs/${org.id}/members/${m.membershipId}`, { role }); flash('Role updated.'); members.reload(); }
    catch (x) { fail(x); }
  };

  const removeMember = async (m) => {
    try { await api.delete(`/orgs/${org.id}/members/${m.membershipId}`); flash('Member removed.'); members.reload(); }
    catch (x) { fail(x); }
    setDialog(null);
  };

  const revoke = async (id) => {
    try { await api.delete(`/auth/sessions/${id}`); flash('Session signed out.'); sessions.reload(); }
    catch (x) { fail(x); }
  };

  const exportData = async () => {
    try {
      const { data } = await api.get('/auth/export');
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'slotsaver-my-data.json'; a.click();
      URL.revokeObjectURL(url);
      flash('Your data export has downloaded.');
    } catch (x) { fail(x); }
  };

  const archive = async () => {
    try { await api.delete(`/orgs/${org.id}`, { data: { confirmName: archiveName } }); setDialog(null); flash('Organization archived. Bookings have stopped.'); refresh(); }
    catch (x) { setDialog(null); fail(x); }
  };

  const deleteAccount = async () => {
    try { await api.delete('/auth/account', { data: { password: accountPassword } }); await logout(); navigate('/', { replace: true }); }
    catch (x) { setDialog(null); fail(x); }
  };

  return (
    <>
      <PageHeader title="Settings" description="Business profile, team, security, and your data." />
      {msg && <div className="mb-4"><Alert tone="success">{msg}</Alert></div>}
      {err && <div className="mb-4"><Alert tone="error">{err}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Business profile">
          {orgData.loading && <Skeleton rows={3} />}
          {orgData.error && <ErrorState error={orgData.error} onRetry={orgData.reload} />}
          {orgData.data && (
            <form onSubmit={saveProfile} className="space-y-4">
              <Field label="Business name"><Input name="name" defaultValue={orgData.data.name} disabled={!isOwner} required minLength={2} /></Field>
              <Field label="Timezone" hint="Changing this changes how every time is shown.">{(p) => <Select {...p} name="timezone" defaultValue={orgData.data.timezone} disabled={!isOwner}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
              <Field label="Customer cancellation cutoff (minutes before)"><Input name="cutoff" type="number" min="0" defaultValue={orgData.data.bookingPolicy.cancelCutoffMinutes} disabled={!isOwner} /></Field>
              {isOwner ? <Button type="submit">Save profile</Button> : <p className="text-xs text-slate-600">Only the owner can change this.</p>}
            </form>
          )}
        </Card>

        {isManager && (
          <Card title="Team">
            {members.loading && <Skeleton rows={3} />}
            {members.error && <ErrorState error={members.error} onRetry={members.reload} />}
            <ul className="divide-y divide-slate-200 text-sm">
              {(members.data ?? []).map((m) => (
                <li key={m.membershipId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{m.user?.fullName ?? 'Member'} <span className="text-slate-600">{m.user?.email}</span></span>
                  {m.role === 'owner' ? <span className="text-slate-700">Owner</span> : (
                    <span className="flex items-center gap-2">
                      {isOwner ? (
                        <>
                          <Select aria-label={`Role for ${m.user?.fullName}`} className="w-32" value={m.role} onChange={(e) => changeRole(m, e.target.value)}>
                            <option value="admin">Admin</option><option value="staff">Staff</option>
                          </Select>
                          <Button variant="secondary" onClick={() => setDialog({ type: 'remove', member: m })}>Remove</Button>
                        </>
                      ) : <span>{m.role}</span>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={invite} className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <label className="sr-only" htmlFor="inv-email">Email to invite</label>
              <Input id="inv-email" type="email" placeholder="colleague@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
              <label className="sr-only" htmlFor="inv-role">Role</label>
              <Select id="inv-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="staff">Staff</option>{isOwner && <option value="admin">Admin</option>}
              </Select>
              <Button type="submit">Send invitation</Button>
            </form>
          </Card>
        )}

        <Card title="Security: signed-in devices">
          {sessions.loading && <Skeleton rows={2} />}
          {sessions.error && <ErrorState error={sessions.error} onRetry={sessions.reload} />}
          {sessions.data?.length === 0 && <EmptyState title="No other sessions" />}
          <ul className="divide-y divide-slate-200 text-sm">
            {(sessions.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <span>{s.current ? 'This device' : 'Another device'} · last active {new Date(s.lastSeenAt).toLocaleString('en-GB')}</span>
                {!s.current && <Button variant="secondary" onClick={() => revoke(s.id)}>Sign out</Button>}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Your data and account">
          <div className="space-y-4 text-sm">
            <p>Download a copy of your account data as JSON.</p>
            <Button variant="secondary" onClick={exportData}>Download my data</Button>
            {isOwner && (
              <div className="border-t border-slate-200 pt-4">
                <p>Archive the business to stop all bookings and hide it from customers. Type its name to confirm.</p>
                <div className="mt-2 flex gap-2">
                  <Input aria-label="Type the organization name to confirm" value={archiveName} onChange={(e) => setArchiveName(e.target.value)} placeholder={orgData.data?.name ?? ''} />
                  <Button variant="danger" disabled={!orgData.data || archiveName !== orgData.data.name} onClick={() => setDialog({ type: 'archive' })}>Archive</Button>
                </div>
              </div>
            )}
            <div className="border-t border-slate-200 pt-4">
              <Field label="Current password (to delete your account)">{(p) => <PasswordInput {...p} value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} />}</Field>
              <div className="mt-2"><Button variant="danger" disabled={!accountPassword} onClick={() => setDialog({ type: 'account' })}>Delete my account</Button></div>
              <p className="mt-2 text-xs text-slate-600">Owners must archive their business first. Deletion anonymizes your personal details.</p>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmDialog open={dialog?.type === 'remove'} title="Remove this member?" body="They will lose access immediately." confirmLabel="Remove" danger onCancel={() => setDialog(null)} onConfirm={() => removeMember(dialog.member)} />
      <ConfirmDialog open={dialog?.type === 'archive'} title="Archive this business?" body="Customers will no longer be able to book, and staff lose access. This cannot be undone from the app." confirmLabel="Archive business" danger onCancel={() => setDialog(null)} onConfirm={archive} />
      <ConfirmDialog open={dialog?.type === 'account'} title="Delete your account?" body="Your personal details are removed and you are signed out. This cannot be undone." confirmLabel="Delete account" danger onCancel={() => setDialog(null)} onConfirm={deleteAccount} />
    </>
  );
}
