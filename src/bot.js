require('dotenv').config();
const { Telegraf } = require('telegraf');
const { pool, mapRow, mapRows } = require('./database');
const { setupReminders } = require('./scheduler');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const token = process.env.TELEGRAM_BOT_TOKEN;

// Validate token format (bot_id:secret)
if (token && !token.includes(':')) {
    console.error('Invalid TELEGRAM_BOT_TOKEN format in .env file.');
    console.error('A valid token should look like: 123456789:ABCDefghIJKLmnopQRSTuvwxyz');
    process.exit(1);
}

const bot = new Telegraf(token);

// Fetch fallback owner ID for legacy support during migration
const fallbackOwnerId = process.env.OWNER_TELEGRAM_ID ? parseInt(process.env.OWNER_TELEGRAM_ID) : null;

// Middleware to check if the user is an admin
const getAdmin = async (ctx) => {
    const [rows] = await pool.query('SELECT * FROM admins WHERE telegram_id = ?', [ctx.from.id.toString()]);
    const admin = mapRow(rows);
    if (admin) return admin;

    // Fallback: if this is the owner and they have a real admin record
    if (fallbackOwnerId && ctx.from.id === fallbackOwnerId) {
        const [ownerRows] = await pool.query('SELECT * FROM admins WHERE telegram_id = ?', [fallbackOwnerId.toString()]);
        return mapRow(ownerRows);
    }
    return null;
};

const isAdmin = async (ctx, next) => {
    const admin = await getAdmin(ctx);
    if (admin) {
        ctx.admin = admin;
        return next();
    }
    return ctx.reply("Unauthorized. This command is for Unit Owners only.");
};

// --- Helper: send message to admin for a tenant ---
async function notifyAdmin(tenant, message, extras) {
    const [rows] = await pool.query('SELECT * FROM admins WHERE id = ?', [tenant.adminId]);
    const admin = mapRow(rows) || { telegramId: fallbackOwnerId };
    if (admin && admin.telegramId) {
        try {
            await bot.telegram.sendMessage(admin.telegramId, message, extras);
        } catch (err) {
            console.error(`Failed to notify admin for unit ${tenant.unit}:`, err.message);
        }
    }
    return admin;
}

// --- Landlord Claiming Command (with OTP verification) ---
bot.command('claim', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) return ctx.reply("Usage: /claim <username>\nYou will receive a verification code to confirm ownership.");

    const username = args[0].toLowerCase();
    if (!/^[a-z0-9_]{1,50}$/.test(username)) {
        return ctx.reply("Invalid username. Use alphanumeric characters or underscores (max 50).");
    }

    const [adminRows] = await pool.query('SELECT * FROM admins WHERE username = ?', [username]);
    const admin = mapRow(adminRows);
    if (!admin) return ctx.reply("Registration not found for that username.");
    if (admin.telegramId) return ctx.reply('This account has already been claimed.');

    // Generate a 6-digit verification code and store its hash
    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Store pending claim with hashed verification code
    await pool.query('DELETE FROM pending_claims WHERE username = ?', [username]);
    await pool.query(
        'INSERT INTO pending_claims (username, telegram_id, code, expires_at) VALUES (?, ?, ?, ?)',
        [username, ctx.from.id.toString(), codeHash, expiresAt]
    );

    await ctx.reply(
        `To claim the account "${username}", you must verify ownership.\n\nA 6-digit code has been generated. Ask the account creator or system admin to provide you the code, or check the registration email.\n\nThen send: /verifyclaim ${username} <code>\n\nCode expires in 10 minutes.`
    );

    // Log claim attempt (code is hashed — not logged in plaintext)
    console.log(`[CLAIM] Verification code generated for "${username}" (requested by Telegram ID ${ctx.from.id})`);
});

// --- Verify Claim Command ---
bot.command('verifyclaim', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply("Usage: /verifyclaim <username> <code>");

    const username = args[0].toLowerCase();
    const codeInput = args[1];
    const codeHash = crypto.createHash('sha256').update(codeInput).digest('hex');

    const [pendingRows] = await pool.query(
        'SELECT * FROM pending_claims WHERE username = ? AND telegram_id = ?',
        [username, ctx.from.id.toString()]
    );
    const pending = mapRow(pendingRows);

    if (!pending) return ctx.reply('No pending claim found. Use /claim <username> first.');
    if (new Date() > new Date(pending.expiresAt)) {
        await pool.query('DELETE FROM pending_claims WHERE username = ?', [username]);
        return ctx.reply('Verification code has expired. Please run /claim again.');
    }
    if (!crypto.timingSafeEqual(Buffer.from(pending.code, 'hex'), Buffer.from(codeHash, 'hex'))) {
        return ctx.reply('Invalid verification code. Please try again.');
    }

    // Verify the admin account still exists and is unclaimed
    const [adminRows] = await pool.query('SELECT * FROM admins WHERE username = ?', [username]);
    const admin = mapRow(adminRows);
    if (!admin) {
        await pool.query('DELETE FROM pending_claims WHERE username = ?', [username]);
        return ctx.reply('Account no longer exists.');
    }
    if (admin.telegramId) {
        await pool.query('DELETE FROM pending_claims WHERE username = ?', [username]);
        return ctx.reply('This account has already been claimed.');
    }

    // Claim successful
    await pool.query('UPDATE admins SET telegram_id = ? WHERE username = ?', [ctx.from.id.toString(), username]);
    await pool.query('DELETE FROM pending_claims WHERE username = ?', [username]);

    await ctx.reply(
        `Account Activated!\n\nWelcome, ${admin.name}. Your LandlordHQ account is now linked to this Telegram profile.\n\nYou can now log in to the dashboard using your username: ${username}`
    );
});

// --- Tenant Commands ---
bot.start(async (ctx) => {
    const [rows] = await pool.query('SELECT start_text FROM settings LIMIT 1');
    const settings = mapRow(rows);
    const startText = (settings && settings.startText) || "Welcome to Landlord HQ. Enter /help for more commands.";
    return ctx.reply(startText);
});

bot.help((ctx) => {
    const helpCommands = `**Landlord HQ Commands:**\n\n` +
        `- **/start** - Show the welcome message.\n` +
        `- **/help** - Show this list of commands.\n` +
        `- **/rules** - View the Condo House Rules.\n` +
        `- **/clearance** - View the Move-out Clearance process.\n` +
        `- **/report <issue>** - Submit a maintenance ticket.\n` +
        `- **/payment** - Attach a Photo/Video receipt to log a payment.\n\n` +
        `**Tip:** When sending a Photo/Video, use \`/report <issue>\` or \`/payment\` in the caption to classify it correctly.`;
    return ctx.replyWithMarkdown(helpCommands);
});

bot.command('link', async (ctx) => {
    const text = ctx.message.text.split(' ');
    if (text.length < 2) return ctx.reply("Usage: /link <LinkCode>\nAsk your landlord for your unique 6-character link code.");

    const code = text[1].toUpperCase();
    const [rows] = await pool.query('SELECT * FROM tenants WHERE link_code = ?', [code]);
    const existing = mapRow(rows);

    if (!existing) return ctx.reply("Invalid Link Code. Please check the code and try again.");

    if (existing.telegramId && String(existing.telegramId) === String(ctx.from.id)) {
        return ctx.reply(`You are already linked to Unit ${existing.unit}!`);
    }
    if (existing.telegramId) {
        return ctx.reply("This link code has already been used by another account. Please ask your landlord for a new one.");
    }

    await pool.query(
        'UPDATE tenants SET telegram_id = ? WHERE link_code = ? AND admin_id = ?',
        [ctx.from.id.toString(), code, existing.adminId]
    );

    await ctx.reply(`Success! You are now registered as the tenant for Unit ${existing.unit}. You will receive automated rent reminders here.`);
});

bot.command('rules', async (ctx) => {
    const [rows] = await pool.query('SELECT rules_text FROM settings LIMIT 1');
    const settings = mapRow(rows);
    const rulesText = (settings && settings.rulesText) || "**Condo House Rules:**\n\n1. No loud music after 10PM.\n2. Keep common areas clean.";
    return ctx.replyWithMarkdown(rulesText);
});

bot.command('report', async (ctx) => {
    const issue = ctx.message.text.split(' ').slice(1).join(' ');
    if (!issue) return ctx.reply("Usage: /report <Describe your issue here>\n\nTip: You can also send a photo or video with the caption 'report: your issue' to attach evidence!");
    if (issue.length > 2000) return ctx.reply("Issue description is too long (max 2000 characters).");

    const telegramId = ctx.from.id.toString();
    const [tenantRows] = await pool.query('SELECT * FROM tenants WHERE telegram_id = ?', [telegramId]);
    const tenant = mapRow(tenantRows);
    if (!tenant) return ctx.reply("You must be linked first. Use /link <code>.");

    const ticketId = uuidv4();
    await pool.query(
        'INSERT INTO tickets (id, admin_id, unit, tenant_name, issue, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [ticketId, tenant.adminId, tenant.unit, tenant.name, issue, 'open', new Date()]
    );

    await ctx.reply(`Issue reported! Your ticket ID is #${ticketId}. The Landlord has been notified.\n\nTip: You can send photos/videos to add evidence.`);

    await notifyAdmin(tenant, `New Tenant Concern:\n\nUnit ${tenant.unit}: ${issue}\n(Ticket #${ticketId})`);
});

bot.command('payment', (ctx) => {
    return ctx.reply("Payment Submission:\n\nPlease send a Photo or Video of your receipt/transaction as an attachment and use /payment in the caption.");
});

bot.command('clearance', async (ctx) => {
    const [rows] = await pool.query('SELECT clearance_text FROM settings LIMIT 1');
    const settings = mapRow(rows);
    const clearanceText = (settings && settings.clearanceText) || "**Move-out Clearance Process:**\n\n1. Settle all outstanding utility bills.\n2. Submit the Clearance Form to the Admin office.\n3. Send a photo of the signed form here for verification.";
    return ctx.replyWithMarkdown(clearanceText);
});

// --- Smart Media Handler (Photos) ---
bot.on('photo', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const [tenantRows] = await pool.query('SELECT * FROM tenants WHERE telegram_id = ?', [telegramId]);
    const tenant = mapRow(tenantRows);
    if (!tenant) return ctx.reply("You must be linked first. Use /link <code>.");

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;
    const caption = (ctx.message.caption || '').trim().toLowerCase();

    // Route: Maintenance Report
    if (caption.startsWith('/report')) {
        const issue = ctx.message.caption.substring(7).trim() || 'Photo evidence submitted';

        const ticketId = uuidv4();
        await pool.query(
            'INSERT INTO tickets (id, admin_id, unit, tenant_name, issue, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [ticketId, tenant.adminId, tenant.unit, tenant.name, issue, 'open', new Date()]
        );
        await pool.query(
            'INSERT INTO ticket_media (ticket_id, type, file_id) VALUES (?, ?, ?)',
            [ticketId, 'photo', fileId]
        );

        await ctx.reply(`Issue reported with photo evidence!\n\nTicket #${ticketId} created for Unit ${tenant.unit}.`);

        const admin = await notifyAdmin(tenant, `New Concern with Photo:\n\nUnit ${tenant.unit}: ${issue}\n(Ticket #${ticketId})`);
        if (admin && admin.telegramId) {
            try {
                await bot.telegram.sendPhoto(admin.telegramId, fileId, { caption: `Evidence from Unit ${tenant.unit} - ${tenant.name}` });
            } catch (err) {
                console.error('Failed to send photo to admin:', err.message);
            }
        }
        return;
    }

    // Route: Payment receipt (default)
    const paymentId = uuidv4();
    await pool.query(
        'INSERT INTO payments (id, admin_id, unit, tenant_name, file_id, media_type, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [paymentId, tenant.adminId, tenant.unit, tenant.name, fileId, 'photo', 'pending', new Date()]
    );

    await ctx.reply(`Receipt Received!\n\nThe Landlord has been notified. We will verify your payment for Unit ${tenant.unit} shortly.`);

    const admin = await notifyAdmin(tenant, `New Payment Proof:\n\nUnit ${tenant.unit} has submitted a receipt for verification.`);
    if (admin && admin.telegramId) {
        try {
            await bot.telegram.sendPhoto(admin.telegramId, fileId, { caption: `Receipt from Unit ${tenant.unit} (${tenant.name})` });
        } catch (err) {
            console.error('Failed to send receipt photo to admin:', err.message);
        }
    }
});

// --- Smart Media Handler (Videos) ---
bot.on('video', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const [tenantRows] = await pool.query('SELECT * FROM tenants WHERE telegram_id = ?', [telegramId]);
    const tenant = mapRow(tenantRows);
    if (!tenant) return ctx.reply("You must be linked first. Use /link <code>.");

    const fileId = ctx.message.video.file_id;
    const caption = (ctx.message.caption || '').trim().toLowerCase();

    // Route: Maintenance Report
    if (caption.startsWith('/report')) {
        const issue = ctx.message.caption.substring(7).trim() || 'Video evidence submitted';

        const ticketId = uuidv4();
        await pool.query(
            'INSERT INTO tickets (id, admin_id, unit, tenant_name, issue, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [ticketId, tenant.adminId, tenant.unit, tenant.name, issue, 'open', new Date()]
        );
        await pool.query(
            'INSERT INTO ticket_media (ticket_id, type, file_id) VALUES (?, ?, ?)',
            [ticketId, 'video', fileId]
        );

        await ctx.reply(`Issue reported with video evidence!\n\nTicket #${ticketId} created for Unit ${tenant.unit}.`);

        const admin = await notifyAdmin(tenant, `New Concern with Video:\n\nUnit ${tenant.unit}: ${issue}\n(Ticket #${ticketId})`);
        if (admin && admin.telegramId) {
            try {
                await bot.telegram.sendVideo(admin.telegramId, fileId, { caption: `Evidence from Unit ${tenant.unit} - ${tenant.name}` });
            } catch (err) {
                console.error('Failed to send video to admin:', err.message);
            }
        }
        return;
    }

    // Route: Payment receipt (default)
    const paymentId = uuidv4();
    await pool.query(
        'INSERT INTO payments (id, admin_id, unit, tenant_name, file_id, media_type, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [paymentId, tenant.adminId, tenant.unit, tenant.name, fileId, 'video', 'pending', new Date()]
    );

    await ctx.reply(`Receipt (Video) Received!\n\nThe Landlord has been notified. We will verify your payment for Unit ${tenant.unit} shortly.`);

    const admin = await notifyAdmin(tenant, `New Payment Proof (Video):\n\nUnit ${tenant.unit} has submitted a video receipt.`);
    if (admin && admin.telegramId) {
        try {
            await bot.telegram.sendVideo(admin.telegramId, fileId, { caption: `Receipt from Unit ${tenant.unit} (${tenant.name})` });
        } catch (err) {
            console.error('Failed to send receipt video to admin:', err.message);
        }
    }
});

// --- /myid command ---
bot.command('myid', (ctx) => {
    return ctx.reply(
        `Your Telegram numeric Chat ID is:\n\n<code>${ctx.from.id}</code>\n\nCopy this number into the <b>Fixer Chat ID</b> field in LandlordHQ Settings.`,
        { parse_mode: 'HTML' }
    );
});

// --- Owner/Admin Commands ---
bot.command('addtenant', isAdmin, async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply("Usage: /addtenant <UnitNumber> <TenantName> [DueDay]");

    const unit = args[0];
    const name = args[1];
    const rent_due_day = parseInt(args[2]) || 1;

    if (unit.length > 20) return ctx.reply("Unit number is too long (max 20 characters).");
    if (name.length > 100) return ctx.reply("Tenant name is too long (max 100 characters).");
    if (rent_due_day < 1 || rent_due_day > 31) return ctx.reply("Due day must be between 1 and 31.");

    const [existingRows] = await pool.query(
        'SELECT id FROM tenants WHERE unit = ? AND admin_id = ?', [unit, ctx.admin.id]
    );
    if (existingRows.length > 0) return ctx.reply(`Unit ${unit} already exists.`);

    const linkCode = crypto.randomBytes(4).toString('base64url').substring(0, 6).toUpperCase();
    await pool.query(
        'INSERT INTO tenants (id, unit, telegram_id, name, rent_due_day, admin_id, link_code) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), unit, null, name, rent_due_day, ctx.admin.id, linkCode]
    );

    await ctx.reply(`Added Unit ${unit} for ${name} (Due Day: ${rent_due_day}).\n\nLink Code: ${linkCode}\nSend this to the tenant. They must send /link ${linkCode} to this bot to receive notifications.`);
});

bot.command('removetenant', isAdmin, async (ctx) => {
    const unit = ctx.message.text.split(' ')[1];
    if (!unit) return ctx.reply("Usage: /removetenant <UnitNumber>");

    const [existingRows] = await pool.query(
        'SELECT id FROM tenants WHERE unit = ? AND admin_id = ?', [unit, ctx.admin.id]
    );
    if (existingRows.length === 0) return ctx.reply(`Unit ${unit} not found.`);

    // Cascade delete: payments, ticket_media, tickets, then tenant
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM payments WHERE unit = ? AND admin_id = ?', [unit, ctx.admin.id]);
        await conn.query(
            'DELETE tm FROM ticket_media tm JOIN tickets t ON tm.ticket_id = t.id WHERE t.unit = ? AND t.admin_id = ?',
            [unit, ctx.admin.id]
        );
        await conn.query('DELETE FROM tickets WHERE unit = ? AND admin_id = ?', [unit, ctx.admin.id]);
        await conn.query('DELETE FROM tenants WHERE unit = ? AND admin_id = ?', [unit, ctx.admin.id]);
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    await ctx.reply(`Removed Unit ${unit} and its tenant data.`);
});

bot.command('tenantlist', isAdmin, async (ctx) => {
    const [rows] = await pool.query(
        'SELECT * FROM tenants WHERE admin_id = ? ORDER BY unit', [ctx.admin.id]
    );
    const tenants = mapRows(rows);
    if (tenants.length === 0) return ctx.reply("No units found.");

    let message = "Unit List:\n\n";
    const messages = [];

    tenants.forEach(t => {
        const status = t.telegramId ? "Linked" : "Pending";
        const entry = `- Unit ${t.unit}: ${t.name} (${status})\n  (Due: ${t.rentDueDay})\n`;

        if (message.length + entry.length > 4000) {
            messages.push(message);
            message = entry;
        } else {
            message += entry;
        }
    });
    if (message.length > 0) messages.push(message);

    for (const msg of messages) {
        await ctx.reply(msg);
    }
});

bot.command('broadcast', isAdmin, async (ctx) => {
    const text = ctx.message.text.split(' ').slice(1).join(' ');
    if (!text) return ctx.reply("Usage: /broadcast <Your Message Here>");
    if (text.length > 4000) return ctx.reply("Message too long. Max 4000 characters.");

    // Escape Markdown special characters in user text to prevent injection
    const escapedText = text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

    const [rows] = await pool.query(
        'SELECT * FROM tenants WHERE admin_id = ? AND telegram_id IS NOT NULL',
        [ctx.admin.id]
    );
    const activeTenants = mapRows(rows);

    if (activeTenants.length === 0) {
        return ctx.reply("No registered tenants found to broadcast to.");
    }

    await ctx.reply(`Sending broadcast to ${activeTenants.length} tenants...`);

    let sent = 0;
    let failed = 0;
    for (const tenant of activeTenants) {
        try {
            await bot.telegram.sendMessage(
                tenant.telegramId,
                `📢 *Announcement from Landlord:*\n\n${escapedText}`,
                { parse_mode: 'MarkdownV2' }
            );
            sent++;
        } catch (err) {
            console.error(`Failed to send broadcast to ${tenant.name}:`, err.message);
            failed++;
        }
        // Respect Telegram rate limit: 30 messages/second
        if (sent % 25 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    await ctx.reply(`Broadcast complete: ${sent} sent, ${failed} failed.`);
});

// --- Error Handling ---
bot.catch((err, ctx) => {
    console.error(`Bot error for ${ctx.updateType}:`, err.message);
});

// Launch Bot only when run directly (not when imported by server.js)
if (require.main === module) {
    if (process.env.TELEGRAM_BOT_TOKEN) {
        console.log('CondoBot launching...');
        setupReminders(bot);

        bot.launch().catch(err => {
            console.error('Failed to launch CondoBot:', err.message);
        });
    } else {
        console.error('TELEGRAM_BOT_TOKEN is missing in .env file.');
    }

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = bot;
