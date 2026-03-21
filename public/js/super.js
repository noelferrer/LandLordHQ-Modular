// --- Super admin page logic ---

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
    if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
        options.headers = { ...options.headers, 'X-CSRF-Token': getCsrfToken() };
    }
    try {
        const res = await fetch(endpoint, options);
        if (res.status === 401 || res.status === 403) {
            window.location.replace('/login');
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

// ── Modal (no inline handlers — CSP scriptSrcAttr: none) ──────────────────
function showInviteModal(code, link) {
    document.getElementById('invite-modal')?.remove();

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'invite-modal';
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0',
        background: 'rgba(11,29,58,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: '9999', padding: '20px'
    });

    // Card
    const card = document.createElement('div');
    Object.assign(card.style, {
        background: '#fff', borderRadius: '20px', padding: '36px',
        maxWidth: '520px', width: '100%',
        boxShadow: '0 24px 64px rgba(11,29,58,0.22)',
        border: '1px solid #E2E8F0', position: 'relative'
    });

    // Close ×
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    Object.assign(closeBtn.style, {
        position: 'absolute', top: '16px', right: '16px',
        background: 'none', border: 'none', fontSize: '18px',
        color: '#64748B', cursor: 'pointer', lineHeight: '1'
    });
    closeBtn.addEventListener('click', () => overlay.remove());

    // Icon
    const icon = document.createElement('div');
    Object.assign(icon.style, {
        width: '48px', height: '48px', borderRadius: '14px',
        background: 'rgba(34,197,94,0.12)', color: '#22C55E',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '20px', marginBottom: '18px'
    });
    icon.innerHTML = '<i class="fas fa-check-circle"></i>';

    // Title
    const title = document.createElement('div');
    Object.assign(title.style, {
        fontFamily: "'Sora',sans-serif", fontSize: '1.2rem',
        fontWeight: '700', color: '#0B1D3A', marginBottom: '6px'
    });
    title.textContent = 'Invite Link Generated';

    // Subtitle
    const sub = document.createElement('div');
    Object.assign(sub.style, {
        fontSize: '0.9rem', color: '#64748B', marginBottom: '24px'
    });
    sub.textContent = 'Share this link with the landlord — it opens the signup page with the code pre-filled.';

    // Label
    const label = document.createElement('div');
    Object.assign(label.style, {
        fontSize: '0.75rem', fontWeight: '600', color: '#64748B',
        textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px'
    });
    label.textContent = 'Signup Link';

    // Link box
    const linkBox = document.createElement('div');
    Object.assign(linkBox.style, {
        background: '#F7F8FA', border: '1px solid #E2E8F0', borderRadius: '12px',
        padding: '14px 16px', fontFamily: "'JetBrains Mono',monospace",
        fontSize: '0.82rem', color: '#0B1D3A', wordBreak: 'break-all',
        lineHeight: '1.5', marginBottom: '16px'
    });
    linkBox.textContent = link;

    // Button row
    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, { display: 'flex', gap: '10px' });

    const copyBtn = document.createElement('button');
    copyBtn.id = 'copy-link-btn';
    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy Link';
    Object.assign(copyBtn.style, {
        flex: '1', background: '#2B7AFF', color: '#fff', border: 'none',
        borderRadius: '12px', padding: '13px', fontWeight: '600',
        fontSize: '0.95rem', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '8px', transition: 'background 0.2s'
    });
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(link).then(() => {
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            copyBtn.style.background = '#22C55E';
            setTimeout(() => {
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy Link';
                copyBtn.style.background = '#2B7AFF';
            }, 2000);
        });
    });

    const doneBtn = document.createElement('button');
    doneBtn.textContent = 'Done';
    Object.assign(doneBtn.style, {
        flex: '1', background: '#F7F8FA', color: '#0B1D3A',
        border: '1px solid #E2E8F0', borderRadius: '12px', padding: '13px',
        fontWeight: '600', fontSize: '0.95rem', cursor: 'pointer',
        transition: 'background 0.2s'
    });
    doneBtn.addEventListener('click', () => overlay.remove());

    btnRow.append(copyBtn, doneBtn);
    card.append(closeBtn, icon, title, sub, label, linkBox, btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Click outside to close
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ── Table ─────────────────────────────────────────────────────────────────
async function loadInvites() {
    const invites = await fetchAPI('/api/super/invites');
    if (!invites) return;

    const tbody = document.getElementById('invites-body');
    const statTotal   = document.getElementById('stat-total');
    const statActive  = document.getElementById('stat-active');
    const statClaimed = document.getElementById('stat-claimed');
    const statExpired = document.getElementById('stat-expired');

    if (invites.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:40px;">No invites generated yet.</td></tr>';
        return;
    }

    statTotal.innerText   = invites.length;
    statActive.innerText  = invites.filter(i => i.status === 'active').length;
    statClaimed.innerText = invites.filter(i => i.status === 'claimed').length;
    if (statExpired) statExpired.innerText = invites.filter(i => i.status === 'expired').length;

    invites.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    tbody.innerHTML = invites.map(i => `
        <tr>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="code-pill">${esc(i.code)}</span>
                    ${i.status === 'active' ? `
                    <button data-copy-code="${esc(i.code)}" title="Copy signup link"
                        style="background:none; border:none; cursor:pointer; color:var(--electric);
                               font-size:13px; padding:4px 6px; border-radius:6px; transition:background 0.15s;">
                        <i class="fas fa-link"></i>
                    </button>` : ''}
                </div>
            </td>
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
                ${i.claimedBy
                    ? `<i class="fab fa-telegram" style="color:#0088cc; margin-right:6px"></i> ${esc(i.claimedBy)}`
                    : '<span style="color:var(--text-muted)">—</span>'}
            </td>
            <td>
                ${i.status === 'claimed' && i.telegramLinked
                    ? `<span class="status-pill" style="background:rgba(34,197,94,0.12); color:#15803D; border:1px solid rgba(34,197,94,0.25);">
                           <i class="fas fa-check-circle"></i> Activated
                       </span>`
                    : i.status === 'claimed' && !i.telegramLinked
                    ? `<span class="status-pill" style="background:rgba(245,158,11,0.12); color:#B45309; border:1px solid rgba(245,158,11,0.25);">
                           <i class="fas fa-hourglass-half"></i> Pending /claim
                       </span>`
                    : `<span style="color:var(--text-muted); font-size:0.85rem;">—</span>`}
            </td>
        </tr>
    `).join('');
}

// ── Generate ──────────────────────────────────────────────────────────────
window.generateInvite = async function() {
    const res = await fetchAPI('/api/super/invites', { method: 'POST' });
    if (res && res.success) {
        const link = res.invite.signupLink || `${location.origin}/signup?code=${res.invite.code}`;
        await loadInvites();
        showInviteModal(res.invite.code, link);
    } else if (res) {
        showError(res.error || "Failed to generate invite.");
    }
};

// ── Event delegation ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (e) => {
        // Generate invite button
        const actionEl = e.target.closest('[data-action]');
        if (actionEl && actionEl.dataset.action === 'generateInvite') {
            window.generateInvite();
            return;
        }

        // Copy signup link button in table
        const copyEl = e.target.closest('[data-copy-code]');
        if (copyEl) {
            const code = copyEl.dataset.copyCode;
            const link = `${location.origin}/signup?code=${code}`;
            navigator.clipboard.writeText(link).then(() => {
                const orig = copyEl.innerHTML;
                copyEl.innerHTML = '<i class="fas fa-check"></i>';
                copyEl.style.color = '#22C55E';
                setTimeout(() => {
                    copyEl.innerHTML = orig;
                    copyEl.style.color = '';
                }, 2000);
            });
        }
    });
});
