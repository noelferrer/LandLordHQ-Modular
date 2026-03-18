const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { validatePositiveNumber, validateString, MAX_STRING_LENGTH } = require('../middleware/validate');

module.exports = ({ db, helpers, middleware }) => {
    const router = express.Router();
    const { authenticateAdmin } = middleware;
    const { auditLog, paginate } = helpers;
    const { pool, mapRows } = db;

    // Get all expenses
    router.get('/', authenticateAdmin, async (req, res) => {
        const [rows] = await pool.query('SELECT * FROM expenses WHERE admin_id = ?', [req.admin.id]);
        const expenses = mapRows(rows);
        if (req.query.page) {
            return res.json(paginate(expenses, req.query.page, req.query.limit));
        }
        res.json(expenses);
    });

    // Create an expense
    router.post('/', authenticateAdmin, async (req, res) => {
        if (req.body.amount !== undefined && !validatePositiveNumber(req.body.amount)) {
            return res.status(400).json({ success: false, error: 'Amount must be a positive number.' });
        }
        if (req.body.description && !validateString(req.body.description, MAX_STRING_LENGTH)) {
            return res.status(400).json({ success: false, error: 'Description too long (max 500 chars).' });
        }
        const { category, amount, description, propertyId, vendor } = req.body;
        if (category && !validateString(category, 100)) {
            return res.status(400).json({ success: false, error: 'Category too long (max 100 chars).' });
        }
        if (vendor && !validateString(vendor, 100)) {
            return res.status(400).json({ success: false, error: 'Vendor too long (max 100 chars).' });
        }

        const expense = {
            id: uuidv4(),
            adminId: req.admin.id,
            timestamp: new Date(),
            category: category || '',
            amount: amount ? parseFloat(amount) : 0,
            description: description || '',
            propertyId: propertyId || null,
            vendor: vendor || '',
        };

        await pool.query(
            `INSERT INTO expenses (id, admin_id, timestamp, category, amount, description, property_id, vendor)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [expense.id, expense.adminId, expense.timestamp, expense.category,
             expense.amount, expense.description, expense.propertyId, expense.vendor]
        );

        auditLog(req.admin.id, 'create', 'expense', { id: expense.id, amount: expense.amount });
        res.json({ success: true, expense });
    });

    // Delete an expense
    router.delete('/:id', authenticateAdmin, async (req, res) => {
        const { id } = req.params;
        const [result] = await pool.query('DELETE FROM expenses WHERE id = ? AND admin_id = ?', [id, req.admin.id]);

        if (result.affectedRows > 0) {
            auditLog(req.admin.id, 'delete', 'expense', { id });
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: 'Expense not found' });
        }
    });

    return router;
};
