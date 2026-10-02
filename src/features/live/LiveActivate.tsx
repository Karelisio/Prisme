import { useState } from 'react';
import { nativeErrorMessage } from '@/shared/native';
import type { LiveStatus } from '@/shared/native/automation';
import { Button } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';

/**
 * Bouton principal d'un genre de fond animé : lance [onActivate] (qui renvoie le message à afficher),
 * puis relit l'état du natif.
 */
export function LiveActivateButton({
  status,
  disabled,
  onActivate,
  refresh,
}: {
  status: LiveStatus | undefined;
  disabled: boolean;
  onActivate: () => Promise<string>;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      showSnackbar(await onActivate());
      refresh();
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="option-actions">
      <Button icon="rotation3d" disabled={disabled || busy} onClick={() => void run()}>
        {status?.active ? 'Mettre à jour' : 'Activer le fond animé'}
      </Button>
    </div>
  );
}
