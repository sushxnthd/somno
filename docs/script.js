const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const header = document.querySelector('.site-header');
const menuButton = document.querySelector('.menu-button');
const mobileNav = document.querySelector('.mobile-nav');
const heroVisual = document.querySelector('.hero-visual');

const scrollProgress = document.createElement('div');
scrollProgress.className = 'scroll-progress';
scrollProgress.setAttribute('aria-hidden', 'true');
document.body.appendChild(scrollProgress);

let lastScrollY = window.scrollY;
let headerAnchorY = window.scrollY;
let scrollTicking = false;

const mobileMenuOpen = () => menuButton?.getAttribute('aria-expanded') === 'true';

const closeMobileMenu = () => {
  if (!mobileNav) return;
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', 'Open navigation');
  mobileNav.hidden = true;
  mobileNav.setAttribute('aria-hidden', 'true');
  mobileNav.style.display = 'none';
};

const openMobileMenu = () => {
  if (!mobileNav || !window.matchMedia('(max-width: 1040px)').matches) return;
  menuButton?.setAttribute('aria-expanded', 'true');
  menuButton?.setAttribute('aria-label', 'Close navigation');
  mobileNav.hidden = false;
  mobileNav.setAttribute('aria-hidden', 'false');
  mobileNav.style.display = 'grid';
};

closeMobileMenu();

const updateScrollUI = () => {
  const y = Math.max(0, window.scrollY);
  const delta = y - lastScrollY;
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = Math.min(1, y / maxScroll);

  scrollProgress.style.transform = `scaleX(${progress})`;
  header?.classList.toggle('scrolled', y > 18);

  if (header) {
    if (y < 96 || mobileMenuOpen()) {
      header.classList.remove('header-hidden');
      header.classList.add('header-visible');
      headerAnchorY = y;
    } else if (delta > 0 && y > 180 && y - headerAnchorY > 72) {
      header.classList.add('header-hidden');
      header.classList.remove('header-visible');
      headerAnchorY = y;
    } else if (delta < 0 && headerAnchorY - y > 30) {
      header.classList.remove('header-hidden');
      header.classList.add('header-visible');
      headerAnchorY = y;
    } else if ((delta > 0 && y < headerAnchorY) || (delta < 0 && y > headerAnchorY)) {
      headerAnchorY = y;
    }
  }

  lastScrollY = y;
  scrollTicking = false;
};

const requestScrollUpdate = () => {
  if (scrollTicking) return;
  scrollTicking = true;
  window.requestAnimationFrame(updateScrollUI);
};

updateScrollUI();
window.addEventListener('scroll', requestScrollUpdate, { passive: true });

menuButton?.addEventListener('click', () => {
  if (mobileMenuOpen()) closeMobileMenu();
  else openMobileMenu();
  header?.classList.remove('header-hidden');
  header?.classList.add('header-visible');
});

mobileNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', closeMobileMenu);
});

window.addEventListener('resize', () => {
  if (!window.matchMedia('(max-width: 1040px)').matches) closeMobileMenu();
}, { passive: true });

const revealItems = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window && !reduceMotion) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -30px' });

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('visible'));
}

if (heroVisual && !reduceMotion && window.matchMedia('(pointer:fine)').matches) {
  heroVisual.addEventListener('pointermove', (event) => {
    const rect = heroVisual.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 16;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 14;
    heroVisual.style.setProperty('--hero-x', `${x.toFixed(2)}px`);
    heroVisual.style.setProperty('--hero-y', `${y.toFixed(2)}px`);
  });

  heroVisual.addEventListener('pointerleave', () => {
    heroVisual.style.setProperty('--hero-x', '0px');
    heroVisual.style.setProperty('--hero-y', '0px');
  });
}

const animateNumber = (element, target, suffix = '', duration = 900) => {
  if (reduceMotion) {
    element.textContent = `${target}${suffix}`;
    return;
  }

  const start = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    element.textContent = `${Math.round(target * eased)}${suffix}`;
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

const heroMeta = document.querySelector('.hero-meta');
if (heroMeta && 'IntersectionObserver' in window) {
  const metaObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const values = entry.target.querySelectorAll('strong');
      values.forEach((value) => {
        const text = value.textContent.trim();
        if (/^\d+$/.test(text)) animateNumber(value, Number(text), '', 700);
        if (/^\d+%$/.test(text)) animateNumber(value, Number(text.replace('%', '')), '%', 1100);
      });
      metaObserver.disconnect();
    });
  }, { threshold: 0.45 });
  metaObserver.observe(heroMeta);
}

const screenMap = {
  result: {
    src: 'https://raw.githubusercontent.com/sushxnthd/somno/main/listing/play/result.png',
    alt: 'Somno SDI result screen'
  },
  recovery: {
    src: 'https://raw.githubusercontent.com/sushxnthd/somno/main/listing/play/recovery.png',
    alt: 'Somno recovery screen'
  },
  alarms: {
    src: 'https://raw.githubusercontent.com/sushxnthd/somno/main/listing/play/alarms.png',
    alt: 'Somno Smart Wake alarm screen'
  }
};

const featureScreen = document.querySelector('#feature-screen');
const featureLines = document.querySelectorAll('.feature-line');
let activeScreen = 'result';

const setFeatureScreen = (line, key) => {
  const next = screenMap[key];
  if (!next || !featureScreen || key === activeScreen) return;

  activeScreen = key;
  featureLines.forEach((item) => item.classList.remove('active'));
  line.classList.add('active');
  featureScreen.classList.add('changing');

  const preload = new Image();
  preload.src = next.src;
  preload.onload = () => {
    window.setTimeout(() => {
      featureScreen.src = next.src;
      featureScreen.alt = next.alt;
      featureScreen.classList.remove('changing');
      featureScreen.classList.remove('screen-enter');
      void featureScreen.offsetWidth;
      featureScreen.classList.add('screen-enter');
    }, reduceMotion ? 0 : 120);
  };
};

featureLines.forEach((line) => {
  line.setAttribute('tabindex', '0');
  line.setAttribute('role', 'button');

  line.addEventListener('click', () => setFeatureScreen(line, line.dataset.screen));
  line.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setFeatureScreen(line, line.dataset.screen);
    }
  });
});

(function sdiLabRuntime() {
  const lab = document.querySelector('#sdi-lab');
  if (!lab) return;

  const $ = (id) => document.getElementById(id);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const controls = {
    pvtOn: $('lab-pvt-on'),
    pvtZ: $('lab-pvt-z'),
    pvtTrials: $('lab-pvt-trials'),
    faceOn: $('lab-face-on'),
    faceZ: $('lab-face-z'),
    faceFull: $('lab-face-full'),
    kssOn: $('lab-kss-on'),
    kss: $('lab-kss'),
    debtOn: $('lab-debt-on'),
    debt: $('lab-debt')
  };
  const base = { pvt: 0.40, face: 0.25, kss: 0.15, debt: 0.20 };

  const render = () => {
    const pvtZ = Number(controls.pvtZ.value);
    const pvtTrials = Number(controls.pvtTrials.value);
    const faceZ = Number(controls.faceZ.value);
    const kss = Number(controls.kss.value);
    const debtHours = Number(controls.debt.value);

    $('lab-pvt-z-out').textContent = pvtZ.toFixed(1);
    $('lab-pvt-trials-out').textContent = String(pvtTrials);
    $('lab-face-z-out').textContent = faceZ.toFixed(1);
    $('lab-kss-out').textContent = String(kss);
    $('lab-debt-out').textContent = debtHours.toFixed(1);

    const precision = {
      pvt: clamp(pvtTrials / 9, 0.5, 1),
      face: controls.faceFull.checked ? 1 : 0.6
    };

    const raw = {
      pvt: controls.pvtOn.checked ? { z: pvtZ, w: base.pvt * precision.pvt } : null,
      face: controls.faceOn.checked ? { z: faceZ, w: base.face * precision.face } : null,
      kss: controls.kssOn.checked ? { z: (5 - kss) * 0.5, w: base.kss } : null,
      debt: controls.debtOn.checked ? { z: clamp(-(debtHours / 2), -3, 3), w: base.debt } : null
    };

    const active = Object.entries(raw).filter(([, value]) => value);
    const weightSum = active.reduce((sum, [, value]) => sum + value.w, 0);
    const normalized = {};

    Object.entries(raw).forEach(([key, value]) => {
      if (!value || weightSum === 0) {
        normalized[key] = { enabled: false, z: 0, w: 0, term: 0 };
        return;
      }
      const w = value.w / weightSum;
      normalized[key] = { enabled: true, z: value.z, w, term: w * value.z };
    });

    const weighted = Object.values(normalized).reduce((sum, item) => sum + item.term, 0);
    const count = active.length;
    const score = count === 0 ? 50 : clamp(Math.round(50 + 10 * weighted), 0, 100);
    const confidence = count >= 4 ? 'high' : count >= 2 ? 'medium' : 'low';

    $('lab-sdi').textContent = String(score);
    $('lab-confidence').textContent = `${confidence} confidence`;
    $('lab-count').textContent = `${count} signal${count === 1 ? '' : 's'}`;
    $('lab-equation').textContent = `50 + 10 × ${weighted.toFixed(3)} = ${score}`;

    ['pvt', 'face', 'kss', 'debt'].forEach((key) => {
      const row = lab.querySelector(`[data-row="${key}"]`);
      const block = lab.querySelector(`[data-signal="${key}"]`);
      const item = normalized[key];
      row.classList.toggle('is-off', !item.enabled);
      block.classList.toggle('is-off', !raw[key]);
      row.querySelector('[data-z]').textContent = item.enabled ? item.z.toFixed(2) : '—';
      row.querySelector('[data-weight]').textContent = item.enabled ? `${(item.w * 100).toFixed(1)}%` : '—';
      row.querySelector('[data-term]').textContent = item.enabled ? item.term.toFixed(3) : '—';
    });

    const notes = [];
    const missing = Object.entries(raw).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length) notes.push(`missing channels are removed and the remaining weights renormalize to 100%`);
    if (raw.pvt && precision.pvt < 1) notes.push(`reaction precision is ${(precision.pvt * 100).toFixed(0)}% at ${pvtTrials} trials`);
    if (raw.face && precision.face < 1) notes.push(`face precision is 60% without full ocular measures`);
    $('lab-status').textContent = notes.length ? notes.join('; ') + '.' : 'All four channels are active at full precision.';
  };

  Object.values(controls).forEach((control) => {
    control.addEventListener('input', render);
    control.addEventListener('change', render);
  });

  render();
})();

const navLinks = [...document.querySelectorAll('.desktop-nav a[href^="#"], .mobile-nav a[href^="#"]')];
const navSectionIds = [...new Set(navLinks.map((link) => link.getAttribute('href')).filter(Boolean))];
const navSections = navSectionIds
  .map((id) => document.querySelector(id))
  .filter(Boolean)
  .sort((a, b) => a.offsetTop - b.offsetTop);

let activeNavId = null;

const setActiveNav = (id) => {
  if (activeNavId === id) return;
  activeNavId = id;
  navLinks.forEach((link) => {
    const active = link.getAttribute('href') === id;
    link.classList.toggle('nav-active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
};

const updateActiveNav = () => {
  if (!navSections.length) return;

  const headerHeight = header?.offsetHeight ?? 78;
  const marker = window.scrollY + headerHeight + Math.min(window.innerHeight * 0.22, 170);
  const firstTop = navSections[0].offsetTop;

  if (marker < firstTop) {
    setActiveNav(null);
    return;
  }

  let current = navSections[0];
  for (const section of navSections) {
    if (section.offsetTop <= marker) current = section;
    else break;
  }

  // At the bottom of the page, keep the last navigable section selected.
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
    current = navSections[navSections.length - 1];
  }

  setActiveNav(`#${current.id}`);
};

navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    const id = link.getAttribute('href');
    if (id?.startsWith('#')) setActiveNav(id);
    header?.classList.remove('header-hidden');
    header?.classList.add('header-visible');
    headerAnchorY = window.scrollY;
  });
});

updateActiveNav();
window.addEventListener('scroll', updateActiveNav, { passive: true });
window.addEventListener('resize', updateActiveNav, { passive: true });

const magneticButtons = document.querySelectorAll('.button');
if (!reduceMotion && window.matchMedia('(pointer:fine)').matches) {
  magneticButtons.forEach((button) => {
    button.addEventListener('pointermove', (event) => {
      const rect = button.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) * 0.08;
      const y = (event.clientY - rect.top - rect.height / 2) * 0.11;
      button.style.transform = `translate3d(${x}px, ${y - 2}px, 0)`;
    });

    button.addEventListener('pointerleave', () => {
      button.style.transform = '';
    });
  });
}
