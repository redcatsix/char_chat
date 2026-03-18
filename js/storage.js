import { STORAGE_KEYS, DEFAULT_STYLE } from './constants.js';
import { DEFAULT_CHARACTERS } from './characters.js';

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function getStoredArray(key) {
  return safeParse(localStorage.getItem(key), []);
}

export function setStoredArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getStoredObject(key) {
  return safeParse(localStorage.getItem(key), {});
}

export function setStoredObject(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getCreatedCharacters() {
  return getStoredArray(STORAGE_KEYS.createdCharacters);
}

export function getFavorites() {
  return getStoredArray(STORAGE_KEYS.favorites);
}

export function getChats() {
  return getStoredObject(STORAGE_KEYS.chats);
}

export function getOnboardingSessions() {
  return getStoredObject(STORAGE_KEYS.onboardingSessions);
}

export function getCharacterConversation(characterId) {
  const chats = getChats();
  return Array.isArray(chats[characterId]) ? chats[characterId] : [];
}

export function setCharacterConversation(characterId, messages) {
  const chats = getChats();
  chats[characterId] = messages;
  setStoredObject(STORAGE_KEYS.chats, chats);
}

function normalizeOnboardingChoices(choices) {
  if (!Array.isArray(choices)) return [];
  return choices
    .map((choice, index) => ({
      id: typeof choice?.id === 'string' && choice.id.trim()
        ? choice.id.trim().slice(0, 48)
        : `choice_${index + 1}`,
      label: typeof choice?.label === 'string'
        ? choice.label.trim().slice(0, 80)
        : '',
      value: typeof choice?.value === 'string'
        ? choice.value.trim().slice(0, 200)
        : '',
    }))
    .filter((choice) => choice.label && choice.value)
    .slice(0, 5);
}

function normalizeOnboardingSession(session) {
  if (!session || typeof session !== 'object') return null;
  const worldSummary = session.worldSummary && typeof session.worldSummary === 'object'
    ? Object.fromEntries(
      Object.entries(session.worldSummary)
        .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
        .map(([key, value]) => [key.slice(0, 40), value.slice(0, 300)])
    )
    : {};

  return {
    active: Boolean(session.active),
    complete: Boolean(session.complete),
    step: Number.isFinite(session.step) ? Math.max(0, Math.min(20, Math.floor(session.step))) : 0,
    question: typeof session.question === 'string' ? session.question.slice(0, 500) : '',
    choices: normalizeOnboardingChoices(session.choices),
    allowDirectInput: session.allowDirectInput !== false,
    worldSummary,
    updatedAt: typeof session.updatedAt === 'string' ? session.updatedAt : new Date().toISOString(),
  };
}

export function getOnboardingSession(characterId) {
  const sessions = getOnboardingSessions();
  return normalizeOnboardingSession(sessions?.[characterId]) || null;
}

export function saveOnboardingSession(characterId, session) {
  if (!characterId) return;
  const sessions = getOnboardingSessions();
  const normalized = normalizeOnboardingSession(session);
  if (!normalized) {
    delete sessions[characterId];
  } else {
    sessions[characterId] = normalized;
  }
  setStoredObject(STORAGE_KEYS.onboardingSessions, sessions);
}

export function clearOnboardingSession(characterId) {
  if (!characterId) return;
  const sessions = getOnboardingSessions();
  delete sessions[characterId];
  setStoredObject(STORAGE_KEYS.onboardingSessions, sessions);
}

export function getCharacterActivityTime(character) {
  const base = new Date(character.updatedAt || character.createdAt || 0).getTime();
  const history = getCharacterConversation(character.id);
  const last = history[history.length - 1];
  const recent = new Date(last?.createdAt || 0).getTime();
  return Math.max(base || 0, recent || 0);
}

export function getAllCharacters() {
  const custom = getCreatedCharacters();
  const merged = [...DEFAULT_CHARACTERS, ...custom];
  return merged.sort((a, b) => getCharacterActivityTime(b) - getCharacterActivityTime(a));
}

export function findCharacterById(id) {
  return getAllCharacters().find((character) => character.id === id) || null;
}

export function isFavorite(id) {
  return getFavorites().includes(id);
}

export function toggleFavorite(id) {
  const favorites = getFavorites();
  const next = favorites.includes(id)
    ? favorites.filter((favoriteId) => favoriteId !== id)
    : [...favorites, id];
  setStoredArray(STORAGE_KEYS.favorites, next);
  return next.includes(id);
}

export function removeCreatedCharacter(id) {
  const created = getCreatedCharacters().filter((character) => character.id !== id);
  setStoredArray(STORAGE_KEYS.createdCharacters, created);

  const chats = getChats();
  delete chats[id];
  setStoredObject(STORAGE_KEYS.chats, chats);

  const sessions = getOnboardingSessions();
  delete sessions[id];
  setStoredObject(STORAGE_KEYS.onboardingSessions, sessions);

  const favorites = getFavorites().filter((favoriteId) => favoriteId !== id);
  setStoredArray(STORAGE_KEYS.favorites, favorites);
}

export function setSelectedCharacter(id) {
  localStorage.setItem(STORAGE_KEYS.selectedCharacter, id);
}

export function getSelectedCharacter() {
  return getUrlQueryParam('character')
    || localStorage.getItem(STORAGE_KEYS.selectedCharacter)
    || getAllCharacters()[0]?.id
    || null;
}

export function getUrlQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function ensureConversationInitialized(character) {
  if (!character) return;
  const existing = getCharacterConversation(character.id);
  if (existing.length > 0) return;
  setCharacterConversation(character.id, [
    {
      id: cryptoRandomId(),
      role: 'assistant',
      text: character.greeting,
      createdAt: new Date().toISOString(),
    },
  ]);
}

export function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getStylePreferences(character) {
  const prefs = getStoredObject(STORAGE_KEYS.stylePrefs);
  return {
    ...DEFAULT_STYLE,
    ...(character?.style || {}),
    ...(prefs[character?.id] || {}),
  };
}

export function saveStylePreferences(characterId, style) {
  const prefs = getStoredObject(STORAGE_KEYS.stylePrefs);
  prefs[characterId] = style;
  setStoredObject(STORAGE_KEYS.stylePrefs, prefs);
}

export function updateCharacterActivity(characterId) {
  const all = getAllCharacters();
  const target = all.find((item) => item.id === characterId);
  if (!target) return;
  if (target.isBuiltin) {
    const builtin = DEFAULT_CHARACTERS.find((item) => item.id === characterId);
    if (builtin) builtin.updatedAt = new Date().toISOString();
  } else {
    const created = getCreatedCharacters().map((item) => item.id === characterId
      ? { ...item, updatedAt: new Date().toISOString(), chats: (item.chats || 0) + 1 }
      : item);
    setStoredArray(STORAGE_KEYS.createdCharacters, created);
  }
}

export function seedInitialSelection() {
  const selected = localStorage.getItem(STORAGE_KEYS.selectedCharacter);
  if (!selected) {
    const first = getAllCharacters()[0];
    if (first) setSelectedCharacter(first.id);
  }
}
