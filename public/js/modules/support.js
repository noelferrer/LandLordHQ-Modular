// --- Support Module ---
import { API_URL, esc, escAttr, csrfHeaders, ITEMS_PER_PAGE } from '../core/api.js';
import { renderPagination } from '../core/pagination.js';

export const SupportModule = {
    id: 'support',
    label: 'Support Hub',
    icon: 'fas fa-headset',
    order: 5,
    titleText: 'Support Hub',
    subtitleText: 'Manage tenant tickets and maintenance requests',
    headerTools: null,
    onActivate: () => { window.refreshDashboard(); },
};

let currentResolvedPage = 1;

// Track sort state
window._resolvedSortCol = 'date';
window._resolvedSortDir = 'desc';
window._sortedClosedTickets = [];

function renderResolvedRows(closedTickets, tenants) {
    const resolvedBody = document.getElementById('resolved-tickets-body');
    if (!resolvedBody) return;
    resolvedBody.innerHTML = closedTickets.map(tk => {
        const t = tenants.find(ten => String(ten.unit) === String(tk.unit)) || { name: 'Unknown' };
        const date = new Date(tk.timestamp);
        let mediaHtml = '-';
        if (tk.media && tk.media.length > 0) {
            const m = tk.media[0];
            const src = `${API_URL}/media/${m.fileId}`;
            mediaHtml = `<button class="btn-icon" data-action="openLightbox" data-type="${escAttr(m.type || 'photo')}" data-src="${escAttr(src)}" title="View Attachment" style="background: rgba(239,68,68,0.1); color: var(--danger); padding: 5px; border-radius: 6px; cursor: pointer; border: none;"><i class="fas fa-${(m.type || 'photo') === 'video' ? 'video' : 'image'}"></i>${tk.media.length > 1 ? ' +' + (tk.media.length - 1) : ''}</button>`;
        } else if (tk.fileId) {
            const src = `${API_URL}/media/${tk.fileId}`;
            mediaHtml = `<button class="btn-icon" data-action="openLightbox" data-type="${escAttr(tk.mediaType || 'photo')}" data-src="${escAttr(src)}" title="View Attachment" style="background: rgba(239,68,68,0.1); color: var(--danger); padding: 5px; border-radius: 6px; cursor: pointer; border: none;"><i class="fas fa-${(tk.mediaType || 'photo') === 'video' ? 'video' : 'image'}"></i></button>`;
        }
        return `
        <tr style="border-bottom: 1px solid var(--border);" data-timestamp="${tk.timestamp}" data-unit="${esc(String(tk.unit))}" data-tenant="${esc(t.name)}" data-issue="${esc(tk.issue)}">
            <td style="padding: 12px 16px; color: var(--text-muted); white-space: nowrap;">
                <div style="font-weight: 500; color: var(--text-main);">${date.toLocaleDateString()}</div>
                <div style="font-size: 0.78rem;">${date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
            </td>
            <td style="padding: 12px 16px; font-weight: 600;">Unit ${esc(String(tk.unit))}</td>
            <td style="padding: 12px 16px;">${esc(t.name)}</td>
            <td style="padding: 12px 16px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escAttr(tk.issue)}">${esc(tk.issue)}</td>
            <td style="padding: 12px 16px; text-align: center;">${mediaHtml}</td>
        </tr>`;
    }).join('');
}

function renderResolvedPage() {
    const all = window._sortedClosedTickets || [];
    const tenants = window._tenants || [];
    const resolvedBody = document.getElementById('resolved-tickets-body');
    if (!resolvedBody) return;

    const totalPages = Math.ceil(all.length / ITEMS_PER_PAGE);
    if (currentResolvedPage > totalPages && totalPages > 0) currentResolvedPage = totalPages;
    const start = (currentResolvedPage - 1) * ITEMS_PER_PAGE;
    const pageData = all.slice(start, start + ITEMS_PER_PAGE);

    renderResolvedRows(pageData, tenants);
    renderPagination('resolved-pagination', currentResolvedPage, totalPages, (page) => {
        currentResolvedPage = page;
        renderResolvedPage();
    });
}

function applyResolvedSort() {
    const tickets = window._closedTickets;
    const tenants = window._tenants;
    if (!tickets || !tenants) return;

    const col = window._resolvedSortCol;
    const dir = window._resolvedSortDir === 'asc' ? 1 : -1;
    const sorted = [...tickets].sort((a, b) => {
        if (col === 'date') return dir * (new Date(a.timestamp) - new Date(b.timestamp));
        if (col === 'unit') return dir * String(a.unit).localeCompare(String(b.unit), undefined, {numeric: true});
        if (col === 'tenant') {
            const tA = (tenants.find(t => String(t.unit) === String(a.unit)) || {name: ''}).name;
            const tB = (tenants.find(t => String(t.unit) === String(b.unit)) || {name: ''}).name;
            return dir * tA.localeCompare(tB);
        }
        if (col === 'issue') return dir * (a.issue || '').localeCompare(b.issue || '');
        return 0;
    });

    window._sortedClosedTickets = sorted;
    renderResolvedPage();

    document.querySelectorAll('#resolved-tickets-table thead th[data-sort]').forEach(th => {
        const icon = th.querySelector('i');
        if (th.dataset.sort === col) {
            icon.className = window._resolvedSortDir === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            icon.style.opacity = '1';
        } else {
            icon.className = 'fas fa-sort';
            icon.style.opacity = '0.4';
        }
    });
}

function sortResolvedTickets(col) {
    if (window._resolvedSortCol === col) {
        window._resolvedSortDir = window._resolvedSortDir === 'desc' ? 'asc' : 'desc';
    } else {
        window._resolvedSortCol = col;
        window._resolvedSortDir = col === 'date' ? 'desc' : 'asc';
    }
    currentResolvedPage = 1;
    applyResolvedSort();
}

async function handleTicketCheck(checkbox, id, field) {
    const repChk = document.getElementById(`chk-rep-${id}`);
    const resChk = document.getElementById(`chk-res-${id}`);
    if (!repChk || !resChk) return;

    if (field === 'status' && checkbox.checked) {
        checkbox.checked = false;
        window.openConfirmModal('Close & Lock Ticket?', 'Mark this issue as resolved? It will move to the Resolved Tickets table and cannot be edited.', 'danger', async () => {
            await updateTicketStatus(id, 'status', 'closed');
        });
        return;
    }
    if (field === 'status' && !checkbox.checked) {
        await updateTicketStatus(id, 'status', 'open');
        return;
    }
    if (field === 'reported') {
        await updateTicketStatus(id, 'reported', checkbox.checked);
        if (checkbox.checked) {
            fetch(`${API_URL}/tickets/${id}/forward`, { method: 'POST', credentials: 'include', headers: csrfHeaders() })
                .then(res => res.json())
                .then(data => {
                    if (!data.success) {
                        window.openConfirmModal('Fixer Not Notified', data.error || 'Ticket was marked as reported, but the fixer could not be notified via Telegram. Please check the Fixer Chat ID in Settings.', 'danger');
                    }
                })
                .catch(e => {
                    console.error('Fixer notification failed:', e);
                    window.openConfirmModal('Fixer Not Notified', 'Ticket was marked as reported, but could not reach the server to notify the fixer.', 'danger');
                });
        }
    }
}

async function updateTicketStatus(id, field, value) {
    try {
        const updates = {};
        updates[field] = value;
        const res = await fetch(`${API_URL}/tickets/${id}`, { method: 'PUT', credentials: 'include', headers: { ...csrfHeaders() }, body: JSON.stringify(updates) });
        if (res.ok) window.refreshDashboard();
        else { const err = await res.json(); window.openConfirmModal('Error', err.error || 'Failed to update ticket.', 'danger'); }
    } catch (err) { console.error('Error updating ticket:', err); }
}

async function verifyPayment(unit, paymentId) {
    const tenant = (window.tenantData || []).find(t => String(t.unit) === String(unit));
    const amountInput = document.getElementById('verify-amount');
    if (tenant && tenant.leaseAmount) {
        amountInput.value = tenant.leaseAmount;
    } else {
        amountInput.value = '';
        if (!tenant) amountInput.placeholder = 'Tenant not found — enter amount manually';
    }

    document.getElementById('verify-payment-id').value = paymentId;
    document.getElementById('verify-payment-unit').value = unit;
    document.getElementById('verify-payment-modal').style.display = 'flex';
}

function closeVerifyPaymentModal() {
    document.getElementById('verify-payment-modal').style.display = 'none';
}

document.getElementById('verify-payment-form').onsubmit = async (e) => {
    e.preventDefault();
    const paymentId = document.getElementById('verify-payment-id').value;
    const unit = document.getElementById('verify-payment-unit').value;
    const amount = document.getElementById('verify-amount').value;

    window.openConfirmModal('Verify Payment', 'Are you sure you want to verify this payment? The tenant will be notified.', 'info', async () => {
        try {
            const res = await fetch(`${API_URL}/payments/${paymentId}/verify`, { method: 'POST', credentials: 'include', headers: { ...csrfHeaders() }, body: JSON.stringify({ unit, amount }) });
            if (res.ok) {
                window.openConfirmModal('Verified!', 'Payment verified and notification sent to tenant.', 'success');
                closeVerifyPaymentModal();
                window.refreshFinanceHub();
                window.refreshDashboard();
            } else { const err = await res.json(); window.openConfirmModal('Error', err.error || 'Failed to verify payment.', 'danger'); }
        } catch (err) { console.error(err); window.openConfirmModal('Error', 'An error occurred during verification.', 'danger'); }
    });
};

// Expose globally
window.sortResolvedTickets = sortResolvedTickets;
window.applyResolvedSort = applyResolvedSort;
window.handleTicketCheck = handleTicketCheck;
window.verifyPayment = verifyPayment;
window.closeVerifyPaymentModal = closeVerifyPaymentModal;
window.forwardFixer = async function(unit, issue) {
    window.openConfirmModal('Forwarded!', `Forwarding Unit ${unit} issue to fixer...\n\nIssue: ${issue}`, 'success');
};
