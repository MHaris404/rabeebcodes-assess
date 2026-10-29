import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { fail, parse } from '../../lib/errors.js';
import { transaction } from '../../lib/database.js';
import { userSelect } from '../../lib/serializers.js';
export const COOKIE = 'supportdesk_session';
const credentials = z.object({ email: z.email().max(254).transform(s => s.toLowerCase()), password: z.string().min(8).max(128) }).strict();
const registration = credentials.extend({ name: z.string().trim().min(2).max(100), password: z.string().min(12).max(72) });
export function authModule(db, cfg) {
  const cookie = { httpOnly: true, secure: cfg.NODE_ENV === 'production', sameSite: cfg.COOKIE_SAME_SITE, path: '/api', maxAge: 30 * 60 * 1000 };
  async function authenticate(req, res, next) {
    let payload;
    try { payload = jwt.verify(req.cookies[COOKIE] || '', cfg.JWT_SECRET, { algorithms: ['HS256'], issuer: 'supportdesk', audience: 'supportdesk-web' }); }
    catch { return next(Object.assign(new Error('Your session has expired. Sign in again.'), { status: 401, code: 'UNAUTHENTICATED' })); }
    const session = await transaction(db, tx => tx.session.findUnique({ where: { id: payload.sid }, include: { user: { select: userSelect } } }));
    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) fail(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.');
    req.user = session.user; req.session = session;
    next();
  }
  function csrf(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const actual = Buffer.from(req.get('X-CSRF-Token') || '');
    const expected = Buffer.from(req.session.csrfToken);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail(403, 'CSRF_INVALID', 'Refresh your session and try again.');
    next();
  }
  async function sessionFor(user, res) {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const session = await transaction(db, tx => tx.session.create({ data: { userId: user.id, expiresAt, csrfToken: randomBytes(32).toString('hex') } }));
    const token = jwt.sign({ sub: user.id, sid: session.id }, cfg.JWT_SECRET, { expiresIn: '30m', algorithm: 'HS256', issuer: 'supportdesk', audience: 'supportdesk-web' });
    res.cookie(COOKIE, token, cookie);
    return { user, csrfToken: session.csrfToken };
  }
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false, skip: () => cfg.NODE_ENV === 'test', handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again later.', requestId: req.id } }) });
  router.post('/register', limiter, async (req, res) => {
    const input = parse(registration, req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await transaction(db, tx => tx.user.create({ data: { name: input.name, email: input.email, passwordHash, role: 'Customer' }, select: userSelect }));
    res.status(201).json({ data: await sessionFor(user, res) });
  });
  router.post('/login', limiter, async (req, res) => {
    const input = parse(credentials, req.body);
    const user = await transaction(db, tx => tx.user.findUnique({ where: { email: input.email } }));
    // A valid dummy hash keeps the missing-account path from skipping password work.
    const valid = await bcrypt.compare(input.password, user?.passwordHash || '$2b$12$5PB0tDghB38JqQpMPJoKTOh9pGmPyJRPjwyTWeQ8xMcv7MzqHr0We');
    if (!user || !valid) fail(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const safe = Object.fromEntries(Object.keys(userSelect).map(k => [k, user[k]]));
    res.json({ data: await sessionFor(safe, res) });
  });
  router.get('/me', authenticate, (req, res) => res.json({ data: req.user }));
  router.get('/csrf', authenticate, (req, res) => res.json({ data: { csrfToken: req.session.csrfToken } }));
  router.post('/logout', authenticate, csrf, async (req, res) => {
    await transaction(db, tx => tx.session.update({ where: { id: req.session.id }, data: { revokedAt: new Date() } }));
    res.clearCookie(COOKIE, { ...cookie, maxAge: undefined }); res.status(204).end();
  });
  return { router, authenticate, csrf };
}
export const requireRole = (...roles) => (req, res, next) => { if (!roles.includes(req.user.role)) fail(403, 'FORBIDDEN', 'You do not have permission for this action.'); next(); };
