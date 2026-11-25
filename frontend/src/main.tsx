import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { RouteBoundary } from "./RouteBoundary";
import { Release11EvidencePage } from "./Release11EvidencePage";
import { UiLocaleProvider } from "./uiLocale";
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
const germanPreview = (import.meta.env.DEV || import.meta.env.MODE === "german-review") && RootPage === App;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <UiLocaleProvider enabled={germanPreview}>
      <RouteBoundary root><RootPage /></RouteBoundary>
    </UiLocaleProvider>
  </React.StrictMode>
);

import "./navigatorDesign.css";

import "./publicDesign.css";
import "./organSpecificationWorkflow.css";
