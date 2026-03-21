// --- Tenants Module ---
import { API_URL, esc, escAttr, csrfHeaders, getCsrfToken, ITEMS_PER_PAGE } from '../core/api.js';
import { renderPagination } from '../core/pagination.js';

// Format a date to YYYY-MM-DD for <input type="date"> values
function toLocalDateStr(dateVal) {
    if (!dateVal) return '';
    // If already a YYYY-MM-DD string, return as-is
    if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
    // For ISO datetime strings, extract just the date part using local timezone
    const d = new Date(dateVal);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const TenantsModule = {
    id: 'tenants',
    label: 'Tenants',
    icon: 'fas fa-user-friends',
    order: 3,
    titleText: 'Tenants',
    subtitleText: 'Manage all tenant records',
    headerTools: () => `
        <div style="display:flex;align-items:center;gap:10px;">
            <button class="btn btn-primary" style="width: auto;" data-action="openAddTenantModal"><i class="fas fa-plus"></i> Add Tenant</button>
        </div>`,
    onActivate: () => { refreshTenants(); },
};

let currentTenantsPage = 1;
let currentSort = { key: 'name', dir: 'asc' };

async function refreshTenants() {
    try {
        const [tenantRes, propRes] = await Promise.all([
            fetch(`${API_URL}/tenants?t=${Date.now()}`, { credentials: 'include' }),
            fetch(`${API_URL}/properties?t=${Date.now()}`, { credentials: 'include' })
        ]);
        window.tenantData = await tenantRes.json();
        window.propertyData = await propRes.json();
        renderTenantsTable();
    } catch (err) { console.error('Refresh tenants error:', err); }
}

function sortTenants(key) {
    if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.key = key;
        currentSort.dir = 'asc';
    }

    document.querySelectorAll('.sort-icon').forEach(icon => {
        icon.className = 'fas fa-sort sort-icon';
    });
    const activeIcon = document.getElementById(`sort-${key}`);
    if (activeIcon) {
        activeIcon.className = currentSort.dir === 'asc' ? 'fas fa-sort-up sort-icon' : 'fas fa-sort-down sort-icon';
    }

    renderTenantsTable();
}

function renderTenantsTable() {
    const tbody = document.getElementById('tenants-table-body');
    if (!tbody || !window.tenantData) return;
    tbody.innerHTML = '';

    let sorted = [...window.tenantData];
    const dirMultiplier = currentSort.dir === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
        let valA = a[currentSort.key];
        let valB = b[currentSort.key];

        if (currentSort.key === 'propertyId') {
            const pA = (window.propertyData || []).find(p => String(p.id) === String(a.propertyId));
            const pB = (window.propertyData || []).find(p => String(p.id) === String(b.propertyId));
            valA = pA ? pA.name.toLowerCase() : 'unassigned';
            valB = pB ? pB.name.toLowerCase() : 'unassigned';
        } else if (currentSort.key === 'moveInDate') {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
        } else {
            valA = String(valA || '').toLowerCase();
            valB = String(valB || '').toLowerCase();
        }

        if (valA < valB) return -1 * dirMultiplier;
        if (valA > valB) return 1 * dirMultiplier;
        return 0;
    });

    const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
    if (currentTenantsPage > totalPages && totalPages > 0) currentTenantsPage = totalPages;

    const startIndex = (currentTenantsPage - 1) * ITEMS_PER_PAGE;
    const paginatedTenants = sorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    paginatedTenants.forEach(t => {
        const prop = (window.propertyData || []).find(p => String(p.id) === String(t.propertyId)) || { name: 'Unassigned' };
        const statusClass = (t.status || 'Active') === 'Active' ? 'status-pill-success' : 'status-pill-inactive';

        tbody.innerHTML += `
            <tr>
                <td data-col="name" style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--text-muted);"><i class="fas fa-user"></i></div>
                    <div style="font-weight: 500;">${esc(t.name)}</div>
                </td>
                <td data-col="phone" style="color: var(--text-muted); font-size: 0.9rem;">${esc(t.phone) || '-'}</td>
                <td data-col="property"><div style="font-weight: 500; color: var(--text-main); font-size: 0.9rem;">${esc(prop.name)}</div><div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">Unit ${esc(t.unit)}</div></td>
                <td data-col="moveIn" style="color: var(--text-muted); font-size: 0.9rem;">${t.moveInDate ? new Date(t.moveInDate).toLocaleDateString() : '-'}</td>
                <td data-col="dueDay" style="color: var(--text-muted); font-size: 0.9rem; text-align: center;">Day ${t.rentDueDay || 1}</td>
                <td data-col="linkCode">${t.telegramId
                    ? '<span style="color:var(--success); font-size: 0.85rem; font-weight:600;"><i class="fas fa-check-circle"></i> Linked</span>'
                    : `<span style="font-family:monospace; font-weight:bold; background:var(--bg); padding:4px 8px; border-radius:4px; font-size:0.9rem; color:var(--text); letter-spacing:1px; border: 1px solid var(--border);">${esc(t.linkCode) || '-'}</span>`
                }</td>
                <td data-col="actions" style="text-align: right;">
                    <button class="btn-outline" style="width: auto; height: 32px; padding: 0 12px; border: none; font-size: 0.9rem;" data-action="openTenantProfile" data-args="${escAttr(t.unit)}" title="View Profile"><i class="fas fa-eye"></i></button>
                    <button class="btn-outline" style="width: auto; height: 32px; padding: 0 12px; border: none; font-size: 0.9rem;" data-action="editTenant" data-args="${escAttr(t.unit)}" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="btn-outline" style="width: auto; height: 32px; padding: 0 12px; border: none; font-size: 0.9rem;" data-action="deleteTenant" data-args="${escAttr(t.unit)}" title="Delete"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>`;
    });

    renderPagination('tenants-pagination', currentTenantsPage, totalPages, (page) => {
        currentTenantsPage = page;
        renderTenantsTable();
    });
}

async function openAddTenantModal() {
    document.getElementById('tenant-modal-title').innerText = 'Add Tenant';
    document.getElementById('tenant-submit-btn').innerText = 'Add Tenant';
    document.getElementById('tenant-original-unit').value = '';
    document.getElementById('tenant-form').reset();

    try {
        const [propRes, tenRes] = await Promise.all([
            fetch(`${API_URL}/properties?t=${Date.now()}`, { credentials: 'include' }),
            fetch(`${API_URL}/tenants?t=${Date.now()}`, { credentials: 'include' })
        ]);
        const properties = await propRes.json();
        const tenants = await tenRes.json();
        // Keep global data fresh
        window.propertyData = properties;
        window.tenantData = tenants;
        const select = document.getElementById('tenant-property');
        select.innerHTML = properties.map(p => {
            const isInactive = p.status === 'Inactive' || p.status === 'Maintenance';
            const maxUnits = parseInt(p.units) || 0;
            const occupied = tenants.filter(t => String(t.propertyId) === String(p.id)).length;
            const isFull = maxUnits > 0 && occupied >= maxUnits;
            const isDisabled = isFull || isInactive;

            let label = esc(p.name);
            if (isInactive) label += ` (${p.status})`;
            else if (isFull) label += ' (Full)';
            if (maxUnits > 0 && !isInactive) label += ` — ${occupied}/${maxUnits}`;

            return `<option value="${escAttr(p.id)}" ${isDisabled ? 'disabled' : ''}>${label}</option>`;
        }).join('');
        const firstEnabled = select.querySelector('option:not([disabled])');
        if (firstEnabled) firstEnabled.selected = true;
    } catch (e) {
        console.error('Failed to load properties for dropdown', e);
        window.openConfirmModal('Error', 'Could not load properties. Please try again.', 'danger');
        return;
    }

    document.getElementById('tenant-modal').style.display = 'flex';
}

function closeTenantModal() {
    document.getElementById('tenant-modal').style.display = 'none';
}

document.getElementById('tenant-form').onsubmit = async (e) => {
    e.preventDefault();
    const originalUnit = document.getElementById('tenant-original-unit').value;
    const unit = document.getElementById('tenant-unit').value;

    const data = {
        unit: unit,
        name: `${document.getElementById('tenant-fname').value} ${document.getElementById('tenant-lname').value}`.trim(),
        email: document.getElementById('tenant-email').value,
        phone: document.getElementById('tenant-phone').value,
        propertyId: document.getElementById('tenant-property').value,
        leaseAmount: document.getElementById('tenant-lease-amount').value,
        moveInDate: document.getElementById('tenant-move-in-date').value,
        advancePayment: document.getElementById('tenant-advance').value,
        prepaidBalance: document.getElementById('tenant-prepaid').value,
        securityDeposit: document.getElementById('tenant-deposit').value,
        leaseEndDate: document.getElementById('tenant-lease-end').value,
        remarks: document.getElementById('tenant-remarks').value,
        telegramId: null,
        rent_due_day: parseInt(document.getElementById('tenant-due-day').value) || 1
    };

    if (originalUnit) {
        try {
            const existingRes = await fetch(`${API_URL}/tenants?t=${Date.now()}`, { credentials: 'include' });
            const tenantsList = await existingRes.json();
            const existingT = tenantsList.find(t => t.unit === originalUnit);
            if (existingT && existingT.telegramId) data.telegramId = existingT.telegramId;

            window.openConfirmModal('Save Changes', 'Are you sure you want to update this tenant?', 'info', async () => {
                try {
                    const res = await fetch(`${API_URL}/tenants/${originalUnit}`, { method: 'PUT', credentials: 'include', headers: { ...csrfHeaders() }, body: JSON.stringify(data) });
                    if (res.ok) {
                        window.openConfirmModal('Updated!', 'Tenant details have been updated.', 'success');
                        closeTenantModal();
                        refreshTenants();
                        window.refreshDashboard();
                        const activeSection = document.querySelector('.content-section.active');
                        if (activeSection && activeSection.id === 'tenant-detail-section' && window._currentDetailTenantUnit) {
                            openTenantProfile(window._currentDetailTenantUnit);
                        } else if (activeSection && activeSection.id === 'property-detail-section' && window._currentDetailPropertyId) {
                            window.showPropertyDetail(window._currentDetailPropertyId);
                        }
                    } else { const err = await res.json(); window.openConfirmModal('Error', err.error || 'Failed to update tenant.', 'danger'); }
                } catch (err) { console.error('Update error:', err); }
            });
        } catch (e) { console.error(e); }
    } else {
        try {
            const res = await fetch(`${API_URL}/tenants`, { method: 'POST', credentials: 'include', headers: { ...csrfHeaders() }, body: JSON.stringify(data) });
            if (res.ok) {
                window.openConfirmModal('Created!', 'Tenant has been added.', 'success');
                closeTenantModal();
                refreshTenants();
                window.refreshDashboard();
            } else { const err = await res.json(); window.openConfirmModal('Error', err.error || 'Failed to add tenant.', 'danger'); }
        } catch (err) { console.error('Create error:', err); }
    }
};

async function editTenant(unit) {
    try {
        const [tenantRes, propRes] = await Promise.all([
            fetch(`${API_URL}/tenants?t=${Date.now()}`, { credentials: 'include' }),
            fetch(`${API_URL}/properties?t=${Date.now()}`, { credentials: 'include' })
        ]);
        const tenants = await tenantRes.json();
        const properties = await propRes.json();
        const t = tenants.find(ten => ten.unit === unit);
        if (!t) return;

        document.getElementById('tenant-modal-title').innerText = 'Edit Tenant';
        document.getElementById('tenant-submit-btn').innerText = 'Save Changes';
        document.getElementById('tenant-original-unit').value = t.unit;
        const nameParts = (t.name || '').split(' ');
        document.getElementById('tenant-fname').value = nameParts[0] || '';
        document.getElementById('tenant-lname').value = nameParts.slice(1).join(' ') || '';
        document.getElementById('tenant-email').value = t.email || '';
        document.getElementById('tenant-phone').value = t.phone || '';
        document.getElementById('tenant-unit').value = t.unit || '';
        document.getElementById('tenant-due-day').value = t.rentDueDay || 1;
        document.getElementById('tenant-lease-amount').value = t.leaseAmount || '';
        document.getElementById('tenant-move-in-date').value = t.moveInDate ? toLocalDateStr(t.moveInDate) : '';
        document.getElementById('tenant-advance').value = t.advancePayment || '';
        document.getElementById('tenant-prepaid').value = t.prepaidBalance || '';
        document.getElementById('tenant-deposit').value = t.securityDeposit || '';
        document.getElementById('tenant-lease-end').value = t.leaseEndDate ? toLocalDateStr(t.leaseEndDate) : '';
        document.getElementById('tenant-remarks').value = t.remarks || '';

        const select = document.getElementById('tenant-property');
        select.innerHTML = properties.map(p => {
            const isCurrent = String(p.id) === String(t.propertyId);
            const isInactive = p.status === 'Inactive' || p.status === 'Maintenance';
            const maxUnits = parseInt(p.units) || 0;
            const occupied = tenants.filter(ten => String(ten.propertyId) === String(p.id) && ten.unit !== t.unit).length;
            const isFull = !isCurrent && maxUnits > 0 && occupied >= maxUnits;
            const isDisabled = !isCurrent && (isFull || isInactive);
            
            let label = esc(p.name);
            if (isInactive && !isCurrent) label += ` (${p.status})`;
            else if (isFull) label += ' (Full)';
            if (maxUnits > 0 && (!isInactive || isCurrent)) label += ` — ${occupied + (isCurrent ? 1 : 0)}/${maxUnits}`;

            return `<option value="${escAttr(p.id)}" ${isCurrent ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}>${label}</option>`;
        }).join('');

        document.getElementById('tenant-modal').style.display = 'flex';
    } catch (err) {
        console.error('Edit tenant lookup error:', err);
        window.openConfirmModal('Error', 'Could not load tenant data. Please try again.', 'danger');
    }
}

async function deleteTenant(unit) {
    window.openConfirmModal('Delete Tenant', 'Are you sure you want to remove this tenant?', 'danger', async () => {
        try {
            const res = await fetch(`${API_URL}/tenants/${unit}`, { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': getCsrfToken() } });
            if (res.ok) {
                window.openConfirmModal('Deleted!', 'Tenant has been removed.', 'success');
                refreshTenants();
                window.refreshDashboard();
                const activeSection = document.querySelector('.content-section.active');
                if (activeSection && activeSection.id === 'tenant-detail-section') {
                    window.showSection('tenants', document.querySelector('.nav-item[data-action="showSection"][data-args="tenants"]'));
                }
            } else { const err = await res.json(); window.openConfirmModal('Error', err.error || 'Failed to delete tenant.', 'danger'); }
        } catch (err) { console.error('Delete tenant error:', err); }
    });
}

async function triggerRentCheck(unit) {
    window.openConfirmModal(
        'Trigger Rent Check',
        `Run a manual rent check for Unit ${unit}? This will evaluate if rent is owed, auto-deduct from prepaid balance if available, or send an overdue notice.`,
        'info',
        async () => {
            try {
                const response = await fetch(`${API_URL}/tenants/${unit}/rent-check`, {
                    method: 'POST',
                    headers: csrfHeaders(),
                    credentials: 'include'
                });
                const result = await response.json();
                if (result.success) {
                    window.openConfirmModal('Rent Check Complete', result.message, 'success');
                    openTenantProfile(unit);
                } else {
                    window.openConfirmModal('Rent Check Failed', result.error || 'Failed to process rent check.', 'danger');
                }
            } catch (error) {
                console.error('Error triggering rent check:', error);
                window.openConfirmModal('Error', 'An unexpected error occurred. Please try again.', 'danger');
            }
        }
    );
}

async function openTenantProfile(unit) {
    window._currentDetailTenantUnit = unit;
    try {
        const [tenantRes, propRes, payRes] = await Promise.all([
            fetch(`${API_URL}/tenants?t=${Date.now()}`, { credentials: 'include' }),
            fetch(`${API_URL}/properties?t=${Date.now()}`, { credentials: 'include' }),
            fetch(`${API_URL}/payments?t=${Date.now()}`, { credentials: 'include' })
        ]);
        const tenants = await tenantRes.json();
        const properties = await propRes.json();
        const allPayments = await payRes.json();

        const t = tenants.find(ten => ten.unit === unit);
        if (!t) return;

        const prop = properties.find(p => String(p.id) === String(t.propertyId)) || { name: 'Unassigned' };
        const tenantPayments = allPayments
            .filter(p => p.unit === unit)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const currencySymbol = window.appSettings?.currency || '\u20b1';
        const fmt = (n) => n ? `${currencySymbol}${parseFloat(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '\u2014';
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '\u2014';

        const payRows = tenantPayments.length === 0
            ? `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;"><i class="fas fa-receipt" style="font-size:1.5rem; opacity:0.3; display:block; margin-bottom:8px;"></i>No payment records found.</td></tr>`
            : tenantPayments.map(p => {
                const statusColor = p.status === 'verified' ? 'var(--success)' : p.status === 'pending' ? '#f59e0b' : 'var(--danger)';
                const receiptSrc = p.fileId ? `${API_URL}/media/${p.fileId}` : null;
                const receiptHtml = receiptSrc
                    ? `<button class="btn-icon" data-action="openLightbox" data-type="${escAttr(p.mediaType || 'photo')}" data-src="${escAttr(receiptSrc)}" title="View Receipt" style="background: rgba(43, 122, 255, 0.1); color: var(--primary); padding: 5px 8px; border-radius: 6px; cursor: pointer; border: none; font-size: 0.85rem;"><i class="fas fa-receipt"></i></button>`
                    : '<span style="color:var(--text-muted);">—</span>';
                return `<tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding:12px 8px; font-size:0.85rem; color:var(--text-muted);">${fmtDate(p.timestamp)}</td>
                    <td style="padding:12px 8px; font-weight:600;">${fmt(p.amount)}</td>
                    <td style="padding:12px 8px; font-size:0.85rem; color:var(--text-muted);">${esc(p.method || 'Manual')}</td>
                    <td style="padding:12px 8px;"><span style="font-size:0.75rem; font-weight:700; color:${statusColor}; text-transform:uppercase;">${esc(p.status || 'unknown')}</span></td>
                    <td style="padding:12px 8px;">${receiptHtml}</td>
                    <td style="padding:12px 8px; font-size:0.8rem; color:var(--text-muted);">${esc(p.notes || '\u2014')}</td>
                </tr>`;
            }).join('');

        // ── Rent Due Tracker logic ─────────────────────────────────────
        const todayD = new Date(); todayD.setHours(0,0,0,0);
        const dueDay   = parseInt(t.rentDueDay) || 1;
        const todayNum = todayD.getDate();
        const yr = todayD.getFullYear(), mo = todayD.getMonth();

        // Cycle boundaries
        const cycleStart = todayNum >= dueDay
            ? new Date(yr, mo, dueDay)
            : new Date(yr, mo - 1, dueDay);
        cycleStart.setHours(0,0,0,0);
        const cycleEnd = todayNum >= dueDay
            ? new Date(yr, mo + 1, dueDay)
            : new Date(yr, mo, dueDay);

        const totalCycleDays = Math.round((cycleEnd - cycleStart) / 86400000);
        const daysIntoCycle  = Math.round((todayD  - cycleStart) / 86400000);
        const daysLeft       = dueDay - todayNum;   // negative = overdue
        const daysOverdue    = daysLeft < 0 ? Math.abs(daysLeft) : 0;

        // Has a verified payment fallen within this cycle?
        const paidThisCycle = tenantPayments.some(p => {
            if (p.status !== 'verified') return false;
            const pd = new Date(p.timestamp); pd.setHours(0,0,0,0);
            return pd >= cycleStart && pd <= todayD;
        });

        const prepaidAmt  = parseFloat(t.prepaidBalance  || 0);
        const leaseAmt    = parseFloat(t.leaseAmount      || 0);
        const hasPrepaid  = prepaidAmt > 0 && prepaidAmt >= leaseAmt;

        // Bar fill %: progress from cycleStart toward due date
        const barRawPct = Math.min(100, Math.max(2, (daysIntoCycle / totalCycleDays) * 100));

        // State resolution
        let trackerColor, trackerBg, trackerStatusText, trackerIcon, trackerPct, trackerPulse = false;
        if (paidThisCycle) {
            trackerColor = 'var(--success)'; trackerBg = 'rgba(34,197,94,0.12)';
            trackerIcon = 'fa-check-circle'; trackerStatusText = 'Paid this cycle';
            trackerPct = barRawPct;
        } else if (hasPrepaid) {
            trackerColor = '#06b6d4'; trackerBg = 'rgba(6,182,212,0.12)';
            trackerIcon = 'fa-wallet'; trackerStatusText = 'Covered by prepaid balance';
            trackerPct = barRawPct;
        } else if (daysOverdue > 0) {
            trackerColor = 'var(--danger)'; trackerBg = 'rgba(239,68,68,0.12)';
            trackerIcon = 'fa-exclamation-circle';
            trackerStatusText = `${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`;
            trackerPct = 100; trackerPulse = true;
        } else if (daysLeft === 0) {
            trackerColor = '#f97316'; trackerBg = 'rgba(249,115,22,0.12)';
            trackerIcon = 'fa-bell'; trackerStatusText = 'Due today';
            trackerPct = 100; trackerPulse = true;
        } else if (daysLeft <= 3) {
            trackerColor = '#f97316'; trackerBg = 'rgba(249,115,22,0.12)';
            trackerIcon = 'fa-exclamation-triangle';
            trackerStatusText = `${daysLeft} day${daysLeft !== 1 ? 's' : ''} until due`;
            trackerPct = barRawPct;
        } else if (daysLeft <= 7) {
            trackerColor = '#f59e0b'; trackerBg = 'rgba(245,158,11,0.12)';
            trackerIcon = 'fa-clock';
            trackerStatusText = `${daysLeft} days until due`;
            trackerPct = barRawPct;
        } else {
            trackerColor = 'var(--primary)'; trackerBg = 'rgba(43,122,255,0.1)';
            trackerIcon = 'fa-calendar-check';
            trackerStatusText = `${daysLeft} days until due`;
            trackerPct = barRawPct;
        }

        // Due-day marker position on the bar (% from left)
        // The bar spans cycleStart → cycleEnd. The due date = cycleEnd = 100%.
        const duePct = 100;
        const todayPct = barRawPct;

        const prepaidColor = prepaidAmt > 0 ? 'var(--success)' : 'var(--text-muted)';
        // ── End tracker logic ───────────────────────────────────────────

        window.showSection('tenant-detail');
        const content = document.getElementById('tenant-detail-content');
        content.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:24px;">
            <!-- Header -->
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <h2 style="font-size:1.35rem; font-weight:700; margin:0 0 4px;">${esc(t.name)}</h2>
                    <p style="font-size:0.9rem; color:var(--text-muted); margin:0;">${esc(prop.name)} &mdash; Unit ${esc(t.unit)}</p>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-outline" style="width:auto; height:40px; padding:0 18px; border-radius:10px;" data-action="triggerRentCheck" data-args="${escAttr(t.unit)}"><i class="fas fa-sync"></i> Trigger Rent Check</button>
                    <button class="btn btn-outline" style="width:auto; height:40px; padding:0 18px; border-radius:10px;" data-action="editTenant" data-args="${escAttr(t.unit)}"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn" style="width:auto; height:40px; padding:0 18px; border-radius:10px; background:var(--danger); color:#fff;" data-action="deleteTenant" data-args="${escAttr(t.unit)}"><i class="fas fa-trash-alt"></i> Delete</button>
                </div>
            </div>

            <!-- Tenant Information — full width, fields horizontal -->
            <div class="card" style="padding:20px 24px;">
                <h3 style="font-size:0.95rem; font-weight:700; margin-bottom:16px; display:flex; align-items:center; gap:8px;"><i class="fas fa-user" style="color:var(--primary);"></i> Tenant Information</h3>
                <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:0; border:1px solid var(--border); border-radius:10px; overflow:hidden;">
                    <div style="padding:14px 18px; border-right:1px solid var(--border);"><div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:5px; display:flex; align-items:center; gap:5px;"><i class="fas fa-envelope"></i> Email</div><div style="font-size:0.88rem; color:var(--text-main); font-weight:500; word-break:break-all;">${esc(t.email) || '\u2014'}</div></div>
                    <div style="padding:14px 18px; border-right:1px solid var(--border);"><div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:5px; display:flex; align-items:center; gap:5px;"><i class="fas fa-phone"></i> Phone</div><div style="font-size:0.88rem; color:var(--text-main); font-weight:500;">${esc(t.phone) || '\u2014'}</div></div>
                    <div style="padding:14px 18px; border-right:1px solid var(--border);"><div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:5px; display:flex; align-items:center; gap:5px;"><i class="fas fa-calendar-check"></i> Move-in Date</div><div style="font-size:0.88rem; color:var(--text-main); font-weight:500;">${fmtDate(t.moveInDate)}</div></div>
                    <div style="padding:14px 18px; border-right:1px solid var(--border);"><div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:5px; display:flex; align-items:center; gap:5px;"><i class="fas fa-calendar-times"></i> Lease End</div><div style="font-size:0.88rem; color:var(--text-main); font-weight:500;">${fmtDate(t.leaseEndDate)}</div></div>
                    <div style="padding:14px 18px;"><div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:5px; display:flex; align-items:center; gap:5px;"><i class="fas fa-clock"></i> Rent Due Day</div><div style="font-size:0.88rem; color:var(--text-main); font-weight:500;">Every Day ${dueDay}</div></div>
                </div>
                ${t.remarks ? `<div style="margin-top:12px; padding:11px 14px; background:var(--bg); border-radius:9px; border:1px solid var(--border); display:flex; gap:10px; align-items:flex-start;"><span style="font-size:0.72rem; color:var(--text-muted); white-space:nowrap; padding-top:2px;">Remarks</span><span style="font-size:0.85rem; line-height:1.6; color:var(--text-main);">${esc(t.remarks)}</span></div>` : ''}
            </div>

            <!-- KPI Strip -->
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:24px; align-items:start;">
                <div class="card" style="padding:16px 18px; display:flex; align-items:center; gap:12px;">
                    <div style="width:36px; height:36px; border-radius:10px; background:rgba(43,122,255,0.1); color:var(--primary); display:flex; align-items:center; justify-content:center; font-size:0.9rem; flex-shrink:0;"><i class="fas fa-coins"></i></div>
                    <div><div style="font-size:1.05rem; font-weight:800; line-height:1.2;">${fmt(t.leaseAmount)}</div><div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Monthly Rent</div></div>
                </div>
                <div class="card" style="padding:16px 18px; display:flex; align-items:center; gap:12px;">
                    <div style="width:36px; height:36px; border-radius:10px; background:rgba(34,197,94,0.1); color:var(--success); display:flex; align-items:center; justify-content:center; font-size:0.9rem; flex-shrink:0;"><i class="fas fa-wallet"></i></div>
                    <div><div style="font-size:1.05rem; font-weight:800; line-height:1.2; color:${prepaidColor};">${fmt(t.prepaidBalance)}</div><div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Prepaid Balance</div></div>
                </div>
                <div class="card" style="padding:16px 18px; display:flex; align-items:center; gap:12px;">
                    <div style="width:36px; height:36px; border-radius:10px; background:rgba(245,158,11,0.1); color:#f59e0b; display:flex; align-items:center; justify-content:center; font-size:0.9rem; flex-shrink:0;"><i class="fas fa-shield-alt"></i></div>
                    <div><div style="font-size:1.05rem; font-weight:800; line-height:1.2;">${fmt(t.securityDeposit)}</div><div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Security Deposit</div></div>
                </div>
                <div class="card" style="padding:16px 18px; display:flex; align-items:center; gap:12px;">
                    <div style="width:36px; height:36px; border-radius:10px; background:rgba(99,102,241,0.1); color:#6366f1; display:flex; align-items:center; justify-content:center; font-size:0.9rem; flex-shrink:0;"><i class="fas fa-hand-holding-usd"></i></div>
                    <div><div style="font-size:1.05rem; font-weight:800; line-height:1.2;">${fmt(t.advancePayment)}</div><div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Advance Payment</div></div>
                </div>
            </div>

            <!-- Rent Due Tracker — full width -->
            <div class="card" style="padding:20px 24px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                    <h3 style="font-size:0.95rem; font-weight:700; display:flex; align-items:center; gap:8px; margin:0;">
                        <i class="fas fa-chart-bar" style="color:${trackerColor};"></i> Rent Due Tracker
                    </h3>
                    <span style="font-size:0.75rem; font-weight:700; color:${trackerColor}; background:${trackerBg}; padding:4px 12px; border-radius:20px; display:flex; align-items:center; gap:5px; white-space:nowrap;">
                        <i class="fas ${trackerIcon}"></i> ${trackerStatusText}
                    </span>
                </div>
                <!-- Progress bar -->
                <div style="position:relative; height:12px; background:var(--border); border-radius:999px; overflow:hidden; margin-bottom:10px;">
                    <div style="position:absolute; left:0; top:0; height:100%; width:${trackerPct}%; background:${trackerColor}; border-radius:999px; transition:width 0.7s cubic-bezier(0.4,0,0.2,1);${trackerPulse ? 'animation:pulse-bar 1.6s ease-in-out infinite;' : ''}"></div>
                </div>
                <!-- Bar labels -->
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
                    <span title="Cycle start">${cycleStart.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>
                    <span style="font-weight:600; color:var(--text-main);">Today: ${todayD.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>
                    <span style="font-weight:700; color:${trackerColor};" title="Next due date">Due: ${cycleEnd.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>
                </div>
            </div>

            <!-- Payment History -->
            <div class="card" style="padding:24px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
                    <div style="width:28px; height:28px; border-radius:8px; background:rgba(43,122,255,0.1); color:var(--primary); display:flex; align-items:center; justify-content:center; font-size:0.85rem;"><i class="fas fa-history"></i></div>
                    <h3 style="font-size:1rem; font-weight:600;">Payment History</h3>
                    <span class="status-pill pill-info" style="font-size:0.75rem;">${tenantPayments.length} record${tenantPayments.length !== 1 ? 's' : ''}</span>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead><tr style="border-bottom:2px solid var(--border);">
                            <th style="text-align:left; padding:8px 8px 12px; color:var(--text-muted); font-weight:600; font-size:0.8rem;">Date</th>
                            <th style="text-align:left; padding:8px 8px 12px; color:var(--text-muted); font-weight:600; font-size:0.8rem;">Amount</th>
                            <th style="text-align:left; padding:8px 8px 12px; color:var(--text-muted); font-weight:600; font-size:0.8rem;">Method</th>
                            <th style="text-align:left; padding:8px 8px 12px; color:var(--text-muted); font-weight:600; font-size:0.8rem;">Status</th>
                            <th style="text-align:left; padding:8px 8px 12px; color:var(--text-muted); font-weight:600; font-size:0.8rem;">Proof</th>
                            <th style="text-align:left; padding:8px 8px 12px; color:var(--text-muted); font-weight:600; font-size:0.8rem;">Notes</th>
                        </tr></thead>
                        <tbody>${payRows}</tbody>
                    </table>
                </div>
            </div>
            </div><!-- end flex column -->`;
    } catch (err) { console.error('Tenant profile error:', err); }
}

// Expose globally
window.refreshTenants = refreshTenants;
window.sortTenants = sortTenants;
window.editTenant = editTenant;
window.deleteTenant = deleteTenant;
window.openAddTenantModal = openAddTenantModal;
window.closeTenantModal = closeTenantModal;
window.openTenantProfile = openTenantProfile;
window.triggerRentCheck = triggerRentCheck;


