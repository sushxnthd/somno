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
let scrollTicking = false;

const mobileMenuOpen = () => menuButton?.getAttribute('aria-expanded') === 'true';

const closeMobileMenu = () => {
  if (!mobileNav) return;
  menuButton?.setAttribute('aria-expanded', 'false');
  mobileNav.hidden = true;
  mobileNav.setAttribute('aria-hidden', 'true');
  mobileNav.style.display = 'none';
};

const openMobileMenu = () => {
  if (!mobileNav || !window.matchMedia('(max-width: 720px)').matches) return;
  menuButton?.setAttribute('aria-expanded', 'true');
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
    if (y < 80 || mobileMenuOpen()) {
      header.classList.remove('header-hidden');
      header.classList.add('header-visible');
    } else if (delta > 7 && y > 120) {
      header.classList.add('header-hidden');
      header.classList.remove('header-visible');
    } else if (delta < -5) {
      header.classList.remove('header-hidden');
      header.classList.add('header-visible');
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
  if (!window.matchMedia('(max-width: 720px)').matches) closeMobileMenu();
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

(function setupModelInspector() {
  const modelInspector = document.querySelector('#model-inspector');

  if (modelInspector) {
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const byId = (id) => document.getElementById(id);

    const controls = {
      pvtEnabled: byId('model-pvt-enabled'),
      pvtZ: byId('model-pvt-z'),
      pvtTrials: byId('model-pvt-trials'),
      faceEnabled: byId('model-face-enabled'),
      faceZ: byId('model-face-z'),
      faceOcular: byId('model-face-ocular'),
      kssEnabled: byId('model-kss-enabled'),
      kss: byId('model-kss'),
      debtEnabled: byId('model-debt-enabled'),
      debt: byId('model-debt'),
    };

    const outputs = {
      pvtZ: byId('model-pvt-z-out'),
      pvtTrials: byId('model-pvt-trials-out'),
      faceZ: byId('model-face-z-out'),
      kss: byId('model-kss-out'),
      debt: byId('model-debt-out'),
      sdi: byId('model-sdi'),
      confidence: byId('model-confidence'),
      signalsUsed: byId('model-signals-used'),
      equation: byId('model-equation'),
      note: byId('model-note'),
    };

    const baseWeights = { pvt: 0.40, face: 0.25, kss: 0.15, debt: 0.20 };

    const presets = {
      baseline: {
        pvtEnabled: true, pvtZ: 0, pvtTrials: 9,
        faceEnabled: true, faceZ: 0, faceOcular: true,
        kssEnabled: true, kss: 5,
        debtEnabled: true, debt: 0,
      },
      'short-sleep': {
        pvtEnabled: true, pvtZ: -1.1, pvtTrials: 9,
        faceEnabled: true, faceZ: -0.7, faceOcular: true,
        kssEnabled: true, kss: 7,
        debtEnabled: true, debt: 3.5,
      },
      'no-face': {
        pvtEnabled: true, pvtZ: -0.6, pvtTrials: 9,
        faceEnabled: false, faceZ: 0, faceOcular: true,
        kssEnabled: true, kss: 6,
        debtEnabled: true, debt: 2,
      },
      alarm: {
        pvtEnabled: true, pvtZ: -0.9, pvtTrials: 5,
        faceEnabled: true, faceZ: -0.4, faceOcular: false,
        kssEnabled: true, kss: 7,
        debtEnabled: true, debt: 2.5,
      },
    };

    const valueOf = (el) => Number(el?.value ?? 0);
    const checked = (el) => Boolean(el?.checked);

    const setControlState = () => {
      ['pvt', 'face', 'kss', 'debt'].forEach((key) => {
        const enabled = checked(controls[`${key}Enabled`]);
        modelInspector.querySelector(`.signal-control[data-signal="${key}"]`)?.classList.toggle('is-disabled', !enabled);
      });
    };

    const rowFor = (key) => modelInspector.querySelector(`.contribution-row[data-output="${key}"]`);

    const renderRow = (key, z, weight, contribution, enabled) => {
      const row = rowFor(key);
      if (!row) return;
      row.classList.toggle('is-off', !enabled);
      const zCell = row.querySelector('.z-value');
      const weightCell = row.querySelector('.weight-cell');
      const weightText = row.querySelector('.weight-cell b');
      const contributionCell = row.querySelector('.contribution-value');
      if (zCell) zCell.textContent = enabled ? z.toFixed(2) : '—';
      if (weightCell) weightCell.style.setProperty('--weight', `${Math.max(0, weight * 100)}%`);
      if (weightText) weightText.textContent = enabled ? `${(weight * 100).toFixed(1)}%` : '0.0%';
      if (contributionCell) contributionCell.textContent = enabled ? contribution.toFixed(3) : '—';
    };

    const updateModelInspector = () => {
      setControlState();

      const pvtZ = valueOf(controls.pvtZ);
      const pvtTrials = valueOf(controls.pvtTrials);
      const faceZ = valueOf(controls.faceZ);
      const kss = valueOf(controls.kss);
      const debtHours = valueOf(controls.debt);

      if (outputs.pvtZ) outputs.pvtZ.textContent = `${pvtZ.toFixed(1)} z`;
      if (outputs.pvtTrials) outputs.pvtTrials.textContent = `${pvtTrials} / 9`;
      if (outputs.faceZ) outputs.faceZ.textContent = `${faceZ.toFixed(1)} z`;
      if (outputs.kss) outputs.kss.textContent = `${kss} / 9`;
      if (outputs.debt) outputs.debt.textContent = `${debtHours.toFixed(1)} h`;

      const precision = {
        pvt: clamp(pvtTrials / 9, 0.5, 1),
        face: checked(controls.faceOcular) ? 1 : 0.6,
      };

      const raw = {
        pvt: checked(controls.pvtEnabled) ? { z: pvtZ, w: baseWeights.pvt * precision.pvt } : null,
        face: checked(controls.faceEnabled) ? { z: faceZ, w: baseWeights.face * precision.face } : null,
        kss: checked(controls.kssEnabled) ? { z: (5 - kss) * 0.5, w: baseWeights.kss } : null,
        debt: checked(controls.debtEnabled) ? { z: clamp(-(debtHours / 2), -3, 3), w: baseWeights.debt } : null,
      };

      const activeEntries = Object.entries(raw).filter(([, item]) => item);
      const weightSum = activeEntries.reduce((sum, [, item]) => sum + item.w, 0);
      const normalized = {};

      Object.entries(raw).forEach(([key, item]) => {
        if (!item || weightSum <= 0) {
          normalized[key] = { z: item?.z ?? 0, weight: 0, contribution: 0, enabled: Boolean(item) };
          return;
        }
        const weight = item.w / weightSum;
        normalized[key] = { z: item.z, weight, contribution: weight * item.z, enabled: true };
      });

      const weighted = Object.values(normalized).reduce((sum, item) => sum + item.contribution, 0);
      const signalsUsed = activeEntries.length;
      const sdi = signalsUsed === 0 ? 50 : clamp(Math.round(50 + 10 * weighted), 0, 100);
      const confidence = signalsUsed >= 4 ? 'High' : signalsUsed >= 2 ? 'Medium' : 'Low';

      if (outputs.sdi) outputs.sdi.textContent = String(sdi);
      if (outputs.confidence) outputs.confidence.textContent = `${confidence} confidence`;
      if (outputs.signalsUsed) outputs.signalsUsed.textContent = `${signalsUsed} signal${signalsUsed === 1 ? '' : 's'} used`;
      if (outputs.equation) outputs.equation.textContent = `50 + 10 × ${weighted.toFixed(3)} = ${sdi}`;

      ['pvt', 'face', 'kss', 'debt'].forEach((key) => {
        const item = normalized[key];
        renderRow(key, item.z, item.weight, item.contribution, item.enabled);
      });

      const omissions = ['pvt', 'face', 'kss', 'debt'].filter((key) => !raw[key]);
      const qualityAdjustments = [];
      if (raw.pvt && precision.pvt < 1) qualityAdjustments.push(`PVT precision is ${(precision.pvt * 100).toFixed(0)}% because this run has ${pvtTrials} trials`);
      if (raw.face && precision.face < 1) qualityAdjustments.push('the face channel is at 60% precision because full ocular measures are unavailable');

      let note;
      if (signalsUsed === 0) {
        note = 'No signal is enabled, so the engine returns the neutral fallback score of 50 with low confidence.';
      } else if (!omissions.length && !qualityAdjustments.length) {
        note = 'All four signals are available at full precision, so the base weights remain 40 / 25 / 15 / 20.';
      } else {
        const parts = [];
        if (omissions.length) parts.push(`Missing ${omissions.join(', ')} ${omissions.length === 1 ? 'is' : 'are'} removed, then the remaining weights are renormalized to 100%`);
        if (qualityAdjustments.length) parts.push(qualityAdjustments.join(' and '));
        note = `${parts.join('. ')}.`;
      }
      if (outputs.note) outputs.note.textContent = note;

      modelInspector.querySelectorAll('.model-preset').forEach((button) => button.classList.remove('active'));
    };

    const applyPreset = (name) => {
      const preset = presets[name];
      if (!preset) return;
      controls.pvtEnabled.checked = preset.pvtEnabled;
      controls.pvtZ.value = String(preset.pvtZ);
      controls.pvtTrials.value = String(preset.pvtTrials);
      controls.faceEnabled.checked = preset.faceEnabled;
      controls.faceZ.value = String(preset.faceZ);
      controls.faceOcular.checked = preset.faceOcular;
      controls.kssEnabled.checked = preset.kssEnabled;
      controls.kss.value = String(preset.kss);
      controls.debtEnabled.checked = preset.debtEnabled;
      controls.debt.value = String(preset.debt);
      updateModelInspector();
      modelInspector.querySelector(`.model-preset[data-preset="${name}"]`)?.classList.add('active');
    };

    Object.values(controls).forEach((control) => {
      control?.addEventListener('input', updateModelInspector);
      control?.addEventListener('change', updateModelInspector);
    });

    modelInspector.querySelectorAll('.model-preset').forEach((button) => {
      button.addEventListener('click', () => applyPreset(button.dataset.preset));
    });

    applyPreset('baseline');
  }
})();

const navLinks = document.querySelectorAll('.desktop-nav a[href^="#"], .mobile-nav a[href^="#"]');
const sections = [...navLinks]
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if ('IntersectionObserver' in window && sections.length) {
  const sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;
    const id = `#${visible.target.id}`;
    navLinks.forEach((link) => {
      const active = link.getAttribute('href') === id;
      link.classList.toggle('nav-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }, { threshold: [0.22, 0.4, 0.6], rootMargin: '-18% 0px -48% 0px' });

  sections.forEach((section) => sectionObserver.observe(section));
}

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
