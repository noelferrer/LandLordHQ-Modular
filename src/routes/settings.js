const express = require('express');

module.exports = ({ db, helpers, middleware }) => {
    const router = express.Router();
    const { authenticateAdmin } = middleware;
    const { auditLog } = helpers;
    const { pool, mapRow } = db;

    // Get settings
    router.get('/', authenticateAdmin, async (req, res) => {
        const [rows] = await pool.query('SELECT * FROM settings WHERE admin_id = ?', [req.admin.id]);
        const settings = mapRow(rows) || {};
        res.json(settings);
    });

    // Update settings
    router.post('/', authenticateAdmin, async (req, res) => {
        const ALLOWED_FIELDS = [
            'currency', 'rent_reminder_days_before', 'rent_check_day',
            'fixer_id', 'property_name', 'auto_deduct', 'timezone',
            'late_fee_enabled', 'late_fee_amount', 'late_fee_grace_days',
            'start_text', 'rules_text', 'clearance_text',
        ];
        const STRING_FIELDS = ['currency', 'fixer_id', 'property_name', 'timezone'];
        const TEXT_FIELDS = ['start_text', 'rules_text', 'clearance_text'];
        const NUMBER_FIELDS = ['rent_reminder_days_before', 'rent_check_day', 'late_fee_amount', 'late_fee_grace_days'];
        const BOOL_FIELDS = ['auto_deduct', 'late_fee_enabled'];

        const newSettings = {};
        for (const key of ALLOWED_FIELDS) {
            if (req.body[key] !== undefined) {
                newSettings[key] = req.body[key];
            }
        }

        for (const key of STRING_FIELDS) {
            if (newSettings[key] !== undefined && typeof newSettings[key] === 'string' && newSettings[key].length > 200) {
                return res.status(400).json({ success: false, error: `${key} is too long (max 200 chars).` });
            }
        }
        for (const key of TEXT_FIELDS) {
            if (newSettings[key] !== undefined && typeof newSettings[key] === 'string' && newSettings[key].length > 5000) {
                return res.status(400).json({ success: false, error: `${key} is too long (max 5000 chars).` });
            }
        }
        for (const key of NUMBER_FIELDS) {
            if (newSettings[key] !== undefined) {
                const val = parseFloat(newSettings[key]);
                if (isNaN(val) || val < 0) {
                    return res.status(400).json({ success: false, error: `${key} must be a non-negative number.` });
                }
                newSettings[key] = val;
            }
        }
        for (const key of BOOL_FIELDS) {
            if (newSettings[key] !== undefined) {
                newSettings[key] = !!newSettings[key];
            }
        }

        if (newSettings.fixer_id) {
            const rawFixerId = String(newSettings.fixer_id).trim().replace(/^@/, '');
            if (rawFixerId && !/^\d+$/.test(rawFixerId)) {
                return res.status(400).json({ success: false, error: 'Fixer ID must be a numeric Telegram user ID. Have your fixer send /myid to the bot.' });
            }
            newSettings.fixer_id = rawFixerId;
        }

        // Build SET clause from camelCase -> snake_case
        const snakeSettings = {};
        for (const [key, val] of Object.entries(newSettings)) {
            const snake = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
            snakeSettings[snake] = val;
        }

        const [existing] = await pool.query('SELECT id FROM settings WHERE admin_id = ?', [req.admin.id]);
        if (existing.length > 0) {
            const sets = Object.keys(snakeSettings).map(k => `${k} = ?`).join(', ');
            const vals = Object.values(snakeSettings);
            await pool.query(`UPDATE settings SET ${sets} WHERE admin_id = ?`, [...vals, req.admin.id]);
        } else {
            snakeSettings.admin_id = req.admin.id;
            const cols = Object.keys(snakeSettings).join(', ');
            const placeholders = Object.keys(snakeSettings).map(() => '?').join(', ');
            await pool.query(`INSERT INTO settings (${cols}) VALUES (${placeholders})`, Object.values(snakeSettings));
        }

        auditLog(req.admin.id, 'update', 'settings', {});
        res.json({ success: true, message: "Settings updated successfully." });
    });

    return router;
};
