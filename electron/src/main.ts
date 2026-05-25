import { app } from "electron";

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.exit(0);
} else {
  void import("./main-app")
    .then(({ focusMainWindow, startMainApp }) => {
      app.on("second-instance", () => {
        focusMainWindow();
      });
      return startMainApp();
    })
    .catch((err: unknown) => {
      console.error("Failed to start Harnss main process", err);
      app.exit(1);
    });
}
