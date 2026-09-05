import "./index.css";
import { render } from "react-dom";
import { App } from "./App";
import { RiderZoneProvider } from "./context/RiderZoneContext";
import { NotificationProvider } from "./context/NotificationContext";
import { MotionConfig } from "framer-motion";
import { HubProvider } from "./context/HubContext";
import { Toaster } from "sileo";

render(
  <HubProvider>
    <RiderZoneProvider>
      <NotificationProvider>
        <MotionConfig reducedMotion="user">
          <Toaster
            position="top-right"
            theme="dark"
            offset={{ top: 16, right: 16 }}
            options={{ fill: "#ffffff", roundness: 16 }}
          />
          <App />
        </MotionConfig>
      </NotificationProvider>
    </RiderZoneProvider>
  </HubProvider>,
  document.getElementById("root")
);

