const cron = require('node-cron');
const { pool, mapRows, mapRow } = require('./database');
const { v4: uuidv4 } = require('uuid');
const { addDays, getDate, setDate, addMonths, isBefore, format, startOfDay } = require('date-fns');

// --- Audit log helper (standalone, no factory needed) ---
function schedulerAuditLog(adminId, action, resource, details = {}) {
    pool.query(
        'INSERT INTO audit_log (id, admin_id, action, resource, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), adminId, action, resource, JSON.stringify(details), new Date()]
    ).catch(err => console.error('Scheduler audit log insert failed:', err.message));
}

const setupReminders = (bot) => {
    // Run daily at 9:00 AM Manila Time
    cron.schedule('0 9 * * *', async () => {
      try {
        console.log('Checking for rent reminders and overdue payments...');

        const [tenantRows] = await pool.query('SELECT * FROM tenants WHERE telegram_id IS NOT NULL AND rent_due_day IS NOT NULL');
        const tenants = mapRows(tenantRows);
        const today = startOfDay(new Date());

        let messageCount = 0;
        const throttledSend = async (fn) => {
            messageCount++;
            if (messageCount % 25 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            return fn();
        };

        for (const tenant of tenants) {
            // 1. Rent Reminders
            const [settingsRows] = await pool.query('SELECT * FROM settings WHERE admin_id = ?', [tenant.adminId]);
            const adminSettings = mapRow(settingsRows) || {};
            const reminderDays = adminSettings.rentReminderDaysBefore || 5;

            let nextDueDate = setDate(today, tenant.rentDueDay);
            if (isBefore(nextDueDate, addDays(today, 1))) {
                nextDueDate = setDate(addMonths(today, 1), tenant.rentDueDay);
            }

            const sendReminderDate = addDays(today, reminderDays);

            if (getDate(sendReminderDate) === getDate(nextDueDate) && sendReminderDate.getMonth() === nextDueDate.getMonth()) {
                const amountText = tenant.leaseAmount ? `\n\nAmount Due: ${parseFloat(tenant.leaseAmount).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '';
                throttledSend(() => bot.telegram.sendMessage(
                    tenant.telegramId,
                    `Friendly Rent Reminder\n\nHi ${tenant.name}, just a heads up that your rent for Unit ${tenant.unit} is due in ${reminderDays} days on ${format(nextDueDate, 'MMMM do, yyyy')}.${amountText}\n\nPlease prepare your payment. Thank you!`
                )).catch(err => console.error(`Failed to send reminder to ${tenant.name}:`, err));
            }

            // 2. Overdue Check (happens the exact day AFTER the due date)
            const currentMonthDueDate = setDate(startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)), tenant.rentDueDay);
            const overdueTargetDate = addDays(currentMonthDueDate, 1);

            const isExactOverdueDay = getDate(today) === getDate(overdueTargetDate) && today.getMonth() === overdueTargetDate.getMonth();
            const isPastOverdueAndNotFlagged = today.getTime() >= overdueTargetDate.getTime() && !tenant.isOverdue;

            if (isExactOverdueDay || isPastOverdueAndNotFlagged) {
                await processRentCheck(bot, tenant, adminSettings, today);
            }
        }
      } catch (err) {
        console.error('Scheduler cron error:', err);
      }
    }, {
        scheduled: true,
        timezone: process.env.TZ || "Asia/Manila"
    });

    console.log('📅 Scheduler initialized: Automatic rent reminders active (Asia/Manila timezone).');
};

/**
 * Core logic to check if a tenant has paid this month, or deducts from prepaid balance.
 * Extracted so it can be triggered manually via the dashboard API.
 */
const processRentCheck = async (bot, tenant, adminSettings, today = new Date()) => {
    today = startOfDay(today);
    const currentMonthStart = setDate(new Date(today.getFullYear(), today.getMonth(), 1), 1);

    // Check for verified payments this month
    const [paymentRows] = await pool.query(
        'SELECT * FROM payments WHERE unit = ? AND admin_id = ? AND status = ? AND timestamp >= ?',
        [tenant.unit, tenant.adminId, 'verified', currentMonthStart]
    );
    const payments = mapRows(paymentRows);
    const hasPaid = payments.length > 0;

    // STEP 1: Already has a verified payment this month
    if (hasPaid) {
        await pool.query('UPDATE tenants SET is_overdue = ? WHERE unit = ? AND admin_id = ?', [false, tenant.unit, tenant.adminId]);
        return { status: 'paid', message: 'Already paid for this month.' };
    }

    // STEP 2: Advance Payment covers the 1st month
    const advancePayment = parseFloat(tenant.advancePayment) || 0;
    if (advancePayment > 0 && tenant.moveInDate) {
        const moveIn = new Date(tenant.moveInDate);
        const isFirstMonth = moveIn.getFullYear() === today.getFullYear() && moveIn.getMonth() === today.getMonth();
        if (isFirstMonth) {
            await pool.query('UPDATE tenants SET is_overdue = ? WHERE unit = ? AND admin_id = ?', [false, tenant.unit, tenant.adminId]);
            return { status: 'advance_covered', message: 'Covered by advance payment for the first month.' };
        }
    }

    // STEP 3: Prepaid Balance auto-deduction
    const leaseAmount = parseFloat(tenant.leaseAmount) || 0;
    const prepaidBalance = parseFloat(tenant.prepaidBalance) || 0;

    // Idempotency guard: check if auto-deduct already ran this month
    const existingAutoDeduct = payments.some(p => p.method === 'Prepaid Balance Auto-Deduct');
    if (existingAutoDeduct) {
        await pool.query('UPDATE tenants SET is_overdue = ? WHERE unit = ? AND admin_id = ?', [false, tenant.unit, tenant.adminId]);
        return { status: 'already_deducted', message: 'Auto-deduction already ran this month.' };
    }

    if (leaseAmount > 0 && prepaidBalance >= leaseAmount) {
        // Atomic deduction: UPDATE only succeeds if balance is still sufficient
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const [updateResult] = await conn.query(
                'UPDATE tenants SET prepaid_balance = prepaid_balance - ?, is_overdue = ? WHERE unit = ? AND admin_id = ? AND prepaid_balance >= ?',
                [leaseAmount, false, tenant.unit, tenant.adminId, leaseAmount]
            );
            if (updateResult.affectedRows === 0) {
                await conn.rollback();
                return { status: 'insufficient', message: 'Prepaid balance changed; insufficient funds.' };
            }
            // Read back the new balance
            const [freshRows] = await conn.query('SELECT prepaid_balance FROM tenants WHERE unit = ? AND admin_id = ?', [tenant.unit, tenant.adminId]);
            const newBalance = parseFloat(freshRows[0]?.prepaid_balance) || 0;

            const paymentId = uuidv4();
            await conn.query(
                'INSERT INTO payments (id, unit, tenant_id, amount, method, status, timestamp, admin_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [paymentId, tenant.unit, tenant.telegramId || 'system', leaseAmount, 'Prepaid Balance Auto-Deduct', 'verified', today, tenant.adminId,
                 `Auto-deducted from Prepaid Balance. Remaining: ${newBalance.toLocaleString()}`]
            );
            await conn.commit();

            schedulerAuditLog(tenant.adminId, 'auto_deduct', 'payment', { unit: tenant.unit, amount: leaseAmount, remainingBalance: newBalance });

            if (tenant.telegramId && bot) {
                bot.telegram.sendMessage(
                    tenant.telegramId,
                    `Rent Auto-Paid\n\nHi ${tenant.name}, your rent of ${leaseAmount.toLocaleString()} for Unit ${tenant.unit} was automatically deducted from your Prepaid Balance.\n\nRemaining Balance: ${newBalance.toLocaleString()}. Thank you!`
                ).catch(err => console.error(`Failed to send auto-pay notice to ${tenant.name}:`, err));
            }
            return { status: 'auto_deducted', message: `Successfully auto-deducted ${leaseAmount.toLocaleString()} from Prepaid Balance.` };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // STEP 4: No payment found — send overdue notice
    if (tenant.telegramId && bot) {
        bot.telegram.sendMessage(
            tenant.telegramId,
            `Overdue Rent Notice\n\nHi ${tenant.name}, our records show that rent for Unit ${tenant.unit} is now overdue. Please settle this as soon as possible.\n\nIf you've already paid, please send your receipt using /payment. Thank you!`
        ).catch(err => console.error(`Failed to send overdue notice to ${tenant.name}:`, err));
    }
    await pool.query('UPDATE tenants SET is_overdue = ? WHERE unit = ? AND admin_id = ?', [true, tenant.unit, tenant.adminId]);
    schedulerAuditLog(tenant.adminId, 'overdue', 'tenant', { unit: tenant.unit });
    return { status: 'overdue', message: 'Marked as overdue and notice sent.' };
};

module.exports = { setupReminders, processRentCheck };
