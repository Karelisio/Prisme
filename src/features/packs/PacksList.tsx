import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@/app/navigation';
import { t } from '@/shared/i18n';
import { BUNDLED_PACKS, type Pack, loadPacks } from './packs';
import './packs.css';

export function usePacks() {
  return useQuery({ queryKey: ['packs'], queryFn: loadPacks, placeholderData: BUNDLED_PACKS, staleTime: 6 * 60 * 60_000 });
}

export function PacksList() {
  const { data } = usePacks();
  const push = useNavigation((s) => s.push);
  const packs = data?.packs ?? [];
  return (
    <div className="packs-grid">
      {packs.map((pack) => (
        <PackCard key={pack.id} pack={pack} onOpen={() => push({ type: 'pack', packId: pack.id })} />
      ))}
    </div>
  );
}

function PackCard({ pack, onOpen }: { pack: Pack; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="pack-card state"
      style={{
        // Voile sombre en bas : le titre reste lisible sur les dégradés clairs.
        backgroundImage: `linear-gradient(transparent 35%, rgb(0 0 0 / 0.4)), linear-gradient(145deg, ${pack.colors[0]}, ${pack.colors[1]})`,
      }}
      onClick={onOpen}
    >
      <span className="pack-card__title">{t(pack.title)}</span>
      <span className="pack-card__description">{t(pack.description)}</span>
    </button>
  );
}
