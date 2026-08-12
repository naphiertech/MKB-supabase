import "./index.css";
import { render } from "react-dom";
import { App } from "./App";
import { RiderZoneProvider } from "./context/RiderZoneContext";
import { NotificationProvider } from "./context/NotificationContext";
import { MotionConfig } from "framer-motion";
import { HubProvider } from "./context/HubContext";

render(
  <HubProvider>
    <RiderZoneProvider>
      <NotificationProvider>
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </NotificationProvider>
    </RiderZoneProvider>
  </HubProvider>,
  document.getElementById("root")
);

