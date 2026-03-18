const express = require('express');
const fetch = require('node-fetch');
const { mediaRateLimiter } = require('../middleware/rateLimit');

module.exports = ({ middleware }) => {
    const router = express.Router();
    const { authenticateAdmin } = middleware;
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    // Telegram Media Proxy (rate-limited)
    router.get('/:fileId', authenticateAdmin, mediaRateLimiter, async (req, res) => {
        try {
            const { fileId } = req.params;

            // Validate fileId format (Telegram file IDs are base64-like, typically alphanumeric + - _ )
            if (!fileId || fileId.length > 200 || !/^[A-Za-z0-9_\-]+$/.test(fileId)) {
                return res.status(400).json({ success: false, error: 'Invalid file ID format' });
            }

            const apiRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
            const apiData = await apiRes.json();

            if (!apiData.ok || !apiData.result || !apiData.result.file_path) {
                console.error('Telegram getFile failed: status', apiData.ok, 'description:', apiData.description || 'unknown');
                return res.status(404).json({ success: false, error: 'File not found on Telegram' });
            }

            const filePath = apiData.result.file_path;
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

            const fileRes = await fetch(fileUrl);

            if (!fileRes.ok) {
                return res.status(404).json({ success: false, error: 'Could not download file from Telegram' });
            }

            const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'private, max-age=86400');
            fileRes.body.pipe(res);
        } catch (err) {
            console.error('Media proxy error:', err.message);
            res.status(500).json({ success: false, error: 'Media proxy failed' });
        }
    });

    return router;
};
