import { type Overlay, useNavigation } from '@/app/navigation';
import { Icon, Switch } from '@/shared/ui/components';
import type { IconName } from '@/shared/ui/icons';
import { type FeatureKey, useSettings } from './store';

interface OptionDef {
  key: FeatureKey;
  title: string;
  description: string;
  icon: IconName;
  /** Écran de configuration, ouvert d'un appui une fois l'option activée. */
  screen?: Overlay['type'];
}

export const OPTIONS: readonly OptionDef[] = [
  { key: 'dynamic', title: 'Fonds dynamiques', description: 'Selon l’heure, la météo, la saison ou la batterie', icon: 'partlyCloudy', screen: 'dynamic' },
  { key: 'live', title: 'Fond animé (parallaxe)', description: 'Le fond suit les mouvements du téléphone', icon: 'rotation3d', screen: 'live' },
  { key: 'rotation', title: 'Rotation automatique', description: 'Change de fond à intervalle régulier, au hasard en ligne ou parmi tes favoris', icon: 'autorenew', screen: 'rotation' },
  { key: 'places', title: 'Selon le lieu', description: 'Un fond à la maison, un autre au travail', icon: 'place', screen: 'places' },
  { key: 'editor', title: 'Éditeur', description: 'Flou, assombrissement, grain, dégradé, texte : bouton « Retoucher » de l’aperçu', icon: 'formatPaint' },
  { key: 'generator', title: 'Générateur minimaliste', description: 'Fonds unis, dégradés, aurores, vagues, formes', icon: 'wandStars', screen: 'generator' },
  { key: 'palette', title: 'Palette Material You', description: 'Couleurs que donnera le fond : bouton palette de l’aperçu', icon: 'palette' },
  { key: 'linked', title: 'Fonds accueil et verrouillage liés', description: 'Variante assortie pour l’autre écran, au moment d’appliquer', icon: 'link' },
  { key: 'focus', title: 'Mode focus', description: 'Fond épuré pendant des plages horaires choisies', icon: 'focus', screen: 'focus' },
];

/** Options désactivées par défaut : chacune s'active ici, puis se règle dans son écran. */
export function AdvancedOptions() {
  const features = useSettings((s) => s.features);
  const setFeature = useSettings((s) => s.setFeature);
  const push = useNavigation((s) => s.push);

  return (
    <section className="settings-section">
      <h2 className="list-subheader">Options avancées</h2>
      {OPTIONS.map((option) => {
        const enabled = features[option.key];
        const configurable = enabled && option.screen;
        return (
          <div key={option.key} className="option-row">
            <button
              type="button"
              className="option-row__main state"
              onClick={() => (configurable ? push({ type: option.screen! } as Overlay) : setFeature(option.key, !enabled))}
            >
              <span className="list-item__leading">
                <Icon name={option.icon} />
              </span>
              <span className="list-item__content">
                <span className="list-item__headline">{option.title}</span>
                <span className="list-item__supporting">{option.description}</span>
              </span>
              {configurable && <Icon name="chevronRight" className="option-row__chevron" />}
            </button>
            <Switch label={option.title} checked={enabled} onChange={(v) => setFeature(option.key, v)} />
          </div>
        );
      })}
    </section>
  );
}
