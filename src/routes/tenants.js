const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { validateString, validateEmail, validatePhone, validatePositiveNumber, MAX_SHORT_STRING } = require('../middleware/validate');

module.exports = ({ db, helpers, middleware }) => {
    const router = express.Router();
    const { authenticateAdmin } = middleware;
    const { auditLog, paginate, generateLinkCode } = helpers;
    const { pool, mapRows, mapRow } = db;

    // Get all tenants (SQL-level pagination when page param present)
    router.get('/', authenticateAdmin, async (req, res) => {
        // Backfill missing link codes (batch update, not per-request full scan)
        const [missingRows] = await pool.query(
            'SELECT unit FROM tenants WHERE admin_id = ? AND telegram_id IS NULL AND (link_code IS NULL OR link_code = "")',
            [req.admin.id]
        );
        for (const row of missingRows) {
            await pool.query('UPDATE tenants SET link_code = ? WHERE unit = ? AND admin_id = ?', [generateLinkCode(), row.unit, req.admin.id]);
        }

        if (req.query.page) {
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
            const offset = (page - 1) * limit;

            const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM tenants WHERE admin_id = ?', [req.admin.id]);
            const [rows] = await pool.query('SELECT * FROM tenants WHERE admin_id = ? ORDER BY unit LIMIT ? OFFSET ?', [req.admin.id, limit, offset]);
            return res.json({ data: mapRows(rows), page, limit, total, totalPages: Math.ceil(total / limit) });
        }

        const [rows] = await pool.query('SELECT * FROM tenants WHERE admin_id = ?', [req.admin.id]);
        res.json(mapRows(rows));
    });

    // Create a new tenant
    router.post('/', authenticateAdmin, async (req, res) => {
        const { unit, name, email, phone, leaseAmount, advancePayment, securityDeposit,
                prepaidBalance, propertyId, moveInDate, leaseEndDate, rent_due_day,
                status, remarks } = req.body;

        if (!unit || !validateString(unit, 50)) {
            return res.status(400).json({ success: false, error: 'Unit is required (max 50 chars).' });
        }
        if (!name || !validateString(name, MAX_SHORT_STRING)) {
            return res.status(400).json({ success: false, error: 'Tenant name is required (max 100 chars).' });
        }
        if (!validateEmail(email)) {
            return res.status(400).json({ success: false, error: 'Invalid email format.' });
        }
        if (!validatePhone(phone)) {
            return res.status(400).json({ success: false, error: 'Invalid phone format.' });
        }
        if (leaseAmount && !validatePositiveNumber(leaseAmount)) {
            return res.status(400).json({ success: false, error: 'Lease amount must be a positive number.' });
        }
        if (advancePayment && !validatePositiveNumber(advancePayment)) {
            return res.status(400).json({ success: false, error: 'Advance payment must be a positive number.' });
        }
        if (securityDeposit && !validatePositiveNumber(securityDeposit)) {
            return res.status(400).json({ success: false, error: 'Security deposit must be a positive number.' });
        }
        if (prepaidBalance && !validatePositiveNumber(prepaidBalance)) {
            return res.status(400).json({ success: false, error: 'Prepaid balance must be a positive number.' });
        }

        const [existingRows] = await pool.query('SELECT id FROM tenants WHERE unit = ? AND admin_id = ?', [unit, req.admin.id]);
        if (existingRows.length > 0) {
            return res.status(400).json({ success: false, error: `Unit ${unit} already exists.` });
        }

        if (propertyId) {
            const [propRows] = await pool.query('SELECT units FROM properties WHERE id = ? AND admin_id = ?', [propertyId, req.admin.id]);
            if (propRows.length > 0) {
                const maxUnits = parseInt(propRows[0].units) || 0;
                const [countRows] = await pool.query('SELECT COUNT(*) as cnt FROM tenants WHERE property_id = ? AND admin_id = ?', [propertyId, req.admin.id]);
                if (maxUnits > 0 && countRows[0].cnt >= maxUnits) {
                    return res.status(400).json({ success: false, error: `This property is at full capacity (${maxUnits} unit${maxUnits !== 1 ? 's' : ''}). Increase the unit count in Property settings first.` });
                }
            }
        }

        const tenant = {
            id: uuidv4(),
            adminId: req.admin.id,
            linkCode: generateLinkCode(),
            unit,
            name,
            email: email || '',
            phone: phone || '',
            leaseAmount: leaseAmount ? parseFloat(leaseAmount) : 0,
            advancePayment: advancePayment ? parseFloat(advancePayment) : 0,
            securityDeposit: securityDeposit ? parseFloat(securityDeposit) : 0,
            prepaidBalance: prepaidBalance ? parseFloat(prepaidBalance) : 0,
            propertyId: propertyId || null,
            moveInDate: moveInDate || null,
            leaseEndDate: leaseEndDate || null,
            rentDueDay: rent_due_day || 1,
            status: status || 'Active',
            remarks: remarks || '',
        };

        await pool.query(
            `INSERT INTO tenants (id, admin_id, link_code, unit, name, email, phone, lease_amount, advance_payment,
             security_deposit, prepaid_balance, property_id, move_in_date, lease_end_date, rent_due_day, status, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tenant.id, tenant.adminId, tenant.linkCode, tenant.unit, tenant.name, tenant.email, tenant.phone,
             tenant.leaseAmount, tenant.advancePayment, tenant.securityDeposit, tenant.prepaidBalance,
             tenant.propertyId, tenant.moveInDate, tenant.leaseEndDate, tenant.rentDueDay, tenant.status, tenant.remarks]
        );

        auditLog(req.admin.id, 'create', 'tenant', { unit: tenant.unit, name: tenant.name });
        res.json({ success: true, tenant });
    });

    // Update a tenant
    router.put('/:unit', authenticateAdmin, async (req, res) => {
        const { unit } = req.params;

        const [existingRows] = await pool.query('SELECT * FROM tenants WHERE unit = ? AND admin_id = ?', [unit, req.admin.id]);
        const currentTenant = mapRow(existingRows);
        if (!currentTenant) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }

        const ALLOWED_UPDATE_FIELDS = [
            'name', 'email', 'phone', 'leaseAmount', 'advancePayment',
            'securityDeposit', 'prepaidBalance', 'propertyId', 'moveInDate',
            'leaseEndDate', 'rent_due_day', 'status', 'remarks'
        ];
        const updates = {};
        for (const key of ALLOWED_UPDATE_FIELDS) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        if (updates.name !== undefined && !validateString(updates.name, MAX_SHORT_STRING)) {
            return res.status(400).json({ success: false, error: 'Tenant name must be 1-100 characters.' });
        }
        if (updates.email !== undefined && updates.email && !validateEmail(updates.email)) {
            return res.status(400).json({ success: false, error: 'Invalid email format.' });
        }
        if (updates.phone !== undefined && updates.phone && !validatePhone(updates.phone)) {
            return res.status(400).json({ success: false, error: 'Invalid phone format.' });
        }

        if (updates.propertyId) {
            const isChangingProperty = String(currentTenant.propertyId) !== String(updates.propertyId);
            if (isChangingProperty) {
                const [propRows] = await pool.query('SELECT units FROM properties WHERE id = ? AND admin_id = ?', [updates.propertyId, req.admin.id]);
                if (propRows.length > 0) {
                    const maxUnits = parseInt(propRows[0].units) || 0;
                    const [countRows] = await pool.query('SELECT COUNT(*) as cnt FROM tenants WHERE property_id = ? AND admin_id = ? AND unit != ?', [updates.propertyId, req.admin.id, unit]);
                    if (maxUnits > 0 && countRows[0].cnt >= maxUnits) {
                        return res.status(400).json({ success: false, error: `Target property is at full capacity (${maxUnits} unit${maxUnits !== 1 ? 's' : ''}). Increase the unit count in Property settings first.` });
                    }
                }
            }
        }

        // Validate rent_due_day
        if (updates.rent_due_day !== undefined) {
            const d = parseInt(updates.rent_due_day);
            if (isNaN(d) || d < 1 || d > 31) {
                return res.status(400).json({ success: false, error: 'Due day must be between 1 and 31.' });
            }
            updates.rent_due_day = d;
        }

        // Validate status
        if (updates.status !== undefined) {
            const VALID_STATUSES = ['Active', 'Inactive', 'Moved Out'];
            if (!VALID_STATUSES.includes(updates.status)) {
                return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
            }
        }

        // Validate numeric fields
        const numericFields = ['leaseAmount', 'advancePayment', 'securityDeposit', 'prepaidBalance'];
        for (const field of numericFields) {
            if (updates[field] !== undefined) {
                const n = parseFloat(updates[field]);
                if (isNaN(n) || n < 0) {
                    return res.status(400).json({ success: false, error: `${field} must be a non-negative number.` });
                }
                updates[field] = n;
            }
        }

        // Convert empty date strings to null
        const dateFields = ['moveInDate', 'leaseEndDate'];
        for (const field of dateFields) {
            if (updates[field] !== undefined && !updates[field]) {
                updates[field] = null;
            }
        }

        // Convert camelCase keys to snake_case for SQL
        const snakeUpdates = {};
        for (const [key, val] of Object.entries(updates)) {
            const snake = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
            snakeUpdates[snake] = val;
        }

        if (Object.keys(snakeUpdates).length > 0) {
            const sets = Object.keys(snakeUpdates).map(k => `${k} = ?`).join(', ');
            await pool.query(`UPDATE tenants SET ${sets} WHERE unit = ? AND admin_id = ?`, [...Object.values(snakeUpdates), unit, req.admin.id]);
        }

        auditLog(req.admin.id, 'update', 'tenant', { unit });
        res.json({ success: true, message: `Unit ${unit} updated.` });
    });

    // Delete a tenant
    router.delete('/:unit', authenticateAdmin, async (req, res) => {
        const { unit } = req.params;

        const [existing] = await pool.query('SELECT id FROM tenants WHERE unit = ? AND admin_id = ?', [unit, req.admin.id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM payments WHERE unit = ? AND admin_id = ?', [unit, req.admin.id]);
            await conn.query('DELETE tm FROM ticket_media tm JOIN tickets t ON tm.ticket_id = t.id WHERE t.unit = ? AND t.admin_id = ?', [unit, req.admin.id]);
            await conn.query('DELETE FROM tickets WHERE unit = ? AND admin_id = ?', [unit, req.admin.id]);
            await conn.query('DELETE FROM tenants WHERE unit = ? AND admin_id = ?', [unit, req.admin.id]);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        auditLog(req.admin.id, 'delete', 'tenant', { unit });
        res.json({ success: true, message: `Unit ${unit} and associated records deleted.` });
    });

    // Trigger manual rent check
    router.post('/:unit/rent-check', authenticateAdmin, async (req, res) => {
        const { unit } = req.params;
        const [rows] = await pool.query('SELECT * FROM tenants WHERE unit = ? AND admin_id = ?', [unit, req.admin.id]);
        const tenant = mapRow(rows);
        if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

        const [settingsRows] = await pool.query('SELECT * FROM settings WHERE admin_id = ?', [req.admin.id]);
        const adminSettings = mapRow(settingsRows) || {};
        const bot = require('../bot');
        const { processRentCheck } = require('../scheduler');

        try {
            const result = await processRentCheck(bot, tenant, adminSettings);
            res.json({ success: true, ...result });
        } catch (error) {
            console.error('Manual rent check error:', error);
            res.status(500).json({ success: false, error: 'Failed to process rent check.' });
        }
    });

    return router;
};
