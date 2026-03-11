import { TOAST_DURATION_MS, MAX_TAGS, DEFAULT_STYLE, STYLE_LABELS } from './constants.js';

let toastTimer = null;

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatCount(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}만`;
  return new Intl.NumberFormat('ko-KR').format(value);
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function showToast(message) {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), TOAST_DURATION_MS);
}

export function updateAiStatus(state, label) {
  const badge = document.getElementById('aiStatusBadge');
  if (!badge) return;
  badge.classList.remove('waiting', 'online', 'fallback', 'checking');
  badge.classList.add(state || 'waiting');
  badge.textContent = label || '연결 대기';
}

export function normalizeTags(input) {
  if (!input) return [];
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .slice(0, MAX_TAGS);
}

export function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function getFormField(form, name) {
  return form?.elements?.namedItem(name);
}

export function getStyleValueOrFallback(style, key) {
  return style?.[key] || DEFAULT_STYLE[key];
}

export function getStyleLabel(key, value) {
  const labels = STYLE_LABELS[key] || {};
  return labels[value] || '';
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

export function getCharacterThumbnail(character) {
  const value = typeof character?.cover === 'string' ? character.cover.trim() : '';
  if (/^idb:/.test(value)) {
    // Resolved asynchronously via resolveIdbCovers(); return cached URL if available
    return character._resolvedCover || '';
  }
  return /^(https?:\/\/|data:image\/)/i.test(value) ? value : '';
}
