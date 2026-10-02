import { useState } from 'react';
import { t } from '@/shared/i18n';
import { nativeErrorMessage } from '@/shared/native';
import type { LiveComponent, LiveStatus } from '@/shared/native/automation';
import { Button } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';

/**
 * Bouton principal d'un genre de fond animé : lance [onActivate] (qui renvoie le message à afficher),
 * puis relit l'état du natif. [component] : le fond Android dont le genre a besoin (les scènes, sauf la vidéo) ;
 * le bouton propose « Mettre à jour » seulement quand c'est celui-là qui est actif.
 */
export function LiveActivateButton({
  status,
  disabled,
  onActivate,
  refresh,
  component = 'scenes',
}: {
  status: LiveStatus | undefined;
  disabled: boolean;
  onActivate: () => Promise<string>;
  refresh: () => void;
  component?: LiveComponent;
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
        {status?.component === component ? t('Mettre à jour') : t('Activer le fond animé')}
      </Button>
    </div>
  );
}
