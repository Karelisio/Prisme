import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useMemo, useState } from 'react';
import type { Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import type { ColorScheme } from '@/shared/theme/scheme';
import { Button, SegmentedButtons, Spinner } from '@/shared/ui/components';
import { BottomSheet } from '@/shared/ui/overlays';
import { paletteOf, schemesFor } from './palette';
import './palette.css';

const ROLES: { label: string; bg: keyof ColorScheme; fg: keyof ColorScheme }[] = [
  { label: 'Primaire', bg: 'primary', fg: 'onPrimary' },
  { label: 'Secondaire', bg: 'secondaryContainer', fg: 'onSecondaryContainer' },
  { label: 'Tertiaire', bg: 'tertiaryContainer', fg: 'onTertiaryContainer' },
  { label: 'Surface', bg: 'surfaceContainerHigh', fg: 'onSurface' },
];

/** Couleurs de la simulation d'écran d'accueil (icônes à thème, barre de recherche). */
export function simulationVars(scheme: ColorScheme): CSSProperties {
  return {
    '--sim-icon-bg': scheme.primaryContainer,
    '--sim-icon-fg': scheme.onPrimaryContainer,
    '--sim-search-bg': scheme.surfaceContainerHigh,
  } as CSSProperties;
}

/** Aperçu des couleurs Material You que donnerait ce fond (style par défaut d'Android). */
export function PaletteSheet({
  wallpaper,
  open,
  onClose,
  onSimulate,
}: {
  wallpaper: Wallpaper;
  open: boolean;
  onClose: () => void;
  onSimulate: (scheme: ColorScheme) => void;
}) {
  const [seedIndex, setSeedIndex] = useState(0);
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const palette = useQuery({ queryKey: ['palette', wallpaper.id], queryFn: () => paletteOf(wallpaper), enabled: open, staleTime: Infinity });
  const seed = palette.data?.seeds[seedIndex] ?? palette.data?.seeds[0];
  const schemes = useMemo(() => (seed ? schemesFor(seed) : null), [seed]);
  const scheme = schemes?.[mode];

  return (
    <BottomSheet open={open} onClose={onClose} title={t('Couleurs Material You')}>
      {palette.isPending ? (
        <div className="palette-loading">
          <Spinner />
        </div>
      ) : palette.isError || !scheme || !palette.data ? (
        <p className="palette-note">{t("Analyse de l'image impossible.")}</p>
      ) : (
        <div className="palette">
          <div className="palette__seeds" role="radiogroup" aria-label={t('Couleur source')}>
            {palette.data.seeds.map((s, i) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={i === seedIndex}
                aria-label={t('Couleur source {n}', { n: i + 1 })}
                className="seed"
                style={{ background: s }}
                onClick={() => setSeedIndex(i)}
              />
            ))}
          </div>
          <SegmentedButtons
            label="Mode"
            options={[
              { value: 'light', label: t('Clair'), icon: 'lightMode' },
              { value: 'dark', label: t('Sombre'), icon: 'darkMode' },
            ]}
            value={mode}
            onChange={setMode}
          />

          <div className="palette__mock" style={{ background: scheme.surface, color: scheme.onSurface }} aria-label={t("Aperçu de l'interface")}>
            <div className="palette__mock-bar" style={{ background: scheme.surfaceContainer }}>
              <span style={{ color: scheme.onSurface }}>{t('Paramètres')}</span>
            </div>
            <div className="palette__mock-row">
              <span className="palette__mock-switch" style={{ background: scheme.primary }}>
                <span style={{ background: scheme.onPrimary }} />
              </span>
              <span className="palette__mock-chip" style={{ background: scheme.secondaryContainer, color: scheme.onSecondaryContainer }}>
                Wi-Fi
              </span>
              <span className="palette__mock-chip" style={{ background: scheme.tertiaryContainer, color: scheme.onTertiaryContainer }}>
                Bluetooth
              </span>
            </div>
            <div className="palette__mock-row">
              <span className="palette__mock-button" style={{ background: scheme.primary, color: scheme.onPrimary }}>
                {t('Bouton')}
              </span>
              <span className="palette__mock-fab" style={{ background: scheme.primaryContainer, color: scheme.onPrimaryContainer }}>
                +
              </span>
            </div>
          </div>

          <div className="palette__roles">
            {ROLES.map((role) => (
              <div key={role.label} className="palette__role" style={{ background: scheme[role.bg], color: scheme[role.fg] }}>
                <span>{t(role.label)}</span>
                <span className="palette__hex">{scheme[role.bg]}</span>
              </div>
            ))}
          </div>
          <p className="palette-note">{t("Calculé comme Android 12+ (style par défaut). Selon le téléphone, d'autres variantes sont proposées.")}</p>
          <div className="sheet__actions">
            <Button
              variant="tonal"
              icon="home"
              onClick={() => {
                onSimulate(scheme);
                onClose();
              }}
            >
              {t("Voir sur l'écran d'accueil")}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
