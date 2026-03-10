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

  const character = payload?.character || {};
  const style = validateStyle(payload?.style);
  const history = Array.isArray(payload?.messages) ? payload.messages : [];
  const historyMessages = history
    .map(normalizeChatMessage)
    .filter(Boolean)
    .slice(-MESSAGE_HISTORY_LIMIT);

  if (!historyMessages.some((message) => message.role === 'user')) {
    sendJson(res, 400, { error: 'At least one user message is required.' });
    return;
  }

  const upstreamPayload = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt(character, style) },
      ...historyMessages,
    ],
    temperature: getTemperature(style),
    max_tokens: getMaxTokens(style),
  };

  if (typeof payload?.user === 'string' && payload.user.trim()) {
    upstreamPayload.user = payload.user.trim().slice(0, 128);
  }

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
    sendJson(res, 502, { error: `Failed to reach DeepInfra: ${error.message}` });
    return;
  }

  const raw = await upstream.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!upstream.ok) {
    const message = typeof data?.error === 'string'
      ? data.error
      : data?.error?.message || 'DeepInfra request failed.';
    sendJson(res, upstream.status, { error: message, detail: data });
    return;
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    sendJson(res, 502, { error: 'DeepInfra returned an empty response.', detail: data });
    return;
  }

  sendJson(res, 200, {
    reply: reply.trim(),
    model: data?.model || DEFAULT_MODEL,
    usage: data?.usage || null,
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
