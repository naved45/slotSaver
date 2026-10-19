import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, client } from '../helpers/testApp.js';
import { createOwner, setupCatalog } from '../helpers/fixtures.js';

let app;
let owner;
beforeAll(async () => {
  app = await startTestApp();
  owner = await createOwner(app.base, { email: 'acct-owner@example.com', businessName: 'Lotus Salon' });
  await setupCatalog(owner);
});
afterAll(async () => { await app.close(); });

describe('personal data export', () => {
  it('exports the profile and memberships without secrets', async () => {
    const res = await owner.client.get('/api/v1/auth/export');
    expect(res.status).toBe(200);
    expect(res.body.data.profile.email).toBe('acct-owner@example.com');
    expect(res.body.data.memberships[0].role).toBe('owner');
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/passwordHash|tokenHash|\$2[aby]\$/);
  });
});

describe('organization archive and account deletion', () => {
  it('refuses account deletion with a wrong password', async () => {
    const res = await owner.client.raw('DELETE', '/api/v1/auth/account', { password: 'not-my-password' });
    expect(res.status).toBe(401);
  });

  it('refuses account deletion while the owner still has a live organization', async () => {
    const res = await owner.client.raw('DELETE', '/api/v1/auth/account', { password: 'correct-horse-battery' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OWNER_HAS_ORGANIZATION');
  });

  it('requires the exact organization name to archive', async () => {
    const res = await owner.client.raw('DELETE', `/api/v1/orgs/${owner.orgId}`, { confirmName: 'Wrong Name' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONFIRMATION_MISMATCH');
  });

  it('archives the organization, hides it from public pages, and blocks member access', async () => {
    const org = await owner.client.get(`/api/v1/orgs/${owner.orgId}`);
    const slug = org.body.data.slug;
    const archive = await owner.client.raw('DELETE', `/api/v1/orgs/${owner.orgId}`, { confirmName: 'Lotus Salon' });
    expect(archive.status).toBe(204);
    const pub = await client(app.base).get(`/api/v1/public/businesses/${slug}`);
    expect(pub.status).toBe(404);
    const member = await owner.client.get(`/api/v1/orgs/${owner.orgId}/services`);
    expect(member.status).toBe(404);
  });

  it('deletes the account after archiving, anonymizes it, and blocks sign-in', async () => {
    const res = await owner.client.raw('DELETE', '/api/v1/auth/account', { password: 'correct-horse-battery' });
    expect(res.status).toBe(204);
    const again = await client(app.base).post('/api/v1/auth/login', { email: 'acct-owner@example.com', password: 'correct-horse-battery' });
    expect(again.status).toBe(401);
    const { User } = await import('../../models/index.js');
    const user = await User.findOne({ deletedAt: { $ne: null } }).lean();
    expect(user.email).toMatch(/@deleted\.invalid$/);
    expect(user.fullName).toBe('Deleted user');
  });
});

describe('API description', () => {
  it('serves an OpenAPI document that is honest about being partial', async () => {
    const res = await client(app.base).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body['x-status']).toBe('partial');
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(40);
  });
});
