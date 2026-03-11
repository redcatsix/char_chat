'use strict';

const MESSAGE_HISTORY_LIMIT = 30;
const MAX_CHARACTER_NAME_LENGTH = 50;
const MAX_MESSAGE_TEXT_LENGTH = 4000;

const STYLE_LABELS = {
  pov: { first: '1인칭', second: '2인칭', third: '3인칭' },
  length: { short: '짧게', medium: '보통', long: '길게' },
  pacing: { fast: '빠르게', natural: '자연스럽게', slow: '천천히' },
  tone: {
    romance: '로맨틱',
    slice: '일상형',
    mystery: '미스터리',
    fantasy: '판타지',
    soft: '다정한 위로',
  },
};

const VALID_STYLE_VALUES = {
  pov: new Set(Object.keys(STYLE_LABELS.pov)),
  length: new Set(Object.keys(STYLE_LABELS.length)),
  pacing: new Set(Object.keys(STYLE_LABELS.pacing)),
  tone: new Set(Object.keys(STYLE_LABELS.tone)),
};

function getStyleLabel(style, key, fallbackKey) {
  const labels = STYLE_LABELS[key] || {};
  return labels[style?.[key]] || labels[fallbackKey];
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLength).trim();
}

function validateStyle(style) {
  if (!style || typeof style !== 'object') return {};
  const validated = {};
  for (const key of ['pov', 'length', 'pacing', 'tone']) {
    if (typeof style[key] === 'string' && VALID_STYLE_VALUES[key].has(style[key])) {
      validated[key] = style[key];
    }
  }
  return validated;
}

function buildSystemPrompt(character, style) {
  const name = sanitizeString(character?.name, MAX_CHARACTER_NAME_LENGTH) || '이름 미상';
  const headline = sanitizeString(character?.headline, 200) || '소개 없음';
  const personality = sanitizeString(character?.personality, 1000) || '설정 없음';
  const greeting = sanitizeString(character?.greeting, 500) || '첫 인사 없음';
  const scenario = sanitizeString(character?.scenario, 1000) || '시나리오 없음';
  const tags = Array.isArray(character?.tags)
    ? character.tags.filter((t) => typeof t === 'string').slice(0, 8).join(', ')
    : '';
  const visibility = character?.visibility === 'private' ? 'private' : 'public';

  return [
    '너는 캐릭터챗 전용 AI다.',
    '항상 한국어로 답변하고, 캐릭터 설정을 유지한다.',
    '메타 설명은 사용자가 요청할 때만 제공한다.',
    '[캐릭터 템플릿]',
    `이름: ${name}`,
    `한 줄 소개: ${headline}`,
    `성격/설정: ${personality}`,
    `첫 인사: ${greeting}`,
    `시나리오: ${scenario}`,
    `태그: ${tags || '태그 없음'}`,
    `공개 범위: ${visibility}`,
    '[응답 스타일]',
    `시점: ${getStyleLabel(style, 'pov', 'third')}`,
    `길이: ${getStyleLabel(style, 'length', 'medium')}`,
    `전개 속도: ${getStyleLabel(style, 'pacing', 'natural')}`,
    `톤: ${getStyleLabel(style, 'tone', 'romance')}`,
    '대화 기록을 이어서 자연스럽게 응답한다.',
  ].join('\n');
}

function getMaxTokens(style) {
  switch (style?.length) {
    case 'short':
      return 240;
    case 'long':
      return 720;
    case 'medium':
    default:
      return 420;
  }
}

function getTemperature(style) {
  switch (style?.tone) {
    case 'mystery':
      return 0.8;
    case 'soft':
      return 0.7;
    case 'fantasy':
      return 0.95;
    case 'slice':
      return 0.75;
    case 'romance':
    default:
      return 0.9;
  }
}

function normalizeChatMessage(message) {
  if (!message || typeof message !== 'object') return null;
  if (!['assistant', 'user'].includes(message.role)) return null;
  if (typeof message.text !== 'string') return null;
  const text = message.text.slice(0, MAX_MESSAGE_TEXT_LENGTH);
  return { role: message.role, content: text };
}

module.exports = {
  MESSAGE_HISTORY_LIMIT,
  MAX_CHARACTER_NAME_LENGTH,
  MAX_MESSAGE_TEXT_LENGTH,
  STYLE_LABELS,
  VALID_STYLE_VALUES,
  getStyleLabel,
  sanitizeString,
  validateStyle,
  buildSystemPrompt,
  getMaxTokens,
  getTemperature,
  normalizeChatMessage,
};
