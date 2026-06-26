import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from '@/types';
import authRoutes from '@/routes/auth';
import usersRoutes from '@/routes/users';
import financeRoutes from '@/routes/finance';
import budgetsRoutes from '@/routes/budgets';
import groupsRoutes from '@/routes/groups';
import questionsRoutes from '@/routes/questions';
import stocksRoutes from '@/routes/stocks';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return origin;
      // Always allow localhost in development
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
      // Allow comma-separated production origins from env
      const allowed = (c.env.FRONTEND_ORIGIN ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'x-csrf-token'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

app.use(
  '*',
  secureHeaders({
    xContentTypeOptions: 'nosniff',
    xFrameOptions: 'DENY',
    referrerPolicy: 'strict-origin-when-cross-origin',
    xXssProtection: '0',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: 'same-origin',
    crossOriginResourcePolicy: 'cross-origin',
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
    },
  }),
);

app.route('/api/auth', authRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/finance', financeRoutes);
app.route('/api/budgets', budgetsRoutes);
app.route('/api/groups', groupsRoutes);
app.route('/api/questions', questionsRoutes);
app.route('/api/stocks', stocksRoutes);

app.notFound((c) => c.json({ ok: false, message: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('[worker error]', err);
  return c.json({ ok: false, message: 'Internal server error' }, 500);
});

export default app;
