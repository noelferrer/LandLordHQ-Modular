const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Helpers factory — uses MySQL pool for audit logging.
 */
module.exports = (db) => {
    const { pool } = db;

    // --- Audit Logger (fire-and-forget async) ---
    function auditLog(adminId, action, resource, details = {}) {
        pool.query(
            'INSERT INTO audit_log (id, admin_id, action, resource, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
            [uuidv4(), adminId, action, resource, JSON.stringify(details), new Date()]
        ).catch(err => console.error('Audit log insert failed:', err.message));
    }

    // --- Pagination Helper ---
    function paginate(array, page = 1, limit = 50) {
        const p = Math.max(1, parseInt(page) || 1);
        const l = Math.min(100, Math.max(1, parseInt(limit) || 50));
        const total = array.length;
        const totalPages = Math.ceil(total / l);
        const start = (p - 1) * l;
        const data = array.slice(start, start + l);
        return { data, page: p, limit: l, total, totalPages };
    }

    // --- OTP Hashing (HMAC with app-level secret) ---
    const OTP_SECRET = process.env.TELEGRAM_BOT_TOKEN || (process.env.NODE_ENV === 'test' ? 'test-only-secret' : null);
    if (!OTP_SECRET) {
        throw new Error('TELEGRAM_BOT_TOKEN must be set for OTP hashing.');
    }
    function hashOTP(code) {
        return crypto.createHmac('sha256', OTP_SECRET).update(String(code)).digest('hex');
    }

    // --- Constant-time OTP comparison ---
    function verifyOTP(storedHash, candidateCode) {
        const candidateHash = hashOTP(candidateCode);
        const a = Buffer.from(storedHash, 'hex');
        const b = Buffer.from(candidateHash, 'hex');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    }

    // --- Secure Random Code Generation ---
    function generateSecureCode(length = 8) {
        return crypto.randomBytes(length).toString('base64url').substring(0, length).toUpperCase();
    }

    function generateLinkCode() {
        return generateSecureCode(6);
    }

    function generateOTP() {
        const num = crypto.randomInt(100000, 999999);
        return num.toString();
    }

    return {
        auditLog,
        paginate,
        hashOTP,
        verifyOTP,
        generateSecureCode,
        generateLinkCode,
        generateOTP,
    };
};
