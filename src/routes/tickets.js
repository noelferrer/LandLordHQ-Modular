const express = require('express');

module.exports = ({ db, bot, helpers, middleware }) => {
    const router = express.Router();
    const { authenticateAdmin } = middleware;
    const { auditLog, paginate } = helpers;
    const { pool, mapRows, mapRow } = db;

    // Get all tickets (with media)
    router.get('/', authenticateAdmin, async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM tickets WHERE admin_id = ? ORDER BY timestamp DESC', [req.admin.id]);
            const tickets = mapRows(rows);

            // Attach media to each ticket
            if (tickets.length > 0) {
                const ticketIds = tickets.map(t => t.id);
                const [mediaRows] = await pool.query('SELECT * FROM ticket_media WHERE ticket_id IN (?)', [ticketIds]);
                const mediaMap = {};
                for (const m of mediaRows) {
                    if (!mediaMap[m.ticket_id]) mediaMap[m.ticket_id] = [];
                    mediaMap[m.ticket_id].push({ type: m.type, fileId: m.file_id });
                }
                for (const t of tickets) {
                    t.media = mediaMap[t.id] || [];
                }
            }

            if (req.query.page) {
                return res.json(paginate(tickets, req.query.page, req.query.limit));
            }
            res.json(tickets);
        } catch (err) {
            console.error('Error fetching tickets:', err);
            res.status(500).json({ success: false, error: 'Failed to load tickets. Please try again.' });
        }
    });

    // Forward ticket to fixer
    router.post('/:id/forward', authenticateAdmin, async (req, res) => {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM tickets WHERE id = ? AND admin_id = ?', [id, req.admin.id]);
        const ticket = mapRow(rows);

        const [settingsRows] = await pool.query('SELECT * FROM settings WHERE admin_id = ?', [req.admin.id]);
        const settings = mapRow(settingsRows) || {};

        if (!ticket) return res.status(404).json({ success: false, error: "Ticket not found" });
        if (!settings.fixerId) return res.status(400).json({ success: false, error: "Fixer Chat ID not configured in Settings. Have your fixer send /myid to the bot to get their numeric ID." });

        const rawFixerId = String(settings.fixerId).trim().replace(/^@/, '');
        const fixerChatId = /^\d+$/.test(rawFixerId) ? parseInt(rawFixerId, 10) : null;
        if (!fixerChatId) {
            return res.status(400).json({ success: false, error: "Fixer Chat ID must be a numeric Telegram user ID." });
        }

        bot.telegram.sendMessage(
            fixerChatId,
            `🛠️ **Maintenance Request Forwarded:**\n\n**Unit**: ${ticket.unit}\n**Issue**: ${ticket.issue}\n**Tenant**: ${ticket.tenantName}\n\nPlease attend to this issue.`,
            { parse_mode: 'Markdown' }
        ).catch(err => console.error("Failed to notify fixer:", err));

        // Forward media
        const [mediaRows] = await pool.query('SELECT * FROM ticket_media WHERE ticket_id = ?', [id]);
        for (const m of mediaRows) {
            if (m.type === 'photo') {
                bot.telegram.sendPhoto(fixerChatId, m.file_id, { caption: `📸 From Unit ${ticket.unit}` }).catch(err => console.error("Failed to send media to fixer:", err));
            } else if (m.type === 'video') {
                bot.telegram.sendVideo(fixerChatId, m.file_id, { caption: `🎥 From Unit ${ticket.unit}` }).catch(err => console.error("Failed to send media to fixer:", err));
            }
        }

        await pool.query('UPDATE tickets SET status = ? WHERE id = ? AND admin_id = ?', ['forwarded', id, req.admin.id]);
        auditLog(req.admin.id, 'forward', 'ticket', { id, unit: ticket.unit });
        res.json({ success: true, message: `Ticket #${id} forwarded to maintenance.` });
    });

    // Update ticket status
    router.put('/:id', authenticateAdmin, async (req, res) => {
        const { id } = req.params;
        const { status, notes, priority, reported } = req.body;
        const VALID_STATUSES = ['open', 'forwarded', 'closed'];
        const VALID_PRIORITIES = ['low', 'medium', 'high'];
        const updates = {};

        if (status !== undefined) {
            if (!VALID_STATUSES.includes(status)) {
                return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
            }
            updates.status = status;
        }
        if (notes !== undefined) {
            if (typeof notes !== 'string' || notes.length > 2000) {
                return res.status(400).json({ success: false, error: 'Notes must be a string (max 2000 chars).' });
            }
            updates.notes = notes;
        }
        if (priority !== undefined) {
            if (!VALID_PRIORITIES.includes(priority)) {
                return res.status(400).json({ success: false, error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
            }
            updates.priority = priority;
        }
        if (reported !== undefined) {
            updates.reported = !!reported;
        }

        const [existing] = await pool.query('SELECT id FROM tickets WHERE id = ? AND admin_id = ?', [id, req.admin.id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, error: "Ticket not found." });
        }

        if (updates.status === 'closed') {
            updates.reported = true;
            updates.closed_at = new Date();
        }

        if (Object.keys(updates).length > 0) {
            const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
            await pool.query(`UPDATE tickets SET ${sets} WHERE id = ? AND admin_id = ?`, [...Object.values(updates), id, req.admin.id]);
        }

        auditLog(req.admin.id, 'update', 'ticket', { id, status: updates.status });
        res.json({ success: true, message: `Ticket ${id} updated successfully.` });
    });

    return router;
};
