import React from "react";
import ReactDOM from "react-dom/client";
import { DesktopRuntimeGate } from "./components/DesktopRuntimeGate";
import { Workbench } from "./pages/Workbench";
import { PreferencesProvider } from "./preferences";
import "./styles/global.css";
import "./styles/run-surface.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreferencesProvider>
      <DesktopRuntimeGate>
        <Workbench />
      </DesktopRuntimeGate>
    </PreferencesProvider>
  </React.StrictMode>,
);
