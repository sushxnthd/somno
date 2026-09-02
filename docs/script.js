const header = document.querySelector('.site-header');
const menuButton = document.querySelector('.menu-button');
const mobileNav = document.querySelector('.mobile-nav');

const updateHeader = () => {
  header?.classList.toggle('scrolled', window.scrollY > 12);
};

updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  if (mobileNav) mobileNav.hidden = open;
});

mobileNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    mobileNav.hidden = true;
  });
});

const revealItems = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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

featureLines.forEach((line) => {
  line.addEventListener('click', () => {
    const key = line.dataset.screen;
    const next = screenMap[key];
    if (!next || !featureScreen) return;

    featureLines.forEach((item) => item.classList.remove('active'));
    line.classList.add('active');
    featureScreen.classList.add('changing');

    window.setTimeout(() => {
      featureScreen.src = next.src;
      featureScreen.alt = next.alt;
      featureScreen.classList.remove('changing');
    }, 170);
  });
});
