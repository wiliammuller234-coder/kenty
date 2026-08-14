import { loadState, saveState } from '../storage';

export function getCustomStickers() {
  return loadState('customStickers', []);
}

export function addCustomSticker(image) {
  const list = getCustomStickers();
  if (list.includes(image)) return list;
  const next = [image, ...list].slice(0, 30);
  saveState('customStickers', next);
  return next;
}
