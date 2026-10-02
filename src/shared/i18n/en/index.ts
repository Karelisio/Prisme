// Traductions anglaises, une table par domaine de l'app (clé = texte français exact).
import { AUTOMATION } from './automation';
import { CREATION } from './creation';
import { SHELL } from './shell';

export const EN: Readonly<Record<string, string>> = { ...SHELL, ...CREATION, ...AUTOMATION };
