require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const cron = require('node-cron');

// --- Env Validation ---
const REQUIRED_ENV = ['TELEGRAM_BOT_TOKEN', 'OWNER_TELEGRAM_ID'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in your values.');
    process.exit(1);
}

// --- Logger ---
const logger = require('./lib/logger');

// Redirect console.log/error to Winston so existing code uses structured logging
console.log = (...args) => logger.info(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
console.error = (...args) => logger.error(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));

// --- Database & Bot ---
const db = require('./database');
const { setupReminders } = require('./scheduler');
const bot = require('./bot');

// --- Middleware imports ---
const { csrfProtection } = require('./middleware/csrf');
const { startRateLimitCleanup, apiRateLimiter, destructiveRateLimiter } = require('./middleware/rateLimit');

// --- Helpers & Auth (factory pattern) ---
const helpers = require('./lib/helpers')(db);
const middleware = require('./middleware/auth')(db);

// --- Express App Setup ---
const app = express();
// Only trust proxy if explicitly configured (e.g., behind nginx/cloudflare)
if (process.env.TRUST_PROXY) {
    const val = process.env.TRUST_PROXY;
    app.set('trust proxy', val === 'true' ? 1 : isNaN(val) ? val : parseInt(val));
}
const PORT = process.env.PORT || 3000;

// CORS
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000'];
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(cookieParser());

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://api.telegram.org"],
            connectSrc: ["'self'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
}));

app.use(express.json({ limit: '1mb' }));
app.use(csrfProtection);

// --- Root Admin Bootstrap (MySQL) ---
const { pool } = db;
(async () => {
    try {
        const fallbackOwnerId = process.env.OWNER_TELEGRAM_ID;
        if (fallbackOwnerId) {
            const [rows] = await pool.query('SELECT * FROM admins WHERE telegram_id = ?', [fallbackOwnerId]);
            if (rows.length === 0) {
                const { v4: uuidv4 } = require('uuid');
                logger.info('Root Admin missing. Creating from .env...');
                await pool.query(
                    'INSERT INTO admins (id, username, telegram_id, name) VALUES (?, ?, ?, ?)',
                    [uuidv4(), process.env.OWNER_USERNAME || 'admin', fallbackOwnerId, 'System Admin']
                );
            }
        }
    } catch (err) {
        logger.error('Root admin bootstrap failed: ' + err.message);
    }
})();

// --- Static Files ---
app.use(express.static(path.join(__dirname, '../public')));

// Serve Default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../dashboard.html'));
});

// Serve Login Page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../login.html'));
});

// Serve Onboarding Guides
app.get('/super-onboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../super-onboard.html'));
});
app.get('/client-onboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../client-onboard.html'));
});
app.get('/tenant-onboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../tenant-onboard.html'));
});

// --- Health Check ---
app.get('/api/health', async (req, res) => {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();

    // Quick DB connectivity check
    let dbStatus = 'ok';
    try {
        await pool.query('SELECT 1');
    } catch {
        dbStatus = 'error';
    }

    res.json({
        status: dbStatus === 'ok' ? 'ok' : 'degraded',
        uptime: Math.floor(uptime),
        memory: {
            rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
            heap: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        },
        database: dbStatus,
        version: require('../package.json').version,
        timestamp: new Date().toISOString(),
    });
});

// --- Rate limiters for write operations (reads are unlimited for authenticated users) ---
app.use('/api/', (req, res, next) => {
    if (req.method === 'DELETE') return destructiveRateLimiter(req, res, next);
    if (req.method === 'POST' || req.method === 'PUT') return apiRateLimiter(req, res, next);
    next();
});

// --- Dependency injection object ---
const deps = { db, bot, helpers, middleware };

// --- Mount Route Modules ---
const authRoutes = require('./routes/auth')(deps);
app.use(authRoutes);

app.use('/api/tenants', require('./routes/tenants')(deps));
app.use('/api/properties', require('./routes/properties')(deps));
app.use('/api/tickets', require('./routes/tickets')(deps));
app.use('/api/payments', require('./routes/payments')(deps));
app.use('/api/expenses', require('./routes/expenses')(deps));
app.use('/api/finance', require('./routes/finance')(deps));
app.use('/api/media', require('./routes/media')(deps));
app.use('/api/message', require('./routes/messages')(deps));
app.use('/api/settings', require('./routes/settings')(deps));
app.use('/api/audit-log', require('./routes/auditLog')(deps));

const superRoutes = require('./routes/super')(deps);
app.use(superRoutes);

// --- Start Rate Limit Cleanup ---
startRateLimitCleanup();

// --- Session & OTP Cleanup (runs every hour) ---
cron.schedule('0 * * * *', async () => {
    try {
        const now = new Date();

        // Clean expired sessions
        const [sessionResult] = await pool.query('DELETE FROM sessions WHERE expires_at < ?', [now]);
        if (sessionResult.affectedRows > 0) {
            logger.info(`Cleaned up ${sessionResult.affectedRows} expired session(s).`);
        }

        // Clean expired OTPs
        const [otpResult] = await pool.query('DELETE FROM otps WHERE expires_at < ?', [now]);
        if (otpResult.affectedRows > 0) {
            logger.info(`Cleaned up ${otpResult.affectedRows} expired OTP(s).`);
        }

        // Expire invites older than 24 hours
        const [inviteResult] = await pool.query(
            "UPDATE invites SET status = 'expired' WHERE status = 'active' AND created_at < DATE_SUB(?, INTERVAL 24 HOUR)",
            [now]
        );
        if (inviteResult.affectedRows > 0) {
            logger.info(`Marked ${inviteResult.affectedRows} invitation(s) as expired.`);
        }

        // Audit log rotation: keep only last 5000 entries
        const [countRows] = await pool.query('SELECT COUNT(*) as cnt FROM audit_log');
        if (countRows[0].cnt > 5000) {
            await pool.query(
                'DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM (SELECT id FROM audit_log ORDER BY timestamp DESC LIMIT 5000) AS keep)'
            );
            logger.info(`Trimmed audit log from ${countRows[0].cnt} to 5000 entries.`);
        }

        // Clean expired pending claims
        const [claimResult] = await pool.query('DELETE FROM pending_claims WHERE expires_at < ?', [now]);
        if (claimResult.affectedRows > 0) {
            logger.info(`Cleaned up ${claimResult.affectedRows} expired pending claim(s).`);
        }
    } catch (err) {
        logger.error('Cleanup cron error: ' + err.message);
    }
}, { scheduled: true, timezone: process.env.TZ || 'Asia/Manila' });

// --- 404 Handler ---
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    logger.error(`Unhandled error on ${req.method} ${req.path}: ${err.message}`, { stack: err.stack });
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// --- Start Server ---
const server = app.listen(PORT, () => {
    logger.info(`Dashboard API running on http://localhost:${PORT}`);
});

// --- Launch Bot ---
if (process.env.TELEGRAM_BOT_TOKEN) {
    logger.info('CondoBot launching...');
    bot.launch().catch(err => {
        logger.error('Failed to launch CondoBot: ' + (err.message || err));
    });
    setupReminders(bot);
} else {
    logger.error('TELEGRAM_BOT_TOKEN is missing. Bot will not start.');
}

// --- Graceful Shutdown ---
function gracefulShutdown(signal) {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
        logger.info('HTTP server closed.');
    });

    // Stop bot
    if (process.env.TELEGRAM_BOT_TOKEN) {
        bot.stop(signal);
    }

    // Close MySQL pool and give in-flight requests time to complete
    pool.end().then(() => {
        logger.info('MySQL pool closed.');
    }).catch(err => {
        logger.error('Error closing MySQL pool: ' + err.message);
    });

    setTimeout(() => {
        logger.info('Shutdown complete.');
        process.exit(0);
    }, 10000);
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Catch unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err.message);
    // Give logger time to flush, then exit
    setTimeout(() => process.exit(1), 1000);
});

module.exports = app; // Export for testing
