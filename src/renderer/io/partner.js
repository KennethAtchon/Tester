// The practice partner runs in the main process, which holds the API key (see
// src/partner.js). Each call resolves to a value or { error: { code, message } };
// in a plain browser there is no main process, so every call says so.

function call(name, ...args) {
  const bridge = window.testFiles?.[name];
  if (!bridge) {
    return Promise.resolve({ error: { code: "no-desktop", message: "The practice partner needs the Recall desktop app." } });
  }
  return bridge(...args).catch((error) => ({ error: { code: "crash", message: error.message } }));
}

export const partnerStatus = () => call("partnerStatus");
export const partnerSetKey = (key) => call("partnerSetKey", key);
export const partnerClearKey = () => call("partnerClearKey");
export const partnerReply = (payload) => call("partnerReply", payload);
export const partnerCoach = (payload) => call("partnerCoach", payload);
