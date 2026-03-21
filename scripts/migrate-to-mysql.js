/**
 * Migration Script: LowDB (db.json) → MySQL
 *
 * Run: node scripts/migrate-to-mysql.js
 *
 * This script reads data from data/db.json and inserts it into MySQL tables.
 * It is idempotent — it skips records that already exist (by primary key).
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2/promise');

const DB_JSON_PATH = path.join(__dirname, '../data/db.json');

async function main() {
    if (!fs.existsSync(DB_JSON_PATH)) {
        console.error('No db.json found at', DB_JSON_PATH);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(DB_JSON_PATH, 'utf-8'));
    console.log('Loaded db.json with collections:', Object.keys(data).join(', '));

    const pool = await mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '8889', 10),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || 'root',
        database: process.env.DB_NAME || 'landlord_hq_modular_db',
        connectionLimit: 5,
        charset: 'utf8mb4',
    });

    const conn = await pool.getConnection();
    let totalMigrated = 0;
    let totalSkipped = 0;

    try {
        // --- 1. Admins ---
        console.log('\n--- Migrating admins ---');
        for (const a of (data.admins || [])) {
            const [existing] = await conn.query('SELECT id FROM admins WHERE id = ?', [a.id]);
            if (existing.length > 0) { totalSkipped++; continue; }
            await conn.query(
                'INSERT INTO admins (id, username, telegram_id, name) VALUES (?, ?, ?, ?)',
                [a.id, a.username, a.telegramId || null, a.name || 'Admin']
            );
            totalMigrated++;
            console.log(`  + Admin: ${a.username}`);
        }

        // --- 2. Properties ---
        console.log('\n--- Migrating properties ---');
        for (const p of (data.properties || [])) {
            const [existing] = await conn.query('SELECT id FROM properties WHERE id = ?', [p.id]);
            if (existing.length > 0) { totalSkipped++; continue; }
            await conn.query(
                'INSERT INTO properties (id, admin_id, name, address, city, state, zip, units, type, status, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [p.id, p.adminId, p.name, p.address || '', p.city || '', p.state || '', p.zip || '',
                 parseInt(p.units) || 0, p.type || '', p.status || 'Active', p.description || null,
                 p.createdAt ? new Date(p.createdAt) : new Date()]
            );
            totalMigrated++;
            console.log(`  + Property: ${p.name}`);
        }

        // --- 3. Tenants (no id in LowDB — generate UUID) ---
        console.log('\n--- Migrating tenants ---');
        for (const t of (data.tenants || [])) {
            // Check by unique (unit, admin_id)
            const [existing] = await conn.query('SELECT id FROM tenants WHERE unit = ? AND admin_id = ?', [t.unit, t.adminId]);
            if (existing.length > 0) { totalSkipped++; continue; }

            const tenantId = t.id || uuidv4();
            // Resolve propertyId — old timestamp-based IDs won't match, set null if no match
            let propertyId = null;
            if (t.propertyId) {
                const [propRows] = await conn.query('SELECT id FROM properties WHERE id = ?', [t.propertyId]);
                if (propRows.length > 0) propertyId = t.propertyId;
            }

            await conn.query(
                `INSERT INTO tenants (id, admin_id, link_code, unit, name, email, phone, lease_amount, advance_payment,
                 security_deposit, prepaid_balance, property_id, move_in_date, lease_end_date, rent_due_day, status,
                 remarks, telegram_id, is_overdue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [tenantId, t.adminId, t.linkCode || null, t.unit, t.name,
                 t.email || null, t.phone || null,
                 parseFloat(t.leaseAmount) || 0, parseFloat(t.advancePayment) || 0,
                 parseFloat(t.securityDeposit) || 0, parseFloat(t.prepaidBalance) || 0,
                 propertyId,
                 t.moveInDate && t.moveInDate !== '' ? t.moveInDate : null,
                 t.leaseEndDate && t.leaseEndDate !== '' ? t.leaseEndDate : null,
                 t.rent_due_day || 1, t.status || 'Active',
                 t.remarks || null, t.telegramId || null, t.isOverdue ? 1 : 0]
            );
            totalMigrated++;
            console.log(`  + Tenant: ${t.name} (Unit ${t.unit})`);
        }

        // --- 4. Tickets + ticket_media ---
        console.log('\n--- Migrating tickets ---');
        for (const tk of (data.tickets || [])) {
            const [existing] = await conn.query('SELECT id FROM tickets WHERE id = ?', [tk.id]);
            if (existing.length > 0) { totalSkipped++; continue; }

            await conn.query(
                'INSERT INTO tickets (id, admin_id, unit, tenant_name, issue, status, reported, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [tk.id, tk.adminId, tk.unit, tk.tenantName || null, tk.issue,
                 tk.status || 'open', tk.reported ? 1 : 0,
                 tk.timestamp ? new Date(tk.timestamp) : new Date()]
            );
            totalMigrated++;
            console.log(`  + Ticket: #${String(tk.id).substring(0, 8)}... (${tk.unit})`);

            // Migrate media array
            if (tk.media && Array.isArray(tk.media)) {
                for (const m of tk.media) {
                    await conn.query(
                        'INSERT INTO ticket_media (ticket_id, type, file_id) VALUES (?, ?, ?)',
                        [tk.id, m.type, m.fileId]
                    );
                    totalMigrated++;
                }
            }
        }

        // --- 5. Payments ---
        console.log('\n--- Migrating payments ---');
        for (const p of (data.payments || [])) {
            const [existing] = await conn.query('SELECT id FROM payments WHERE id = ?', [p.id]);
            if (existing.length > 0) { totalSkipped++; continue; }

            await conn.query(
                `INSERT INTO payments (id, admin_id, unit, tenant_name, tenant_id, amount, method, status, timestamp,
                 notes, file_id, media_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [p.id, p.adminId, p.unit || '', p.tenantName || null, p.tenantId || null,
                 parseFloat(p.amount) || 0, p.method || '', p.status || 'pending',
                 p.timestamp ? new Date(p.timestamp) : new Date(),
                 p.notes || null, p.fileId || null, p.mediaType || null]
            );
            totalMigrated++;
            console.log(`  + Payment: ${String(p.id).substring(0, 8)}... (${p.unit})`);
        }

        // --- 6. Expenses ---
        console.log('\n--- Migrating expenses ---');
        for (const e of (data.expenses || [])) {
            const [existing] = await conn.query('SELECT id FROM expenses WHERE id = ?', [e.id]);
            if (existing.length > 0) { totalSkipped++; continue; }

            await conn.query(
                'INSERT INTO expenses (id, admin_id, timestamp, category, amount, description) VALUES (?, ?, ?, ?, ?, ?)',
                [e.id, e.adminId, e.timestamp ? new Date(e.timestamp) : new Date(),
                 e.category || '', parseFloat(e.amount) || 0, e.description || '']
            );
            totalMigrated++;
            console.log(`  + Expense: ${String(e.id).substring(0, 8)}...`);
        }

        // --- 7. Settings ---
        console.log('\n--- Migrating settings ---');
        const settingsArr = Array.isArray(data.settings) ? data.settings : (data.settings ? [data.settings] : []);
        for (const s of settingsArr) {
            if (!s.adminId) continue;
            const [existing] = await conn.query('SELECT id FROM settings WHERE admin_id = ?', [s.adminId]);
            if (existing.length > 0) { totalSkipped++; continue; }

            await conn.query(
                `INSERT INTO settings (admin_id, currency, rent_reminder_days_before, fixer_id, start_text, rules_text, clearance_text)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [s.adminId, s.currency || null, s.rent_reminder_days_before || null,
                 s.fixer_id || s.fixerId || null,
                 s.start_text || s.startText || null,
                 s.rules_text || s.rulesText || null,
                 s.clearance_text || s.clearanceText || null]
            );
            totalMigrated++;
            console.log(`  + Settings for admin: ${s.adminId.substring(0, 8)}...`);
        }

        // --- 8. Invites ---
        console.log('\n--- Migrating invites ---');
        for (const i of (data.invites || [])) {
            const [existing] = await conn.query('SELECT code FROM invites WHERE code = ?', [i.code]);
            if (existing.length > 0) { totalSkipped++; continue; }

            await conn.query(
                'INSERT INTO invites (code, status, created_at, claimed_by, claimed_at) VALUES (?, ?, ?, ?, ?)',
                [i.code, i.status || 'active',
                 i.createdAt ? new Date(i.createdAt) : new Date(),
                 i.claimedBy || null, i.claimedAt ? new Date(i.claimedAt) : null]
            );
            totalMigrated++;
            console.log(`  + Invite: ${i.code}`);
        }

        // --- 9. Audit Log ---
        console.log('\n--- Migrating audit log ---');
        const auditLogs = data.auditLog || [];
        let auditCount = 0;
        for (const a of auditLogs) {
            const id = a.id || uuidv4();
            const [existing] = await conn.query('SELECT id FROM audit_log WHERE id = ?', [id]);
            if (existing.length > 0) { totalSkipped++; continue; }

            await conn.query(
                'INSERT INTO audit_log (id, admin_id, action, resource, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                [id, a.adminId, a.action, a.resource,
                 typeof a.details === 'object' ? JSON.stringify(a.details) : (a.details || '{}'),
                 a.timestamp ? new Date(a.timestamp) : new Date()]
            );
            auditCount++;
        }
        totalMigrated += auditCount;
        console.log(`  + ${auditCount} audit log entries migrated`);

        // --- 10. Sessions (migrate active ones) ---
        console.log('\n--- Migrating sessions ---');
        for (const s of (data.sessions || [])) {
            if (new Date(s.expiresAt) < new Date()) { totalSkipped++; continue; }
            const [existing] = await conn.query('SELECT token FROM sessions WHERE token = ?', [s.token]);
            if (existing.length > 0) { totalSkipped++; continue; }

            await conn.query(
                'INSERT INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)',
                [s.token, s.adminId, new Date(s.expiresAt)]
            );
            totalMigrated++;
            console.log(`  + Session: ${s.token.substring(0, 8)}...`);
        }

        console.log(`\n========================================`);
        console.log(`Migration complete!`);
        console.log(`  Migrated: ${totalMigrated} records`);
        console.log(`  Skipped:  ${totalSkipped} records (already exist)`);
        console.log(`========================================\n`);

    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    } finally {
        conn.release();
        await pool.end();
    }
}

main();
