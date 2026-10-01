import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { goBack } from '@/app/navigation';
import { type GeneratorParams, exportGenerated, renderGenerated } from '@/features/generator/generate';
import { saveCreation } from '@/features/library/creations';
import { useLibrary } from '@/features/library/store';
import { TARGET_LABELS, applyWallpaper } from '@/features/preview/applyWallpaper';
import { useSettings } from '@/features/settings/store';
import { getScreenInfo } from '@/shared/lib/screen';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeAutomation } from '@/shared/native/automation';
import { useTheme } from '@/shared/theme/ThemeController';
import type { ColorScheme } from '@/shared/theme/scheme';
import { Button, Icon, IconButton, Switch } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { RefRow, TargetChips, WallpaperPicker } from './components';
import { DAYS, type FocusScheduleDraft } from './model';
import { useAutomationPrefs } from './store';

interface Preset {
  key: string;
  label: string;
  params: GeneratorParams;
}

/** Fonds épurés proposés pour le focus : sobres, sans détail qui attire l'œil. */
export function focusPresets(scheme?: ColorScheme): Preset[] {
  const presets: Preset[] = [
    { key: 'black', label: 'Noir', params: { style: 'solid', colors: ['#000000', '#000000', '#000000'], angle: 0, grain: 0, seed: 1 } },
    { key: 'slate', label: 'Ardoise', params: { style: 'linear', colors: ['#34373d', '#24262b', '#17181b'], angle: 180, grain: 0.06, seed: 1 } },
    { key: 'mist', label: 'Brume', params: { style: 'radial', colors: ['#dfe6ea', '#c3ced5', '#9aa8b1'], angle: 0, grain: 0.05, seed: 1 } },
  ];
  if (scheme) {
    presets.push({
      key: 'you',
      label: 'Mes couleurs',
      params: { style: 'linear', colors: [scheme.surfaceContainerHigh, scheme.surfaceContainer, scheme.surfaceDim], angle: 165, grain: 0.04, seed: 1 },
    });
  }
  return presets;
}

function PresetTile({ preset, onPick, disabled }: { preset: Preset; onPick: () => void; disabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) renderGenerated(ctx, preset.params, canvas.width, canvas.height);
  }, [preset]);
  return (
    <button type="button" className="preset-tile" onClick={onPick} disabled={disabled} aria-label={`Fond épuré ${preset.label}`}>
      <canvas ref={ref} width={90} height={200} className="preset" />
      <span>{preset.label}</span>
    </button>
  );
}

export function FocusScreen() {
  const prefs = useAutomationPrefs((s) => s.focus);
  const update = useAutomationPrefs((s) => s.updateFocus);
  const enabled = useSettings((s) => s.features.focus);
  const setFeature = useSettings((s) => s.setFeature);
  const scheme = useTheme((s) => s.scheme);
  const wallpaper = useLibrary((s) => (prefs.wallpaperId ? s.items[prefs.wallpaperId] : undefined));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ['automation-status'], queryFn: () => PrismeAutomation.getStatus(), refetchInterval: 10_000 });

  const pickPreset = async (preset: Preset) => {
    setBusy(true);
    try {
      const { width, height } = await getScreenInfo();
      const creation = await saveCreation(await exportGenerated(preset.params, width, height), preset.params.colors[0], `Fond épuré ${preset.label}`);
      update({ wallpaperId: creation.id });
    } catch (e) {
      showSnackbar(nativeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const setSchedule = (id: string, patch: Partial<FocusScheduleDraft>) =>
    update({ schedules: prefs.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const toggleDay = (schedule: FocusScheduleDraft, day: number) =>
    setSchedule(schedule.id, { days: schedule.days.includes(day) ? schedule.days.filter((d) => d !== day) : [...schedule.days, day] });

  const tryNow = async () => {
    if (!wallpaper) return;
    try {
      await applyWallpaper({ wallpaper, target: prefs.target });
      showSnackbar(`Fond épuré appliqué : ${TARGET_LABELS[prefs.target].toLowerCase()}`);
    } catch (e) {
      showSnackbar(`Échec : ${nativeErrorMessage(e)}`);
    }
  };

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">Mode focus</h1>
        <Switch label="Activer le mode focus" checked={enabled} onChange={(v) => setFeature('focus', v)} />
      </header>
      <p className="option-intro">
        Pendant les plages choisies, Prisme pose un fond épuré pour limiter les distractions, puis remet ton fond habituel.
        Il passe avant les fonds dynamiques et la rotation.
      </p>

      {enabled && (
        <div className="option-status" role="status">
          <Icon name={status.data?.focusActive ? 'focus' : 'schedule'} />
          {!wallpaper ? 'Choisis un fond épuré pour démarrer.' : status.data?.focusActive ? 'Mode focus en cours.' : 'En attente de la prochaine plage.'}
        </div>
      )}

      <div className="option-block">
        <h2 className="option-block__title">Fond épuré</h2>
        <div className="presets">
          {focusPresets(scheme).map((preset) => (
            <PresetTile key={preset.key} preset={preset} disabled={busy} onPick={() => void pickPreset(preset)} />
          ))}
        </div>
      </div>
      <RefRow
        icon="focus"
        label="Fond choisi"
        supporting={wallpaper ? undefined : 'Un modèle ci-dessus ou une image de ta bibliothèque'}
        wallpaperId={prefs.wallpaperId}
        onChoose={() => setPicking(true)}
        onClear={() => update({ wallpaperId: null })}
      />

      <div className="option-block">
        <h2 className="option-block__title">Plages horaires</h2>
      </div>
      {prefs.schedules.map((schedule) => (
        <div key={schedule.id} className="schedule">
          <div className="schedule__days" aria-label="Jours">
            {DAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                className="day-toggle"
                aria-pressed={schedule.days.includes(day.value)}
                aria-label={day.label}
                title={day.label}
                onClick={() => toggleDay(schedule, day.value)}
              >
                {day.short}
              </button>
            ))}
          </div>
          <div className="schedule__times">
            <label>
              Début
              <input type="time" className="time-input" value={schedule.start} onChange={(e) => e.target.value && setSchedule(schedule.id, { start: e.target.value })} />
            </label>
            <label>
              Fin
              <input type="time" className="time-input" value={schedule.end} onChange={(e) => e.target.value && setSchedule(schedule.id, { end: e.target.value })} />
            </label>
            <span className="schedule__spacer" />
            <IconButton icon="delete" label="Supprimer la plage" onClick={() => update({ schedules: prefs.schedules.filter((s) => s.id !== schedule.id) })} />
          </div>
          {schedule.end < schedule.start && <p className="schedule__note">Se termine le lendemain.</p>}
        </div>
      ))}
      <div className="option-actions">
        <Button
          variant="outlined"
          icon="add"
          onClick={() => update({ schedules: [...prefs.schedules, { id: crypto.randomUUID(), days: [1, 2, 3, 4, 5], start: '14:00', end: '17:00' }] })}
        >
          Ajouter une plage
        </Button>
      </div>

      <div className="option-block">
        <h2 className="option-block__title">Écran</h2>
        <TargetChips value={prefs.target} onChange={(target) => update({ target })} />
      </div>
      <div className="option-actions">
        <Button variant="tonal" icon="play" disabled={!wallpaper} onClick={() => void tryNow()}>
          Essayer maintenant
        </Button>
      </div>

      <WallpaperPicker open={picking} title="Fond épuré" onClose={() => setPicking(false)} onPick={(w) => update({ wallpaperId: w.id })} />
    </div>
  );
}
