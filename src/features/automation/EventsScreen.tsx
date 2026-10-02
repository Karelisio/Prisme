import { type FormEvent, useMemo, useState } from 'react';
import { goBack } from '@/app/navigation';
import { useSettings } from '@/features/settings/store';
import { Button, Chip, Icon, IconButton, Switch, TextField } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { RefRow, TargetChips, WallpaperPicker } from './components';
import { HOLIDAYS, type HolidayKey, eventDates, nextDate } from './events';
import { DEFAULT_AUTOMATION } from './model';
import { useAutomationPrefs } from './store';

interface Picking {
  label: string;
  assign: (id: string) => void;
}

const DAY_MS = 86_400_000;

function untilLabel(date: Date, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((date.getTime() - today) / DAY_MS);
  const when = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  if (days === 0) return `aujourd’hui (${when})`;
  if (days === 1) return `demain (${when})`;
  return `le ${when}, dans ${days} jours`;
}

/** Options avancées › Fêtes et dates perso. */
export function EventsScreen() {
  const stored = useAutomationPrefs((s) => s.events);
  const prefs = { ...DEFAULT_AUTOMATION.events, ...stored };
  const update = useAutomationPrefs((s) => s.updateEvents);
  const enabled = useSettings((s) => s.features.events);
  const setFeature = useSettings((s) => s.setFeature);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [keyword, setKeyword] = useState('');
  const isOn = (key: HolidayKey) => prefs.holidays[key]?.enabled !== false;
  const setHoliday = (key: HolidayKey, patch: { enabled?: boolean; wallpaperId?: string | undefined }) =>
    update({ holidays: { ...prefs.holidays, [key]: { enabled: isOn(key), ...prefs.holidays[key], ...patch } } });

  const upcoming = useMemo(() => {
    const now = new Date();
    const candidates = [
      ...HOLIDAYS.filter((h) => prefs.holidays[h.key]?.enabled !== false).map((h) => ({ name: h.label, date: nextDate(eventDates(h.days, now), now) })),
      ...prefs.custom.map((c) => ({ name: c.name, date: nextDate(eventDates(() => [[c.month, c.day]], now), now) })),
    ].filter((c): c is { name: string; date: Date } => c.date !== null);
    candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
    const first = candidates[0];
    return first ? `Prochain : ${first.name}, ${untilLabel(first.date, now)}` : null;
  }, [prefs.holidays, prefs.custom]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const [, month, day] = date.split('-').map(Number);
    if (!name.trim() || !month || !day) return;
    update({ custom: [...prefs.custom, { id: crypto.randomUUID(), name: name.trim(), month, day, keyword: keyword.trim() }] });
    showSnackbar(`« ${name.trim()} » ajouté`);
    setName('');
    setDate('');
    setKeyword('');
  };

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">Fêtes et dates</h1>
        <Switch label="Activer les fêtes et dates perso" checked={enabled} onChange={(v) => setFeature('events', v)} />
      </header>
      <p className="option-intro">
        Le jour venu, ton fond change tout seul : celui que tu as choisi, ou à défaut un fond du thème trouvé en ligne. Le
        lendemain, tout redevient comme avant. Seul le mode focus passe avant.
      </p>

      {enabled && upcoming && (
        <div className="option-status" role="status">
          <Icon name="calendar" />
          {upcoming}
        </div>
      )}

      <div className="option-block">
        <h2 className="option-block__title">Fêtes suivies</h2>
        <div className="chip-wrap">
          {HOLIDAYS.map((h) => (
            <Chip key={h.key} selected={isOn(h.key)} onClick={() => setHoliday(h.key, { enabled: !isOn(h.key) })}>
              {h.label}
            </Chip>
          ))}
        </div>
      </div>

      {HOLIDAYS.filter((h) => isOn(h.key)).map((h) => (
        <RefRow
          key={h.key}
          icon={h.icon}
          label={h.label}
          supporting={prefs.holidays[h.key]?.wallpaperId ? 'Fond choisi' : 'Automatique : un fond du thème, en ligne'}
          wallpaperId={prefs.holidays[h.key]?.wallpaperId}
          onChoose={() => setPicking({ label: h.label, assign: (id) => setHoliday(h.key, { wallpaperId: id }) })}
          onClear={() => setHoliday(h.key, { wallpaperId: undefined })}
        />
      ))}

      <div className="option-block">
        <h2 className="option-block__title">Dates perso</h2>
        {prefs.custom.length === 0 && <p className="option-hint">Anniversaires, fêtes de famille… chaque année au même jour.</p>}
      </div>
      {prefs.custom.map((c) => (
        <RefRow
          key={c.id}
          icon="calendar"
          label={c.name}
          supporting={`${new Date(2000, c.month - 1, c.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · ${
            c.wallpaperId ? 'fond choisi' : `en ligne : « ${c.keyword || 'celebration'} »`
          }`}
          wallpaperId={c.wallpaperId}
          onChoose={() =>
            setPicking({
              label: c.name,
              assign: (id) => update({ custom: prefs.custom.map((x) => (x.id === c.id ? { ...x, wallpaperId: id } : x)) }),
            })
          }
          onClear={() => update({ custom: prefs.custom.map((x) => (x.id === c.id ? { ...x, wallpaperId: undefined } : x)) })}
        >
          <button
            type="button"
            className="ref-row__remove"
            onClick={() => update({ custom: prefs.custom.filter((x) => x.id !== c.id) })}
            aria-label={`Supprimer « ${c.name} »`}
          >
            Supprimer
          </button>
        </RefRow>
      ))}
      <form className="option-block event-form" onSubmit={add}>
        <TextField label="Nom" placeholder="ex. Anniversaire de Léa" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <TextField
          label="Thème en ligne (sans fond choisi)"
          placeholder="ex. birthday cake, fleurs"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className="option-actions">
          <Button type="submit" variant="tonal" icon="add" disabled={!name.trim() || !date}>
            Ajouter la date
          </Button>
        </div>
      </form>

      <div className="option-block">
        <h2 className="option-block__title">Écran</h2>
        <TargetChips value={prefs.target} onChange={(target) => update({ target })} />
      </div>

      <WallpaperPicker
        open={picking !== null}
        title={picking ? `Fond « ${picking.label} »` : ''}
        onClose={() => setPicking(null)}
        onPick={(w) => picking?.assign(w.id)}
      />
    </div>
  );
}
