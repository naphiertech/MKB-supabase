import "./index.css";
import { render } from "react-dom";
import { App } from "./App";
import { RiderZoneProvider } from "./context/RiderZoneContext";
import { NotificationProvider } from "./context/NotificationContext";

render(
  <RiderZoneProvider>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  </RiderZoneProvider>,
  document.getElementById("root")
);

