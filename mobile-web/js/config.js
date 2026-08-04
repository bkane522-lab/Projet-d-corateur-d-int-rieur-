// js/config.js
// Source unique de vérité pour la marque et les URLs d'API.
// Pour reproduire l'application pour une autre décoratrice, modifier uniquement
// ce fichier et remplacer les fichiers du dossier assets/brand/.

const APP_CONFIG = {
  brand: {
    nomCommercial: "The Lemon Tree Interior Design",
    nomCourt: "The Lemon Tree",
    metier: "Décoratrice d’intérieur",
    slogan: "Des espaces lumineux, accueillants et prêts à recevoir.",
    description: "Décoration et aménagement d’intérieurs, notamment pour les locations saisonnières.",

    // Chemins relatifs utilisables depuis les pages à la racine.
    logoUrl: "assets/brand/logo-transparent.png",
    logoCarreUrl: "assets/brand/logo-square.png",
    faviconUrl: "icons/icon-192.png",

    // La structure conserve les anciennes clés utilisées par le projet pour garantir
    // la compatibilité avec le CSS et le générateur de manifest.
    couleurs: {
      encre: "#173F35",
      ivoire: "#F8F4E8",
      terre: "#B99545",
      sauge: "#78836C",
      pierre: "#EEE7D7",
      blanc: "#FFFFFF"
    },

    domaine: "",
    email: "",
    telephone: "",
    raisonSociale: "",
    siret: "",
    adresse: "",
    reseauxSociaux: {
      instagram: "https://www.instagram.com/thelemontreedesign/",
      facebook: ""
    }
  },

  api: {
    baseUrlWeb: "",
    baseUrlMobile: "https://votre-projet.vercel.app",
    environment: "production",
    baseUrlMobileDev: "http://localhost:3000"
  }
};

function resolveApiUrl(path) {
  const isNativeApp = typeof window !== 'undefined'
    && window.Capacitor
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform();

  if (!isNativeApp) return APP_CONFIG.api.baseUrlWeb + path;

  const base = APP_CONFIG.api.environment === 'development'
    ? APP_CONFIG.api.baseUrlMobileDev
    : APP_CONFIG.api.baseUrlMobile;

  return base.replace(/\/$/, '') + path;
}

if (typeof window !== 'undefined') {
  window.APP_CONFIG = APP_CONFIG;
  window.resolveApiUrl = resolveApiUrl;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { APP_CONFIG, resolveApiUrl };
}
