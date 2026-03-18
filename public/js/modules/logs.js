// --- Logs Module ---
import { API_URL, ITEMS_PER_PAGE, esc, escAttr } from '../core/api.js';

export const LogsModule = {
    id: 'logs',
    label: 'Activity Logs',
    icon: 'fas fa-history',
    order: 8,
    titleText: 'Activity Logs',
    subtitleText: 'Full audit trail of administrative actions',
    headerTools: null,
    onActivate: () => refreshLogs(),
};

let currentLogsPage = 1;

async function changeLogsPage(delta) {
    currentLogsPage += delta;
    await refreshLogs(currentLogsPage);
}

async function refreshLogs(page = 1) {
    currentLogsPage = page;
    const res = await fetch(`${API_URL}/audit-log?page=${page}&limit=${ITEMS_PER_PAGE}`, { credentials: 'include' });
    if (!res.ok) return;
    const { data, total, page: p, totalPages } = await res.json();

    const tbody = document.getElementById('logs-table-body');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--text-muted);">No logs found.</td></tr>';
    } else {
        tbody.innerHTML = data.map(log => {
            const date = new Date(log.timestamp);
            const actionClass = log.action === 'delete' ? 'text-danger' : log.action === 'create' ? 'text-success' : 'text-info';
            const icon = log.action === 'delete' ? 'fa-trash' : log.action === 'create' ? 'fa-plus' : 'fa-edit';
            return `
                <tr>
                    <td><div style="font-weight: 500;">${date.toLocaleDateString()}</div><div style="font-size: 0.75rem; color: var(--text-muted);">${date.toLocaleTimeString()}</div></td>
                    <td><span class="badge ${actionClass}" style="text-transform: capitalize;"><i class="fas ${icon}" style="margin-right: 4px;"></i> ${esc(log.action)}</span></td>
                    <td><span style="font-family: var(--font-mono); font-size: 0.85rem; background: var(--off-white); padding: 2px 6px; border-radius: 4px;">${esc(log.resource)}</span></td>
                    <td><div style="font-size: 0.85rem; color: var(--text-main); max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escAttr(JSON.stringify(log.details || {}))}">${Object.entries(log.details || {}).map(([k,v]) => `<strong>${esc(k)}</strong>: ${esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}`).join(', ')}</div></td>
                </tr>`;
        }).join('');
    }

    document.getElementById('logs-pagination-info').innerText = `Showing ${data.length} of ${total} logs`;
    document.getElementById('logs-prev-btn').disabled = (p <= 1);
    document.getElementById('logs-next-btn').disabled = (p >= totalPages);
}

// Expose globally
window.refreshLogs = refreshLogs;
window.changeLogsPage = changeLogsPage;
