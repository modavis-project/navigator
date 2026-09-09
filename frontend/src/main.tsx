import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Release11EvidencePage } from "./Release11EvidencePage";
import "./styles.css";
import "./documentation.css";
import "./useCases.css";
import "./organCoverageUseCase.css";
import "./organLifecycleUseCase.css";
import "./builderNetworkUseCase.css";
import "./dalmatiaFireUseCase.css";

const RootPage = window.location.pathname.replace(/\/+$/, "") === "/release-1-1/evidence"
  ? Release11EvidencePage
  : App;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootPage />
  </React.StrictMode>
);

import "./navigatorDesign.css";
