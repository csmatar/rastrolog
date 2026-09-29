window.posthog = {
  calls: [],
  capture(event, properties) {
    this.calls.push(["capture", event, properties]);
  },
  setPersonProperties(properties) {
    this.calls.push(["setPersonProperties", properties]);
  },
};
