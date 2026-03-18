const express = require('express');
const path = require('path');

module.exports = ({ db, helpers, middleware }) => {
    const router = express.Router();
    const { authenticateSuperAdmin } = middleware;
    const { auditLog, paginate } = helpers;
    const { pool, mapRows } = db;

    // Serve Super Admin page
    router.get('/super', (req, res) => {
        res.sendFile(path.join(__dirname, '../../super.html'));
    });

    // Generate a new invite code
    router.post('/api/super/invites', authenticateSuperAdmin, async (req, res) => {
        const code = 'INV-' + helpers.generateSecureCode(8);

        await pool.query(
            'INSERT INTO invites (code, status, created_at) VALUES (?, ?, ?)',
            [code, 'active', new Date()]
        );

        auditLog(req.admin.id, 'create', 'invite', { code });
        res.json({ success: true, invite: { code, status: 'active', createdAt: new Date().toISOString() } });
    });

    // View audit log (super admin only)
    router.get('/api/super/audit-log', authenticateSuperAdmin, async (req, res) => {
        const [rows] = await pool.query('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100');
        const logs = mapRows(rows);
        if (req.query.page) {
            return res.json(paginate(logs, req.query.page, req.query.limit));
        }
        res.json(logs);
    });

    // List all invite codes
    router.get('/api/super/invites', authenticateSuperAdmin, async (req, res) => {
        const [rows] = await pool.query('SELECT * FROM invites ORDER BY created_at DESC');
        const invites = mapRows(rows);
        res.json(invites);
    });

    return router;
};
