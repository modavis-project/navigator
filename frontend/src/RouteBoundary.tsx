import { Component, type ErrorInfo, type ReactNode } from "react";
import { useUiLocale, type UiText } from "./uiLocale";

type Props = { children: ReactNode; resetKey?: string; label?: string; root?: boolean };

/** Keep navigation and the local research workspace usable if one view fails. */
class RouteErrorBoundary extends Component<Props & { t: UiText }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Development diagnostics remain outside the public reading surface.
    if (import.meta.env.DEV) console.error("Navigator view failed", error, info);
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { t, label } = this.props;
    return <section className="route-failure" role="alert" aria-labelledby="route-failure-title">
      <p className="eyebrow">{t("route.failure.eyebrow", "View unavailable", "Ansicht nicht verfügbar")}</p>
      <h2 id="route-failure-title">{label
        ? t("route.failure.named", "We couldn’t display {label}", "Die Ansicht „{label}“ konnte nicht angezeigt werden", { label })
        : t("route.failure.title", "We couldn’t display this page", "Diese Seite konnte nicht angezeigt werden")}</h2>
      <p>{t("route.failure.recovery", "Try opening the view again. Your saved research workspace remains in this browser.", "Öffnen Sie die Ansicht erneut. Der gespeicherte Recherche-Arbeitsbereich bleibt in diesem Browser erhalten.")}</p>
      <div className="route-failure-actions">
        <button type="button" onClick={() => this.props.root ? window.location.reload() : this.setState({ failed: false })}>{t("route.failure.retry", "Try again", "Erneut versuchen")}</button>
        <a href="/">{t("route.failure.home", "Return to discovery", "Zur Suche zurückkehren")}</a>
        <a href="/about/release">{t("route.failure.data", "About the data", "Über die Daten")}</a>
      </div>
    </section>;
  }
}

export function RouteBoundary(props: Props) {
  const { t } = useUiLocale();
  return <RouteErrorBoundary {...props} t={t} />;
}
