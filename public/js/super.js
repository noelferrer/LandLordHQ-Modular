// --- Super admin page logic (extracted from inline <script>) ---

// Check auth via cookie
fetch('/api/auth/check', { credentials: 'include' })
    .then(r => {
        if (!r.ok) { window.location.replace('/login'); return; }
        document.getElementById('app-content').style.display = 'block';
        loadInvites();
    })
    .catch(() => window.location.replace('/login'));

function showError(msg) {
    const b = document.getElementById('error-banner');
    if (b) {
        b.innerText = msg;
        b.style.display = 'block';
        setTimeout(() => b.style.display = 'none', 5000);
    }
}

function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)landlordhq_csrf=([^;]+)/);
    return match ? match[1] : '';
}

async function fetchAPI(endpoint, options = {}) {
    options.credentials = 'include';
    // Add CSRF header for state-changing requests
    if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
        options.headers = { ...options.headers, 'X-CSRF-Token': getCsrfToken() };
    }
    try {
        const res = await fetch(endpoint, options);
        if (res.status === 401 || res.status === 403) {
            window.location.replace('/');
            return null;
        }
        return res.json();
    } catch (err) {
        showError("Network error. Please try again.");
        return null;
    }
}

function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function loadInvites() {
    const invites = await fetchAPI('/api/super/invites');
    if (!invites) return;

    const tbody = document.getElementById('invites-body');
    const statTotal = document.getElementById('stat-total');
    const statActive = document.getElementById('stat-active');
    const statClaimed = document.getElementById('stat-claimed');

    if(invites.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:40px;">No invites generated yet.</td></tr>';
        return;
    }

    // Update stats
    statTotal.innerText = invites.length;
    statActive.innerText = invites.filter(i => i.status === 'active').length;
    statClaimed.innerText = invites.filter(i => i.status === 'claimed').length;
    const statExpired = document.getElementById('stat-expired');
    if (statExpired) statExpired.innerText = invites.filter(i => i.status === 'expired').length;

    invites.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

    tbody.innerHTML = invites.map(i => `
        <tr>
            <td><span class="code-pill">${esc(i.code)}</span></td>
            <td>
                <div style="font-weight:500; font-size:0.9rem">${new Date(i.createdAt).toLocaleDateString()}</div>
                <div style="color:var(--text-muted); font-size:0.75rem">${new Date(i.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
            </td>
            <td>
                <span class="status-pill ${i.status === 'active' ? 'pill-active' : i.status === 'claimed' ? 'pill-claimed' : 'pill-expired'}">
                    <i class="fas ${i.status === 'active' ? 'fa-circle-check' : i.status === 'claimed' ? 'fa-user-lock' : 'fa-clock'}"></i>
                    ${esc(i.status).toUpperCase()}
                </span>
            </td>
            <td style="font-family:var(--font-mono); font-size:0.85rem; color:var(--navy-mid)">
                ${i.claimedBy ? `<i class="fab fa-telegram" style="color:#0088cc; margin-right:6px"></i> ${esc(i.claimedBy)}` : '<span style="color:var(--text-muted)">Unclaimed</span>'}
            </td>
        </tr>
    `).join('');
}

window.generateInvite = async function() {
    const res = await fetchAPI('/api/super/invites', { method: 'POST' });
    if (res && res.success) {
        loadInvites();
    } else if (res) {
        showError(res.error || "Failed to generate invite.");
    }
};

// Event delegation for data-action clicks
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        if (el.dataset.action === 'generateInvite') {
            window.generateInvite();
        }
    });
});
