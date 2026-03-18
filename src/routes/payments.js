const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { validatePositiveNumber, validateString, MAX_STRING_LENGTH } = require('../middleware/validate');

module.exports = ({ db, bot, helpers, middleware }) => {
    const router = express.Router();
    const { authenticateAdmin } = middleware;
    const { auditLog, paginate } = helpers;
    const { pool, mapRows, mapRow } = db;

    // Get all payments (SQL-level pagination when page param present)
    router.get('/', authenticateAdmin, async (req, res) => {
        if (req.query.page) {
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
            const offset = (page - 1) * limit;

            const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM payments WHERE admin_id = ?', [req.admin.id]);
            const [rows] = await pool.query('SELECT * FROM payments WHERE admin_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?', [req.admin.id, limit, offset]);
            return res.json({ data: mapRows(rows), page, limit, total, totalPages: Math.ceil(total / limit) });
        }

        const [rows] = await pool.query('SELECT * FROM payments WHERE admin_id = ?', [req.admin.id]);
        res.json(mapRows(rows));
    });

    // Add a manual payment
    router.post('/', authenticateAdmin, async (req, res) => {
        if (req.body.amount !== undefined && !validatePositiveNumber(req.body.amount)) {
            return res.status(400).json({ success: false, error: 'Amount must be a positive number.' });
        }
        if (req.body.notes && !validateString(req.body.notes, MAX_STRING_LENGTH)) {
            return res.status(400).json({ success: false, error: 'Notes too long (max 500 chars).' });
        }
        const { unit, amount, method, notes, propertyId } = req.body;
        if (unit && !validateString(unit, 50)) {
            return res.status(400).json({ success: false, error: 'Unit name too long (max 50 chars).' });
        }
        if (method && !validateString(method, 100)) {
            return res.status(400).json({ success: false, error: 'Method too long (max 100 chars).' });
        }

        const payment = {
            id: uuidv4(),
            adminId: req.admin.id,
            type: 'manual',
            status: 'verified',
            timestamp: new Date(),
            unit: unit || '',
            amount: amount ? parseFloat(amount) : 0,
            method: method || '',
            notes: notes || '',
            propertyId: propertyId || null,
        };

        await pool.query(
            `INSERT INTO payments (id, admin_id, type, status, timestamp, unit, amount, method, notes, property_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [payment.id, payment.adminId, payment.type, payment.status, payment.timestamp,
             payment.unit, payment.amount, payment.method, payment.notes, payment.propertyId]
        );

        auditLog(req.admin.id, 'create', 'payment', { id: payment.id, unit: payment.unit, amount: payment.amount });
        res.json({ success: true, payment });
    });

    // Verify a payment
    router.post('/:id/verify', authenticateAdmin, async (req, res) => {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM payments WHERE id = ? AND admin_id = ?', [id, req.admin.id]);
        const payment = mapRow(rows);

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        const { amount } = req.body;
        const updateData = { status: 'verified' };

        const [tenantRows] = await pool.query('SELECT * FROM tenants WHERE unit = ? AND admin_id = ?', [payment.unit, req.admin.id]);
        const tenant = mapRow(tenantRows);

        if (amount !== undefined && amount !== null) {
            if (!validatePositiveNumber(amount)) {
                return res.status(400).json({ success: false, error: 'Amount must be a positive number.' });
            }
            updateData.amount = parseFloat(amount);
        } else if (!payment.amount) {
            updateData.amount = (tenant && tenant.leaseAmount) ? tenant.leaseAmount : 0;
        }

        if (tenant && tenant.propertyId) {
            updateData.property_id = tenant.propertyId;
        }

        const sets = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
        await pool.query(`UPDATE payments SET ${sets} WHERE id = ? AND admin_id = ?`, [...Object.values(updateData), id, req.admin.id]);

        if (tenant && tenant.telegramId) {
            bot.telegram.sendMessage(
                tenant.telegramId,
                `✅ **Payment Verified!**\n\nYour payment for Unit ${payment.unit} has been confirmed by the landlord. Thank you!`
            ).catch(err => console.error("Failed to notify tenant:", err));
        }

        auditLog(req.admin.id, 'verify', 'payment', { id, unit: payment.unit });
        res.json({ success: true, message: 'Payment verified' });
    });

    // Delete a payment
    router.delete('/:paymentId', authenticateAdmin, async (req, res) => {
        const { paymentId } = req.params;
        const [result] = await pool.query('DELETE FROM payments WHERE id = ? AND admin_id = ?', [paymentId, req.admin.id]);

        if (result.affectedRows > 0) {
            auditLog(req.admin.id, 'delete', 'payment', { id: paymentId });
            res.json({ success: true, message: 'Payment deleted successfully' });
        } else {
            res.status(404).json({ success: false, error: 'Payment not found' });
        }
    });

    return router;
};
