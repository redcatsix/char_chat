export const STORAGE_KEYS = {
  favorites: 'nebulaTalk:favorites',
  createdCharacters: 'nebulaTalk:createdCharacters',
  chats: 'nebulaTalk:chats',
  stylePrefs: 'nebulaTalk:stylePrefs',
  selectedCharacter: 'nebulaTalk:selectedCharacter',
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

export const MAX_TAGS = 8;
export const MAX_FEATURED = 8;
export const MAX_RECENT_HOME = 4;
export const MAX_TOP_TAGS = 16;
export const MESSAGE_HISTORY_LIMIT = 30;
export const TOAST_DURATION_MS = 1800;
export const THUMBNAIL_MAX_BYTES = 1.5 * 1024 * 1024;
