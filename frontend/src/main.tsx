import React from "react";
import ReactDOM from "react-dom/client";
import { Workbench } from "./pages/Workbench";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Workbench />
  </React.StrictMode>,
);

