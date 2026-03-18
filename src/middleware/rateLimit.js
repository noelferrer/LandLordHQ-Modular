// --- Rate Limiter (in-memory, per IP) ---
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 OTP attempts per 15 min window

function createRateLimiter(maxRequests = RATE_LIMIT_MAX_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS, prefix = '') {
    return function (req, res, next) {
        const ip = req.ip || req.connection.remoteAddress;
        const key = prefix + ip;
        const now = Date.now();
        const record = rateLimitStore.get(key);

        if (!record || now - record.windowStart > windowMs) {
            rateLimitStore.set(key, { windowStart: now, count: 1, windowMs });
            return next();
        }

        record.count++;
        if (record.count > maxRequests) {
            const retryAfter = Math.ceil((record.windowStart + windowMs - now) / 1000);
            const minutes = Math.ceil(retryAfter / 60);
            res.setHeader('Retry-After', retryAfter);
            return res.status(429).json({
                success: false,
                error: `Too many requests. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`
            });
        }
        return next();
    };
}

// Default rate limiter for auth endpoints
const rateLimiter = createRateLimiter(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS, 'auth:');

// Media proxy rate limiter: 60 requests per 5 minutes
const mediaRateLimiter = createRateLimiter(60, 5 * 60 * 1000, 'media:');

// API write rate limiter: 100 POST/PUT requests per 15 minutes per IP
const apiRateLimiter = createRateLimiter(100, 15 * 60 * 1000, 'api:');

// Cleanup stale rate limit entries every 30 min
function startRateLimitCleanup() {
    setInterval(() => {
        const now = Date.now();
        for (const [key, record] of rateLimitStore) {
            if (now - record.windowStart > (record.windowMs || RATE_LIMIT_WINDOW_MS)) {
                rateLimitStore.delete(key);
            }
        }
    }, 30 * 60 * 1000);
}

// Destructive operations rate limiter: 20 DELETE requests per 15 minutes
const destructiveRateLimiter = createRateLimiter(20, 15 * 60 * 1000, 'destructive:');

module.exports = { rateLimiter, mediaRateLimiter, apiRateLimiter, destructiveRateLimiter, createRateLimiter, startRateLimitCleanup };
