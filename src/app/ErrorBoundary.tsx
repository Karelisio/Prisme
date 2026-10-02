import { Component, type ReactNode } from 'react';
import { recordError } from '@/features/diagnostics/errorLog';
import { Button, EmptyState } from '@/shared/ui/components';

/** Dernier filet : une erreur d'affichage est journalisée et l'app propose de se recharger. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    recordError('Affichage', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen">
        <EmptyState
          icon="error"
          title="Un problème est survenu"
          text="L'erreur a été ajoutée au journal (Réglages › Diagnostic)."
          action={<Button onClick={() => window.location.reload()}>Recharger</Button>}
        />
      </div>
    );
  }
}
