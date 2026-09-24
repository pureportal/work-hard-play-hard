import { Component, Suspense, type ReactNode } from "react";
import { LoaderCircle, X } from "lucide-react";
import { useModalFocus } from "../hooks/useModalFocus";
import { IconButton } from "./IconButton";
import "../deferred-dialog.css";

interface DeferredContentProps {
  children: ReactNode;
  onClose: () => void;
  modal?: boolean;
  sidebar?: boolean;
}

export class DeferredContent extends Component<DeferredContentProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    const { children, onClose, modal = true, sidebar = false } = this.props;
    const pending = <ContentStatus failed={this.state.failed} onClose={onClose} modal={modal} sidebar={sidebar} />;
    return this.state.failed ? pending : <Suspense fallback={pending}>{children}</Suspense>;
  }
}

function ContentStatus({ failed, onClose, modal, sidebar }: { failed: boolean; onClose: () => void; modal: boolean; sidebar: boolean }) {
  const ref = useModalFocus<HTMLDivElement>(onClose, true, modal && !sidebar);
  return <div className={sidebar ? "side-panel deferred-sidebar" : modal ? "modal-backdrop" : "deferred-dialog-floating"}>
    <div className={sidebar ? "deferred-content-status" : "deferred-dialog deferred-content-status"} ref={ref} role={sidebar ? "region" : "dialog"} aria-modal={!sidebar && modal || undefined} aria-label={failed ? "Panel unavailable" : "Loading"} tabIndex={-1}>
      <IconButton className="deferred-content-close" label="Close" icon={X} onClick={onClose} />
      <div className="deferred-content-message">
        {!failed && <LoaderCircle className="deferred-content-spinner" size={32} aria-hidden="true" />}
        <p role={failed ? "alert" : "status"}>{failed ? "This panel could not load. Reload to try again." : "Loading…"}</p>
        {failed && <button className="primary-button" onClick={() => window.location.reload()}>Reload</button>}
      </div>
    </div>
  </div>;
}
