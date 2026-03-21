// --- Settings Module ---
import { API_URL, csrfHeaders } from '../core/api.js';

export const SettingsModule = {
    id: 'settings',
    label: 'Settings',
    icon: 'fas fa-cog',
    order: 6,
    titleText: 'System Configuration',
    subtitleText: 'Customize reminder logic and bot behavior',
    headerTools: null,
    onActivate: null,
};

async function saveSettings() {
    const settings = {
        rent_reminder_days_before: parseInt(document.getElementById('remind-days').value),
        currency: document.getElementById('currency').value,
        fixer_id: document.getElementById('fixer-id').value,
        start_text: document.getElementById('start-text').value,
        rules_text: document.getElementById('rules-text').value,
        clearance_text: document.getElementById('clearance-text').value
    };
    window.openConfirmModal('Save Settings', 'Are you sure you want to update the system settings?', 'info', async () => {
        try {
            const res = await fetch(`${API_URL}/settings`, { method: 'POST', credentials: 'include', headers: { ...csrfHeaders() }, body: JSON.stringify(settings) });
            if (res.ok) {
                window.openConfirmModal('Saved!', 'Core Settings Updated & Saved', 'success');
                window.refreshDashboard();
            } else {
                const err = await res.json();
                window.openConfirmModal('Error', err.error || 'Failed to save settings. Please check your inputs.', 'danger');
            }
        } catch (err) {
            console.error(err);
            window.openConfirmModal('Error', 'A network error occurred. Please try again.', 'danger');
        }
    });
}

// Expose globally
window.saveSettings = saveSettings;
