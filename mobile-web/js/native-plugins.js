// js/native-plugins.js
//
// Enregistrement JS explicite des plugins natifs, plutôt que de compter sur la
// résolution implicite via window.Capacitor.Plugins.NomDuPlugin (qui fonctionne mais ne
// garantit pas un objet plugin propre si le natif n'est pas chargé). `Capacitor.
// registerPlugin(name)` est l'API officielle exposée par @capacitor/core sur le global
// `Capacitor` pour obtenir un proxy JS vers un plugin natif enregistré côté iOS/Android
// (voir native/README.md pour l'enregistrement natif correspondant : CAP_PLUGIN côté
// iOS, registerPlugin() dans MainActivity côté Android).
//
// Sur le site web (hors Capacitor), window.Capacitor n'existe pas : window.NativePlugins
// expose alors des valeurs `null`, et tout le code appelant doit vérifier leur présence
// avant utilisation (voir js/scan-detect.js et scanner.html).

(function () {
  function getPlugin(name) {
    if (typeof window === 'undefined' || !window.Capacitor || typeof window.Capacitor.registerPlugin !== 'function') {
      return null;
    }
    try {
      return window.Capacitor.registerPlugin(name);
    } catch (err) {
      console.warn(`Plugin natif "${name}" indisponible :`, err);
      return null;
    }
  }

  window.NativePlugins = {
    RoomPlanPlugin: getPlugin('RoomPlanPlugin'),
    ARCorePlugin: getPlugin('ARCorePlugin')
  };
})();
