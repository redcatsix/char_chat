export const STORAGE_KEYS = {
  favorites: 'nebulaTalk:favorites',
  createdCharacters: 'nebulaTalk:createdCharacters',
  chats: 'nebulaTalk:chats',
  stylePrefs: 'nebulaTalk:stylePrefs',
  selectedCharacter: 'nebulaTalk:selectedCharacter',
  selectedModel: 'nebulaTalk:selectedModel',
};

export const DEFAULT_STYLE = {
  pov: 'third',
  length: 'medium',
  pacing: 'natural',
  tone: 'romance',
};

export const GENRES = [
  { key: 'all', label: '전체' },
  { key: 'romance', label: '로맨스', tags: ['#로맨스', '#연애', '#첫사랑'] },
  { key: 'fantasy', label: '판타지', tags: ['#판타지', '#마법', '#이세계'] },
  { key: 'mystery', label: '미스터리', tags: ['#미스터리', '#추리', '#스릴러'] },
  { key: 'slice', label: '일상', tags: ['#일상', '#힐링', '#학원'] },
  { key: 'soft', label: '힐링', tags: ['#위로', '#힐링', '#감성'] },
];

export const STYLE_LABELS = {
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

export const MODEL_OPTIONS = [
  { id: 'deepseek-ai/DeepSeek-V3.2', label: 'DeepSeek V3.2', desc: '빠르고 자연스러운 한국어 (기본)', provider: 'deepinfra' },
  { id: 'Qwen/Qwen3-235B-A22B', label: 'Qwen3 235B', desc: '아시아 언어 특화, 섬세한 묘사', provider: 'deepinfra' },
  { id: 'anthropic/claude-4-opus', label: 'Claude 4 Opus', desc: '최고 품질 역할극 (API 키 필요)', provider: 'anthropic' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', desc: '안정적이고 똑똑한 응답 (API 키 필요)', provider: 'openai' },
  { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', label: 'Llama 4 Maverick', desc: '창의적이고 자유로운 전개', provider: 'deepinfra' },
];

export const DEFAULT_MODEL_ID = 'deepseek-ai/DeepSeek-V3.2';

export const MAX_TAGS = 8;
export const MAX_FEATURED = 8;
export const MAX_RECENT_HOME = 4;
export const MAX_TOP_TAGS = 16;
export const MESSAGE_HISTORY_LIMIT = 30;
export const TOAST_DURATION_MS = 1800;
export const THUMBNAIL_MAX_BYTES = 1.5 * 1024 * 1024;
