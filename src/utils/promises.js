export function getShameTag(promises) {
  const broken = promises.filter((p) => p.status === 'broken').length;
  if (broken >= 3) return '👻 Супервоздух';
  if (broken >= 1) return '👻 Воздух';
  return null;
}

export function isOverdue(promise) {
  if (promise.status !== 'pending') return false;
  return new Date(promise.deadline) < new Date(new Date().toDateString());
}
