'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const http = require('node:http');
const path = require('node:path');

const ROOT_DIR = process.cwd();
const ROOT_DIR_NORMALIZED = path.resolve(ROOT_DIR).toLowerCase();
const MAX_BODY_BYTES = 1024 * 1024;
const MESSAGE_HISTORY_LIMIT = 30;
const MAX_CHARACTER_NAME_LENGTH = 50;
const MAX_MESSAGE_TEXT_LENGTH = 4000;

loadLocalEnv();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const API_URL = 'https://api.deepinfra.com/v1/openai/chat/completions';
const DEFAULT_MODEL = process.env.DEEPINFRA_MODEL || 'deepseek-ai/DeepSeek-V3.2';

// Rate limiting: per-IP sliding window
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitMap = new Map();

// Periodic cleanup of stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitMap) {
    const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, valid);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

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

const CHAT_MODE = 'chat';
const ONBOARDING_MODE = 'onboarding';
const ONBOARDING_MIN_CHOICES = 2;
const ONBOARDING_MAX_CHOICES = 5;
const ONBOARDING_MAX_STEP = 10;

function loadLocalEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const index = trimmed.indexOf('=');
    if (index <= 0) return;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

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

function normalizeWorldSummary(worldSummary) {
  if (!worldSummary || typeof worldSummary !== 'object') return {};
  return Object.fromEntries(
    Object.entries(worldSummary)
      .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
      .map(([key, value]) => [key.slice(0, 40), value.slice(0, 300).trim()])
      .filter(([, value]) => value)
  );
}

function buildWorldSummaryLines(worldSummary) {
  const entries = Object.entries(normalizeWorldSummary(worldSummary));
  if (entries.length === 0) return [];

  return [
    '[세션 세계관 설정]',
    ...entries.map(([key, value]) => `${key}: ${value}`),
    '위 세계관 설정을 현재 대화의 우선 맥락으로 반영한다.',
  ];
}

function buildSystemPrompt(character, style, worldSummary) {
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
    ...buildWorldSummaryLines(worldSummary),
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

const ONBOARDING_TEMPLATES = [
  {
    step: 1,
    question: '어떤 장르/분위기의 세계로 시작할까요?',
    choices: [
      { id: 'fantasy', label: '판타지', value: '정통 판타지 분위기로 시작하고 싶어.' },
      { id: 'modern_fantasy', label: '현실 판타지', value: '현대 배경의 현실 판타지로 시작하고 싶어.' },
      { id: 'dark_fantasy', label: '다크 판타지', value: '어둡고 긴장감 있는 다크 판타지로 가고 싶어.' },
    ],
  },
  {
    step: 2,
    question: '세계의 시대/기술 수준은 어느 쪽이 좋아요?',
    choices: [
      { id: 'ancient_era', label: '고전 시대', value: '고전 시대 배경이 좋아.' },
      { id: 'modern_era', label: '현대', value: '현대 기반으로 진행하고 싶어.' },
      { id: 'future_era', label: '근미래', value: '근미래 기술이 있는 배경이 좋아.' },
    ],
  },
  {
    step: 3,
    question: '주인공의 기본 역할은 어떻게 둘까요?',
    choices: [
      { id: 'warrior_role', label: '전투형', value: '전투에 강한 역할로 시작하고 싶어.' },
      { id: 'mage_role', label: '마법/능력형', value: '마법이나 초능력을 다루는 역할이 좋아.' },
      { id: 'support_role', label: '조력/탐색형', value: '정보수집이나 조력 중심 역할이 좋아.' },
    ],
  },
  {
    step: 4,
    question: '이야기의 핵심 목표를 정해볼까요?',
    choices: [
      { id: 'save_world_goal', label: '세계 구원', value: '큰 위협에서 세계를 지키는 목표가 좋아.' },
      { id: 'personal_goal', label: '개인 서사', value: '개인적인 성장이나 복수가 중심이면 좋겠어.' },
      { id: 'mystery_goal', label: '비밀 추적', value: '숨겨진 비밀을 추적하는 흐름이 좋아.' },
    ],
  },
];

function getOnboardingTemplate(step) {
  const normalizedStep = Number.isFinite(step)
    ? Math.max(1, Math.min(ONBOARDING_MAX_STEP, Math.floor(step)))
    : 1;
  return ONBOARDING_TEMPLATES.find((item) => item.step === normalizedStep)
    || ONBOARDING_TEMPLATES[ONBOARDING_TEMPLATES.length - 1];
}

function sanitizeChoiceId(value, fallbackIndex) {
  const normalized = sanitizeString(value, 40)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || `choice_${fallbackIndex + 1}`;
}

function normalizeOnboardingChoices(choices, fallbackChoices = []) {
  const source = Array.isArray(choices) ? choices : [];
  const normalized = source
    .map((choice, index) => ({
      id: sanitizeChoiceId(choice?.id, index),
      label: sanitizeString(choice?.label, 80),
      value: sanitizeString(choice?.value, 240),
    }))
    .filter((choice) => choice.label && choice.value)
    .slice(0, ONBOARDING_MAX_CHOICES);

  if (normalized.length >= ONBOARDING_MIN_CHOICES) {
    return normalized;
  }

  return (Array.isArray(fallbackChoices) ? fallbackChoices : [])
    .map((choice, index) => ({
      id: sanitizeChoiceId(choice?.id, index),
      label: sanitizeString(choice?.label, 80),
      value: sanitizeString(choice?.value, 240),
    }))
    .filter((choice) => choice.label && choice.value)
    .slice(0, ONBOARDING_MAX_CHOICES);
}

function normalizeOnboardingState(state) {
  if (!state || typeof state !== 'object') return null;
  const step = Number.isFinite(state.step)
    ? Math.max(1, Math.min(ONBOARDING_MAX_STEP, Math.floor(state.step)))
    : 1;
  const template = getOnboardingTemplate(step);
  const complete = Boolean(state.complete);
  const active = complete ? false : state.active !== false;

  return {
    active,
    complete,
    step,
    question: complete ? '' : sanitizeString(state.question, 400) || template.question,
    choices: complete ? [] : normalizeOnboardingChoices(state.choices, template.choices),
    allowDirectInput: state.allowDirectInput !== false,
    worldSummary: normalizeWorldSummary(state.worldSummary),
  };
}

function createInitialOnboardingState() {
  const template = getOnboardingTemplate(1);
  return {
    active: true,
    complete: false,
    step: 1,
    question: template.question,
    choices: normalizeOnboardingChoices(template.choices, template.choices),
    allowDirectInput: true,
    worldSummary: {},
  };
}

function hasOnboardingInput(payload) {
  return (
    (payload?.userInputType === 'button' && typeof payload?.selectedChoiceId === 'string' && payload.selectedChoiceId.trim())
    || (typeof payload?.directInputText === 'string' && payload.directInputText.trim())
    || (typeof payload?.user === 'string' && payload.user.trim())
  );
}

function parseOnboardingUserInput(payload, onboardingState) {
  if (payload?.userInputType === 'button') {
    const selectedChoiceId = sanitizeChoiceId(payload?.selectedChoiceId, 0);
    const selectedChoice = onboardingState.choices.find((choice) => choice.id === selectedChoiceId);
    if (!selectedChoice) {
      return { error: 'Invalid selectedChoiceId for onboarding button input.' };
    }

    return {
      userInputType: 'button',
      selectedChoiceId: selectedChoice.id,
      text: selectedChoice.value,
      label: selectedChoice.label,
    };
  }

  const directInputText = sanitizeString(payload?.directInputText || payload?.user, 500);
  if (!directInputText) {
    return { error: 'directInputText is required for onboarding text input.' };
  }

  return {
    userInputType: 'text',
    directInputText,
    text: directInputText,
    label: directInputText,
  };
}

function toReplyText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function parseJsonLoose(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }
  return null;
}

function buildOnboardingSystemPrompt(character, onboardingState) {
  const name = sanitizeString(character?.name, MAX_CHARACTER_NAME_LENGTH) || '이름 미상';
  const headline = sanitizeString(character?.headline, 200) || '소개 없음';
  const personality = sanitizeString(character?.personality, 900) || '설정 없음';
  const scenario = sanitizeString(character?.scenario, 900) || '시나리오 없음';
  const worldSummary = normalizeWorldSummary(onboardingState?.worldSummary);

  return [
    '너는 캐릭터챗 온보딩 설계자다.',
    '목표: 5~10턴 내에서 세계관 설정을 정리한 뒤 일반 대화 모드로 넘긴다.',
    '반드시 JSON 객체만 출력한다. 코드블록/설명 문장 금지.',
    'JSON 스키마:',
    '{"reply":"string","complete":boolean,"question":"string","choices":[{"id":"string","label":"string","value":"string"}],"allowDirectInput":boolean,"worldSummary":{"genre":"string","era":"string","background":"string","job":"string","tone":"string","coreGoal":"string","conflict":"string","notes":"string"}}',
    `현재 단계: ${onboardingState?.step || 1}`,
    '규칙:',
    '- complete=false면 question/choices를 반드시 채우고, choices 개수는 2~5개.',
    '- complete=true면 question은 빈 문자열, choices는 빈 배열.',
    '- choice.id는 영문 소문자/숫자/밑줄/하이픈만 사용.',
    '- 모든 텍스트는 한국어.',
    '- 사용자가 "알아서 설정해줘" 같은 의도를 보이면 complete=true로 전환하고 worldSummary를 완성.',
    '[캐릭터 컨텍스트]',
    `이름: ${name}`,
    `한 줄 소개: ${headline}`,
    `성격/설정: ${personality}`,
    `시나리오: ${scenario}`,
    '[현재 누적 세계관]',
    JSON.stringify(worldSummary),
  ].join('\n');
}

function buildOnboardingUserMessage(onboardingState, userInput) {
  return JSON.stringify({
    current: {
      step: onboardingState.step,
      question: onboardingState.question,
      choices: onboardingState.choices,
      worldSummary: onboardingState.worldSummary,
    },
    userInput,
    outputRules: {
      minChoices: ONBOARDING_MIN_CHOICES,
      maxChoices: ONBOARDING_MAX_CHOICES,
      mustBeJson: true,
    },
  });
}

function getFallbackOnboardingQuestion(step) {
  return getOnboardingTemplate(step).question;
}

function getFallbackOnboardingChoices(step) {
  return getOnboardingTemplate(step).choices;
}

function buildCompletedOnboardingState(step, worldSummary) {
  return {
    active: false,
    complete: true,
    step: Math.max(1, Math.min(ONBOARDING_MAX_STEP, Math.floor(step))),
    question: '',
    choices: [],
    allowDirectInput: false,
    worldSummary: normalizeWorldSummary(worldSummary),
  };
}

function buildIdleOnboardingState(worldSummary) {
  return {
    active: false,
    complete: false,
    step: 0,
    question: '',
    choices: [],
    allowDirectInput: false,
    worldSummary: normalizeWorldSummary(worldSummary),
  };
}

async function requestDeepInfra(apiKey, upstreamPayload) {
  let upstream;
  try {
    upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(upstreamPayload),
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: `Failed to reach DeepInfra: ${error.message}`,
      detail: null,
    };
  }

  const raw = await upstream.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!upstream.ok) {
    return {
      ok: false,
      status: upstream.status,
      error: typeof data?.error === 'string'
        ? data.error
        : data?.error?.message || 'DeepInfra request failed.',
      detail: data,
    };
  }

  return { ok: true, status: upstream.status, data };
}

function isSafePath(absolutePath) {
  const normalized = absolutePath.toLowerCase();
  const rootWithSep = ROOT_DIR_NORMALIZED.endsWith(path.sep)
    ? ROOT_DIR_NORMALIZED
    : `${ROOT_DIR_NORMALIZED}${path.sep}`;
  return normalized === ROOT_DIR_NORMALIZED || normalized.startsWith(rootWithSep);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });

    req.on('error', (error) => reject(error));
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON payload.'));
      }
    });
  });
}

async function serveStatic(req, res, pathname) {
  let targetPath = pathname === '/' ? '/index.html' : pathname;

  try {
    targetPath = decodeURIComponent(targetPath);
  } catch {
    sendText(res, 400, 'Bad Request');
    return;
  }

  // Block dotfile access (except root)
  if (targetPath !== '/' && /\/\./.test(targetPath)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  const resolved = path.resolve(ROOT_DIR, `.${targetPath}`);
  if (!isSafePath(resolved)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  let finalPath = resolved;
  try {
    const stat = await fsp.stat(resolved);
    if (stat.isDirectory()) {
      finalPath = path.join(resolved, 'index.html');
    }
  } catch {
    sendText(res, 404, 'Not Found');
    return;
  }

  try {
    const file = await fsp.readFile(finalPath);
    const ext = path.extname(finalPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': file.byteLength,
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    res.end(file);
  } catch {
    sendText(res, 404, 'Not Found');
  }
}

async function handleChatRequest(req, res) {
  // Rate limiting
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    sendJson(res, 429, { error: 'Too many requests. Please wait a moment.' });
    return;
  }

  const apiKey = process.env.DEEPINFRA_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, {
      error: 'DEEPINFRA_API_KEY is missing. Add it to .env or environment variables.',
    });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const mode = payload?.mode === ONBOARDING_MODE ? ONBOARDING_MODE : CHAT_MODE;
  const character = payload?.character || {};
  const style = validateStyle(payload?.style);
  const incomingOnboardingState = normalizeOnboardingState(payload?.onboardingState);
  const sessionWorldSummary = normalizeWorldSummary(incomingOnboardingState?.worldSummary);
  const history = Array.isArray(payload?.messages) ? payload.messages : [];
  const historyMessages = history
    .map(normalizeChatMessage)
    .filter(Boolean)
    .slice(-MESSAGE_HISTORY_LIMIT);

  if (mode === ONBOARDING_MODE) {
    const hasInput = hasOnboardingInput(payload);
    const onboardingState = incomingOnboardingState || createInitialOnboardingState();

    if (!hasInput) {
      if (onboardingState.complete) {
        sendJson(res, 200, {
          reply: '세계관 설정이 완료되어 일반 대화를 이어갈 수 있어요.',
          mode: CHAT_MODE,
          onboarding: onboardingState,
          model: DEFAULT_MODEL,
          usage: null,
        });
        return;
      }

      const greeting = incomingOnboardingState
        ? `설정을 이어서 진행할게요.\n${onboardingState.question}`
        : `세계관 설정을 시작할게요.\n${onboardingState.question}`;

      sendJson(res, 200, {
        reply: greeting,
        mode: ONBOARDING_MODE,
        onboarding: onboardingState,
        model: DEFAULT_MODEL,
        usage: null,
      });
      return;
    }

    const userInput = parseOnboardingUserInput(payload, onboardingState);
    if (userInput.error) {
      sendJson(res, 400, { error: userInput.error });
      return;
    }

    const upstreamPayload = {
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: buildOnboardingSystemPrompt(character, onboardingState) },
        { role: 'user', content: buildOnboardingUserMessage(onboardingState, userInput) },
      ],
      temperature: 0.7,
      max_tokens: 700,
    };

    if (typeof payload?.user === 'string' && payload.user.trim()) {
      upstreamPayload.user = payload.user.trim().slice(0, 128);
    }

    const upstream = await requestDeepInfra(apiKey, upstreamPayload);
    if (!upstream.ok) {
      sendJson(res, upstream.status, { error: upstream.error, detail: upstream.detail });
      return;
    }

    const rawReply = toReplyText(upstream.data?.choices?.[0]?.message?.content);
    if (!rawReply) {
      sendJson(res, 502, {
        error: 'DeepInfra returned an empty onboarding response.',
        detail: upstream.data,
      });
      return;
    }

    const parsed = parseJsonLoose(rawReply);
    if (!parsed || typeof parsed !== 'object') {
      sendJson(res, 502, {
        error: 'Failed to parse onboarding JSON response.',
        detail: { rawReply },
      });
      return;
    }

    const mergedWorldSummary = normalizeWorldSummary({
      ...onboardingState.worldSummary,
      ...(parsed.worldSummary && typeof parsed.worldSummary === 'object' ? parsed.worldSummary : {}),
    });

    const aiRequestedStep = Number.isFinite(parsed.step) ? Math.floor(parsed.step) : onboardingState.step + 1;
    const nextStep = Math.max(
      onboardingState.step + 1,
      Math.max(1, Math.min(ONBOARDING_MAX_STEP, aiRequestedStep))
    );
    const complete = Boolean(parsed.complete) || nextStep >= ONBOARDING_MAX_STEP;
    const replyText = sanitizeString(parsed.reply, 2500) || rawReply;

    let nextOnboardingState;
    let responseMode = ONBOARDING_MODE;

    if (complete) {
      nextOnboardingState = buildCompletedOnboardingState(nextStep, mergedWorldSummary);
      responseMode = CHAT_MODE;
    } else {
      nextOnboardingState = normalizeOnboardingState({
        active: true,
        complete: false,
        step: nextStep,
        question: sanitizeString(parsed.question, 400) || getFallbackOnboardingQuestion(nextStep),
        choices: normalizeOnboardingChoices(parsed.choices, getFallbackOnboardingChoices(nextStep)),
        allowDirectInput: parsed.allowDirectInput !== false,
        worldSummary: mergedWorldSummary,
      }) || createInitialOnboardingState();
    }

    sendJson(res, 200, {
      reply: replyText,
      mode: responseMode,
      onboarding: nextOnboardingState,
      model: upstream.data?.model || DEFAULT_MODEL,
      usage: upstream.data?.usage || null,
    });
    return;
  }

  if (!historyMessages.some((message) => message.role === 'user')) {
    sendJson(res, 400, { error: 'At least one user message is required.' });
    return;
  }

  const upstreamPayload = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt(character, style, sessionWorldSummary) },
      ...historyMessages,
    ],
    temperature: getTemperature(style),
    max_tokens: getMaxTokens(style),
  };

  if (typeof payload?.user === 'string' && payload.user.trim()) {
    upstreamPayload.user = payload.user.trim().slice(0, 128);
  }

  const upstream = await requestDeepInfra(apiKey, upstreamPayload);
  if (!upstream.ok) {
    sendJson(res, upstream.status, { error: upstream.error, detail: upstream.detail });
    return;
  }

  const reply = toReplyText(upstream.data?.choices?.[0]?.message?.content);
  if (!reply) {
    sendJson(res, 502, { error: 'DeepInfra returned an empty response.', detail: upstream.data });
    return;
  }

  sendJson(res, 200, {
    reply,
    mode: CHAT_MODE,
    onboarding: incomingOnboardingState?.complete
      ? buildCompletedOnboardingState(incomingOnboardingState.step || 1, sessionWorldSummary)
      : buildIdleOnboardingState(sessionWorldSummary),
    model: upstream.data?.model || DEFAULT_MODEL,
    usage: upstream.data?.usage || null,
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendText(res, 400, 'Bad Request');
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = parsedUrl;

  if (pathname === '/api/chat') {
    if (req.method === 'POST') {
      await handleChatRequest(req, res);
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  await serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`NebulaTalk server running at http://${HOST}:${PORT}`);
});
