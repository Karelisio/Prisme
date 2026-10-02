import { type FormEvent, useState } from 'react';
import { goBack } from '@/app/navigation';
import '@/features/settings/settings.css';
import { sourceLabel } from '@/features/sources/registry';
import { t } from '@/shared/i18n';
import { toWebUrl } from '@/shared/native';
import { Button, Chip, Icon, IconButton, ListItem, TextField } from '@/shared/ui/components';
import { hiddenCount, useDiscover } from './store';
import './discover.css';

/** Réglages › Contenus masqués : sujets, auteurs et fonds retirés des grilles. */
export function HiddenScreen() {
  const store = useDiscover();
  const [word, setWord] = useState('');
  const wallpapers = Object.values(store.hiddenIds).sort((a, b) => b.at - a.at);
  const authors = Object.values(store.hiddenAuthors).sort((a, b) => b.at - a.at);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    store.addHiddenWord(word);
    setWord('');
  };

  return (
    <div className="screen overlay-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label={t('Retour')} onClick={goBack} />
        <h1 className="top-bar__title">{t('Contenus masqués')}</h1>
      </header>

      <section className="settings-section">
        <h2 className="list-subheader">{t('Sujets')}</h2>
        <form className="hidden-add" onSubmit={submit}>
          <TextField label={t('Masquer un sujet')} placeholder={t('ex. voiture, chat')} value={word} onChange={(e) => setWord(e.target.value)} />
          <Button type="submit" variant="tonal" disabled={!word.trim()}>
            {t('Ajouter')}
          </Button>
        </form>
        {store.hiddenWords.length > 0 ? (
          <div className="chip-wrap chip-wrap--padded">
            {store.hiddenWords.map((w) => (
              <Chip key={w} selected onClick={() => store.removeHiddenWord(w)} aria-label={t('Réafficher le sujet {word}', { word: w })}>
                {w} ✕
              </Chip>
            ))}
          </div>
        ) : (
          <p className="hidden-empty">{t('Aucun sujet masqué.')}</p>
        )}
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">{t('Photographes et auteurs')}</h2>
        {authors.length > 0 ? (
          <ul className="list">
            {authors.map((a) => (
              <li key={a.key}>
                <ListItem
                  headline={a.name}
                  supporting={sourceLabel(a.source)}
                  leading={<Icon name="personOff" />}
                  trailing={
                    <Button variant="text" onClick={() => store.unhideAuthor(a.key)} aria-label={t('Réafficher {name}', { name: a.name })}>
                      {t('Réafficher')}
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="hidden-empty">{t('Aucun auteur masqué.')}</p>
        )}
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">{t('Fonds')}</h2>
        {wallpapers.length > 0 ? (
          <ul className="list">
            {wallpapers.map((h) => (
              <li key={h.id}>
                <ListItem
                  headline={h.alt}
                  leading={<img className="hidden-thumb" src={toWebUrl(h.thumb)} alt="" />}
                  trailing={
                    <Button variant="text" onClick={() => store.unhideWallpaper(h.id)} aria-label={t('Réafficher {name}', { name: h.alt })}>
                      {t('Réafficher')}
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="hidden-empty">{t('Aucun fond masqué.')}</p>
        )}
      </section>

      {hiddenCount(store) > 0 && (
        <div className="hidden-clear">
          <Button variant="outlined" icon="visibility" onClick={store.clearHidden}>
            {t('Tout réafficher')}
          </Button>
        </div>
      )}
    </div>
  );
}
