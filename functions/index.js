'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const deepinfraApiKey = defineSecret('DEEPINFRA_API_KEY');
const API_URL = 'https://api.deepinfra.com/v1/openai/chat/completions';
const DEFAULT_MODEL = process.env.DEEPINFRA_MODEL || 'deepseek-ai/DeepSeek-V3.2';

const STYLE_LABELS = {
  pov: {
    first: '1인칭',
    second: '2인칭',
    third: '3인칭',
  },
  length: {
    short: '짧게',
    medium: '보통',
    long: '길게',
  },
  pacing: {
    fast: '빠르게',
    natural: '자연스럽게',
    slow: '천천히',
  },
  tone: {
    romance: '로맨틱',
    slice: '일상형',
    mystery: '미스터리',
    fantasy: '판타지',
    soft: '다정한 위로',
  },
};

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function getStyleLabel(style, key, fallbackKey) {
  const labels = STYLE_LABELS[key] || {};
  return labels[style?.[key]] || labels[fallbackKey];
}

function buildSystemPrompt(character, style) {
  const tags = Array.isArray(character?.tags) ? character.tags.join(', ') : '';

  return [
    '너는 캐릭터챗 전용 AI다.',
    '항상 한국어로 답변하고, 캐릭터 설정을 유지한다.',
    '메타 설명은 사용자가 요청할 때만 제공한다.',
    '[캐릭터 템플릿]',
    `이름: ${character?.name || '이름 미상'}`,
    `한 줄 소개: ${character?.headline || '소개 없음'}`,
    `성격/설정: ${character?.personality || '설정 없음'}`,
    `첫 인사: ${character?.greeting || '첫 인사 없음'}`,
    `시나리오: ${character?.scenario || '시나리오 없음'}`,
    `태그: ${tags || '태그 없음'}`,
    `공개 범위: ${character?.visibility || 'public'}`,
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

  return {
    role: message.role,
    content: message.text,
  };
}

function parseRequestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;

  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf8'));
    } catch {
      return {};
    }
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
}

function toReplyText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

exports.apiChat = onRequest(
  {
    region: 'us-central1',
    secrets: [deepinfraApiKey],
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const apiKey = deepinfraApiKey.value();
    if (!apiKey) {
      res.status(500).json({ error: 'DEEPINFRA_API_KEY secret is missing.' });
      return;
    }

    const payload = parseRequestBody(req);
    const character = payload?.character || {};
    const style = payload?.style || {};
    const history = Array.isArray(payload?.messages) ? payload.messages : [];

    const historyMessages = history
      .map(normalizeChatMessage)
      .filter(Boolean)
      .slice(-30);

    if (!historyMessages.some((message) => message.role === 'user')) {
      res.status(400).json({ error: 'At least one user message is required.' });
      return;
    }

    const upstreamPayload = {
      model: typeof payload?.model === 'string' && payload.model.trim()
        ? payload.model.trim()
        : DEFAULT_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(character, style) },
        ...historyMessages,
      ],
      temperature: getTemperature(style),
      max_tokens: getMaxTokens(style),
    };

    if (typeof payload?.user === 'string' && payload.user.trim()) {
      upstreamPayload.user = payload.user.trim();
    }

    try {
      const upstreamResponse = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(upstreamPayload),
      });

      const raw = await upstreamResponse.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }

      if (!upstreamResponse.ok) {
        const errorMessage = typeof data?.error === 'string'
          ? data.error
          : data?.error?.message || 'DeepInfra request failed.';

        res.status(upstreamResponse.status).json({
          error: errorMessage,
          detail: data,
        });
        return;
      }

      const reply = toReplyText(data?.choices?.[0]?.message?.content);
      if (!reply) {
        res.status(502).json({ error: 'DeepInfra returned an empty response.', detail: data });
        return;
      }

      res.status(200).json({
        reply,
        model: data?.model || upstreamPayload.model,
        usage: data?.usage || null,
      });
    } catch (error) {
      res.status(502).json({
        error: `Failed to reach DeepInfra: ${error.message}`,
      });
    }
  },
);


