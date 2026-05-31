// Status bar + load-button disabling. Owns its own DOM nodes and a monotonic
// request id so stale async loads can detect they have been superseded.

const elements = {
  statusMessage: document.querySelector("#statusMessage"),
  loadJsonButton: document.querySelector("#loadJsonButton"),
  loadSampleButton: document.querySelector("#loadSampleButton"),
  exampleList: document.querySelector("#exampleList")
};

let loadRequestId = 0;
let isLoading = false;

export function setStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("error", isError);
}

export function startLoad(message) {
  loadRequestId += 1;
  isLoading = true;
  setLoadingState(true);
  setStatus(message);
  return loadRequestId;
}

export function finishLoad(loadId) {
  if (!isCurrentLoad(loadId)) {
    return;
  }
  isLoading = false;
  setLoadingState(false);
}

export function isCurrentLoad(loadId) {
  return loadId === loadRequestId;
}

export function isBusy() {
  return isLoading;
}

function setLoadingState(loading) {
  elements.loadJsonButton.disabled = loading;
  elements.loadSampleButton.disabled = loading;

  for (const button of elements.exampleList.querySelectorAll("button")) {
    button.disabled = loading;
  }
}
