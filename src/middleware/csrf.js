const crypto = require('crypto');

const COOKIE_NAME = 'landlordhq_token';
const CSRF_COOKIE_NAME = 'landlordhq_csrf';

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/'
};

const csrfCookieOptions = {
    httpOnly: false, // Must be readable by JS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
};

function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function csrfProtection(req, res, next) {
    // Skip CSRF for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    // Skip CSRF for auth endpoints (login — no session yet)
    // /api/register is also exempt: no session to derive CSRF from; invite code serves as anti-CSRF token
    if (req.path.startsWith('/api/auth/') || req.path === '/api/register') return next();

    const cookieToken = req.cookies && req.cookies[CSRF_COOKIE_NAME];
    const headerToken = req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken ||
        cookieToken.length !== headerToken.length ||
        !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
        return res.status(403).json({ success: false, error: 'CSRF token mismatch. Please refresh and try again.' });
    }
    next();
}

module.exports = {
    COOKIE_NAME,
    CSRF_COOKIE_NAME,
    cookieOptions,
    csrfCookieOptions,
    generateCsrfToken,
    csrfProtection,
};
