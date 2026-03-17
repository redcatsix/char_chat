import { STORAGE_KEYS, DEFAULT_STYLE, DEFAULT_MODEL_ID } from './constants.js';
import { DEFAULT_CHARACTERS } from './characters.js';
import { getCoverImage, deleteCoverImage } from './image-store.js';

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

// --- Per-character conversation storage (P1 #6) ---

function chatKey(characterId) {
  return `${STORAGE_KEYS.chats}:${characterId}`;
}

export function getChats() {
  // Legacy compatibility: read from old unified key first
  const legacy = safeParse(localStorage.getItem(STORAGE_KEYS.chats), null);
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    // Migrate: split into per-character keys
    for (const [id, messages] of Object.entries(legacy)) {
      if (Array.isArray(messages)) {
        localStorage.setItem(chatKey(id), JSON.stringify(messages));
      }
    }
    localStorage.removeItem(STORAGE_KEYS.chats);
  }
  // Build object from per-character keys (for export / legacy callers)
  const result = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`${STORAGE_KEYS.chats}:`)) {
      const id = key.slice(STORAGE_KEYS.chats.length + 1);
      result[id] = safeParse(localStorage.getItem(key), []);
    }
  }
  return result;
}

export function getCharacterConversation(characterId) {
  // Try per-character key first
  const perChar = safeParse(localStorage.getItem(chatKey(characterId)), null);
  if (Array.isArray(perChar)) return perChar;
  // Fallback: legacy unified key
  const legacy = safeParse(localStorage.getItem(STORAGE_KEYS.chats), null);
  if (legacy && Array.isArray(legacy[characterId])) return legacy[characterId];
  return [];
}

export function setCharacterConversation(characterId, messages) {
  localStorage.setItem(chatKey(characterId), JSON.stringify(messages));
}

export function getCharacterActivityTime(character) {
  const base = new Date(character.updatedAt || character.createdAt || 0).getTime();
  const history = getCharacterConversation(character.id);
  const last = history[history.length - 1];
  const recent = new Date(last?.createdAt || 0).getTime();
  return Math.max(base || 0, recent || 0);
}

// --- Character list with caching (P1 #5) ---

let _cachedCharacters = null;
let _cacheVersion = 0;
let _lastCacheVersion = -1;

export function invalidateCharacterCache() {
  _cacheVersion++;
}

export function getAllCharacters() {
  if (_cachedCharacters && _lastCacheVersion === _cacheVersion) {
    return _cachedCharacters;
  }
  const custom = getCreatedCharacters();
  const merged = [...DEFAULT_CHARACTERS, ...custom];
  _cachedCharacters = merged.sort((a, b) => getCharacterActivityTime(b) - getCharacterActivityTime(a));
  _lastCacheVersion = _cacheVersion;
  return _cachedCharacters;
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
  invalidateCharacterCache();

  localStorage.removeItem(chatKey(id));

  const favorites = getFavorites().filter((favoriteId) => favoriteId !== id);
  setStoredArray(STORAGE_KEYS.favorites, favorites);

  // Clean up IndexedDB cover image
  deleteCoverImage(id).catch(() => {});
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
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
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

export function getSelectedModel() {
  return localStorage.getItem(STORAGE_KEYS.selectedModel) || DEFAULT_MODEL_ID;
}

export function setSelectedModel(modelId) {
  localStorage.setItem(STORAGE_KEYS.selectedModel, modelId);
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
  invalidateCharacterCache();
}

export function seedInitialSelection() {
  const selected = localStorage.getItem(STORAGE_KEYS.selectedCharacter);
  if (!selected) {
    const first = getAllCharacters()[0];
    if (first) setSelectedCharacter(first.id);
  }
}

export async function resolveIdbCovers(characters) {
  const pending = characters.filter((c) => typeof c.cover === 'string' && c.cover.startsWith('idb:'));
  await Promise.all(pending.map(async (c) => {
    const id = c.cover.slice(4);
    try {
      c._resolvedCover = await getCoverImage(id);
    } catch {
      c._resolvedCover = '';
    }
  }));
}
