// js/scan-detect.js
// Détermine quel mode de scan proposer : iOS LiDAR natif, Android ARCore natif, ou
// parcours web de secours. La détection native ne peut fonctionner que si l'app tourne
// dans le conteneur Capacitor (voir /native) avec le plugin correspondant installé —
// un simple navigateur web, même sur iPhone Pro, n'a jamais accès au LiDAR ni à ARCore.

async function detectScanMode() {
  const isCapacitor = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.();
  const platform = isCapacitor ? window.Capacitor.getPlatform() : 'web';

  const result = {
    mode: 'web_fallback',
    platform,
    isCapacitor,
    hasCamera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    hasMotionSensors: typeof DeviceOrientationEvent !== 'undefined',
    lidarAvailable: false,
    arcoreAvailable: false
  };

  if (isCapacitor && platform === 'ios') {
    // Le plugin natif est résolu explicitement via Capacitor.registerPlugin() dans
    // js/native-plugins.js — voir native/README.md pour l'enregistrement natif
    // correspondant (CAP_PLUGIN côté iOS).
    const plugin = window.NativePlugins && window.NativePlugins.RoomPlanPlugin;
    if (!plugin) {
      console.warn('RoomPlanPlugin non enregistré — vérifier native/README.md');
    } else {
      try {
        const check = await plugin.isSupported();
        result.lidarAvailable = !!check?.supported;
        if (result.lidarAvailable) result.mode = 'ios_lidar';
      } catch (e) {
        console.warn('RoomPlanPlugin indisponible :', e);
      }
    }
  }

  if (isCapacitor && platform === 'android') {
    const plugin = window.NativePlugins && window.NativePlugins.ARCorePlugin;
    if (!plugin) {
      console.warn('ARCorePlugin non enregistré — vérifier native/README.md');
    } else {
      try {
        const check = await plugin.isSupported();
        result.arcoreAvailable = !!check?.supported;
        if (result.arcoreAvailable) result.mode = 'android_arcore';
      } catch (e) {
        console.warn('ARCorePlugin indisponible :', e);
      }
    }
  }

  return result;
}

function getScanModeMessage(caps) {
  if (caps.mode === 'ios_lidar') {
    return "Votre appareil prend en charge le scan LiDAR guidé. Vous allez pouvoir scanner la pièce en vous déplaçant lentement.";
  }
  if (caps.mode === 'android_arcore') {
    return "Votre appareil prend en charge le scan assisté par ARCore. Vous allez viser les angles et confirmer les mesures à l'écran.";
  }
  if (caps.isCapacitor) {
    return "Le scan natif n'est pas disponible sur cet appareil. Utilisez le parcours photos guidées ci-dessous.";
  }
  return "Vous êtes sur le site web : le scan spatial complet nécessite l'application mobile. Utilisez le parcours photos guidées ci-dessous — pleinement fonctionnel.";
}
