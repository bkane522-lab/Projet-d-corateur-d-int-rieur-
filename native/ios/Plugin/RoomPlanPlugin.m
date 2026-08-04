// native/ios/Plugin/RoomPlanPlugin.m
// Pont Objective-C requis par Capacitor pour exposer les méthodes Swift au JS.

#import <Capacitor/Capacitor.h>

CAP_PLUGIN(RoomPlanPlugin, "RoomPlanPlugin",
  CAP_PLUGIN_METHOD(isSupported, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(startScan, CAPPluginReturnPromise);
)
