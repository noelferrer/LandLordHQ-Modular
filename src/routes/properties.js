const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { validateString, MAX_SHORT_STRING } = require('../middleware/validate');

module.exports = ({ db, helpers, middleware }) => {
    const router = express.Router();
    const { authenticateAdmin } = middleware;
    const { auditLog, paginate } = helpers;
    const { pool, mapRows, mapRow } = db;

    // Get all properties
    router.get('/', authenticateAdmin, async (req, res) => {
        const [rows] = await pool.query('SELECT * FROM properties WHERE admin_id = ?', [req.admin.id]);
        const properties = mapRows(rows);
        if (req.query.page) {
            return res.json(paginate(properties, req.query.page, req.query.limit));
        }
        res.json(properties);
    });

    // Create a property
    router.post('/', authenticateAdmin, async (req, res) => {
        if (!req.body.name || !validateString(req.body.name, MAX_SHORT_STRING)) {
            return res.status(400).json({ success: false, error: 'Property name is required (max 100 chars).' });
        }
        if (req.body.address && !validateString(req.body.address, 200)) {
            return res.status(400).json({ success: false, error: 'Address too long (max 200 chars).' });
        }

        const { name, address, city, state, zip, units, type, status, description } = req.body;
        const property = {
            id: uuidv4(),
            adminId: req.admin.id,
            name,
            address: address || '',
            city: city || '',
            state: state || '',
            zip: zip || '',
            units: units || 0,
            type: type || '',
            status: status || 'Active',
            description: description || '',
            createdAt: new Date(),
        };

        await pool.query(
            `INSERT INTO properties (id, admin_id, name, address, city, state, zip, units, type, status, description, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [property.id, property.adminId, property.name, property.address, property.city, property.state,
             property.zip, property.units, property.type, property.status, property.description, property.createdAt]
        );

        auditLog(req.admin.id, 'create', 'property', { name: property.name, id: property.id });
        res.json({ success: true, property });
    });

    // Update a property
    router.put('/:id', authenticateAdmin, async (req, res) => {
        const { id } = req.params;
        const { name, address, units, type, status } = req.body;
        const updates = {};

        if (name !== undefined) {
            if (!validateString(name, MAX_SHORT_STRING)) {
                return res.status(400).json({ success: false, error: 'Property name must be 1-100 characters.' });
            }
            updates.name = name;
        }
        if (address !== undefined) {
            if (address && !validateString(address, 200)) {
                return res.status(400).json({ success: false, error: 'Address too long (max 200 chars).' });
            }
            updates.address = address;
        }
        if (units !== undefined) {
            const u = parseInt(units);
            if (isNaN(u) || u < 0 || u > 10000) {
                return res.status(400).json({ success: false, error: 'Units must be a number between 0 and 10000.' });
            }
            updates.units = u;
        }
        if (type !== undefined) {
            if (type && !validateString(type, 50)) {
                return res.status(400).json({ success: false, error: 'Type too long (max 50 chars).' });
            }
            updates.type = type;
        }
        if (status !== undefined) {
            if (status && !validateString(status, 50)) {
                return res.status(400).json({ success: false, error: 'Status too long (max 50 chars).' });
            }
            updates.status = status;
        }

        const [existing] = await pool.query('SELECT id FROM properties WHERE id = ? AND admin_id = ?', [id, req.admin.id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, error: 'Property not found' });
        }

        if (Object.keys(updates).length > 0) {
            const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
            await pool.query(`UPDATE properties SET ${sets} WHERE id = ? AND admin_id = ?`, [...Object.values(updates), id, req.admin.id]);
        }

        auditLog(req.admin.id, 'update', 'property', { id });
        res.json({ success: true, message: `Property ${id} updated.` });
    });

    // Delete a property (cascade)
    router.delete('/:id', authenticateAdmin, async (req, res) => {
        const { id } = req.params;

        const [existing] = await pool.query('SELECT id FROM properties WHERE id = ? AND admin_id = ?', [id, req.admin.id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, error: 'Property not found' });
        }

        // Find tenants in this property for cascade
        const [tenantRows] = await pool.query('SELECT unit FROM tenants WHERE property_id = ? AND admin_id = ?', [id, req.admin.id]);
        const removedUnits = tenantRows.map(t => t.unit);

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            for (const unit of removedUnits) {
                await conn.query('DELETE FROM payments WHERE unit = ? AND admin_id = ?', [unit, req.admin.id]);
                // Delete ticket media first (FK constraint)
                await conn.query('DELETE tm FROM ticket_media tm JOIN tickets t ON tm.ticket_id = t.id WHERE t.unit = ? AND t.admin_id = ?', [unit, req.admin.id]);
                await conn.query('DELETE FROM tickets WHERE unit = ? AND admin_id = ?', [unit, req.admin.id]);
            }

            await conn.query('DELETE FROM tenants WHERE property_id = ? AND admin_id = ?', [id, req.admin.id]);
            await conn.query('DELETE FROM properties WHERE id = ? AND admin_id = ?', [id, req.admin.id]);

            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        auditLog(req.admin.id, 'delete', 'property', {
            id,
            cascaded: { tenants: removedUnits.length, units: removedUnits }
        });
        res.json({ success: true, message: `Property and ${removedUnits.length} associated tenant(s) deleted.` });
    });

    return router;
};
