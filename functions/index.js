'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const {
  MESSAGE_HISTORY_LIMIT,
  validateStyle,
  buildSystemPrompt,
  getMaxTokens,
  getTemperature,
  normalizeChatMessage,
} = require('../shared/chat-logic.js');

const deepinfraApiKey = defineSecret('DEEPINFRA_API_KEY');
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const openaiApiKey = defineSecret('OPENAI_API_KEY');
const DEFAULT_MODEL = process.env.DEEPINFRA_MODEL || 'deepseek-ai/DeepSeek-V3.2';

const ALLOWED_MODELS = new Set([
  'deepseek-ai/DeepSeek-V3.2',
  'Qwen/Qwen3-235B-A22B',
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
  'anthropic/claude-4-opus',
  'openai/gpt-4o',
]);

function getProviderConfig(modelId, secrets) {
  if (modelId.startsWith('anthropic/')) {
    return {
      provider: 'anthropic',
      url: 'https://api.anthropic.com/v1/messages',
      key: secrets.anthropic,
      model: modelId.replace('anthropic/', ''),
    };
  }
  if (modelId.startsWith('openai/')) {
    return {
      provider: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      key: secrets.openai,
      model: modelId.replace('openai/', ''),
    };
  }
  return {
    provider: 'deepinfra',
    url: 'https://api.deepinfra.com/v1/openai/chat/completions',
    key: secrets.deepinfra,
    model: modelId,
  };
}

const ALLOWED_ORIGINS = [
  'https://char-chat-d120d.web.app',
  'https://char-chat-d120d.firebaseapp.com',
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
    secrets: [deepinfraApiKey, anthropicApiKey, openaiApiKey],
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const payload = parseRequestBody(req);
    const character = payload?.character || {};
    const style = validateStyle(payload?.style);
    const history = Array.isArray(payload?.messages) ? payload.messages : [];

    const historyMessages = history
      .map(normalizeChatMessage)
      .filter(Boolean)
      .slice(-MESSAGE_HISTORY_LIMIT);

    if (!historyMessages.some((message) => message.role === 'user')) {
      res.status(400).json({ error: 'At least one user message is required.' });
      return;
    }

    const requestedModel = typeof payload?.model === 'string' && ALLOWED_MODELS.has(payload.model)
      ? payload.model
      : DEFAULT_MODEL;

    const secrets = {
      deepinfra: deepinfraApiKey.value(),
      anthropic: anthropicApiKey.value(),
      openai: openaiApiKey.value(),
    };
    const config = getProviderConfig(requestedModel, secrets);

    if (!config.key) {
      res.status(500).json({
        error: `${config.provider.toUpperCase()} API 키가 설정되지 않았습니다.`,
      });
      return;
    }

    const systemPrompt = buildSystemPrompt(character, style);
    const temperature = getTemperature(style);
    const maxTokens = getMaxTokens(style);

    try {
      let upstreamResponse;

      if (config.provider === 'anthropic') {
        upstreamResponse = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: maxTokens,
            temperature,
            system: systemPrompt,
            messages: historyMessages,
          }),
        });
      } else {
        const body = {
          model: config.model,
          messages: [{ role: 'system', content: systemPrompt }, ...historyMessages],
          temperature,
          max_tokens: maxTokens,
        };
        if (typeof payload?.user === 'string' && payload.user.trim()) {
          body.user = payload.user.trim().slice(0, 128);
        }
        upstreamResponse = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.key}`,
          },
          body: JSON.stringify(body),
        });
      }

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
          : data?.error?.message || `${config.provider} request failed.`;

        res.status(upstreamResponse.status).json({
          error: errorMessage,
          detail: data,
        });
        return;
      }

      let reply;
      if (config.provider === 'anthropic') {
        const content = data?.content;
        reply = Array.isArray(content)
          ? content.map((b) => b?.text || '').join('').trim()
          : '';
      } else {
        reply = toReplyText(data?.choices?.[0]?.message?.content);
      }

      if (!reply) {
        res.status(502).json({ error: 'AI가 빈 응답을 반환했습니다.', detail: data });
        return;
      }

      res.status(200).json({
        reply,
        model: data?.model || requestedModel,
        usage: data?.usage || null,
      });
    } catch (error) {
      res.status(502).json({
        error: `${config.provider} 연결 실패: ${error.message}`,
      });
    }
  },
);
