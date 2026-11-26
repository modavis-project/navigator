import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { RouteBoundary } from "./RouteBoundary";
import { LoadingContent } from "./LoadingContent";
import { UiLocaleProvider } from "./uiLocale";
import "./styles.css";
import "./navigatorDesign.css";
import "./publicDesign.css";

const Release11EvidencePage = lazy(() => import("./Release11EvidencePage").then(module => ({ default: module.Release11EvidencePage })));
const evidenceRoute = window.location.pathname.replace(/\/+$/, "") === "/release-1-1/evidence";
const germanPreview = (import.meta.env.DEV || import.meta.env.MODE === "german-review") && !evidenceRoute;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <UiLocaleProvider enabled={germanPreview}>
      <RouteBoundary root>
        {evidenceRoute
          ? <Suspense fallback={<LoadingContent kind="article" label="Loading release evidence…" />}><Release11EvidencePage /></Suspense>
          : <App />}
      </RouteBoundary>
    </UiLocaleProvider>
  </React.StrictMode>
);
