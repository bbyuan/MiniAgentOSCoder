import React from "react";
import ReactDOM from "react-dom/client";
import { Workbench } from "./pages/Workbench";
import { PreferencesProvider } from "./preferences";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreferencesProvider>
      <Workbench />
    </PreferencesProvider>
  </React.StrictMode>,
);
