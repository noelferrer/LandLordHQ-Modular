// --- Dashboard Module ---
import { API_URL, esc, escAttr } from '../core/api.js';

export const DashboardModule = {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'fas fa-th-large',
    order: 1,
    titleText: 'Dashboard',
    subtitleText: 'Real-time unit pulse and occupancy grid',
    headerTools: null,
    onActivate: () => { refreshDashboard(); },
};

function renderMedia(fileId, mediaType) {
    const src = `${API_URL}/media/${fileId}`;
    return `
        <div class="media-container" data-action="openLightbox" data-type="${escAttr(mediaType)}" data-src="${escAttr(src)}">
            <div class="media-type-badge"><i class="fas fa-${mediaType === 'video' ? 'video' : 'camera'}"></i> ${esc(mediaType).toUpperCase()}</div>
            ${mediaType === 'video' ? `<video src="${escAttr(src)}" muted preload="metadata"></video>` : `<img src="${escAttr(src)}" alt="Media" loading="lazy">`}
        </div>`;
}

async function refreshDashboard() {
    try {
        const today = new Date();
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
        const fetchOpts = { credentials: 'include' };

        const authCheck = await fetch(`${API_URL}/tenants`, fetchOpts);
        if (authCheck.status === 401) {
            window.location.replace('/login');
            return;
        }
        const rawTenants = await authCheck.json();

        const [rawTickets, rawPayments, rawSettings, rawProperties] = await Promise.all([
            fetch(`${API_URL}/tickets`, fetchOpts).then(r => r.ok ? r.json() : []),
            fetch(`${API_URL}/payments`, fetchOpts).then(r => r.ok ? r.json() : []),
            fetch(`${API_URL}/settings`, fetchOpts).then(r => r.ok ? r.json() : {}),
            fetch(`${API_URL}/properties?t=${Date.now()}`, fetchOpts).then(r => r.ok ? r.json() : [])
        ]);

        const tenants = Array.isArray(rawTenants) ? rawTenants : [];
        const tickets = Array.isArray(rawTickets) ? rawTickets : [];
        const payments = Array.isArray(rawPayments) ? rawPayments : [];
        const settings = (rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)) ? rawSettings : {};
        const properties = Array.isArray(rawProperties) ? rawProperties : [];

        window.appSettings = settings;
        window.tenantData = tenants;
        window.propertyData = properties;
        window._allPayments = payments;

        // Update Stats
        const statProps = document.getElementById('dash-total-properties');
        const statTenants = document.getElementById('dash-total-tenants');
        const statLeases = document.getElementById('dash-active-leases');
        const statRevenue = document.getElementById('dash-monthly-revenue');

        if (statProps) statProps.innerText = properties.length;
        if (statTenants) statTenants.innerText = tenants.length;

        const activeLeases = tenants.filter(t => t.status !== 'Inactive').length;
        if (statLeases) statLeases.innerText = activeLeases;

        const verifiedPayments = payments.filter(p => p.status === 'verified');
        const currentMonthRevenuePayments = verifiedPayments.filter(p => new Date(p.timestamp).getTime() >= currentMonthStart);
        const totalRevenue = currentMonthRevenuePayments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
        const currencySymbol = settings.currency || '₱';
        if (statRevenue) statRevenue.innerText = `${currencySymbol}${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Occupancy
        let totalUnits = 0;
        properties.forEach(p => totalUnits += parseInt(p.units || 1));
        const occupancyRate = totalUnits > 0 ? ((activeLeases / totalUnits) * 100).toFixed(1) : 0;

        const occText = document.getElementById('dash-occupancy-text');
        const occBar = document.getElementById('dash-occupancy-bar');
        if (occText) occText.innerText = `${occupancyRate}%`;
        if (occBar) occBar.style.width = `${occupancyRate}%`;

        // Overdue Tenants
        const overdueTenants = tenants.filter(t => {
            if (t.status === 'Inactive') return false;
            const dueDay = t.rentDueDay || 1;
            const gracePeriod = 1;
            const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);
            const overdueThreshold = new Date(dueDate.getTime() + (gracePeriod * 24 * 60 * 60 * 1000));
            const hasPaid = verifiedPayments.some(p => p.unit === t.unit && new Date(p.timestamp).getTime() >= currentMonthStart);
            return !hasPaid && today > overdueThreshold;
        });


        // Recent Payments
        const recentBody = document.getElementById('dash-recent-payments');
        if (recentBody) {
            const displayPayments = verifiedPayments.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            if (displayPayments.length === 0) {
                recentBody.innerHTML = '<div style="flex:1;text-align:center;">No recent payments.</div>';
                recentBody.style.display = 'flex';
            } else {
                recentBody.style.display = 'block';
                recentBody.innerHTML = `
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                        <thead><tr style="border-bottom: 1px solid var(--border); color: var(--text-muted);">
                            <th style="padding-bottom: 15px; font-weight: 600;">Tenant</th>
                            <th style="padding-bottom: 15px; font-weight: 600;">Property</th>
                            <th style="padding-bottom: 15px; font-weight: 600;">Amount</th>
                            <th style="padding-bottom: 15px; font-weight: 600;">Date</th>
                        </tr></thead>
                        <tbody>
                            ${displayPayments.slice(0, 3).map(p => {
                                const t = tenants.find(ten => String(ten.unit) === String(p.unit)) || { name: p.tenantName || 'Unknown' };
                                const pName = t.propertyId ? ((properties.find(prop => String(prop.id) === String(t.propertyId)) || {}).name || 'Unassigned') : 'Unassigned';
                                return `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 12px 0; font-weight: 600;">${esc(t.name)}</td>
                                    <td style="padding: 12px 0; color: var(--text-muted);">${esc(pName)}</td>
                                    <td style="padding: 12px 0; font-weight: 600; color: var(--success);">${currencySymbol}${(parseFloat(p.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style="padding: 12px 0; color: var(--text-muted);"><i class="far fa-calendar-alt"></i> ${new Date(p.timestamp).toLocaleDateString()}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>`;
            }
        }

        // Pending Verifications
        const pendingPayments = payments.filter(p => p.status !== 'verified');
        const pendVerifPill = document.getElementById('dash-pending-verif-pill');
        const pendVerifList = document.getElementById('dash-pending-verif-list');
        if (pendVerifPill) {
            pendVerifPill.innerText = `${pendingPayments.length} Pending`;
            pendVerifPill.style.display = pendingPayments.length > 0 ? 'inline-block' : 'none';
        }
        if (pendVerifList) {
            if (pendingPayments.length === 0) {
                pendVerifList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">No pending verifications.</div>';
            } else {
                const recent3 = pendingPayments.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 3);
                pendVerifList.innerHTML = `<table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                    <thead><tr style="border-bottom: 1px solid var(--border); color: var(--text-muted);">
                        <th style="padding-bottom: 10px; font-weight: 600;">Tenant</th>
                        <th style="padding-bottom: 10px; font-weight: 600;">Unit</th>
                        <th style="padding-bottom: 10px; font-weight: 600; text-align: right;">Submitted</th>
                    </tr></thead>
                    <tbody>
                    ${recent3.map(p => {
                        const pt = tenants.find(ten => ten.unit === p.unit) || { name: 'Unknown' };
                        const submittedDate = p.timestamp ? new Date(p.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                        const submittedTime = p.timestamp ? new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        return `<tr style="border-bottom: 1px solid var(--border);">
                            <td style="padding:10px 4px; font-weight:600;">${esc(pt.name)}</td>
                            <td style="padding:10px 4px; color:var(--text-muted);">Unit ${esc(p.unit)}</td>
                            <td style="padding:10px 4px; text-align:right; color:var(--text-muted); font-size:0.82rem;">
                                <div>${submittedDate}</div>
                                <div style="color:var(--text-muted); opacity:0.7;">${submittedTime}</div>
                            </td>
                        </tr>`;
                    }).join('')}
                    </tbody>
                </table>
                ${pendingPayments.length > 3 ? `<div style="text-align:center; padding:8px; color:var(--text-muted); font-size:0.8rem;">+${pendingPayments.length - 3} more pending</div>` : ''}`;
            }
        }


        // Support Overview
        const pendingTickets = tickets.filter(tk => tk.status !== 'closed');
        const recentResolvedTickets = tickets.filter(tk => tk.status === 'closed').sort((a, b) => b.timestamp - a.timestamp);

        const dashPendingSupport = document.getElementById('dash-pending-support');
        if (dashPendingSupport) {
            if (pendingTickets.length === 0) {
                dashPendingSupport.innerHTML = '<div style="flex:1;text-align:center;">No pending support tickets.</div>';
                dashPendingSupport.style.display = 'flex';
            } else {
                dashPendingSupport.style.display = 'block';
                dashPendingSupport.innerHTML = `
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                        <thead><tr style="border-bottom: 1px solid var(--border); color: var(--text-muted);">
                            <th style="padding-bottom: 15px; font-weight: 600;">Unit</th>
                            <th style="padding-bottom: 15px; font-weight: 600;">Issue</th>
                            <th style="padding-bottom: 15px; font-weight: 600;">Date</th>
                        </tr></thead>
                        <tbody>
                            ${pendingTickets.slice(0, 3).map(tk => `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 12px 0; font-weight: 600;">Unit ${esc(tk.unit)}</td>
                                <td style="padding: 12px 10px 12px 0; color: var(--text-main); max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escAttr(tk.issue)}">${esc(tk.issue)}</td>
                                <td style="padding: 12px 0; color: var(--text-muted);">${new Date(tk.timestamp).toLocaleDateString()}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>`;
            }
        }

        const dashRecentSupport = document.getElementById('dash-recent-support');
        if (dashRecentSupport) {
            if (recentResolvedTickets.length === 0) {
                dashRecentSupport.innerHTML = '<div style="flex:1;text-align:center;">No recently resolved tickets.</div>';
                dashRecentSupport.style.display = 'flex';
            } else {
                dashRecentSupport.style.display = 'block';
                dashRecentSupport.innerHTML = `
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                        <thead><tr style="border-bottom: 1px solid var(--border); color: var(--text-muted);">
                            <th style="padding-bottom: 15px; font-weight: 600;">Unit</th>
                            <th style="padding-bottom: 15px; font-weight: 600;">Issue</th>
                            <th style="padding-bottom: 15px; font-weight: 600;">Date</th>
                            <th style="padding-bottom: 15px; font-weight: 600;">Resolved</th>
                        </tr></thead>
                        <tbody>
                            ${recentResolvedTickets.slice(0, 3).map(tk => `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 12px 0; font-weight: 600;">Unit ${esc(tk.unit)}</td>
                                <td style="padding: 12px 10px 12px 0; color: var(--text-main); max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escAttr(tk.issue)}">${esc(tk.issue)}</td>
                                <td style="padding: 12px 0; color: var(--text-muted);"><i class="far fa-calendar-alt"></i> ${new Date(tk.timestamp).toLocaleDateString()}</td>
                                <td style="padding: 12px 0; color: var(--text-muted);"><span class="status-pill pill-success" style="font-size: 0.75rem;"><i class="fas fa-check"></i> Done</span></td>
                            </tr>`).join('')}
                        </tbody>
                    </table>`;
            }
        }

        // Render Payments Grid (Support section)
        const payGrid = document.getElementById('payments-list');
        if (payGrid) {
            payGrid.innerHTML = pendingPayments.length > 0 ? '' : '<p style="color:var(--text-muted); grid-column: 1/-1; text-align: center; padding: 40px;">No pending payments to verify.</p>';
            pendingPayments.forEach(p => {
                const t = tenants.find(ten => ten.unit === p.unit) || { name: 'Unknown' };
                payGrid.innerHTML += `
                <div class="card" style="height: 100%;">
                    <div class="card-body" style="height: 100%; display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <div class="stat-icon bg-success"><i class="fas fa-receipt"></i></div>
                                    <h4 style="margin:0; font-size:1.1rem; font-weight:700;">UNIT ${esc(p.unit)}</h4>
                                </div>
                                <span class="status-pill pill-warning" style="font-size: 0.70rem;">Pending Review</span>
                            </div>
                            ${p.fileId ? `<div style="margin: 10px 0;">${renderMedia(p.fileId, p.mediaType || 'photo')}</div>` : ''}
                            <div class="card-title" style="margin-bottom: 5px; font-size: 1.05rem;">${esc(t.name)}</div>
                            <div class="card-meta" style="margin-bottom: 15px;"><i class="fas fa-clock"></i> Submitted: ${new Date(p.timestamp).toLocaleString()}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-top: 20px;">
                            <button class="btn btn-primary" style="flex: 1;" data-action="verifyPayment" data-unit="${escAttr(p.unit)}" data-id="${escAttr(p.id || '')}">
                                <i class="fas fa-check-double"></i> Verify
                            </button>
                            <button style="background: transparent; border: none; color: var(--danger); font-size: 1.2rem; cursor: pointer; padding: 10px; transition: opacity 0.2s; outline: none;" data-action="deletePayment" data-id="${escAttr(p.id)}" data-name="${escAttr(t.name)}" title="Delete Payment">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
            });
        }

        // Render Support Tickets
        const tickGrid = document.getElementById('tickets-list');
        const resolvedSection = document.getElementById('resolved-tickets-section');
        const resolvedBody = document.getElementById('resolved-tickets-body');

        if (tickGrid) {
            const openTickets = tickets.filter(tk => tk.status !== 'closed');
            const closedTickets = tickets.filter(tk => tk.status === 'closed').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            tickGrid.innerHTML = openTickets.length > 0 ? '' : '<p style="color:var(--text-muted); grid-column: 1/-1; text-align: center; padding: 40px;">No active support tickets.</p>';

            openTickets.forEach(tk => {
                const t = tenants.find(ten => String(ten.unit) === String(tk.unit)) || { name: 'Unknown' };
                tickGrid.innerHTML += `
                <div class="card">
                    <div class="card-body">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
                            <div class="unit-number">UNIT ${esc(tk.unit)}</div>
                            <span class="status-pill pill-danger">Open</span>
                        </div>
                        <div class="card-title">${esc(t.name)}</div>
                        <div class="card-meta"><i class="fas fa-clock"></i> ${new Date(tk.timestamp).toLocaleString()}</div>
                        <div style="display: flex; flex-direction: column; gap: 10px; margin: 12px 0;">
                            ${tk.media && tk.media.length > 0 ? tk.media.map(m => renderMedia(m.fileId, m.type)).join('') : (tk.fileId ? renderMedia(tk.fileId, tk.mediaType || 'photo') : '')}
                        </div>
                        <p style="font-size:0.95rem; line-height:1.6; color:var(--text-main); margin-bottom:20px;">${esc(tk.issue)}</p>
                        <div class="ticket-checklist" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                            <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: pointer; color: var(--text-main);">
                                <input type="checkbox" id="chk-rep-${escAttr(tk.id)}" ${tk.reported ? 'checked' : ''} data-action="handleTicketCheck" data-ticket-id="${escAttr(tk.id)}" data-field="reported" style="width: 18px; height: 18px; cursor: pointer;">
                                Reported to Fixer
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: var(--text-main);">
                                <input type="checkbox" id="chk-res-${escAttr(tk.id)}" data-action="handleTicketCheck" data-ticket-id="${escAttr(tk.id)}" data-field="status" style="width: 18px; height: 18px; cursor: pointer;">
                                Issue Resolved (Done)
                            </label>
                        </div>
                    </div>
                </div>`;
            });

            window._closedTickets = closedTickets;
            window._tenants = tenants;
            if (resolvedSection && resolvedBody) {
                if (closedTickets.length === 0) {
                    resolvedSection.style.display = 'none';
                } else {
                    resolvedSection.style.display = 'block';
                    window.applyResolvedSort();
                }
            }
        }

        // Settings
        const focusedElement = document.activeElement;
        const settingsIds = ['remind-days', 'currency', 'fixer-id', 'start-text', 'rules-text', 'clearance-text'];
        if (document.getElementById('remind-days')) {
            if (!settingsIds.includes(focusedElement.id)) {
                document.getElementById('remind-days').value = settings.rentReminderDaysBefore || 5;
                document.getElementById('currency').value = settings.currency || '₱';
                document.getElementById('fixer-id').value = settings.fixerId || '';
                document.getElementById('start-text').value = settings.startText || 'Welcome to Landlord HQ. Enter /help for more commands.';
                document.getElementById('rules-text').value = settings.rulesText || '📝 **Condo House Rules:**\n\n1. No loud music after 10PM.\n2. Keep common areas clean.';
                document.getElementById('clearance-text').value = settings.clearanceText || '📦 **Move-out Clearance Process:**\n\n1. Settle all outstanding utility bills.\n2. Submit the Clearance Form to the Admin office.\n3. Send a photo of the signed form here for verification.';
            }
        }
    } catch (err) { console.error('Data refresh error:', err); }
}

// Expose globally
window.refreshDashboard = refreshDashboard;
window.renderMedia = renderMedia;
