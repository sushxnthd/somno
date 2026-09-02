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

const evidenceData = {
  pvt: {
    kicker: 'Psychomotor vigilance',
    title: 'Sleep loss shows up in response speed.',
    body: 'Brief psychomotor vigilance testing has been studied as a practical way to retain sensitivity to sleep-loss-related changes in attention. Somno uses the same measurement family to track response speed, lapses, anticipations and variability against a personal baseline.',
    factOne: 'Reaction speed, lapses and sustained attention',
    factTwo: 'Highest-weight behavioral input in the SDI',
    source: 'https://pubmed.ncbi.nlm.nih.gov/22025811/',
    scopeLabel: 'PVT signal',
    scopeValue: 'response speed + lapses'
  },
  kss: {
    kicker: 'Subjective sleepiness',
    title: 'Perceived sleepiness carries measurable information.',
    body: 'The Karolinska Sleepiness Scale is widely used in sleep research. Kaida and colleagues reported relationships between KSS ratings and behavioral plus EEG measures of sleepiness, giving Somno a compact subjective signal that complements its objective channels.',
    factOne: 'Self-reported momentary sleepiness on a 1 to 9 scale',
    factTwo: 'Independent subjective channel inside multimodal fusion',
    source: 'https://pubmed.ncbi.nlm.nih.gov/16679057/',
    scopeLabel: 'KSS signal',
    scopeValue: 'subjective state + context'
  },
  ocular: {
    kicker: 'Ocular fatigue markers',
    title: 'The eyes reveal changes in vigilance.',
    body: 'Controlled fatigue research has linked eyelid closure measures such as PERCLOS with degraded visual attention. Somno extends that evidence family with on-device temporal and geometric features, including closure behavior, eye geometry, motion and photometric quality.',
    factOne: 'Eyelid closure and ocular behavior under fatigue',
    factTwo: 'Quality-gated visual signal processed on-device',
    source: 'https://rosap.ntl.bts.gov/view/dot/2518',
    scopeLabel: 'Ocular signal',
    scopeValue: 'closure + geometry + motion'
  },
  performance: {
    kicker: 'Sleep and performance',
    title: 'Sleep debt reaches beyond feeling tired.',
    body: 'A 2024 meta-analysis reported that acute sleep deprivation can impair overall athletic performance across multiple performance domains. Somno brings recent sleep shortfall together with cognitive speed and perceived fatigue to build a broader recovery picture.',
    factOne: 'Cognitive and physical performance under sleep loss',
    factTwo: 'Longitudinal sleep history and recovery context',
    source: 'https://pubmed.ncbi.nlm.nih.gov/39006249/',
    scopeLabel: 'Performance signal',
    scopeValue: 'sleep loss + readiness context'
  }
};

const evidenceConsole = document.querySelector('#evidence-console');
const evidenceTabs = [...document.querySelectorAll('.evidence-tab')];
const evidenceCopy = document.querySelector('#evidence-copy');
const evidenceKicker = document.querySelector('#evidence-kicker');
const evidenceTitle = document.querySelector('#evidence-title');
const evidenceBody = document.querySelector('#evidence-body');
const evidenceFactOne = document.querySelector('#evidence-fact-one');
const evidenceFactTwo = document.querySelector('#evidence-fact-two');
const evidenceSource = document.querySelector('#evidence-source');
const evidenceScopeLabel = document.querySelector('#evidence-scope-label');
const evidenceScopeValue = document.querySelector('#evidence-scope-value');
let evidenceIndex = 0;
let evidenceTimer = null;
let evidenceHasInteraction = false;

const setEvidence = (key, userInitiated = false) => {
  const next = evidenceData[key];
  if (!next) return;

  if (userInitiated) evidenceHasInteraction = true;

  evidenceTabs.forEach((tab, index) => {
    const active = tab.dataset.evidence === key;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    if (active) evidenceIndex = index;
  });

  evidenceCopy?.classList.remove('is-switching');
  if (evidenceCopy && !reduceMotion) {
    void evidenceCopy.offsetWidth;
    evidenceCopy.classList.add('is-switching');
  }

  if (evidenceKicker) evidenceKicker.textContent = next.kicker;
  if (evidenceTitle) evidenceTitle.textContent = next.title;
  if (evidenceBody) evidenceBody.textContent = next.body;
  if (evidenceFactOne) evidenceFactOne.textContent = next.factOne;
  if (evidenceFactTwo) evidenceFactTwo.textContent = next.factTwo;
  if (evidenceSource) evidenceSource.href = next.source;
  if (evidenceScopeLabel) evidenceScopeLabel.textContent = next.scopeLabel;
  if (evidenceScopeValue) evidenceScopeValue.textContent = next.scopeValue;
};

evidenceTabs.forEach((tab) => {
  tab.addEventListener('click', () => setEvidence(tab.dataset.evidence, true));
  tab.addEventListener('focus', () => {
    evidenceHasInteraction = true;
  });
});

const startEvidenceCycle = () => {
  if (reduceMotion || !evidenceConsole || evidenceTimer) return;
  evidenceTimer = window.setInterval(() => {
    if (evidenceHasInteraction || document.hidden) return;
    evidenceIndex = (evidenceIndex + 1) % evidenceTabs.length;
    setEvidence(evidenceTabs[evidenceIndex]?.dataset.evidence);
  }, 5200);
};

if (evidenceConsole && 'IntersectionObserver' in window) {
  const evidenceObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      startEvidenceCycle();
      evidenceObserver.disconnect();
    }
  }, { threshold: 0.35 });
  evidenceObserver.observe(evidenceConsole);
}

if (evidenceConsole && !reduceMotion && window.matchMedia('(pointer:fine)').matches) {
  const scope = evidenceConsole.querySelector('.evidence-scope');
  evidenceConsole.addEventListener('pointermove', (event) => {
    if (!scope) return;
    const rect = evidenceConsole.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 4;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 4;
    scope.style.transform = `perspective(800px) rotateX(${-y}deg) rotateY(${x}deg)`;
  });
  evidenceConsole.addEventListener('pointerleave', () => {
    if (scope) scope.style.transform = '';
  });
}

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
