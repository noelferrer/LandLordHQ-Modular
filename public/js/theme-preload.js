// Early dark-mode preload — prevents flash of light theme on page load
if (localStorage.getItem('landlordHQ_theme') === 'dark') {
    document.documentElement.classList.add('preload-dark');
}
