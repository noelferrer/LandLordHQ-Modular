// --- Signup page logic (extracted from inline <script>) ---

async function submitRegistration() {
    const code = document.getElementById('code').value.trim();
    const name = document.getElementById('name').value.trim();
    const username = document.getElementById('username').value.trim().toLowerCase();

    const btn = document.getElementById('btn-submit');
    const err = document.getElementById('error-msg');

    err.style.display = 'none';
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.loading-spinner').style.display = 'block';
    btn.disabled = true;

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, name, username })
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('register-form').style.display = 'none';
            document.getElementById('claim-command').innerText = `/claim ${username}`;
            document.getElementById('success-state').style.display = 'block';
        } else if (data.pendingClaim) {
            // Account already created but Telegram not linked yet — re-show claim instructions
            document.getElementById('register-form').style.display = 'none';
            document.getElementById('claim-command').innerText = `/claim ${data.username}`;
            document.getElementById('success-state').style.display = 'block';
        } else {
            err.innerText = data.error || "Registration failed.";
            err.style.display = 'block';
        }
    } catch (error) {
        err.innerText = "Network error. Try again.";
        err.style.display = 'block';
    } finally {
        btn.querySelector('.btn-text').style.display = 'inline';
        btn.querySelector('.loading-spinner').style.display = 'none';
        btn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Auto-fill invite code from ?code= URL param
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam) {
        const input = document.getElementById('code');
        if (input) {
            input.value = codeParam;
            input.readOnly = true;
            input.style.background = '#F3F4F6';
            input.style.color = '#6B7280';
            input.style.cursor = 'default';
        }
    }

    const form = document.getElementById('register-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            submitRegistration();
        });
    }
});
