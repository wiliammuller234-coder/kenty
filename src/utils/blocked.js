import { loadState, saveState } from '../storage';

export function getBlocked() {
  return loadState('blockedPhones', []);
}

export function isBlocked(phone) {
  return getBlocked().includes(phone);
}

export function toggleBlock(phone) {
  const list = getBlocked();
  const next = list.includes(phone) ? list.filter((p) => p !== phone) : [...list, phone];
  saveState('blockedPhones', next);
  return next;
}
