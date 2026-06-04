import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { AlertOccurrence } from "../shared/types";
import "./overlay.css";

function Overlay(): JSX.Element {
  const [alert, setAlert] = useState<AlertOccurrence | null>(null);
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);

  useEffect(() => window.reminderApi.onOverlayAlert(setAlert), []);

  if (!alert) {
    return <div className="overlay-stage" />;
  }

  const acknowledge = (): void => {
    if (acknowledgedKey === alert.key) {
      return;
    }
    setAcknowledgedKey(alert.key);
    window.reminderApi.acknowledgeOverlay(alert.key);
  };

  return (
    <div className="overlay-stage">
      <span
        className="floating-alert"
        onMouseEnter={() => window.reminderApi.setOverlayInteractive(true)}
        onMouseLeave={() => window.reminderApi.setOverlayInteractive(false)}
        onFocus={() => window.reminderApi.setOverlayInteractive(true)}
        onBlur={() => window.reminderApi.setOverlayInteractive(false)}
      >
        <span className="alert-copy">
          <span className="alert-title">{alert.title}</span>
          <span className="alert-detail">
            提前 {alert.leadMinutes} 分钟 · {new Date(alert.occurrenceAt).toLocaleString()}
          </span>
          {alert.description ? <span className="alert-description">{alert.description}</span> : null}
        </span>
        <button type="button" className="ack-button" onPointerDown={acknowledge} onClick={acknowledge}>
          我马上去做
        </button>
      </span>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("overlay-root")!).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>
);
