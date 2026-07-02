import "./index.css";
import { render } from "react-dom";
import { App } from "./App";
import { RiderZoneProvider } from "./context/RiderZoneContext";

render(
  <RiderZoneProvider>
    <App />
  </RiderZoneProvider>,
  document.getElementById("root")
);

