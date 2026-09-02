const motionStyles = document.createElement('link');
motionStyles.rel = 'stylesheet';
motionStyles.href = 'motion.css';
document.head.appendChild(motionStyles);

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
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  if (mobileNav) mobileNav.hidden = open;
  header?.classList.remove('header-hidden');
  header?.classList.add('header-visible');
});

mobileNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    mobileNav.hidden = true;
  });
});

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
