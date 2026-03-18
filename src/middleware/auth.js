const crypto = require('crypto');
const { isAfter } = require('date-fns');
const { COOKIE_NAME } = require('./csrf');

/**
 * Hash a session token with SHA-256 for secure DB storage.
 * The raw token is sent to the client; only the hash is stored.
 */
function hashSessionToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Auth middleware factory — uses MySQL pool to look up sessions/admins.
 */
module.exports = (db) => {
    const { pool, mapRow } = db;

    const authenticateAdmin = async (req, res, next) => {
        let token = req.cookies && req.cookies[COOKIE_NAME];
        if (!token) {
            const authHeader = req.headers['authorization'];
            if (authHeader) token = authHeader.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ success: false, error: "Missing authorization token." });
        }

        const tokenHash = hashSessionToken(token);
        const [rows] = await pool.query('SELECT * FROM sessions WHERE token = ?', [tokenHash]);
        const session = mapRow(rows);

        if (!session) {
            return res.status(401).json({ success: false, error: "Invalid or expired session token." });
        }

        if (isAfter(new Date(), new Date(session.expiresAt))) {
            await pool.query('DELETE FROM sessions WHERE token = ?', [tokenHash]);
            return res.status(401).json({ success: false, error: "Session expired. Please log in again." });
        }

        const [adminRows] = await pool.query('SELECT id, username, name, telegram_id FROM admins WHERE id = ?', [session.adminId]);
        const admin = mapRow(adminRows);

        if (!admin) {
            return res.status(401).json({ success: false, error: "Admin account not found." });
        }

        req.admin = admin;
        next();
    };

    const authenticateSuperAdmin = async (req, res, next) => {
        // Use a sentinel to detect if authenticateAdmin already sent a response
        let adminPassed = false;
        await authenticateAdmin(req, res, () => { adminPassed = true; });
        if (!adminPassed) return; // authenticateAdmin already sent an error response

        if (req.admin.telegramId !== process.env.OWNER_TELEGRAM_ID) {
            return res.status(403).json({ success: false, error: 'Forbidden: Super Admin only' });
        }
        next();
    };

    return { authenticateAdmin, authenticateSuperAdmin };
};

// Also export hashSessionToken for use by auth routes
module.exports.hashSessionToken = hashSessionToken;
