const fetch = globalThis.fetch;

async function run() {
  const base = process.env.DEBUG_BASE_URL || 'http://localhost:5000/api/health';
  const email = `testuser+${Date.now()}@example.com`;
  const password = 'TestPass123!';
  const name = 'Debug User';

  console.log('Registering user', email);
  const reg = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const regJson = await reg.json().catch(() => ({}));
  console.log('Register response status', reg.status, regJson);

  const login = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginJson = await login.json().catch(() => ({}));
  console.log('Login response status', login.status, loginJson);

  const token = loginJson.token;
  if (!token) {
    console.error('No token returned; cannot verify /me endpoint');
    return;
  }

  console.log('Calling /api/health/me with token...');
  const me = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
  const meJson = await me.json().catch(() => ({}));
  console.log('/me', me.status, meJson);
}

run().catch((e) => { console.error('Debug script error', e); process.exit(1); });
