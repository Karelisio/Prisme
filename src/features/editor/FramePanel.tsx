import { Button, IconButton } from '@/shared/ui/components';
import { Slider } from './controls';
import { type Geometry, MAX_STRAIGHTEN, MAX_ZOOM, type Size, mirrorGeometry, rotateGeometry, straightenGeometry, zoomGeometry } from './geometry';

const decimal = (value: number, digits: number) => value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** « +3,5° », « −2° », « 0° » (jamais « −0° »). */
function formatDegrees(degrees: number): string {
  if (Math.abs(degrees) < 0.05) return '0°';
  return `${degrees > 0 ? '+' : '−'}${decimal(Math.abs(degrees), Math.abs(degrees) % 1 === 0 ? 0 : 1)}°`;
}

/** Rotation par quarts de tour, miroir, redressement fin et zoom ; le déplacement se fait au doigt sur l'aperçu. */
export function FramePanel({
  geometry,
  source,
  output,
  fills,
  onChange,
  onRestore,
}: {
  geometry: Geometry;
  source: Size;
  output: Size;
  /** Mode « Remplir » : seul cas où la zone se déplace et se zoome. */
  fills: boolean;
  onChange: (geometry: Geometry) => void;
  onRestore: () => void;
}) {
  return (
    <>
      <div className="editor__row editor__row--tools">
        <IconButton icon="rotateLeft" label="Pivoter à gauche" variant="tonal" onClick={() => onChange(rotateGeometry(geometry, -1, source, output))} />
        <IconButton icon="rotateRight" label="Pivoter à droite" variant="tonal" onClick={() => onChange(rotateGeometry(geometry, 1, source, output))} />
        <IconButton
          icon="flip"
          label="Miroir horizontal"
          variant="tonal"
          className="editor__toggle"
          selected={geometry.mirror}
          onClick={() => onChange(mirrorGeometry(geometry, source, output))}
        />
        <span className="editor__spacer" />
        <Button variant="text" onClick={onRestore}>
          Rétablir le cadrage
        </Button>
      </div>
      <Slider
        label="Redressement"
        min={-MAX_STRAIGHTEN}
        max={MAX_STRAIGHTEN}
        step={0.5}
        value={geometry.straighten}
        valueText={formatDegrees(geometry.straighten)}
        onChange={(degrees) => onChange(straightenGeometry(geometry, degrees, source, output))}
      />
      <Slider
        label="Zoom"
        min={1}
        max={MAX_ZOOM}
        step={0.05}
        value={geometry.view.zoom}
        valueText={`×${decimal(geometry.view.zoom, 1)}`}
        disabled={!fills}
        onChange={(zoom) => onChange(zoomGeometry(geometry, source, output, zoom / geometry.view.zoom))}
      />
      <p className="editor__hint">{fills ? 'Glisse la photo pour la déplacer, pince ou utilise la molette pour zoomer.' : 'Le déplacement et le zoom ne servent qu’avec « Remplir (recadrer) ».'}</p>
    </>
  );
}
