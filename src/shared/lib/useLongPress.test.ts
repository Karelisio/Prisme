// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { haptic } from './haptics';
import { useLongPress } from './useLongPress';

vi.mock('./haptics', () => ({ haptic: vi.fn() }));

const at = (x: number, y: number) => ({ clientX: x, clientY: y }) as never;
const click = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('appui long', () => {
  it('se déclenche après 500 ms sans bouger, avec un retour haptique', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    const press = result.current as Required<typeof result.current>;
    press.onPointerDown(at(10, 10));
    vi.advanceTimersByTime(499);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith('long');
  });

  it('le clic qui suit le relâchement est annulé, une seule fois', () => {
    const { result } = renderHook(() => useLongPress(vi.fn()));
    const press = result.current as Required<typeof result.current>;
    press.onPointerDown(at(0, 0));
    vi.advanceTimersByTime(600);
    press.onPointerUp();
    const first = click();
    press.onClickCapture(first as never);
    expect(first.preventDefault).toHaveBeenCalled();
    expect(first.stopPropagation).toHaveBeenCalled();
    const second = click();
    press.onClickCapture(second as never);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });

  it('un toucher court reste un clic ordinaire', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    const press = result.current as Required<typeof result.current>;
    press.onPointerDown(at(0, 0));
    vi.advanceTimersByTime(200);
    press.onPointerUp();
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
    const tap = click();
    press.onClickCapture(tap as never);
    expect(tap.preventDefault).not.toHaveBeenCalled();
  });

  it('un défilement (doigt qui bouge, geste annulé ou quitté) l’interrompt', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    const press = result.current as Required<typeof result.current>;

    press.onPointerDown(at(0, 0));
    press.onPointerMove(at(4, 3));
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    for (const cancel of [() => press.onPointerMove(at(0, 40)), () => press.onPointerCancel(), () => press.onPointerLeave()]) {
      press.onPointerDown(at(0, 0));
      cancel();
      vi.advanceTimersByTime(1000);
    }
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('un nouvel appui repart de zéro', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    const press = result.current as Required<typeof result.current>;
    press.onPointerDown(at(0, 0));
    vi.advanceTimersByTime(300);
    press.onPointerDown(at(0, 0));
    vi.advanceTimersByTime(300);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('sans rappel, ne branche aucun gestionnaire et laisse le menu du navigateur tranquille', () => {
    const { result } = renderHook(() => useLongPress(undefined));
    expect(result.current).toEqual({});
  });

  it('empêche le menu contextuel du navigateur pendant un appui long', () => {
    const { result } = renderHook(() => useLongPress(vi.fn()));
    const press = result.current as Required<typeof result.current>;
    const event = { preventDefault: vi.fn() };
    press.onContextMenu(event as never);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
