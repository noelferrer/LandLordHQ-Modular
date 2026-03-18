const express = require('express');

module.exports = ({ db, helpers, middleware }) => {
    const router = express.Router();
    const { authenticateAdmin } = middleware;
    const { paginate } = helpers;
    const { pool, mapRows } = db;

    // View filtered audit log for current landlord (SQL-level pagination)
    router.get('/', authenticateAdmin, async (req, res) => {
        if (req.query.page) {
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
            const offset = (page - 1) * limit;

            const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM audit_log WHERE admin_id = ?', [req.admin.id]);
            const [rows] = await pool.query(
                'SELECT * FROM audit_log WHERE admin_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
                [req.admin.id, limit, offset]
            );
            return res.json({ data: mapRows(rows), page, limit, total, totalPages: Math.ceil(total / limit) });
        }

        const [rows] = await pool.query(
            'SELECT * FROM audit_log WHERE admin_id = ? ORDER BY timestamp DESC LIMIT 50',
            [req.admin.id]
        );
        res.json(mapRows(rows));
    });

    return router;
};
