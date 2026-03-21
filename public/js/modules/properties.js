// --- Properties Module ---
import { API_URL, esc, escAttr, csrfHeaders, getCsrfToken, ITEMS_PER_PAGE } from '../core/api.js';
import { renderPagination } from '../core/pagination.js';

export const PropertiesModule = {
    id: 'properties',
    label: 'Properties',
    icon: 'fas fa-building',
    order: 2,
    titleText: 'Properties',
    subtitleText: 'Building-level management and oversight',
    headerTools: () => `<button class="btn btn-primary" style="width: auto;" data-action="openAddPropertyModal"><i class="fas fa-plus"></i> Add Property</button>`,
    onActivate: () => refreshProperties(),
};

let currentPropertiesPage = 1;

function renderPropertiesGrid() {
    const grid = document.getElementById('properties-grid');
    if (!grid || !window.propertyData) return;
    grid.innerHTML = '';

    const totalPages = Math.ceil(window.propertyData.length / ITEMS_PER_PAGE);
    if (currentPropertiesPage > totalPages && totalPages > 0) currentPropertiesPage = totalPages;

    const startIndex = (currentPropertiesPage - 1) * ITEMS_PER_PAGE;
    const paginatedProperties = window.propertyData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    paginatedProperties.forEach(p => {
        const pTenants = (window.tenantData || []).filter(t => String(t.propertyId) === String(p.id));
        const tCount = pTenants.length;
        const maxUnits = parseInt(p.units) || 0;
        const isFull = maxUnits > 0 && tCount >= maxUnits;
        const occupancyColor = isFull ? 'var(--danger)' : tCount > 0 ? 'var(--success)' : 'var(--text-muted)';
        
        const isInactive = p.status === 'Inactive' || p.status === 'Maintenance';
        const cardStyle = isInactive ? 'cursor: pointer; opacity: 0.45; filter: grayscale(1) contrast(0.85);' : 'cursor: pointer;';

        grid.innerHTML += `
        <div class="card" data-action="showPropertyDetail" data-args="${escAttr(p.id)}" style="${cardStyle}">
            <div class="card-body">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(255,165,0,0.1); display: flex; align-items: center; justify-content: center; color: var(--primary);">
                            <i class="fas fa-building"></i>
                        </div>
                        <h4 style="margin:0; font-size:1.1rem; font-weight:700;">${esc(p.name)}</h4>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <span class="status-pill pill-info" style="font-size: 0.7rem;">${esc(p.type)}</span>
                        <span class="status-pill ${isInactive ? 'pill-warning' : 'pill-success'}" style="font-size: 0.7rem;">${esc(p.status)}</span>
                    </div>
                </div>
                <div class="card-meta" style="margin-bottom:15px; font-size: 0.85rem;">
                    <i class="fas fa-map-marker-alt"></i> ${esc(p.address)}, ${esc(p.city)}, ${esc(p.state)} ${esc(p.zip)}
                </div>
                <div style="display:flex; gap:15px; border-top:1px solid var(--border); padding-top:15px; margin-top:15px; font-size: 0.8rem; color: var(--text-muted);">
                    <div style="display:flex; align-items:center; gap:5px;">
                        <i class="fas fa-door-open"></i> ${esc(p.units)} units
                    </div>
                    <div style="display:flex; align-items:center; gap:5px; color:${occupancyColor}; font-weight: ${isFull ? '600' : '400'};">
                        <i class="fas fa-user-friends"></i> ${tCount}/${maxUnits} occupied${isFull ? ' (Full)' : ''}
                    </div>
                </div>
            </div>
        </div>`;
    });

    renderPagination('properties-pagination', currentPropertiesPage, totalPages, (page) => {
        currentPropertiesPage = page;
        renderPropertiesGrid();
    });
}

async function refreshProperties() {
    try {
        const [propRes, tenantRes] = await Promise.all([
            fetch(`${API_URL}/properties?t=${Date.now()}`, { credentials: 'include' }),
            fetch(`${API_URL}/tenants?t=${Date.now()}`, { credentials: 'include' })
        ]);
        window.propertyData = await propRes.json();
        window.tenantData = await tenantRes.json();
        renderPropertiesGrid();
    } catch (err) { console.error('Refresh properties error:', err); }
}

async function showPropertyDetail(id) {
    window._currentDetailPropertyId = id;
    try {
        const [propRes, tenantRes] = await Promise.all([
            fetch(`${API_URL}/properties?t=${Date.now()}`, { credentials: 'include' }),
            fetch(`${API_URL}/tenants?t=${Date.now()}`, { credentials: 'include' })
        ]);
        const properties = await propRes.json();
        const tenants = await tenantRes.json();
        const p = properties.find(prop => prop.id == id);
        if (!p) return;

        const pTenants = tenants.filter(t => String(t.propertyId) === String(p.id));
        const activeTenants = pTenants.length;
        const currencySymbol = window.appSettings.currency || '₱';
        const isInactive = p.status === 'Inactive' || p.status === 'Maintenance';

        const totalUnits  = parseInt(p.units) || 0;
        const vacantUnits = Math.max(0, totalUnits - activeTenants);
        const totalMonthlyRent = pTenants.reduce((sum, t) => sum + (parseFloat(t.leaseAmount) || 0), 0);
        const fmtMoney = (n) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        const fmtDate  = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

        window.showSection('property-detail');
        const content = document.getElementById('detail-content');
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 24px;">

            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h2 style="font-size: 1.35rem; font-weight: 700; margin: 0 0 4px;">${esc(p.name)}</h2>
                    <p style="font-size: 0.9rem; color: var(--text-muted); margin: 0;">${esc(p.address)}, ${esc(p.city)}, ${esc(p.state)} ${esc(p.zip)}</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-outline" style="width: auto; height: 40px; padding: 0 18px; border-radius: 10px;" data-action="editProperty" data-args="${escAttr(p.id)}"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn" style="width: auto; height: 40px; padding: 0 18px; border-radius: 10px; background: var(--danger); color: #fff;" data-action="deleteProperty" data-args="${escAttr(p.id)}"><i class="fas fa-trash-alt"></i> Delete</button>
                </div>
            </div>

            <!-- Property Information — full width, fields horizontal -->
            <div class="card" style="padding: 20px 24px;">
                <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;"><i class="fas fa-building" style="color: var(--primary);"></i> Property Information</h3>
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden;">
                    <div style="padding: 14px 18px; border-right: 1px solid var(--border);"><div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 5px; display: flex; align-items: center; gap: 5px;"><i class="fas fa-map-marker-alt"></i> Address</div><div style="font-size: 0.88rem; color: var(--text-main); font-weight: 500;">${esc(p.address)}</div></div>
                    <div style="padding: 14px 18px; border-right: 1px solid var(--border);"><div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 5px; display: flex; align-items: center; gap: 5px;"><i class="fas fa-city"></i> City / State</div><div style="font-size: 0.88rem; color: var(--text-main); font-weight: 500;">${esc(p.city)}, ${esc(p.state)} ${esc(p.zip)}</div></div>
                    <div style="padding: 14px 18px; border-right: 1px solid var(--border);"><div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 5px; display: flex; align-items: center; gap: 5px;"><i class="fas fa-tag"></i> Type</div><div style="font-size: 0.88rem; color: var(--text-main); font-weight: 500;">${esc(p.type)}</div></div>
                    <div style="padding: 14px 18px; border-right: 1px solid var(--border);"><div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 5px; display: flex; align-items: center; gap: 5px;"><i class="fas fa-circle"></i> Status</div><div style="font-size: 0.88rem; font-weight: 600; color: ${isInactive ? 'var(--warning, #f59e0b)' : 'var(--success)'};">${esc(p.status)}</div></div>
                    <div style="padding: 14px 18px;"><div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 5px; display: flex; align-items: center; gap: 5px;"><i class="fas fa-calendar-alt"></i> Date Added</div><div style="font-size: 0.88rem; color: var(--text-main); font-weight: 500;">${fmtDate(p.createdAt)}</div></div>
                </div>
                ${p.description ? `<div style="margin-top: 12px; padding: 11px 14px; background: var(--bg); border-radius: 9px; border: 1px solid var(--border); display: flex; gap: 10px; align-items: flex-start;"><span style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; padding-top: 2px;">Description</span><span style="font-size: 0.85rem; line-height: 1.6; color: var(--text-main);">${esc(p.description)}</span></div>` : ''}
            </div>

            <!-- KPI Strip -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; align-items: start;">
                <div class="card" style="padding: 16px 18px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(43,122,255,0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;"><i class="fas fa-user-friends"></i></div>
                    <div><div style="font-size: 1.05rem; font-weight: 800; line-height: 1.2;">${activeTenants}</div><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Active Tenant${activeTenants !== 1 ? 's' : ''}</div></div>
                </div>
                <div class="card" style="padding: 16px 18px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(34,197,94,0.1); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;"><i class="fas fa-door-open"></i></div>
                    <div><div style="font-size: 1.05rem; font-weight: 800; line-height: 1.2;">${activeTenants} / ${totalUnits}</div><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Units Occupied</div></div>
                </div>
                <div class="card" style="padding: 16px 18px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(245,158,11,0.1); color: #f59e0b; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;"><i class="fas fa-door-closed"></i></div>
                    <div><div style="font-size: 1.05rem; font-weight: 800; line-height: 1.2;">${vacantUnits}</div><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Vacant Unit${vacantUnits !== 1 ? 's' : ''}</div></div>
                </div>
                <div class="card" style="padding: 16px 18px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(99,102,241,0.1); color: #6366f1; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;"><i class="fas fa-coins"></i></div>
                    <div><div style="font-size: 1.05rem; font-weight: 800; line-height: 1.2;">${fmtMoney(totalMonthlyRent)}</div><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Monthly Rent Total</div></div>
                </div>
            </div>

            <!-- Tenants Table -->
            <div class="card" style="padding: 24px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
                    <div style="width: 28px; height: 28px; border-radius: 8px; background: rgba(43, 122, 255, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 0.85rem;"><i class="fas fa-user-friends"></i></div>
                    <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-main);">Tenants Leasing in This Property</h3>
                    <span class="status-pill pill-info" style="font-size: 0.75rem;">${pTenants.length} tenant${pTenants.length !== 1 ? 's' : ''}</span>
                </div>
                <div style="overflow-x: auto;">
                    ${pTenants.length === 0
                        ? `<div style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 0.9rem;"><i class="fas fa-user-slash" style="font-size: 1.5rem; margin-bottom: 10px; display: block; opacity: 0.4;"></i>No tenants assigned to this property.</div>`
                        : `<table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                        <thead><tr style="border-bottom: 2px solid var(--border);">
                            <th style="text-align: left; padding: 8px 8px 12px; color: var(--text-muted); font-weight: 600; font-size: 0.8rem;">Tenant</th>
                            <th style="text-align: left; padding: 8px 8px 12px; color: var(--text-muted); font-weight: 600; font-size: 0.8rem;">Unit</th>
                            <th style="text-align: left; padding: 8px 8px 12px; color: var(--text-muted); font-weight: 600; font-size: 0.8rem;">Lease Amount</th>
                            <th style="text-align: left; padding: 8px 8px 12px; color: var(--text-muted); font-weight: 600; font-size: 0.8rem;">Move-in Date</th>
                            <th style="text-align: left; padding: 8px 8px 12px; color: var(--text-muted); font-weight: 600; font-size: 0.8rem;">Due Day</th>
                            <th style="text-align: left; padding: 8px 8px 12px; color: var(--text-muted); font-weight: 600; font-size: 0.8rem;">Status</th>
                            <th style="text-align: right; padding: 8px 8px 12px; color: var(--text-muted); font-weight: 600; font-size: 0.8rem;">Actions</th>
                        </tr></thead>
                        <tbody>${pTenants.map(t => {
                            const statusClass = t.status === 'Active' ? 'pill-success' : 'pill-warning';
                            const moveIn = fmtDate(t.moveInDate);
                            return `<tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 12px 8px 12px 0; font-weight: 600;">${esc(t.name)}</td>
                                <td style="padding: 12px 8px; color: var(--text-muted);">Unit ${esc(t.unit)}</td>
                                <td style="padding: 12px 8px; font-weight: 600; color: var(--success); font-family: var(--font-mono);">${fmtMoney(parseFloat(t.leaseAmount) || 0)}</td>
                                <td style="padding: 12px 8px; color: var(--text-muted);">${moveIn}</td>
                                <td style="padding: 12px 8px; color: var(--text-muted); text-align: center;">Day ${t.rentDueDay || 1}</td>
                                <td style="padding: 12px 8px;"><span class="status-pill ${statusClass}" style="font-size: 0.75rem;">${esc(t.status || 'Active')}</span></td>
                                <td style="padding: 12px 0; text-align: right;"><button class="btn btn-outline" style="width: 32px; height: 32px; padding: 0; font-size: 0.9rem; border-radius: 8px;" data-action="editTenant" data-args="${escAttr(t.unit)}" title="Edit Tenant"><i class="fas fa-edit"></i></button></td>
                            </tr>`;
                        }).join('')}</tbody>
                    </table>`}
                </div>
            </div>

            </div><!-- end flex column -->`;
    } catch (err) { console.error('Show detail error:', err); }
}

function openAddPropertyModal() {
    document.getElementById('modal-title').innerText = 'Add Property';
    document.getElementById('modal-subtitle').innerText = 'Fill in the details to add a new property.';
    document.getElementById('submit-btn').innerText = 'Create Property';
    document.getElementById('prop-id').value = '';
    document.getElementById('property-form').reset();
    document.getElementById('property-modal').style.display = 'flex';
}

function closePropertyModal() {
    document.getElementById('property-modal').style.display = 'none';
}

document.getElementById('property-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('prop-id').value;
    const data = {
        name: document.getElementById('prop-name').value,
        address: document.getElementById('prop-address').value,
        city: document.getElementById('prop-city').value,
        state: document.getElementById('prop-state').value,
        zip: document.getElementById('prop-zip').value,
        type: document.getElementById('prop-type').value,
        units: document.getElementById('prop-units').value,
        status: document.getElementById('prop-status').value,
        description: document.getElementById('prop-desc').value
    };

    if (id) {
        window.openConfirmModal('Save Changes', 'Are you sure you want to update this property?', 'info', async () => {
            try {
                const res = await fetch(`${API_URL}/properties/${id}`, { method: 'PUT', credentials: 'include', headers: { ...csrfHeaders() }, body: JSON.stringify(data) });
                if (res.ok) {
                    window.openConfirmModal('Updated!', 'Building details have been updated successfully.', 'success');
                    closePropertyModal();
                    showPropertyDetail(id);
                    refreshProperties();
                    window.refreshDashboard();
                } else { const err = await res.json(); window.openConfirmModal('Error', err.error || 'Failed to update property.', 'danger'); }
            } catch (err) { console.error('Update error:', err); }
        });
    } else {
        window.openConfirmModal('Create Property', 'Are you sure you want to add this new property?', 'info', async () => {
            try {
                const res = await fetch(`${API_URL}/properties`, { method: 'POST', credentials: 'include', headers: { ...csrfHeaders() }, body: JSON.stringify(data) });
                if (res.ok) {
                    window.openConfirmModal('Created!', 'Property has been added to your portfolio.', 'success');
                    closePropertyModal();
                    refreshProperties();
                    window.refreshDashboard();
                } else {
                    const err = await res.json();
                    window.openConfirmModal('Error', err.error || 'Failed to add property.', 'danger');
                }
            } catch (err) {
                console.error('Create error:', err);
                window.openConfirmModal('Error', 'A network error occurred. Please try again.', 'danger');
            }
        });
    }
};

async function editProperty(id) {
    try {
        const res = await fetch(`${API_URL}/properties?t=${Date.now()}`, { credentials: 'include' });
        const properties = await res.json();
        const p = properties.find(prop => prop.id == id);
        if (!p) return;

        document.getElementById('modal-title').innerText = 'Edit Property';
        document.getElementById('modal-subtitle').innerText = 'Update the details for this property.';
        document.getElementById('submit-btn').innerText = 'Update Property';
        document.getElementById('prop-id').value = p.id;
        document.getElementById('prop-name').value = p.name;
        document.getElementById('prop-address').value = p.address;
        document.getElementById('prop-city').value = p.city;
        document.getElementById('prop-state').value = p.state;
        document.getElementById('prop-zip').value = p.zip;
        document.getElementById('prop-type').value = p.type;
        document.getElementById('prop-units').value = p.units;
        document.getElementById('prop-status').value = p.status;
        document.getElementById('prop-desc').value = p.description || '';
        document.getElementById('property-modal').style.display = 'flex';
    } catch (err) {
        console.error('Edit lookup error:', err);
        window.openConfirmModal('Error', 'Could not load property data. Please try again.', 'danger');
    }
}

async function deleteProperty(id) {
    window.openConfirmModal('Delete Property', 'Are you sure you want to delete this building? This action is permanent.', 'danger', async () => {
        try {
            const res = await fetch(`${API_URL}/properties/${id}`, { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': getCsrfToken() } });
            if (res.ok) {
                window.openConfirmModal('Deleted!', 'Building has been removed from the portfolio.', 'success');
                window.showSection('properties', document.querySelector('.nav-item[data-action="showSection"][data-args="properties"]'));
                window.refreshDashboard();
            } else { const err = await res.json(); window.openConfirmModal('Error', err.error || 'Failed to delete property.', 'danger'); }
        } catch (err) { console.error('Delete error:', err); }
    });
}

// Expose globally
window.refreshProperties = refreshProperties;
window.renderPropertiesGrid = renderPropertiesGrid;
window.showPropertyDetail = showPropertyDetail;
window.openAddPropertyModal = openAddPropertyModal;
window.closePropertyModal = closePropertyModal;
window.editProperty = editProperty;
window.deleteProperty = deleteProperty;
