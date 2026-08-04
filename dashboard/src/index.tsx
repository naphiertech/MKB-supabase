import "./index.css";
import { render } from "react-dom";
import { App } from "./App";
import { RiderZoneProvider } from "./context/RiderZoneContext";
import { NotificationProvider } from "./context/NotificationContext";
import { MotionConfig } from "framer-motion";

render(
  <RiderZoneProvider>
    <NotificationProvider>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </NotificationProvider>
  </RiderZoneProvider>,
  document.getElementById("root")
);

