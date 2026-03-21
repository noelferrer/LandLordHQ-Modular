// --- Confirm Modal ---

let confirmCallback = null;

export function openConfirmModal(title, msg, type, callback) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-msg').innerText = msg;
    const icon = document.getElementById('confirm-icon');
    const btn = document.getElementById('confirm-btn');
    const cancelBtn = btn.previousElementSibling;

    cancelBtn.style.display = callback ? 'block' : 'none';
    btn.innerText = !callback ? 'Close' : type === 'danger' ? 'Confirm' : 'Proceed';

    if (type === 'danger') {
        icon.style.background = 'rgba(239, 68, 68, 0.1)';
        icon.style.color = 'var(--danger)';
        icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        btn.style.background = 'var(--danger)';
        btn.style.color = '#fff';
    } else if (type === 'success') {
        icon.style.background = 'rgba(16, 185, 129, 0.1)';
        icon.style.color = '#10b981';
        icon.innerHTML = '<i class="fas fa-check-circle"></i>';
        btn.style.background = '#10b981';
        btn.style.color = '#fff';
    } else {
        icon.style.background = 'rgba(59, 130, 246, 0.1)';
        icon.style.color = '#3b82f6';
        icon.innerHTML = '<i class="fas fa-info-circle"></i>';
        btn.style.background = '#3b82f6';
        btn.style.color = '#fff';
    }

    confirmCallback = callback;
    document.getElementById('confirm-modal').style.display = 'flex';
}

export function closeConfirmModal() {
    document.getElementById('confirm-modal').style.display = 'none';
}

// Wire up confirm button
document.getElementById('confirm-btn').onclick = () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
};

// Expose globally
window.openConfirmModal = openConfirmModal;
window.closeConfirmModal = closeConfirmModal;
