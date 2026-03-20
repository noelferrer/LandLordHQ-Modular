const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { addMinutes, isAfter } = require('date-fns');
const { COOKIE_NAME, CSRF_COOKIE_NAME, cookieOptions, csrfCookieOptions, generateCsrfToken } = require('../middleware/csrf');
const { hashSessionToken } = require('../middleware/auth');
const { validateString, MAX_SHORT_STRING } = require('../middleware/validate');

module.exports = ({ db, bot, helpers, middleware }) => {
    const router = express.Router();
    const { rateLimiter, createRateLimiter } = require('../middleware/rateLimit');
    const registerRateLimiter = createRateLimiter(5, 15 * 60 * 1000, 'register:');
    const { authenticateAdmin } = middleware;
    const { auditLog, hashOTP, verifyOTP, generateOTP } = helpers;
    const { pool, mapRow } = db;
    const fallbackOwnerId = process.env.OWNER_TELEGRAM_ID;

    router.get('/signup', (req, res) => res.sendFile(path.join(__dirname, '../../signup.html')));
    router.get('/register', (req, res) => res.redirect('/signup'));

    // 1. Request OTP
    router.post('/api/auth/request', rateLimiter, async (req, res) => {
        let telegramUsername = req.body.username;
        let admin = null;

        if (telegramUsername) {
            telegramUsername = telegramUsername.replace('@', '');
            const [rows] = await pool.query('SELECT * FROM admins WHERE username = ?', [telegramUsername]);
            admin = mapRow(rows);
        } else {
            const [rows] = await pool.query('SELECT * FROM admins WHERE telegram_id = ?', [fallbackOwnerId]);
            admin = mapRow(rows);
        }

        if (!admin) {
            return res.status(404).json({ success: false, error: "Admin account not found. Please contact support." });
        }

        const code = generateOTP();
        const expiresAt = addMinutes(new Date(), 10);
        const hashedCode = hashOTP(code);

        // Upsert OTP
        await pool.query('DELETE FROM otps WHERE telegram_id = ?', [admin.telegramId]);
        await pool.query('INSERT INTO otps (telegram_id, code, expires_at) VALUES (?, ?, ?)', [admin.telegramId, hashedCode, expiresAt]);

        try {
            await bot.telegram.sendMessage(admin.telegramId, `🔐 **Landlord HQ Login**\n\nYour secure verification code is:\n\n\`${code}\`\n\n_This code will expire in 10 minutes. If you did not request this, you can safely ignore this message._`, { parse_mode: 'Markdown' });
            res.json({ success: true, message: "OTP sent to your Telegram." });
        } catch (err) {
            console.error("Failed to send OTP to Telegram:", err);
            res.status(500).json({ success: false, error: "Failed to send code via Telegram." });
        }
    });

    // 2. Verify OTP
    router.post('/api/auth/verify', rateLimiter, async (req, res) => {
        const { code, username } = req.body;
        let telegramUsername = username;

        let admin = null;
        if (telegramUsername) {
            telegramUsername = telegramUsername.replace('@', '');
            const [rows] = await pool.query('SELECT * FROM admins WHERE username = ?', [telegramUsername]);
            admin = mapRow(rows);
        } else {
            const [rows] = await pool.query('SELECT * FROM admins WHERE telegram_id = ?', [fallbackOwnerId]);
            admin = mapRow(rows);
        }

        if (!admin) {
            return res.status(401).json({ success: false, error: "Invalid admin context." });
        }

        const [otpRows] = await pool.query('SELECT * FROM otps WHERE telegram_id = ?', [admin.telegramId]);
        const record = mapRow(otpRows);
        if (!record) {
            return res.status(401).json({ success: false, error: "No OTP requested or expired." });
        }

        if (isAfter(new Date(), new Date(record.expiresAt))) {
            await pool.query('DELETE FROM otps WHERE telegram_id = ?', [admin.telegramId]);
            return res.status(401).json({ success: false, error: "OTP has expired. Please request a new one." });
        }

        const MAX_OTP_ATTEMPTS = 5;
        const attempts = (record.attempts || 0) + 1;

        if (attempts > MAX_OTP_ATTEMPTS) {
            await pool.query('DELETE FROM otps WHERE telegram_id = ?', [admin.telegramId]);
            return res.status(401).json({ success: false, error: "Too many failed attempts. Please request a new code." });
        }

        if (verifyOTP(record.code, code)) {
            const [result] = await pool.query('DELETE FROM otps WHERE telegram_id = ?', [admin.telegramId]);
            if (result.affectedRows === 0) {
                return res.status(401).json({ success: false, error: "Code already used. Please request a new one." });
            }

            const sessionToken = uuidv4();
            const sessionExpires = addMinutes(new Date(), 60 * 24);
            const tokenHash = hashSessionToken(sessionToken);

            await pool.query('INSERT INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)', [tokenHash, admin.id, sessionExpires]);

            res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
            res.cookie(CSRF_COOKIE_NAME, generateCsrfToken(), csrfCookieOptions);
            auditLog(admin.id, 'login', 'session', { username: admin.username });
            res.json({ success: true });
        } else {
            await pool.query('UPDATE otps SET attempts = ? WHERE telegram_id = ?', [attempts, admin.telegramId]);
            auditLog(admin.id, 'otp_failed', 'session', { attempt: attempts, username: admin.username });
            const remaining = MAX_OTP_ATTEMPTS - attempts;
            res.status(401).json({ success: false, error: `Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
        }
    });

    // Auth Check
    router.get('/api/auth/check', authenticateAdmin, (req, res) => {
        res.cookie(CSRF_COOKIE_NAME, generateCsrfToken(), csrfCookieOptions);
        const isSuperAdmin = req.admin.telegramId === process.env.OWNER_TELEGRAM_ID;
        res.json({ success: true, admin: { name: req.admin.name, username: req.admin.username, isSuperAdmin } });
    });

    // Logout
    router.post('/api/auth/logout', async (req, res) => {
        const token = req.cookies && req.cookies[COOKIE_NAME];
        if (token) {
            const tokenHash = hashSessionToken(token);
            const [rows] = await pool.query('SELECT * FROM sessions WHERE token = ?', [tokenHash]);
            const session = mapRow(rows);
            if (session) auditLog(session.adminId, 'logout', 'session');
            await pool.query('DELETE FROM sessions WHERE token = ?', [tokenHash]);
        }
        res.clearCookie(COOKIE_NAME, { path: '/' });
        res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
        res.json({ success: true });
    });

    // Public Registration
    router.post('/api/register', registerRateLimiter, async (req, res) => {
        const { code, name, username } = req.body;

        if (!code || !name || !username) {
            return res.status(400).json({ success: false, error: 'All fields are required.' });
        }
        if (!validateString(name, MAX_SHORT_STRING)) {
            return res.status(400).json({ success: false, error: 'Name must be 1-100 characters.' });
        }
        if (!validateString(username, 50) || !/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.status(400).json({ success: false, error: 'Username must be 1-50 alphanumeric characters.' });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [inviteRows] = await conn.query('SELECT * FROM invites WHERE code = ? FOR UPDATE', [code.trim().toUpperCase()]);
            const invite = inviteRows[0];

            if (!invite) {
                await conn.rollback();
                return res.status(400).json({ success: false, error: 'Invalid invite code.' });
            }

            // Invite already claimed — check if Telegram is still unlinked (forgot /claim)
            if (invite.status === 'claimed') {
                const claimedUsername = invite.claimed_by;
                const [adminRows] = await conn.query(
                    'SELECT username, name FROM admins WHERE LOWER(username) = LOWER(?) AND telegram_id IS NULL',
                    [claimedUsername]
                );
                await conn.rollback();
                if (adminRows.length > 0) {
                    // Account created but Telegram not linked yet — resend claim instructions
                    return res.json({ success: false, pendingClaim: true, username: adminRows[0].username });
                }
                // Fully claimed and Telegram linked — truly already used
                return res.status(400).json({ success: false, error: 'This invite has already been used and the account is active.' });
            }

            const hoursOld = (new Date() - new Date(invite.created_at)) / (1000 * 60 * 60);
            if (hoursOld > 24) {
                await conn.query('UPDATE invites SET status = ? WHERE code = ?', ['expired', invite.code]);
                await conn.commit();
                return res.status(400).json({ success: false, error: 'This invitation code has expired (valid for 24h).' });
            }

            // Check username uniqueness
            const [existingAdmin] = await conn.query('SELECT id FROM admins WHERE LOWER(username) = LOWER(?)', [username]);
            if (existingAdmin.length > 0) {
                await conn.rollback();
                return res.status(400).json({ success: false, error: 'Username is already taken.' });
            }

            // Claim invite
            await conn.query('UPDATE invites SET status = ?, claimed_by = ?, claimed_at = ? WHERE code = ?',
                ['claimed', username, new Date(), invite.code]);

            // Create admin
            const newId = uuidv4();
            await conn.query('INSERT INTO admins (id, username, name, telegram_id) VALUES (?, ?, ?, ?)',
                [newId, username.toLowerCase(), name, null]);

            await conn.commit();
            res.json({ success: true, message: 'Account created. Awaiting Telegram claim.' });
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    });

    return router;
};
