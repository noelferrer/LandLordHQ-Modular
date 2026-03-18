const express = require('express');
const { validateString } = require('../middleware/validate');

module.exports = ({ db, bot, middleware }) => {
    const router = express.Router();
    const { authenticateAdmin } = middleware;
    const { pool, mapRow } = db;

    // Landlord-to-Tenant text messaging
    router.post('/:unit', authenticateAdmin, async (req, res) => {
        const { unit } = req.params;
        const { message } = req.body;

        if (!message || !validateString(message, 2000)) {
            return res.status(400).json({ success: false, error: 'Message is required (max 2000 chars).' });
        }

        const [rows] = await pool.query('SELECT * FROM tenants WHERE unit = ? AND admin_id = ?', [unit, req.admin.id]);
        const tenant = mapRow(rows);

        if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
        if (!tenant.telegramId) return res.status(400).json({ success: false, error: 'Tenant not linked via Telegram' });

        try {
            await bot.telegram.sendMessage(tenant.telegramId, `📩 **Message from Landlord:**\n\n${message}`);
            res.json({ success: true, message: `Message sent to Unit ${unit}` });
        } catch (err) {
            console.error('Message send error:', err.message);
            res.status(500).json({ success: false, error: 'Failed to send message' });
        }
    });

    // Landlord sends photo to tenant
    router.post('/:unit/photo', authenticateAdmin, async (req, res) => {
        const { unit } = req.params;
        const { photoUrl, caption } = req.body;

        if (!photoUrl || typeof photoUrl !== 'string' || photoUrl.length > 500) {
            return res.status(400).json({ success: false, error: 'Valid photoUrl is required (max 500 chars).' });
        }

        // SSRF protection: only allow HTTPS URLs, block internal/private IPs
        let parsedUrl;
        try {
            parsedUrl = new URL(photoUrl);
        } catch {
            return res.status(400).json({ success: false, error: 'Invalid URL format.' });
        }
        if (parsedUrl.protocol !== 'https:') {
            return res.status(400).json({ success: false, error: 'Only HTTPS URLs are allowed.' });
        }
        const hostname = parsedUrl.hostname;
        // Block localhost, private IPs, and link-local addresses
        const blockedPatterns = [
            /^localhost$/i,
            /^127\./,
            /^10\./,
            /^172\.(1[6-9]|2\d|3[01])\./,
            /^192\.168\./,
            /^0\./,
            /^169\.254\./,
            /^\[?::1\]?$/,
            /^\[?fe80:/i,
            /^\[?fc00:/i,
            /^\[?fd/i,
        ];
        if (blockedPatterns.some(p => p.test(hostname))) {
            return res.status(400).json({ success: false, error: 'URLs pointing to internal addresses are not allowed.' });
        }
        if (caption && !validateString(caption, 1000)) {
            return res.status(400).json({ success: false, error: 'Caption too long (max 1000 chars).' });
        }

        const [rows] = await pool.query('SELECT * FROM tenants WHERE unit = ? AND admin_id = ?', [unit, req.admin.id]);
        const tenant = mapRow(rows);

        if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
        if (!tenant.telegramId) return res.status(400).json({ success: false, error: 'Tenant not linked via Telegram' });

        try {
            await bot.telegram.sendPhoto(tenant.telegramId, photoUrl, { caption: `📩 From Landlord: ${caption || ''}` });
            res.json({ success: true, message: `Photo sent to Unit ${unit}` });
        } catch (err) {
            console.error('Photo send error:', err.message);
            res.status(500).json({ success: false, error: 'Failed to send photo' });
        }
    });

    return router;
};
