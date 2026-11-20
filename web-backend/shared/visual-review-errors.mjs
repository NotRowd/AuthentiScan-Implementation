const messages={
  VISUAL_BUSY:'The visual review service is busy. Wait a moment, then retry.',
  VISUAL_OFFLINE:'The visual review service is offline. Try again later; if this continues, ask the administrator to start the service.',
  VISUAL_TIMEOUT:'The visual review took too long. You can retry later.',
  VISUAL_INVALID_RESPONSE:'The model returned a response we could not use. You can retry; no findings were added from that response.',
  VISUAL_MODEL_FAILURE:'The visual review could not finish. Try again later.',
};
export const visualErrorCode=code=>Object.hasOwn(messages,code)?code:'VISUAL_INVALID_RESPONSE';
export const visualErrorMessage=code=>`${messages[Object.hasOwn(messages,code)?code:'VISUAL_MODEL_FAILURE']} Your saved result and scan credits are unchanged.`;
