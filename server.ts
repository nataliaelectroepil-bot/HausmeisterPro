import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'sandokanmcroar@gmail.com').trim().toLowerCase();
const ENV_ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24;

const DATA_DIR = path.resolve(process.cwd(), '.data');
const AUTH_STORE_PATH = path.resolve(DATA_DIR, 'admin-auth.json');

interface ClaimedAdminRecord {
  email: string;
  passwordHash: string;
  claimedAt: string;
}

interface SessionPayload {
  sub: string;
  email: string;
  role: 'admin' | 'worker' | 'client_hausverwaltung';
  exp: number;
}

const DEMO_NON_ADMIN_USERS: Record<
  string,
  { id: string; email: string; role: 'worker' | 'client_hausverwaltung' }
> = {
  u2: { id: 'u2', email: 'l.wagner@hausmeister-pro.de', role: 'worker' },
  u3: { id: 'u3', email: 'm.yilmaz@hausmeister-pro.de', role: 'worker' },
  u4: { id: 'u4', email: 'koenig@isar-grund-hv.de', role: 'client_hausverwaltung' },
};

function readClaimedAdmin(): ClaimedAdminRecord | null {
  try {
    if (!fs.existsSync(AUTH_STORE_PATH)) return null;
    const raw = fs.readFileSync(AUTH_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ClaimedAdminRecord>;
    if (
      typeof parsed.email === 'string' &&
      typeof parsed.passwordHash === 'string' &&
      parsed.passwordHash.includes(':')
    ) {
      return {
        email: parsed.email.trim().toLowerCase(),
        passwordHash: parsed.passwordHash,
        claimedAt: typeof parsed.claimedAt === 'string' ? parsed.claimedAt : new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeClaimedAdmin(record: ClaimedAdminRecord): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(AUTH_STORE_PATH, JSON.stringify(record, null, 2), { mode: 0o600 });
}

function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasswordScrypt(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function verifyEnvPasscode(input: string, configured: string): boolean {
  const inputDigest = crypto.createHash('sha256').update(input, 'utf8').digest();
  const configuredDigest = crypto.createHash('sha256').update(configured, 'utf8').digest();
  return crypto.timingSafeEqual(inputDigest, configuredDigest);
}

function signSessionToken(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (
      typeof parsed.sub !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.role !== 'string' ||
      typeof parsed.exp !== 'number' ||
      Date.now() > parsed.exp
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/auth/status', (_req: Request, res: Response) => {
    const claimed = readClaimedAdmin();
    const adminConfigured = Boolean(ENV_ADMIN_PASSCODE || claimed);
    res.json({
      adminEmail: ADMIN_EMAIL,
      adminConfigured,
      usesEnvPasscode: Boolean(ENV_ADMIN_PASSCODE),
    });
  });

  app.post('/api/auth/setup-admin', (req: Request, res: Response) => {
    const claimed = readClaimedAdmin();
    if (ENV_ADMIN_PASSCODE || claimed) {
      res.status(409).json({ error: 'ADMIN_ALREADY_CONFIGURED' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ADMIN_EMAIL;
    const password = typeof body.password === 'string' ? body.password : '';

    if (rawEmail !== ADMIN_EMAIL) {
      res.status(400).json({ error: 'INVALID_ADMIN_EMAIL' });
      return;
    }

    if (password.length < 4 || password.length > 128) {
      res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
      return;
    }

    const record: ClaimedAdminRecord = {
      email: ADMIN_EMAIL,
      passwordHash: hashPasswordScrypt(password),
      claimedAt: new Date().toISOString(),
    };
    writeClaimedAdmin(record);

    const token = signSessionToken({
      sub: 'u1',
      email: ADMIN_EMAIL,
      role: 'admin',
      exp: Date.now() + TOKEN_TTL_MS,
    });

    res.status(201).json({
      token,
      user: { id: 'u1', email: ADMIN_EMAIL, role: 'admin' },
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'MISSING_CREDENTIALS' });
      return;
    }

    if (email !== ADMIN_EMAIL) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }

    let valid = false;
    if (ENV_ADMIN_PASSCODE) {
      valid = verifyEnvPasscode(password, ENV_ADMIN_PASSCODE);
    } else {
      const claimed = readClaimedAdmin();
      if (!claimed) {
        res.status(403).json({ error: 'ADMIN_NOT_CONFIGURED' });
        return;
      }
      valid = verifyPasswordScrypt(password, claimed.passwordHash);
    }

    if (!valid) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }

    const token = signSessionToken({
      sub: 'u1',
      email: ADMIN_EMAIL,
      role: 'admin',
      exp: Date.now() + TOKEN_TTL_MS,
    });

    res.json({
      token,
      user: { id: 'u1', email: ADMIN_EMAIL, role: 'admin' },
    });
  });

  app.post('/api/auth/demo-login', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const demoUser = DEMO_NON_ADMIN_USERS[userId];
    if (!demoUser) {
      res.status(403).json({ error: 'DEMO_LOGIN_NOT_ALLOWED' });
      return;
    }

    const token = signSessionToken({
      sub: demoUser.id,
      email: demoUser.email,
      role: demoUser.role,
      exp: Date.now() + TOKEN_TTL_MS,
    });

    res.json({
      token,
      user: demoUser,
    });
  });

  app.get('/api/auth/session', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const session = token ? verifySessionToken(token) : null;
    if (!session) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
    res.json({
      user: {
        id: session.sub,
        email: session.email,
        role: session.role,
      },
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hausmeister Pro server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
