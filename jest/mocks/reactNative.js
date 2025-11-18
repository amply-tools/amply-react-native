const {EventEmitter} = require('events');

class MockNativeEventEmitter extends EventEmitter {
  constructor() {
    super();
  }

  addListener(event, handler) {
    super.addListener(event, handler);
    return {
      remove: () => this.removeListener(event, handler),
    };
  }
}

function createTurboEmitter(channel) {
  const emitter = new MockNativeEventEmitter();
  return {
    addListener(handler) {
      return emitter.addListener(channel, handler);
    },
    emit(payload) {
      emitter.emit(channel, payload);
    },
  };
}

const systemEventEmitter = createTurboEmitter('onSystemEvent');
const deepLinkEmitter = createTurboEmitter('onDeepLink');

module.exports = {
  NativeModules: {
    Amply: {
      onSystemEvent(handler) {
        return systemEventEmitter.addListener(handler);
      },
      onDeepLink(handler) {
        return deepLinkEmitter.addListener(handler);
      },
      registerDeepLinkListener() {},
      __emitSystemEvent(payload) {
        systemEventEmitter.emit(payload);
      },
      __emitDeepLinkEvent(payload) {
        deepLinkEmitter.emit(payload);
      },
    },
  },
  NativeEventEmitter: MockNativeEventEmitter,
};
