// --- Finance Module ---
import { API_URL, esc, escAttr, csrfHeaders, getCsrfToken, ITEMS_PER_PAGE } from '../core/api.js';
import { renderPagination } from '../core/pagination.js';

export const FinanceModule = {
    id: 'finance',
    label: 'Financial Hub',
    icon: 'fas fa-chart-pie',
    order: 4,
    titleText: 'Financial Hub',
    subtitleText: 'Real-time revenue, expenses, and transaction logs',
    headerTools: () => `<div style="display: flex; gap: 10px;">
        <button class="btn btn-outline" style="width: auto;" data-action="openExpenseModal"><i class="fas fa-receipt"></i> Add Expense</button>
        <button class="btn btn-primary" style="width: auto;" data-action="openManualPaymentModal"><i class="fas fa-plus"></i> Manual Payment</button>
    </div>`,
    onActivate: () => { refreshFinanceHub(); window.refreshDashboard(); },
};

let currentHistoryPage = 1;
let currentExpensePage = 1;

async function refreshFinanceHub() {
    try {
        const [payRes, expRes, sumRes, settingsRes] = await Promise.all([
            fetch(`${API_URL}/payments?t=${Date.now()}`, { credentials: 'include' }),
            fetch(`${API_URL}/expenses?t=${Date.now()}`, { credentials: 'include' }),
            fetch(`${API_URL}/finance/summary?t=${Date.now()}`, { credentials: 'include' }),
            fetch(`${API_URL}/settings`, { credentials: 'include' })
        ]);
        const payments = await payRes.json();
        const expenses = await expRes.json();
        const summary = await sumRes.json();
        if (settingsRes.ok) {
            const s = await settingsRes.json();
            if (s && typeof s === 'object' && !Array.isArray(s)) window.appSettings = s;
        }

        renderPaymentsHistory(payments, window.tenantData || [], window.propertyData || []);
        renderExpenses(expenses);
        renderFinanceUpcoming(window.tenantData || [], window.propertyData || [], payments);
        renderFinanceOverdue(window.tenantData || [], window.propertyData || [], payments);
        updateFinanceSummary(summary);
    } catch (err) { console.error('Finance refresh error:', err); }
}

function renderFinanceUpcoming(tenants, properties, payments) {
    const tbody = document.getElementById('finance-upcoming-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const currencySymbol = window.appSettings.currency || '₱';
    const getOrdinal = (n) => {
        n = n || 0;
        if (n % 100 >= 11 && n % 100 <= 13) return 'th';
        const r = n % 10;
        return r === 1 ? 'st' : r === 2 ? 'nd' : r === 3 ? 'rd' : 'th';
    };

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentMonthStart = new Date(currentYear, currentMonth, 1).getTime();
    const reminderDays = parseInt(window.appSettings?.rentReminderDaysBefore) || 5;

    const verifiedPayments = payments.filter(p => p.status === 'verified');

    const upcoming = tenants.filter(t => {
        if (t.status !== 'Active') return false;
        const hasPaid = verifiedPayments.some(p => String(p.unit) === String(t.unit) && new Date(p.timestamp).getTime() >= currentMonthStart);
        if (hasPaid) return false;
        // Only show if within reminder window
        const dueDay = parseInt(t.rentDueDay || 1);
        let dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
        if (dueDate < now) dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
        const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
        return daysUntilDue >= 0 && daysUntilDue <= reminderDays;
    });

    if (upcoming.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted)">No upcoming receivables for the current period.</td></tr>'; return; }

    upcoming.forEach(t => {
        const prop = properties.find(p => String(p.id) === String(t.propertyId)) || {};
        tbody.innerHTML += `<tr>
            <td>${esc(t.name)}</td>
            <td><div style="font-weight:500">${esc(prop.name) || 'Unassigned'}</div><div style="font-size:0.75rem; color:var(--text-muted)">Unit ${esc(t.unit)}</div></td>
            <td style="font-weight:600; font-family:var(--font-mono)">${currencySymbol}${(parseFloat(t.leaseAmount) || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="color:var(--text-muted); font-size:0.9rem">Every ${t.rentDueDay}${getOrdinal(t.rentDueDay)}</td>
            <td style="text-align:right"><span class="status-pill pill-warning">Upcoming</span></td>
        </tr>`;
    });
}

function renderPaymentsHistory(payments, tenants, properties) {
    const history = payments.filter(p => p.status === 'verified').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    window._sortedHistory = history;
    window._historyTenants = tenants;
    window._historyProperties = properties;
    currentHistoryPage = 1;
    renderHistoryPage();
}

function renderHistoryPage() {
    const tbody = document.getElementById('payments-history-body');
    if (!tbody) return;
    const currencySymbol = window.appSettings.currency || '₱';
    const history = window._sortedHistory || [];
    const tenants = window._historyTenants || [];
    const properties = window._historyProperties || [];

    if (history.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted)">No transaction history found.</td></tr>'; renderPagination('history-pagination', 1, 0, () => {}); return; }

    const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
    if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;
    const start = (currentHistoryPage - 1) * ITEMS_PER_PAGE;
    const pageData = history.slice(start, start + ITEMS_PER_PAGE);

    tbody.innerHTML = '';
    pageData.forEach(p => {
        const dateObj = new Date(p.timestamp);
        const src = p.fileId ? `${API_URL}/media/${p.fileId}` : null;
        const receiptHtml = src ? `<button class="btn-icon" data-action="openLightbox" data-type="${escAttr(p.mediaType || 'photo')}" data-src="${escAttr(src)}" title="View Receipt" style="background: rgba(43, 122, 255, 0.1); color: var(--primary); padding: 5px; border-radius: 6px; cursor: pointer;"><i class="fas fa-receipt"></i></button>` : '-';
        let property = properties.find(prop => String(prop.id) === String(p.propertyId));
        if (!property) { const t = tenants.find(ten => String(ten.unit) === String(p.unit)); if (t && t.propertyId) property = properties.find(prop => String(prop.id) === String(t.propertyId)); }
        const pName = property ? property.name : (p.propertyName || 'Unassigned');
        const displayName = p.tenantName || (tenants.find(t => String(t.unit) === String(p.unit))?.name) || `Unit ${p.unit}`;
        tbody.innerHTML += `<tr>
            <td>${esc(displayName)}</td>
            <td><div style="font-weight:500">${esc(pName)}</div><div style="font-size:0.75rem; color:var(--text-muted)">Unit ${esc(p.unit)}</div></td>
            <td style="font-weight:600; color:var(--success); font-family:var(--font-mono)">${currencySymbol}${(parseFloat(p.amount) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td><div style="font-size:0.85rem">${dateObj.toLocaleDateString()}</div><div style="font-size:0.75rem; color:var(--text-muted)">${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></td>
            <td><div style="display: flex; align-items: center; gap: 8px;">${receiptHtml}<span class="status-pill pill-info" style="font-size:0.65rem; padding: 2px 6px;">${esc(p.method) || (p.type === 'manual' ? 'Manual' : 'Telegram')}</span></div></td>
            <td style="text-align: right;"><button class="btn-outline" style="width: auto; height: 32px; padding: 0 12px; border: none; color: var(--danger); font-size: 0.9rem; cursor: pointer;" data-action="deletePayment" data-id="${escAttr(p.id)}" data-name="${escAttr(p.tenantName)}"><i class="fas fa-trash-alt"></i></button></td>
        </tr>`;
    });
    renderPagination('history-pagination', currentHistoryPage, totalPages, (page) => { currentHistoryPage = page; renderHistoryPage(); });
}

function renderExpenses(expenses) {
    const sorted = expenses.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    window._sortedExpenses = sorted;
    currentExpensePage = 1;
    renderExpensePage();
}

function renderExpensePage() {
    const tbody = document.getElementById('expenses-body');
    if (!tbody) return;
    const currencySymbol = window.appSettings.currency || '₱';
    const expenses = window._sortedExpenses || [];

    if (expenses.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted)">No expenses recorded.</td></tr>'; renderPagination('expense-pagination', 1, 0, () => {}); return; }

    const totalPages = Math.ceil(expenses.length / ITEMS_PER_PAGE);
    if (currentExpensePage > totalPages) currentExpensePage = totalPages;
    const start = (currentExpensePage - 1) * ITEMS_PER_PAGE;
    const pageData = expenses.slice(start, start + ITEMS_PER_PAGE);

    tbody.innerHTML = '';
    pageData.forEach(e => {
        tbody.innerHTML += `<tr>
            <td>${esc(e.category)}</td>
            <td style="font-weight:600; color:var(--danger); font-family:var(--font-mono)">${currencySymbol}${e.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="color:var(--text-muted); font-size:0.9rem">${esc(e.description) || '—'}</td>
            <td style="color:var(--text-muted); font-size:0.85rem"><div>${new Date(e.timestamp).toLocaleDateString()}</div><div style="font-size:0.75rem; opacity:0.7;">${new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></td>
            <td style="text-align: right;"><button class="btn-outline" style="width: auto; height: 32px; padding: 0 12px; border: none; color: var(--danger); font-size: 0.9rem; cursor: pointer;" data-action="deleteExpense" data-id="${escAttr(e.id)}" data-name="${escAttr(e.category)}"><i class="fas fa-trash-alt"></i></button></td>
        </tr>`;
    });
    renderPagination('expense-pagination', currentExpensePage, totalPages, (page) => { currentExpensePage = page; renderExpensePage(); });
}

function renderFinanceOverdue(tenants, properties, payments) {
    const tbody = document.getElementById('finance-overdue-body');
    const pill = document.getElementById('finance-overdue-pill');
    if (!tbody) return;
    const currencySymbol = window.appSettings.currency || '₱';
    const today = new Date();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    const verifiedPayments = payments.filter(p => p.status === 'verified');

    const overdue = tenants.filter(t => {
        if (t.status === 'Inactive') return false;
        const dueDay = parseInt(t.rentDueDay || 1);
        const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);
        const overdueThreshold = new Date(dueDate.getTime() + 24 * 60 * 60 * 1000);
        const hasPaid = verifiedPayments.some(p => p.unit === t.unit && new Date(p.timestamp).getTime() >= currentMonthStart);
        return !hasPaid && today > overdueThreshold;
    });

    if (pill) { pill.innerText = `${overdue.length} Unpaid`; pill.style.display = overdue.length > 0 ? 'inline-block' : 'none'; }
    if (overdue.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted)">No overdue payments.</td></tr>'; return; }

    tbody.innerHTML = '';
    overdue.forEach(t => {
        const prop = properties.find(p => String(p.id) === String(t.propertyId)) || {};
        const dueDate = new Date(today.getFullYear(), today.getMonth(), t.rentDueDay || 1);
        tbody.innerHTML += `<tr>
            <td style="font-weight:600">${esc(t.name)}</td>
            <td><div style="font-weight:500">${esc(prop.name) || 'Unassigned'}</div><div style="font-size:0.75rem; color:var(--text-muted)">Unit ${esc(t.unit)}</div></td>
            <td style="font-weight:600; color:var(--danger); font-family:var(--font-mono)">${currencySymbol}${(parseFloat(t.leaseAmount) || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="color:var(--danger); font-weight:600;"><i class="fas fa-exclamation-triangle"></i> ${dueDate.toLocaleDateString(undefined, {month:'short', day:'numeric'})}</td>
        </tr>`;
    });
}

function updateFinanceSummary(summary) {
    const currencySymbol = window.appSettings.currency || '₱';
    document.getElementById('total-collected').innerText = `${currencySymbol}${summary.totalCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('total-expenses').innerText = `${currencySymbol}${summary.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('net-profit').innerText = `${currencySymbol}${summary.netProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
}

// Sort direction tracker
window._finSortDir = { history: 'desc', expenses: 'desc', upcoming: 'asc' };

function sortFinanceTable(type, column) {
    const dir = window._finSortDir[type] || 'desc';
    const nextDir = dir === 'desc' ? 'asc' : 'desc';
    window._finSortDir[type] = nextDir;

    function compareVals(a, b, col) {
        if (col === 'amount') return (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0);
        if (col === 'timestamp' || col === 'dueDate') return new Date(a.timestamp || a.dueDate || 0) - new Date(b.timestamp || b.dueDate || 0);
        const aStr = String(a[col] || '').toLowerCase();
        const bStr = String(b[col] || '').toLowerCase();
        return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
    }

    if (type === 'history') { window._sortedHistory = (window._sortedHistory || []).slice().sort((a, b) => { return (nextDir === 'desc' ? -1 : 1) * compareVals(a, b, column); }); currentHistoryPage = 1; renderHistoryPage(); }
    else if (type === 'expenses') { window._sortedExpenses = (window._sortedExpenses || []).slice().sort((a, b) => { return (nextDir === 'desc' ? -1 : 1) * compareVals(a, b, column); }); currentExpensePage = 1; renderExpensePage(); }
    else if (type === 'upcoming') {
        const tbody = document.getElementById('finance-upcoming-body');
        if (!tbody) return;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort((a, b) => {
            const aVal = a.cells[column === 'amount' ? 2 : column === 'dueDate' ? 3 : column === 'property' ? 1 : 0]?.innerText.trim() || '';
            const bVal = b.cells[column === 'amount' ? 2 : column === 'dueDate' ? 3 : column === 'property' ? 1 : 0]?.innerText.trim() || '';
            if (column === 'amount') return nextDir === 'desc' ? parseFloat(bVal.replace(/[^0-9.-]+/g,"")) - parseFloat(aVal.replace(/[^0-9.-]+/g,"")) : parseFloat(aVal.replace(/[^0-9.-]+/g,"")) - parseFloat(bVal.replace(/[^0-9.-]+/g,""));
            return nextDir === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
        });
        tbody.innerHTML = '';
        rows.forEach(r => tbody.appendChild(r));
    }
}

// Finance Actions
async function deletePayment(id, name) {
    window.openConfirmModal('Delete Payment', `Are you sure you want to delete the payment log for ${name || 'this tenant'}? This will also deduct the amount from your total collection.`, 'danger', async () => {
        try {
            const res = await fetch(`${API_URL}/payments/${id}`, { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': getCsrfToken() } });
            if (res.ok) {
                window.openConfirmModal('Deleted!', 'Payment record has been removed.', 'success');
                refreshFinanceHub();
                window.refreshDashboard();
            } else {
                const err = await res.json();
                window.openConfirmModal('Error', err.error || 'Failed to delete payment.', 'danger');
            }
        } catch (err) {
            console.error(err);
            window.openConfirmModal('Error', 'A network error occurred. Please try again.', 'danger');
        }
    });
}

async function deleteExpense(id, category) {
    window.openConfirmModal('Delete Expense', `Are you sure you want to delete the expense record: ${category}?`, 'danger', async () => {
        try {
            const res = await fetch(`${API_URL}/expenses/${id}`, { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': getCsrfToken() } });
            if (res.ok) {
                window.openConfirmModal('Deleted!', 'Expense record has been removed.', 'success');
                refreshFinanceHub();
                window.refreshDashboard();
            } else {
                const err = await res.json();
                window.openConfirmModal('Error', err.error || 'Failed to delete expense.', 'danger');
            }
        } catch (err) {
            console.error(err);
            window.openConfirmModal('Error', 'A network error occurred. Please try again.', 'danger');
        }
    });
}

async function openManualPaymentModal() {
    const select = document.getElementById('payment-tenant');
    try {
        const res = await fetch(`${API_URL}/tenants?t=${Date.now()}`, { credentials: 'include' });
        const tenants = await res.json();
        window.tenantData = tenants;
        select.innerHTML = tenants.filter(t => t.status === 'Active').map(t => `<option value="${escAttr(t.unit)}">${esc(t.name)} (UNIT-${esc(t.unit)})</option>`).join('');
    } catch (e) {
        console.error(e);
        window.openConfirmModal('Error', 'Could not load tenant list. Please try again.', 'danger');
        return;
    }
    document.getElementById('payment-form').reset();
    document.getElementById('payment-modal').style.display = 'flex';
}

function closePaymentModal() { document.getElementById('payment-modal').style.display = 'none'; }
function openExpenseModal() { document.getElementById('expense-form').reset(); document.getElementById('expense-modal').style.display = 'flex'; }
function closeExpenseModal() { document.getElementById('expense-modal').style.display = 'none'; }

document.getElementById('payment-form').onsubmit = async (e) => {
    e.preventDefault();
    const unit = document.getElementById('payment-tenant').value;
    const tenant = window.tenantData.find(t => t.unit === unit);
    const amount = parseFloat(document.getElementById('payment-amount').value);
    if (!unit) { window.openConfirmModal('Error', 'Please select a tenant.', 'danger'); return; }
    if (isNaN(amount) || amount <= 0) { window.openConfirmModal('Error', 'Please enter a valid payment amount greater than zero.', 'danger'); return; }
    const data = { unit, tenantName: tenant ? tenant.name : 'Unknown', propertyId: tenant ? tenant.propertyId : null, amount, method: document.getElementById('payment-method').value, notes: document.getElementById('payment-notes').value };
    const currencySymbol = window.appSettings?.currency || '₱';
    window.openConfirmModal('Log Payment', `Log a manual payment of ${currencySymbol}${data.amount.toLocaleString(undefined, {minimumFractionDigits: 2})} for ${data.tenantName}?`, 'info', async () => {
        try {
            const res = await fetch(`${API_URL}/payments`, { method: 'POST', credentials: 'include', headers: { ...csrfHeaders() }, body: JSON.stringify(data) });
            if (res.ok) {
                window.openConfirmModal('Success', 'Manual payment logged successfully.', 'success');
                closePaymentModal();
                refreshFinanceHub();
                window.refreshDashboard();
            } else {
                const err = await res.json();
                window.openConfirmModal('Error', err.error || 'Failed to log payment.', 'danger');
            }
        } catch (err) {
            console.error(err);
            window.openConfirmModal('Error', 'A network error occurred. Please try again.', 'danger');
        }
    });
};

document.getElementById('expense-form').onsubmit = async (e) => {
    e.preventDefault();
    const category = document.getElementById('expense-category').value.trim();
    const amount = parseFloat(document.getElementById('expense-amount').value);
    if (!category) { window.openConfirmModal('Error', 'Please enter an expense category.', 'danger'); return; }
    if (isNaN(amount) || amount <= 0) { window.openConfirmModal('Error', 'Please enter a valid expense amount greater than zero.', 'danger'); return; }
    const data = { category, amount, description: document.getElementById('expense-desc').value };
    const currencySymbol = window.appSettings?.currency || '₱';
    window.openConfirmModal('Log Expense', `Log an expense of ${currencySymbol}${data.amount.toLocaleString(undefined, {minimumFractionDigits: 2})} for ${data.category}?`, 'info', async () => {
        try {
            const res = await fetch(`${API_URL}/expenses`, { method: 'POST', credentials: 'include', headers: { ...csrfHeaders() }, body: JSON.stringify(data) });
            if (res.ok) {
                window.openConfirmModal('Success', 'Expense logged successfully.', 'success');
                closeExpenseModal();
                refreshFinanceHub();
                window.refreshDashboard();
            } else {
                const err = await res.json();
                window.openConfirmModal('Error', err.error || 'Failed to log expense.', 'danger');
            }
        } catch (err) {
            console.error(err);
            window.openConfirmModal('Error', 'A network error occurred. Please try again.', 'danger');
        }
    });
};

// Expose globally
window.refreshFinanceHub = refreshFinanceHub;
window.sortFinanceTable = sortFinanceTable;
window.deletePayment = deletePayment;
window.deleteExpense = deleteExpense;
window.openManualPaymentModal = openManualPaymentModal;
window.closePaymentModal = closePaymentModal;
window.openExpenseModal = openExpenseModal;
window.closeExpenseModal = closeExpenseModal;
