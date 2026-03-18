const mysql = require('mysql2/promise');

// Validate required DB credentials are present
const requiredDbVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missingDbVars = requiredDbVars.filter(v => !process.env[v]);
if (missingDbVars.length > 0) {
    console.error(`Missing required database environment variables: ${missingDbVars.join(', ')}`);
    console.error('Add them to your .env file.');
    process.exit(1);
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    waitForConnections: true,
    charset: 'utf8mb4',
    dateStrings: ['DATE'],  // Return DATE columns as 'YYYY-MM-DD' strings (avoids timezone shift)
    // Return rows as plain objects, parse JSON columns
    typeCast: function (field, next) {
        if (field.type === 'JSON') {
            const val = field.string();
            return val === null ? null : JSON.parse(val);
        }
        // Convert TINY(1) to boolean
        if (field.type === 'TINY' && field.length === 1) {
            const val = field.string();
            return val === null ? null : val === '1';
        }
        return next();
    }
});

// --- Helpers for camelCase <-> snake_case mapping ---

function snakeToCamel(row) {
    if (!row) return null;
    const out = {};
    for (const [key, val] of Object.entries(row)) {
        const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        out[camel] = val;
    }
    return out;
}

function camelToSnake(obj) {
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
        const snake = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
        out[snake] = val;
    }
    return out;
}

function mapRows(rows) {
    return rows.map(snakeToCamel);
}

function mapRow(rows) {
    return rows.length > 0 ? snakeToCamel(rows[0]) : null;
}

// --- Auto-migration: widen sessions.token for SHA-256 hashes ---
(async () => {
    try {
        await pool.query('ALTER TABLE sessions MODIFY COLUMN token VARCHAR(64) NOT NULL');
    } catch (err) {
        // Ignore if already correct or table doesn't exist yet
        if (!err.message.includes('Unknown table') && !err.message.includes("doesn't exist")) {
            // Column may already be wide enough — safe to ignore
        }
    }
})();

module.exports = { pool, snakeToCamel, camelToSnake, mapRows, mapRow };
