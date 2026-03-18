const express = require('express');

module.exports = ({ db, middleware }) => {
    const router = express.Router();
    const { authenticateAdmin } = middleware;
    const { pool } = db;

    // Finance Summary
    router.get('/summary', authenticateAdmin, async (req, res) => {
        const now = new Date();
        const currentMonth = now.getMonth() + 1; // MySQL months are 1-indexed
        const currentYear = now.getFullYear();

        const [paymentRows] = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) as totalCollected, COUNT(*) as paymentCount
             FROM payments WHERE admin_id = ? AND status = 'verified'
             AND MONTH(timestamp) = ? AND YEAR(timestamp) = ?`,
            [req.admin.id, currentMonth, currentYear]
        );

        const [expenseRows] = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) as totalExpenses, COUNT(*) as expenseCount
             FROM expenses WHERE admin_id = ?
             AND MONTH(timestamp) = ? AND YEAR(timestamp) = ?`,
            [req.admin.id, currentMonth, currentYear]
        );

        const totalCollected = parseFloat(paymentRows[0].totalCollected);
        const totalExpenses = parseFloat(expenseRows[0].totalExpenses);

        res.json({
            totalCollected,
            totalExpenses,
            netProfit: totalCollected - totalExpenses,
            paymentCount: paymentRows[0].paymentCount,
            expenseCount: expenseRows[0].expenseCount
        });
    });

    return router;
};
