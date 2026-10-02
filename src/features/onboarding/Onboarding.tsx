import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { useBackHandler } from '@/app/backStack';
import { runTransition } from '@/app/transitions';
import { ThemePicker } from '@/features/settings/pickers';
import { SourceToggles } from '@/features/settings/SourceToggles';
import { useSettings } from '@/features/settings/store';
import { Button, Chip, Icon, IconButton } from '@/shared/ui/components';
import type { IconName } from '@/shared/ui/icons';
import { showSnackbar } from '@/shared/ui/overlays';
import { MAX_TASTE_CATEGORIES, MAX_TASTE_COLORS, type Tastes, useOnboarding } from './store';
import { TASTE_CATEGORIES, TASTE_COLORS, hasTastes, toggleCategory, toggleColor } from './tastes';
import './onboarding.css';

const STEP_COUNT = 3;

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'wallpaper', title: 'Des fonds en haute résolution', text: 'Photos, art et espace, libres de droits.' },
  { icon: 'mobile', title: 'Un aperçu avant d’appliquer', text: 'Écrans d’accueil et de verrouillage simulés.' },
  { icon: 'favorite', title: 'Tes favoris, même hors ligne', text: 'Collections et historique sur ton téléphone.' },
];

/**
 * Introduction : bienvenue, sources, goûts. Elle s'affiche au tout premier lancement (et via
 * Réglages › Revoir l'introduction), se passe à tout moment, et ne revient plus une fois fermée.
 */
export function Onboarding() {
  const saved = useOnboarding((s) => s.tastes);
  const finish = useOnboarding((s) => s.finish);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'next' | 'previous'>('next');
  const [tastes, setTastes] = useState<Tastes>(saved);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const go = (target: number) => {
    setDirection(target > step ? 'next' : 'previous');
    setStep(target);
  };

  /** Ferme l'introduction ; les goûts choisis ne sont gardés que si elle est menée à son terme. */
  const close = (keepTastes: boolean) => {
    const chosen = keepTastes ? tastes : undefined;
    runTransition(() => finish(chosen), { kind: 'fade' });
    if (chosen && hasTastes(chosen)) showSnackbar('Tes goûts orientent désormais « Pour toi »');
  };

  const last = step === STEP_COUNT - 1;
  const next = () => (last ? close(true) : go(step + 1));
  const previous = () => (step > 0 ? go(step - 1) : close(false));
  useBackHandler(true, previous);

  // À chaque étape, le titre prend le focus : les lecteurs d'écran l'annoncent.
  useEffect(() => titleRef.current?.focus({ preventScroll: true }), [step]);

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-label="Introduction">
      <div className="intro__top">
        {step > 0 ? <IconButton icon="arrowBack" label="Retour" onClick={previous} /> : <span />}
        <Button variant="text" onClick={() => close(false)}>
          Passer
        </Button>
      </div>

      <div className="intro__body" key={step} data-direction={direction}>
        {step === 0 && <Welcome titleRef={titleRef} />}
        {step === 1 && <Sources titleRef={titleRef} />}
        {step === 2 && <Taste titleRef={titleRef} tastes={tastes} onChange={setTastes} />}
      </div>

      <div className="intro__bottom">
        <p className="visually-hidden" role="status">
          Étape {step + 1} sur {STEP_COUNT}
        </p>
        <div className="intro__dots" aria-hidden="true">
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span key={i} className={i === step ? 'intro__dot intro__dot--active' : 'intro__dot'} />
          ))}
        </div>
        <Button large onClick={next}>
          {last ? 'Commencer' : 'Suivant'}
        </Button>
      </div>
    </div>
  );
}

interface StepProps {
  titleRef: RefObject<HTMLHeadingElement | null>;
}

function Heading({ titleRef, children, lead }: StepProps & { children: ReactNode; lead: ReactNode }) {
  return (
    <>
      <h1 className="intro__title" ref={titleRef} tabIndex={-1}>
        {children}
      </h1>
      <p className="intro__lead">{lead}</p>
    </>
  );
}

function Welcome({ titleRef }: StepProps) {
  const themeMode = useSettings((s) => s.themeMode);
  const update = useSettings((s) => s.update);
  return (
    <>
      <div className="intro-hero" aria-hidden="true">
        <span className="intro-hero__card intro-hero__card--left" />
        <span className="intro-hero__card intro-hero__card--right" />
        <span className="intro-hero__card intro-hero__card--center">
          <Icon name="wallpaper" size={40} />
        </span>
      </div>
      <Heading titleRef={titleRef} lead="Des fonds d’écran soignés, à appliquer en un geste.">
        Bienvenue dans Prisme
      </Heading>
      <ul className="intro-features">
        {FEATURES.map((feature) => (
          <li key={feature.title}>
            <span className="intro-features__icon">
              <Icon name={feature.icon} />
            </span>
            <span>
              <strong>{feature.title}</strong>
              <span>{feature.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="intro__label">Choisis ton ambiance</p>
      <ThemePicker value={themeMode} onChange={(mode) => update({ themeMode: mode })} />
    </>
  );
}

function Sources({ titleRef }: StepProps) {
  return (
    <>
      <Heading titleRef={titleRef} lead="Prisme réunit plusieurs banques d’images libres de droits. Garde celles que tu veux : tu pourras en changer dans Réglages › Sources.">
        Tes sources
      </Heading>
      <div className="intro__list">
        <SourceToggles />
      </div>
    </>
  );
}

function Taste({ titleRef, tastes, onChange }: StepProps & { tastes: Tastes; onChange: (tastes: Tastes) => void }) {
  return (
    <>
      <Heading titleRef={titleRef} lead="Choisis des thèmes et des couleurs : « Pour toi » en tiendra compte. Cette étape est facultative.">
        Qu’est-ce qui te plaît ?
      </Heading>
      <p className="intro__label">
        Thèmes <span className="intro__count">{tastes.categories.length}/{MAX_TASTE_CATEGORIES}</span>
      </p>
      <div className="chip-wrap" role="group" aria-label="Thèmes">
        {TASTE_CATEGORIES.map((category) => (
          <Chip key={category.key} selected={tastes.categories.includes(category.key)} onClick={() => onChange(toggleCategory(tastes, category.key))}>
            {category.label}
          </Chip>
        ))}
      </div>
      <p className="intro__label">
        Couleurs <span className="intro__count">{tastes.colors.length}/{MAX_TASTE_COLORS}</span>
      </p>
      <div className="chip-wrap" role="group" aria-label="Couleurs">
        {TASTE_COLORS.map((color) => (
          <Chip key={color.value} swatch={color.swatch} selected={tastes.colors.includes(color.value)} onClick={() => onChange(toggleColor(tastes, color.value))}>
            {color.label}
          </Chip>
        ))}
      </div>
    </>
  );
}
