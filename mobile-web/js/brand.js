// js/brand.js
// Injecte la marque configurée dans js/config.js et applique sa palette.

(function () {
  function setCssVariables(cfg) {
    const colors = cfg.couleurs || {};
    const root = document.documentElement;
    const vars = {
      '--ivoire': colors.ivoire,
      '--pierre': colors.pierre,
      '--blanc': colors.blanc,
      '--encre': colors.encre,
      '--terre': colors.terre,
      '--sauge': colors.sauge
    };
    Object.entries(vars).forEach(([name, value]) => {
      if (value) root.style.setProperty(name, value);
    });
    if (colors.encre) {
      root.style.setProperty('--encre-soft', `${colors.encre}9E`);
      root.style.setProperty('--ligne', `${colors.encre}1F`);
    }
  }

  function applyBrand() {
    const cfg = (window.APP_CONFIG && window.APP_CONFIG.brand) || {};
    const nomCourt = cfg.nomCourt || "Nom de l’agence";
    setCssVariables(cfg);

    document.querySelectorAll('[data-brand="nomCourt"]').forEach((el) => {
      if (el.classList.contains('brand') && cfg.logoUrl) {
        el.textContent = '';
        const img = document.createElement('img');
        img.src = cfg.logoUrl;
        img.alt = `Logo ${nomCourt}`;
        img.className = 'brand-logo';
        const span = document.createElement('span');
        span.textContent = nomCourt;
        el.append(img, span);
      } else {
        el.textContent = nomCourt;
      }
    });

    document.querySelectorAll('[data-brand="nomCommercial"]').forEach((el) => {
      el.textContent = cfg.nomCommercial || nomCourt;
    });
    document.querySelectorAll('[data-brand="slogan"]').forEach((el) => {
      el.textContent = cfg.slogan || '';
    });
    document.querySelectorAll('[data-brand="metier"]').forEach((el) => {
      el.textContent = cfg.metier || '';
    });
    document.querySelectorAll('[data-brand="logo"]').forEach((el) => {
      if ('src' in el && cfg.logoUrl) {
        el.src = cfg.logoUrl;
        el.alt = `Logo ${nomCourt}`;
      }
    });
    document.querySelectorAll('[data-brand-line]').forEach((el) => {
      const suffix = el.getAttribute('data-brand-line');
      el.textContent = suffix ? `${nomCourt} — ${suffix}` : nomCourt;
    });
    document.querySelectorAll('[data-brand-title]').forEach((el) => {
      const suffix = el.getAttribute('data-brand-title');
      document.title = suffix ? `${suffix} — ${nomCourt}` : nomCourt;
    });
    document.querySelectorAll('[data-brand="email"]').forEach((el) => {
      el.textContent = cfg.email || '';
      if (el.tagName === 'A') el.href = cfg.email ? `mailto:${cfg.email}` : '#';
    });
    document.querySelectorAll('[data-brand="telephone"]').forEach((el) => {
      el.textContent = cfg.telephone || '';
      if (el.tagName === 'A') el.href = cfg.telephone ? `tel:${cfg.telephone.replace(/\s/g, '')}` : '#';
    });
    document.querySelectorAll('[data-brand="instagram"]').forEach((el) => {
      el.textContent = cfg.reseauxSociaux?.instagram ? '@thelemontreedesign' : '';
      if (el.tagName === 'A') el.href = cfg.reseauxSociaux?.instagram || '#';
    });

    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme && cfg.couleurs?.encre) theme.setAttribute('content', cfg.couleurs.encre);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBrand);
  } else {
    applyBrand();
  }
})();
