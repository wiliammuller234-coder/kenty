export function normalizePhone(raw) {
  return (raw || '').replace(/\D/g, '');
}
