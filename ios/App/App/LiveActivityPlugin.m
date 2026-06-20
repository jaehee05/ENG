#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// JS 의 registerPlugin<LiveActivityPlugin>('LiveActivity') 와 매핑.
CAP_PLUGIN(LiveActivityPlugin, "LiveActivity",
           CAP_PLUGIN_METHOD(isSupported, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(startClass, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(updateClass, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(endClass, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(currentId, CAPPluginReturnPromise);
)
