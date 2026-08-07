export const DEFAULT_CHATS = [{ id: 'main', name: 'Кенты', emoji: '🔥' }];

export const CHAT_EMOJIS = ['🔥', '🌊', '🎮', '⚽', '🍕', '🎉', '📚', '🏠', '🎂', '💬'];

export function seedMessages() {
  return [{ id: 's1', system: true, text: 'Чат создан. Верификация пройдена — тут только свои.' }];
}
