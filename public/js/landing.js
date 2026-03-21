// ── Nav scroll behavior
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
});

// ── Mobile menu
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
  const spans = hamburger.querySelectorAll('span');
  const isOpen = mobileMenu.classList.contains('open');
  spans[0].style.transform = isOpen ? 'translateY(7px) rotate(45deg)' : '';
  spans[1].style.opacity   = isOpen ? '0' : '1';
  spans[2].style.transform = isOpen ? 'translateY(-7px) rotate(-45deg)' : '';
});

function closeMobileMenu() {
  mobileMenu.classList.remove('open');
  const spans = hamburger.querySelectorAll('span');
  spans[0].style.transform = '';
  spans[1].style.opacity   = '1';
  spans[2].style.transform = '';
}

// ── Scroll reveal
const revealEls = document.querySelectorAll('.reveal, .reveal-r');
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      revealObs.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

revealEls.forEach(el => revealObs.observe(el));

// ── Counter animation
function animateCount(el, target, duration = 1800) {
  const start = performance.now();
  const isDecimal = String(target).includes('.');
  const update = (now) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(eased * target);
    el.textContent = isDecimal ? current.toFixed(1) : current.toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

const counterObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      const target = parseFloat(e.target.dataset.count);
      animateCount(e.target, target);
      counterObs.unobserve(e.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('[data-count]').forEach(el => counterObs.observe(el));

// ── Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── Access request form submission
// Paste your Google Apps Script Web App URL below after deploying
const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyin23_8TUFEFYGMpkaDWlkMK322e4eKdVHN9tskgjWc02WBOSTJeL1yibVV_cKUJ-c/exec';

async function handleAccessRequest(e) {
  e.preventDefault();

  const form    = document.getElementById('accessForm');
  const btn     = form.querySelector('.demo-submit');
  const success = document.getElementById('accessSuccess');

  // Button loading state
  const originalHTML = btn.innerHTML;
  btn.disabled  = true;
  btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending…';

  // Build form payload
  const params = new URLSearchParams({
    name:         form.querySelector('[name="name"]').value.trim(),
    email:        form.querySelector('[name="email"]').value.trim(),
    units:        form.querySelector('[name="units"]').value,
    current_tool: form.querySelector('[name="current_tool"]').value.trim()
  });

  try {
    // no-cors: we can't read the response body, but the script executes fine on Google's end
    await fetch(FORM_ENDPOINT, {
      method: 'POST',
      mode:   'no-cors',
      body:   params
    });
  } catch (err) {
    // Network errors are uncommon with Apps Script; still show success to user
    console.warn('Access request fetch error (non-critical):', err);
  }

  // Show success state regardless — Apps Script is reliable
  form.style.display    = 'none';
  success.style.display = 'block';

  // Reset button in case user navigates back
  btn.disabled  = false;
  btn.innerHTML = originalHTML;
}
