// --- Login page logic (extracted from inline <script>) ---

const inputs = document.querySelectorAll('.otp-box');

// --- Event Listeners Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Step 1: Username Input & Continue Button
    const usernameInput = document.getElementById('username');
    const continueBtn = document.getElementById('btn-continue');

    usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') requestOtp();
    });
    continueBtn.addEventListener('click', requestOtp);

    // Step 2: Back & Resend Links
    document.getElementById('link-back').addEventListener('click', goBack);
    document.getElementById('link-resend').addEventListener('click', requestOtp);

    // Verify Button
    document.getElementById('btn-verify').addEventListener('click', verifyOtp);
});

inputs.forEach((input, index) => {
    // Toggle filled class
    function toggleFilled() {
        if (input.value.length > 0) {
            input.classList.add('filled');
        } else {
            input.classList.remove('filled');
        }
    }

    input.addEventListener('input', toggleFilled);

    input.addEventListener('keyup', function(e) {
        toggleFilled();
        if(e.key >= 0 && e.key <= 9 && index < inputs.length - 1) {
            inputs[index + 1].focus();
        } else if(e.key === 'Backspace' && index > 0 && !this.value) {
            inputs[index - 1].focus();
        } else if(e.key === 'Enter') {
            verifyOtp();
        }
    });
    // Handle pasting 6 digits
    input.addEventListener('paste', function(e) {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').slice(0, 6).replace(/[^0-9]/g, '');
        if (pastedData) {
            for (let i = 0; i < pastedData.length; i++) {
                inputs[i].value = pastedData[i];
                inputs[i].classList.add('filled');
            }
            if (pastedData.length === 6) {
                inputs[5].focus();
                verifyOtp();
            } else {
                inputs[pastedData.length].focus();
            }
        }
    });
});

async function requestOtp() {
    const username = document.getElementById('username').value;
    if(!username) return;

    const btn = document.getElementById('btn-continue');
    const err = document.getElementById('step1-error');

    err.style.display = 'none';
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-icon').style.display = 'none';
    btn.querySelector('.loading-spinner').style.display = 'block';

    try {
        const res = await fetch('/api/auth/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('step1').style.display = 'none';
            document.getElementById('step2').style.display = 'block';
            inputs[0].focus();
        } else {
            err.innerText = data.error || "Failed to send code.";
            err.style.display = 'block';
        }
    } catch (error) {
        err.innerText = "Network error. Try again.";
        err.style.display = 'block';
    } finally {
        btn.querySelector('.btn-text').style.display = 'inline';
        btn.querySelector('.btn-icon').style.display = 'inline';
        btn.querySelector('.loading-spinner').style.display = 'none';
    }
}

async function verifyOtp() {
    let code = Array.from(inputs).map(i => i.value).join('');
    if(code.length !== 6) return;

    const btn = document.getElementById('btn-verify');
    const err = document.getElementById('step2-error');

    err.style.display = 'none';
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.loading-spinner').style.display = 'block';

    try {
        const username = document.getElementById('username').value;
        const res = await fetch('/api/auth/verify', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, username })
        });
        const data = await res.json();

        if (data.success) {
            window.location.href = '/';
        } else {
            err.innerText = data.error || "Invalid code.";
            err.style.display = 'block';
            inputs.forEach(i => i.value = '');
            inputs[0].focus();
        }
    } catch (error) {
        err.innerText = "Network error. Try again.";
        err.style.display = 'block';
    } finally {
        btn.querySelector('.btn-text').style.display = 'inline';
        btn.querySelector('.loading-spinner').style.display = 'none';
    }
}

function goBack() {
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step1').style.display = 'block';
}

// Auto-redirect if already logged in (cookie-based)
fetch('/api/auth/check', { credentials: 'include' })
    .then(res => { if (res.ok) window.location.href = '/'; })
    .catch(() => {});
