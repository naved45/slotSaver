const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:5173';
// Pass the seeded owner password through the environment. It is never stored in this file.
if (!process.env.SEED_OWNER_PASSWORD) { console.error('Set SEED_OWNER_PASSWORD'); process.exit(1); }
(async () => {
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true, defaultViewport: { width: 1280, height: 900 } });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const out = [];
  const step = async (name, fn) => {
    try { await fn(); out.push('PASS ' + name); }
    catch (e) { out.push('FAIL ' + name + ' :: ' + e.message.split('\n')[0]); await page.screenshot({ path: '/tmp/fail-' + name.replace(/\W+/g, '_') + '.png' }); }
  };
  const clickText = async (text, selector = 'button') => {
    const handles = await page.$$(selector);
    for (const h of handles) {
      const t = await h.evaluate((el) => el.innerText.trim());
      if (t === text) { await h.click(); return; }
    }
    throw new Error('no button with text ' + text);
  };
  const bodyHas = (s) => page.waitForFunction((m) => document.body.innerText.includes(m), { timeout: 12000 }, s);

  await step('landing renders hero', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await page.waitForSelector('h1');
    const h = await page.$eval('h1', (el) => el.innerText);
    if (!h.includes('Smart Appointment Scheduling')) throw new Error('hero: ' + h);
    await page.screenshot({ path: '/tmp/shot-landing.png' });
  });

  await step('wrong password shows a clear error', async () => {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
    const inputs = await page.$$('form input');
    await inputs[0].type('owner@example.com');
    await inputs[1].type('wrong-password-here');
    await clickText('Sign in', 'form button');
    await bodyHas('Email or password is incorrect');
  });

  await step('correct password opens the dashboard', async () => {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
    const inputs = await page.$$('form input');
    await inputs[0].type('owner@example.com');
    await inputs[1].type(process.env.SEED_OWNER_PASSWORD || '');
    await clickText('Sign in', 'form button');
    await page.waitForFunction(() => location.pathname === '/app', { timeout: 12000 });
    await bodyHas('Dashboard');
    await page.screenshot({ path: '/tmp/shot-dashboard.png' });
  });

  const pages = [
    ['/app/services', 'Dental cleaning'],
    ['/app/appointments', 'Appointments'],
    ['/app/waitlist', 'Waitlist'],
    ['/app/customers', 'Customers'],
    ['/app/staff', 'Dr. Meera Iyer'],
    ['/app/reminders', 'Delivery status'],
    ['/app/analytics', 'Bookings'],
    ['/app/settings', 'Business profile'],
    ['/app/calendar', 'Calendar'],
    ['/onboarding', 'Set opening hours'],
  ];
  for (const [path, marker] of pages) {
    await step('page ' + path, async () => {
      await page.goto(BASE + path, { waitUntil: 'networkidle0' });
      await bodyHas(marker);
      await page.screenshot({ path: '/tmp/shot-' + path.replace(/\W+/g, '_') + '.png' });
    });
  }

  await step('public booking completes end to end', async () => {
    await page.goto(BASE + '/book/maple-dental-studio', { waitUntil: 'networkidle0' });
    await bodyHas('Dental cleaning');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Dental cleaning')).click());
    await bodyHas('See times');
    await clickText('See times', 'button');
    await page.waitForSelector('[aria-label^="Book "]', { timeout: 15000 });
    await page.click('[aria-label^="Book "]');
    await page.waitForSelector('form input[type=email]', { timeout: 8000 });
    await page.type('form input[autocomplete=name]', 'Browser Test Guest');
    await page.type('form input[type=email]', 'browser-guest@example.com');
    await clickText('Confirm booking', 'button');
    await bodyHas('You are booked');
    await page.screenshot({ path: '/tmp/shot-booking-done.png' });
  });

  out.push('--- page errors: ' + errors.length);
  errors.slice(0, 15).forEach((e) => out.push(e));
  console.log(out.join('\n'));
  await browser.close();
})().catch((e) => { console.error('FATAL ' + e.stack); process.exit(1); });
