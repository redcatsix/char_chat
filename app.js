(() => {
  const STORAGE_KEYS = {
    favorites: 'nebulaTalk:favorites',
    createdCharacters: 'nebulaTalk:createdCharacters',
    chats: 'nebulaTalk:chats',
    stylePrefs: 'nebulaTalk:stylePrefs',
    selectedCharacter: 'nebulaTalk:selectedCharacter',
  };

  const DEFAULT_STYLE = {
    pov: 'third',
    length: 'medium',
    pacing: 'natural',
    tone: 'romance',
  };

  const GENRES = [
    { key: 'all', label: '전체' },
    { key: 'romance', label: '로맨스', tags: ['#로맨스', '#연애', '#첫사랑'] },
    { key: 'fantasy', label: '판타지', tags: ['#판타지', '#마법', '#이세계'] },
    { key: 'mystery', label: '미스터리', tags: ['#미스터리', '#추리', '#스릴러'] },
    { key: 'slice', label: '일상', tags: ['#일상', '#힐링', '#학원'] },
    { key: 'soft', label: '힐링', tags: ['#위로', '#힐링', '#감성'] },
  ];

  const DEFAULT_CHARACTERS = [
    {
      id: 'seoha',
      name: '서하',
      avatar: '🌙',
      cover: 'https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=900&q=80',
      headline: '차갑지만 끝내는 네 편이 되는 전략가',
      personality: '말수는 적지만 관찰력이 매우 좋다. 감정을 쉽게 드러내지 않지만, 신뢰한 사람에게는 의외로 다정하다.',
      greeting: '늦었네. 기다리고 있었어. 오늘은 네가 먼저 이야기를 꺼내 줘.',
      scenario: '비밀 작전을 함께 수행하는 파트너 관계. 겉으로는 냉정하지만 협업할수록 묘한 긴장감이 깊어진다.',
      tags: ['#로맨스', '#현대', '#전략가', '#서서히'],
      visibility: 'public',
      likes: 18240,
      chats: 96400,
      createdAt: '2026-01-09T10:00:00+09:00',
      updatedAt: '2026-03-07T21:10:00+09:00',
      style: { pov: 'third', length: 'medium', pacing: 'slow', tone: 'mystery' },
      isBuiltin: true,
    },
  ];

  const page = document.body.dataset.page;
  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  function safeParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function getStoredArray(key) {
    return safeParse(localStorage.getItem(key), []);
  }

  function setStoredArray(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getStoredObject(key) {
    return safeParse(localStorage.getItem(key), {});
  }

  function setStoredObject(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getCreatedCharacters() {
    return getStoredArray(STORAGE_KEYS.createdCharacters);
  }

  function getFavorites() {
    return getStoredArray(STORAGE_KEYS.favorites);
  }

  function getChats() {
    return getStoredObject(STORAGE_KEYS.chats);
  }

  function getCharacterActivityTime(character) {
    const base = new Date(character.updatedAt || character.createdAt || 0).getTime();
    const history = getCharacterConversation(character.id);
    const last = history[history.length - 1];
    const recent = new Date(last?.createdAt || 0).getTime();
    return Math.max(base || 0, recent || 0);
  }

  function getAllCharacters() {
    const custom = getCreatedCharacters();
    const merged = [...DEFAULT_CHARACTERS, ...custom];
    return merged.sort((a, b) => getCharacterActivityTime(b) - getCharacterActivityTime(a));
  }

  function findCharacterById(id) {
    return getAllCharacters().find((character) => character.id === id) || null;
  }

  function getCharacterConversation(characterId) {
    const chats = getChats();
    return Array.isArray(chats[characterId]) ? chats[characterId] : [];
  }

  function setCharacterConversation(characterId, messages) {
    const chats = getChats();
    chats[characterId] = messages;
    setStoredObject(STORAGE_KEYS.chats, chats);
  }

  function formatCount(value) {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 10000) return `${(value / 10000).toFixed(1)}만`;
    return new Intl.NumberFormat('ko-KR').format(value);
  }

  function formatDateTime(value) {
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

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 1800);
  }

  function updateAiStatus(state, label) {
    const badge = document.getElementById('aiStatusBadge');
    if (!badge) return;
    badge.classList.remove('waiting', 'online', 'fallback', 'checking');
    badge.classList.add(state || 'waiting');
    badge.textContent = label || '연결 대기';
  }

  function getUrlQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function setSelectedCharacter(id) {
    localStorage.setItem(STORAGE_KEYS.selectedCharacter, id);
  }

  function getSelectedCharacter() {
    return getUrlQueryParam('character') || localStorage.getItem(STORAGE_KEYS.selectedCharacter) || getAllCharacters()[0]?.id || null;
  }

  function ensureConversationInitialized(character) {
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

  function cryptoRandomId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function isFavorite(id) {
    return getFavorites().includes(id);
  }

  function toggleFavorite(id) {
    const favorites = getFavorites();
    const next = favorites.includes(id)
      ? favorites.filter((favoriteId) => favoriteId !== id)
      : [...favorites, id];
    setStoredArray(STORAGE_KEYS.favorites, next);
    return next.includes(id);
  }

  function removeCreatedCharacter(id) {
    const created = getCreatedCharacters().filter((character) => character.id !== id);
    setStoredArray(STORAGE_KEYS.createdCharacters, created);

    const chats = getChats();
    delete chats[id];
    setStoredObject(STORAGE_KEYS.chats, chats);

    const favorites = getFavorites().filter((favoriteId) => favoriteId !== id);
    setStoredArray(STORAGE_KEYS.favorites, favorites);
  }

  function normalizeTags(input) {
    if (!input) return [];
    return input
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
      .slice(0, 8);
  }

  function getAllTags() {
    const counter = new Map();
    getAllCharacters().forEach((character) => {
      character.tags.forEach((tag) => {
        counter.set(tag, (counter.get(tag) || 0) + 1);
      });
    });
    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }

  function getConversationSummaries() {
    return getAllCharacters()
      .map((character) => {
        const messages = getCharacterConversation(character.id).filter((item) => item.role !== 'system');
        if (messages.length < 2) return null;
        const lastMessage = messages[messages.length - 1];
        const userTurns = messages.filter((item) => item.role === 'user').length;
        return {
          character,
          messageCount: messages.length,
          userTurns,
          preview: lastMessage.text,
          updatedAt: lastMessage.createdAt,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  function emptyState(title, description) {
    return `
      <div class="empty-state">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function getFormField(form, name) {
    return form?.elements?.namedItem(name);
  }

  function getCharacterThumbnail(character) {
    const value = typeof character?.cover === 'string' ? character.cover.trim() : '';
    return /^(https?:\/\/|data:image\/)/i.test(value) ? value : '';
  }

  function renderAvatarBadge(character, { size = 48, className = 'avatar-badge' } = {}) {
    const thumb = getCharacterThumbnail(character);
    const style = `style="width:${size}px;height:${size}px;"`;
    if (thumb) {
      return `<div class="${className} has-thumb" ${style}><img src="${escapeHtml(thumb)}" alt="${escapeHtml(character?.name || '캐릭터')}" loading="lazy" /></div>`;
    }
    return `<div class="${className}" ${style}>${escapeHtml(character?.avatar || '✨')}</div>`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
  }

  function renderCharacterCard(character, { showDelete = false, layout = 'default' } = {}) {
    const favoriteActive = isFavorite(character.id);
    const visibilityClass = character.visibility === 'private' ? 'private' : '';
    const cover = getCharacterThumbnail(character);
    const safeTags = Array.isArray(character.tags) ? character.tags : [];

    if (layout === 'feed') {
      return `
        <article class="card character-card character-card-feed" data-character-card="${escapeHtml(character.id)}">
          <div class="character-thumb">
            ${cover
              ? `<img class="character-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(character.name)}" loading="lazy" />`
              : `<div class="character-cover-fallback"><span>${escapeHtml(character.avatar || '✨')}</span></div>`}
            <span class="chat-count-pill">💬 ${formatCount(character.chats || 0)}</span>
            <button class="favorite-toggle ${favoriteActive ? 'is-active' : ''}" data-favorite-id="${escapeHtml(character.id)}" type="button" aria-label="즐겨찾기">♥</button>
            <div class="character-overlay">
              <strong>${escapeHtml(character.name)}</strong>
              <p>${escapeHtml(character.headline)}</p>
              <div class="tag-list">
                ${safeTags.slice(0, 2).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}
              </div>
            </div>
            <a class="character-tile-link" href="chat.html?character=${encodeURIComponent(character.id)}" data-open-chat-id="${escapeHtml(character.id)}" aria-label="${escapeHtml(character.name)}와 대화"></a>
          </div>
        </article>
      `;
    }

    return `
      <article class="card character-card" data-character-card="${escapeHtml(character.id)}">
        <div class="character-thumb">
          ${cover
            ? `<img class="character-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(character.name)}" loading="lazy" />`
            : `<div class="character-cover-fallback"><span>${escapeHtml(character.avatar || '✨')}</span></div>`}
          <span class="chat-count-pill">💬 ${formatCount(character.chats || 0)}</span>
          <button class="favorite-toggle ${favoriteActive ? 'is-active' : ''}" data-favorite-id="${escapeHtml(character.id)}" type="button" aria-label="즐겨찾기">♥</button>
        </div>

        <div class="character-info">
          <div class="character-title">
            <strong>${escapeHtml(character.name)}</strong>
            <span class="visibility-badge ${visibilityClass}">${character.visibility === 'private' ? '비공개' : '공개'}</span>
          </div>
          <p class="character-description">${escapeHtml(character.headline)}</p>
        </div>

        <div class="tag-list">
          ${safeTags.slice(0, 3).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}
        </div>

        <div class="stat-row">
          <span class="stat-item">♥ ${formatCount(character.likes || 0)}</span>
          <span class="stat-item">🕒 ${escapeHtml(formatDateTime(getCharacterActivityTime(character)))}</span>
        </div>

        <div class="character-actions">
          <a class="button ghost small" href="chat.html?character=${encodeURIComponent(character.id)}" data-open-chat-id="${escapeHtml(character.id)}">대화</a>
          ${showDelete
            ? `<button class="button ghost small" type="button" data-delete-character-id="${escapeHtml(character.id)}">삭제</button>`
            : `<a class="button primary small" href="create.html?duplicate=${encodeURIComponent(character.id)}">복제</a>`}
        </div>
      </article>
    `;
  }

  function wireFavoriteButtons(scope = document) {
    scope.querySelectorAll('[data-favorite-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.favoriteId;
        const active = toggleFavorite(id);
        button.classList.toggle('is-active', active);
        showToast(active ? '즐겨찾기에 추가했어요' : '즐겨찾기를 해제했어요');
        refreshPage();
      });
    });
  }

  function wireChatLinks(scope = document) {
    scope.querySelectorAll('[data-open-chat-id]').forEach((link) => {
      link.addEventListener('click', () => {
        setSelectedCharacter(link.dataset.openChatId);
      });
    });
  }

  function wireDeleteButtons(scope = document) {
    scope.querySelectorAll('[data-delete-character-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.deleteCharacterId;
        const target = findCharacterById(id);
        if (!target || target.isBuiltin) return;
        if (!window.confirm(`'${target.name}' 캐릭터를 삭제할까요? 저장된 대화도 함께 삭제됩니다.`)) return;
        removeCreatedCharacter(id);
        showToast('캐릭터를 삭제했어요');
        refreshPage();
      });
    });
  }

  function refreshPage() {
    switch (page) {
      case 'home':
        initHomePage(true);
        break;
      case 'explore':
        initExplorePage(true);
        break;
      case 'chat':
        initChatPage(true);
        break;
      case 'create':
        initCreatePage(true);
        break;
      case 'mypage':
        initMyPage(true);
        break;
      default:
        break;
    }
  }

  function createRecentCard(summary) {
    return `
      <article class="recent-chat-card">
        <div class="recent-chat-card-header">
          <div class="character-title">
            <div class="avatar-badge" style="width:44px;height:44px;border-radius:14px;font-size:1.2rem;">${escapeHtml(summary.character.avatar || '✨')}</div>
            <div>
              <h3>${escapeHtml(summary.character.name)}</h3>
              <small>${escapeHtml(summary.character.headline)}</small>
            </div>
          </div>
          <small>${escapeHtml(formatDateTime(summary.updatedAt))}</small>
        </div>
        <p>${escapeHtml(summary.preview)}</p>
        <div class="meta-row">
          <span class="meta-pill">유저 입력 ${summary.userTurns}회</span>
          <span class="meta-pill">메시지 ${summary.messageCount}개</span>
        </div>
        <a class="button primary small" href="chat.html?character=${encodeURIComponent(summary.character.id)}">대화 이어가기</a>
      </article>
    `;
  }

  function renderGenreTabs(containerId, activeGenre, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = GENRES.map((genre) =>
      `<button class="genre-tab ${genre.key === activeGenre ? 'is-active' : ''}" data-genre="${genre.key}" type="button">${escapeHtml(genre.label)}</button>`
    ).join('');
    container.querySelectorAll('[data-genre]').forEach((btn) => {
      btn.addEventListener('click', () => onSelect(btn.dataset.genre));
    });
  }

  function filterByGenre(characters, genreKey) {
    if (genreKey === 'all') return characters;
    const genre = GENRES.find((g) => g.key === genreKey);
    if (!genre || !genre.tags) {
      return characters.filter((c) => c.style?.tone === genreKey);
    }
    return characters.filter((c) => {
      const tags = Array.isArray(c.tags) ? c.tags : [];
      const toneMatch = c.style?.tone === genreKey;
      const tagMatch = genre.tags.some((t) => tags.includes(t));
      return toneMatch || tagMatch;
    });
  }

  function showCharacterProfile(characterId) {
    const character = findCharacterById(characterId);
    if (!character) return;
    const existing = document.getElementById('characterProfileModal');
    if (existing) existing.remove();
    const cover = getCharacterThumbnail(character);
    const safeTags = Array.isArray(character.tags) ? character.tags : [];
    const modal = document.createElement('div');
    modal.id = 'characterProfileModal';
    modal.className = 'profile-modal';
    modal.innerHTML = `
      <div class="profile-modal-backdrop"></div>
      <div class="profile-modal-content">
        <button class="profile-modal-close" type="button">✕</button>
        <div class="profile-modal-cover">
          ${cover
            ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(character.name)}" />`
            : `<div class="character-cover-fallback" style="aspect-ratio:4/3;"><span style="font-size:3rem;">${escapeHtml(character.avatar || '✨')}</span></div>`}
        </div>
        <div class="profile-modal-body">
          <h2>${escapeHtml(character.name)}</h2>
          <p style="color:var(--text-secondary);margin:0;">${escapeHtml(character.headline)}</p>
          <div class="tag-list">
            ${safeTags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}
          </div>
          <div class="meta-row">
            <span class="meta-pill">♥ ${formatCount(character.likes || 0)}</span>
            <span class="meta-pill">💬 ${formatCount(character.chats || 0)}</span>
          </div>
          <div class="profile-modal-section">
            <strong>성격 / 설정</strong>
            <p>${escapeHtml(character.personality || '설정이 없습니다.')}</p>
          </div>
          ${character.scenario ? `
          <div class="profile-modal-section">
            <strong>시나리오</strong>
            <p>${escapeHtml(character.scenario)}</p>
          </div>` : ''}
          <a class="button primary" href="chat.html?character=${encodeURIComponent(character.id)}" style="text-align:center;">대화 시작하기</a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.profile-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.profile-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('a.button').addEventListener('click', () => {
      setSelectedCharacter(character.id);
    });
  }

  function wireProfileModals(scope = document) {
    scope.querySelectorAll('[data-character-card]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-favorite-id]') || e.target.closest('[data-delete-character-id]') || e.target.closest('a') || e.target.closest('button')) return;
        showCharacterProfile(card.dataset.characterCard);
      });
    });
  }

  function initHomePage(force = false) {
    const featuredGrid = document.getElementById('featuredGrid');
    if (!featuredGrid) return;

    const homeState = window.__homeState || { genre: 'all' };
    window.__homeState = homeState;

    function renderHomeGrid() {
      const characters = getAllCharacters().sort((a, b) => (b.likes + b.chats) - (a.likes + a.chats));
      const filtered = filterByGenre(characters, homeState.genre);
      const featured = filtered.slice(0, 6);
      featuredGrid.innerHTML = featured.length
        ? featured.map((character) => renderCharacterCard(character, { layout: 'feed' })).join('')
        : emptyState('이 장르에 해당하는 캐릭터가 없어요', '다른 장르를 선택해 보세요.');
      wireFavoriteButtons(featuredGrid);
      wireChatLinks(featuredGrid);
      wireProfileModals(featuredGrid);
    }

    function onGenreSelect(genre) {
      homeState.genre = genre;
      renderGenreTabs('genreTabs', genre, onGenreSelect);
      renderHomeGrid();
    }
    renderGenreTabs('genreTabs', homeState.genre, onGenreSelect);
    renderHomeGrid();

    const tagsRoot = document.getElementById('popularTags');
    const topTags = getAllTags().slice(0, 16);
    if (tagsRoot) {
      tagsRoot.innerHTML = topTags
        .map(({ tag, count }) => `<a class="tag-pill" href="explore.html?q=${encodeURIComponent(tag)}">${escapeHtml(tag)} <span class="meta-muted">${count}</span></a>`)
        .join('');
    }

    const recentRoot = document.getElementById('recentChats');
    const summaries = getConversationSummaries();
    if (recentRoot) {
      recentRoot.innerHTML = summaries.length
        ? summaries.slice(0, 4).map((summary) => createRecentCard(summary)).join('')
        : emptyState('아직 이어갈 대화가 없어요', '탐색 페이지에서 캐릭터를 고르고 첫 대화를 시작해보세요.');
    }

    const statsMap = {
      homeCharacterCount: getAllCharacters().length,
      homeCreatedCount: getCreatedCharacters().length,
      homeConversationCount: summaries.length,
    };

    Object.entries(statsMap).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = formatCount(value);
    });

    if (!force) {
      document.getElementById('heroSearchForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const query = document.getElementById('heroSearchInput')?.value?.trim() || '';
        const nextUrl = query ? `explore.html?q=${encodeURIComponent(query)}` : 'explore.html';
        window.location.href = nextUrl;
      });
    }
  }

  function initExplorePage(force = false) {
    const grid = document.getElementById('exploreGrid');
    if (!grid) return;

    const input = document.getElementById('exploreSearchInput');
    const sortSelect = document.getElementById('exploreSortSelect');
    const tagsRoot = document.getElementById('exploreTagFilters');
    const titleEl = document.getElementById('exploreResultTitle');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    const state = window.__exploreState || {
      query: getUrlQueryParam('q') || '',
      sort: 'popular',
      activeTags: [],
      genre: 'all',
    };

    window.__exploreState = state;

    if (!force) {
      input.value = state.query;
      sortSelect.value = state.sort;

      input.addEventListener('input', () => {
        state.query = input.value.trim();
        renderExploreResults();
      });

      sortSelect.addEventListener('change', () => {
        state.sort = sortSelect.value;
        renderExploreResults();
      });

      clearFiltersBtn?.addEventListener('click', () => {
        state.query = '';
        state.activeTags = [];
        state.sort = 'popular';
        state.genre = 'all';
        input.value = '';
        sortSelect.value = 'popular';
        renderGenreTabs('exploreGenreTabs', 'all', onExploreGenre);
        renderExploreResults();
      });

      function onExploreGenre(genre) {
        state.genre = genre;
        renderGenreTabs('exploreGenreTabs', genre, onExploreGenre);
        renderExploreResults();
      }
      renderGenreTabs('exploreGenreTabs', state.genre, onExploreGenre);
    } else {
      input.value = state.query;
      sortSelect.value = state.sort;
    }

    function renderExploreResults() {
      const allTags = getAllTags();
      tagsRoot.innerHTML = allTags.map(({ tag, count }) => {
        const active = state.activeTags.includes(tag);
        return `<button class="tag-pill ${active ? 'is-active' : ''}" data-filter-tag="${escapeHtml(tag)}" type="button">${escapeHtml(tag)} <span class="meta-muted">${count}</span></button>`;
      }).join('');

      tagsRoot.querySelectorAll('[data-filter-tag]').forEach((button) => {
        button.addEventListener('click', () => {
          const tag = button.dataset.filterTag;
          state.activeTags = state.activeTags.includes(tag)
            ? state.activeTags.filter((item) => item !== tag)
            : [...state.activeTags, tag];
          renderExploreResults();
        });
      });

      const favorites = getFavorites();
      const query = state.query.toLowerCase();
      let items = filterByGenre(getAllCharacters(), state.genre).filter((character) => {
        const searchable = [character.name, character.headline, character.personality, character.scenario, ...character.tags]
          .join(' ')
          .toLowerCase();
        const queryMatch = !query || searchable.includes(query);
        const tagsMatch = state.activeTags.length === 0 || state.activeTags.every((tag) => character.tags.includes(tag));
        return queryMatch && tagsMatch;
      });

      items.sort((a, b) => {
        switch (state.sort) {
          case 'recent':
            return getCharacterActivityTime(b) - getCharacterActivityTime(a);
          case 'name':
            return a.name.localeCompare(b.name, 'ko-KR');
          case 'favorites': {
            const aFav = favorites.includes(a.id) ? 1 : 0;
            const bFav = favorites.includes(b.id) ? 1 : 0;
            if (bFav !== aFav) return bFav - aFav;
            return (b.likes + b.chats) - (a.likes + a.chats);
          }
          case 'popular':
          default:
            return (b.likes + b.chats) - (a.likes + a.chats);
        }
      });

      titleEl.textContent = state.query || state.activeTags.length
        ? `탐색 결과 (${items.length})`
        : '탐색 결과';

      grid.innerHTML = items.length
        ? items.map((character) => renderCharacterCard(character)).join('')
        : emptyState('검색 결과가 없어요', '다른 태그나 키워드로 다시 찾아보세요.');
      wireFavoriteButtons(grid);
      wireChatLinks(grid);
      wireProfileModals(grid);
    }

    renderExploreResults();
  }

  function getStylePreferences(character) {
    const prefs = getStoredObject(STORAGE_KEYS.stylePrefs);
    return {
      ...DEFAULT_STYLE,
      ...(character?.style || {}),
      ...(prefs[character?.id] || {}),
    };
  }

  function saveStylePreferences(characterId, style) {
    const prefs = getStoredObject(STORAGE_KEYS.stylePrefs);
    prefs[characterId] = style;
    setStoredObject(STORAGE_KEYS.stylePrefs, prefs);
  }

  function getStyleValueOrFallback(style, key) {
    return style?.[key] || DEFAULT_STYLE[key];
  }

    function renderChatCharacterList(characters, activeCharacterId) {
    const chats = getChats();
    return characters.map((character) => {
      const history = Array.isArray(chats[character.id]) ? chats[character.id] : [];
      const last = history[history.length - 1];
      return `
        <a class="chat-character-item ${character.id === activeCharacterId ? 'is-active' : ''}" href="chat.html?character=${encodeURIComponent(character.id)}" data-open-chat-id="${escapeHtml(character.id)}">
          ${renderAvatarBadge(character, { size: 46 })}
          <div class="chat-character-meta">
            <strong>${escapeHtml(character.name)}</strong>
            <p>${escapeHtml(character.headline)}</p>
            <small>${escapeHtml(last?.text || character.greeting)}</small>
          </div>
        </a>
      `;
    }).join('');
  }

  function renderChatHeader(character) {
    const favoriteActive = isFavorite(character.id);
    return `
      <div class="chat-header-main">
        ${renderAvatarBadge(character)}
        <div>
          <div class="character-title">
            <h1>${escapeHtml(character.name)}</h1>
            <span class="visibility-badge ${character.visibility === 'private' ? 'private' : ''}">${character.visibility === 'private' ? '비공개' : '공개'}</span>
          </div>
          <p>${escapeHtml(character.headline)}</p>
          <div class="tag-list" style="margin-top:12px;">
            ${character.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="chat-header-actions">
        <button class="favorite-toggle ${favoriteActive ? 'is-active' : ''}" data-favorite-id="${escapeHtml(character.id)}" type="button" aria-label="즐겨찾기">♥</button>
      </div>
    `;
  }

  function renderProfileCard(character) {
    return `
      <div class="character-title">
        ${renderAvatarBadge(character)}
        <div>
          <strong>${escapeHtml(character.name)}</strong>
          <p>${escapeHtml(character.headline)}</p>
        </div>
      </div>
      <div class="meta-row">
        <span class="meta-pill">♥ ${formatCount(character.likes || 0)}</span>
        <span class="meta-pill">💬 ${formatCount(character.chats || 0)}</span>
      </div>
      <div>
        <strong>성격 / 설정</strong>
        <p>${escapeHtml(character.personality)}</p>
      </div>
      <div>
        <strong>시나리오</strong>
        <p>${escapeHtml(character.scenario || '시나리오 설명이 아직 없어요.')}</p>
      </div>
    `;
  }

    function renderMessages(messages, character, { withTyping = false } = {}) {
    const renderMessageAvatar = () => {
      const thumb = getCharacterThumbnail(character);
      if (thumb) {
        return `<div class="message-avatar"><img src="${escapeHtml(thumb)}" alt="${escapeHtml(character?.name || '캐릭터')}" loading="lazy" /></div>`;
      }
      return `<div class="message-avatar">${escapeHtml(character?.avatar || '✨')}</div>`;
    };

    const items = messages.map((message) => {
      const isAssistant = message.role === 'assistant';
      return `
        <div class="message ${escapeHtml(message.role)}">
          ${isAssistant ? renderMessageAvatar() : ''}
          <div class="message-content">
            <div class="message-bubble">${formatMessageText(message.text)}</div>
            <div class="message-meta">${isAssistant ? '캐릭터' : '나'} · ${escapeHtml(formatDateTime(message.createdAt))}</div>
          </div>
        </div>
      `;
    });

    if (withTyping) {
      items.push(`
        <div class="message assistant" id="typingMessage">
          ${renderMessageAvatar()}
          <div class="message-content">
            <div class="message-bubble">
              <div class="typing-indicator" aria-label="입력 중">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        </div>
      `);
    }

    return items.join('');
  }

  function formatMessageText(text) {
    return escapeHtml(text).replaceAll('\n', '<br />');
  }

  function generateMockReply(character, userMessage, style) {
    const snippet = userMessage.trim().replace(/\s+/g, ' ').slice(0, 22);
    const address = {
      romance: ['조용히 미소를 지으며', '한 박자 늦게 시선을 맞추며', '낮게 웃음을 흘리며'],
      slice: ['편안하게 어깨를 풀고', '가볍게 웃으며', '조금 가까이 기대며'],
      mystery: ['주변을 한번 살피고', '의미심장한 표정으로', '낮게 목소리를 낮추며'],
      fantasy: ['공기 끝에 마력이 번지듯', '희미한 빛이 감도는 듯', '장난스러운 마법처럼'],
      soft: ['조심스럽게 숨을 고르고', '다정하게 눈을 맞추며', '너를 안심시키듯 천천히'],
    };

    const openers = {
      first: [`나는 잠깐 생각에 잠겼다.`, `나는 네 말을 곱씹으며 숨을 고른다.`, `나는 천천히 고개를 끄덕였다.`],
      second: [`네가 말을 꺼낸 순간 분위기가 조금 달라졌다.`, `네 쪽으로 시선을 돌리자 공기가 달라진다.`, `네 표정에서 먼저 답이 보이는 것 같았다.`],
      third: [`${character.name}은 잠시 침묵하다가 입을 열었다.`, `${character.name}은 시선을 살짝 내리며 말을 이었다.`, `${character.name}은 눈빛을 가다듬고 천천히 대답했다.`],
    };

    const bodyMap = {
      romance: [
        `네가 말한 "${snippet || '그 이야기'}"는 생각보다 오래 마음에 남을 것 같아.`,
        `이런 순간엔 서두르지 않는 편이 좋아. 우리 둘만의 속도로 가 보자.`,
        `나는 지금 이 대화를 그냥 흘려보내고 싶지 않아.`,
      ],
      slice: [
        `좋아, 그럼 너무 거창하게 생각하지 말고 지금 기분부터 하나씩 풀어보자.`,
        `네가 편하면 일상적인 얘기부터 해도 돼. 그런 대화가 의외로 오래 남거든.`,
        `오늘 있었던 일 중 제일 마음에 걸린 장면이 뭐였는지 들려줘.`,
      ],
      mystery: [
        `표면만 보면 단순해 보여도, 보통 중요한 건 그 뒤에 숨어 있지.`,
        `네가 짚은 "${snippet || '그 단서'}"는 그냥 지나치면 안 될 것 같아.`,
        `조금만 더 들여다보면 뜻밖의 연결점이 나올지도 몰라.`,
      ],
      fantasy: [
        `이야기가 시작되는 소리가 들리는 것 같네. 세계관이 네 말에 반응하고 있어.`,
        `지금 선택 하나로 흐름이 크게 달라질 수 있어. 그래서 더 흥미롭고.`,
        `원하면 내가 이 장면을 조금 더 선명하게 열어줄게.`,
      ],
      soft: [
        `괜찮아. 급하게 말하지 않아도 돼. 네 속도에 맞춰서 들을게.`,
        `"${snippet || '그 마음'}"를 입 밖으로 꺼낸 것만으로도 이미 큰걸 해낸 거야.`,
        `조금 더 편하게, 숨 돌리듯 이야기해도 괜찮아.`,
      ],
    };

    const closersByPacing = {
      fast: ['바로 다음 장면으로 넘어가 볼까?', '좋아, 그럼 지금 바로 움직이자.', '이미 흐름은 시작됐어.'],
      natural: ['네가 원하면 여기서 조금 더 이어가도 좋아.', '다음 이야기는 네 선택에 달렸어.', '이제 네가 어떤 말을 꺼낼지 궁금해.'],
      slow: ['서두르지 말자. 이 장면은 천천히 음미하는 편이 더 어울려.', '조금 더 머무르면서 감정을 정리해보자.', '지금은 한 장면씩 천천히 쌓아 올리는 게 좋아.'],
    };

    const lengthCount = {
      short: 2,
      medium: 3,
      long: 4,
    };

    const tone = getStyleValueOrFallback(style, 'tone');
    const pov = getStyleValueOrFallback(style, 'pov');
    const pacing = getStyleValueOrFallback(style, 'pacing');
    const length = getStyleValueOrFallback(style, 'length');

    const segments = [];
    segments.push(pickRandom(openers[pov]));
    segments.push(`${pickRandom(address[tone])}, ${pickRandom(bodyMap[tone])}`);

    if ((lengthCount[length] || 3) >= 3) {
      segments.push(buildCharacterSpecificLine(character, tone));
    }

    if ((lengthCount[length] || 3) >= 4) {
      segments.push(`그리고 솔직히 말하면, 지금 이 장면은 ${character.name}답게 더 깊어질 여지가 있어.`);
    }

    segments.push(pickRandom(closersByPacing[pacing]));

    return segments.join(' ');
  }

  function buildCharacterSpecificLine(character, tone) {
    if (tone === 'mystery') {
      return `${character.name}의 직감으로는 아직 드러나지 않은 핵심이 하나 더 있어. 네가 다음 단서를 어떻게 다루느냐가 중요해.`;
    }
    if (tone === 'fantasy') {
      return `${character.scenario ? character.scenario.split('.')[0] : '이 세계는 아직 숨겨 둔 장면이 많아'}라는 설정이 지금 더 생생하게 살아나는 느낌이야.`;
    }
    if (tone === 'soft') {
      return `${character.name}은 너를 다그치기보다 옆에서 호흡을 맞춰 주는 쪽을 택할 거야.`;
    }
    if (tone === 'slice') {
      return `${character.name}이라면 특별한 사건보다도 지금 여기의 공기와 표정을 먼저 기억해 둘 것 같아.`;
    }
    return `${character.name}은 감정을 쉽게 드러내지 않지만, 지금만큼은 네 말에 분명히 반응하고 있어.`;
  }

  function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  async function requestAssistantReply(character, messages, userMessage, style) {
    updateAiStatus('checking', 'AI 연결 확인 중');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character,
          messages,
          style,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Chat API request failed.');
      }

      if (typeof payload?.reply !== 'string' || !payload.reply.trim()) {
        throw new Error('Chat API returned an invalid response.');
      }

      updateAiStatus('online', 'DeepInfra 연결됨');
      return payload.reply.trim();
    } catch (error) {
      console.error('[chat-api]', error);
      updateAiStatus('fallback', '백업 응답 모드');
      showToast('API 오류로 목업 응답을 사용해요');
      await new Promise((resolve) => setTimeout(resolve, 500));
      return generateMockReply(character, userMessage, style);
    }
  }

  function initChatPage(force = false) {
    const messagesRoot = document.getElementById('chatMessages');
    if (!messagesRoot) return;

    const characterSearch = document.getElementById('chatCharacterSearch');
    const listRoot = document.getElementById('chatCharacterList');
    const headerRoot = document.getElementById('chatHeader');
    const profileCard = document.getElementById('characterProfileCard');
    const styleForm = document.getElementById('styleForm');
    const composer = document.getElementById('chatComposer');
    const input = document.getElementById('chatInput');
    const resetChatBtn = document.getElementById('resetChatBtn');
    const chatSidebar = document.getElementById('chatSidebar');
    const chatSidepanel = document.getElementById('chatSidepanel');
    const chatOverlay = document.getElementById('chatOverlay');
    const sidebarToggle = document.getElementById('chatSidebarToggle');
    const settingsToggle = document.getElementById('chatSettingsToggle');
    const chatTopbarInfo = document.getElementById('chatTopbarInfo');

    const state = window.__chatState || {
      characterId: getSelectedCharacter(),
      filter: '',
      sending: false,
    };
    window.__chatState = state;

    let character = findCharacterById(state.characterId) || getAllCharacters()[0];
    if (!character) return;
    state.characterId = character.id;
    setSelectedCharacter(character.id);
    ensureConversationInitialized(character);

    const style = getStylePreferences(character);
    updateAiStatus('waiting', '연결 대기');

    function closePanels() {
      chatSidebar?.classList.remove('is-open');
      chatSidepanel?.classList.remove('is-open');
      chatOverlay?.classList.remove('is-active');
    }

    if (!force) {
      getFormField(styleForm, 'pov').value = style.pov;
      getFormField(styleForm, 'length').value = style.length;
      getFormField(styleForm, 'pacing').value = style.pacing;
      getFormField(styleForm, 'tone').value = style.tone;

      sidebarToggle?.addEventListener('click', () => {
        closePanels();
        chatSidebar?.classList.add('is-open');
        chatOverlay?.classList.add('is-active');
      });

      settingsToggle?.addEventListener('click', () => {
        closePanels();
        chatSidepanel?.classList.add('is-open');
        chatOverlay?.classList.add('is-active');
      });

      chatOverlay?.addEventListener('click', closePanels);

      characterSearch.addEventListener('input', () => {
        state.filter = characterSearch.value.trim().toLowerCase();
        renderCharacterList();
      });

      styleForm.addEventListener('change', () => {
        const nextStyle = Object.fromEntries(new FormData(styleForm).entries());
        saveStylePreferences(character.id, nextStyle);
        showToast('응답 스타일을 저장했어요');
      });

      composer.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.sending) return;
        const value = input.value.trim();
        if (!value) return;

        const liveCharacter = findCharacterById(state.characterId) || character;
        const currentStyle = Object.fromEntries(new FormData(styleForm).entries());
        saveStylePreferences(liveCharacter.id, currentStyle);

        const messages = getCharacterConversation(liveCharacter.id);
        const nextMessages = [
          ...messages,
          { id: cryptoRandomId(), role: 'user', text: value, createdAt: new Date().toISOString() },
        ];
        setCharacterConversation(liveCharacter.id, nextMessages);
        input.value = '';
        state.sending = true;
        renderMain(true);

        const reply = await requestAssistantReply(liveCharacter, nextMessages, value, currentStyle);
        const finalMessages = [
          ...getCharacterConversation(liveCharacter.id),
          { id: cryptoRandomId(), role: 'assistant', text: reply, createdAt: new Date().toISOString() },
        ];
        setCharacterConversation(liveCharacter.id, finalMessages);
        state.sending = false;
        updateCharacterActivity(liveCharacter.id);
        renderMain(false);
        renderCharacterList();
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          composer.requestSubmit();
        }
      });

      resetChatBtn?.addEventListener('click', () => {
        if (!window.confirm('현재 캐릭터와의 대화를 초기 상태로 되돌릴까요?')) return;
        const liveCharacter = findCharacterById(state.characterId) || character;
        setCharacterConversation(liveCharacter.id, [{
          id: cryptoRandomId(),
          role: 'assistant',
          text: liveCharacter.greeting,
          createdAt: new Date().toISOString(),
        }]);
        state.sending = false;
        renderMain(false);
        renderCharacterList();
        showToast('대화를 초기화했어요');
      });
    } else {
      getFormField(styleForm, 'pov').value = style.pov;
      getFormField(styleForm, 'length').value = style.length;
      getFormField(styleForm, 'pacing').value = style.pacing;
      getFormField(styleForm, 'tone').value = style.tone;
      characterSearch.value = state.filter || '';
    }

    function renderCharacterList() {
      const items = getAllCharacters().filter((item) => {
        const searchable = [item.name, item.headline, ...item.tags].join(' ').toLowerCase();
        return !state.filter || searchable.includes(state.filter);
      });
      listRoot.innerHTML = renderChatCharacterList(items, state.characterId);
      wireChatLinks(listRoot);
      listRoot.querySelectorAll('[data-open-chat-id]').forEach((link) => {
        link.addEventListener('click', () => {
          state.characterId = link.dataset.openChatId;
          setSelectedCharacter(state.characterId);
          closePanels();
        });
      });
    }

    function renderMain(withTyping) {
      const liveCharacter = findCharacterById(state.characterId) || character;
      character = liveCharacter;
      headerRoot.innerHTML = renderChatHeader(liveCharacter);
      profileCard.innerHTML = renderProfileCard(liveCharacter);
      wireFavoriteButtons(headerRoot);

      if (chatTopbarInfo) {
        chatTopbarInfo.innerHTML = `
          <div class="message-avatar" style="width:28px;height:28px;border-radius:8px;font-size:0.85rem;">${escapeHtml(liveCharacter.avatar || '✨')}</div>
          <strong>${escapeHtml(liveCharacter.name)}</strong>
        `;
      }

      const history = getCharacterConversation(liveCharacter.id);
      messagesRoot.innerHTML = renderMessages(history, liveCharacter, { withTyping });
      requestAnimationFrame(() => {
        messagesRoot.scrollTo({ top: messagesRoot.scrollHeight, behavior: 'smooth' });
      });
    }

    renderCharacterList();
    renderMain(state.sending);
  }

  function updateCharacterActivity(characterId) {
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

  function getDuplicateSource() {
    const duplicateId = getUrlQueryParam('duplicate');
    return duplicateId ? findCharacterById(duplicateId) : null;
  }

  function renderCreatePreview(data) {
    return `
      <div class="character-title">
        <div class="avatar-badge">${escapeHtml(data.avatar || '✨')}</div>
        <div>
          <strong>${escapeHtml(data.name || '새 캐릭터')}</strong>
          <p>${escapeHtml(data.headline || '한 줄 소개가 여기에 표시됩니다.')}</p>
        </div>
      </div>
      ${data.cover
        ? `<div class="preview-cover"><img src="${escapeHtml(data.cover)}" alt="${escapeHtml(data.name || '캐릭터')}" loading="lazy" /></div>`
        : ''}
      <div class="tag-list">
        ${(data.tags.length ? data.tags : ['#태그예시']).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}
      </div>
      <div>
        <strong>성격 / 설정</strong>
        <p>${escapeHtml(data.personality || '성격과 말투, 관계성, 세계관 등을 적어 주세요.')}</p>
      </div>
      <div>
        <strong>첫 인사</strong>
        <div class="preview-chat">${escapeHtml(data.greeting || '안녕. 네가 여기 오길 기다리고 있었어.').replaceAll('\n', '<br />')}</div>
      </div>
      <div class="meta-row">
        <span class="meta-pill">${data.visibility === 'private' ? '비공개' : '공개'}</span>
        <span class="meta-pill">${escapeHtml(labelPov(data.style.pov))}</span>
        <span class="meta-pill">${escapeHtml(labelLength(data.style.length))}</span>
        <span class="meta-pill">${escapeHtml(labelPacing(data.style.pacing))}</span>
        <span class="meta-pill">${escapeHtml(labelTone(data.style.tone))}</span>
      </div>
      <p>${escapeHtml(data.scenario || '시나리오를 입력하면 캐릭터의 대화 맥락을 더 분명하게 줄 수 있습니다.')}</p>
    `;
  }

  function labelPov(value) {
    return { first: '1인칭', second: '2인칭', third: '3인칭' }[value] || '3인칭';
  }

  function labelLength(value) {
    return { short: '짧게', medium: '보통', long: '길게' }[value] || '보통';
  }

  function labelPacing(value) {
    return { fast: '빠르게', natural: '자연스럽게', slow: '천천히' }[value] || '자연스럽게';
  }

  function labelTone(value) {
    return {
      romance: '로맨틱',
      slice: '일상형',
      mystery: '미스터리',
      fantasy: '판타지',
      soft: '다정한 위로',
    }[value] || '로맨틱';
  }

  function initCreatePage(force = false) {
    const form = document.getElementById('createCharacterForm');
    const previewCard = document.getElementById('createPreviewCard');
    if (!form || !previewCard) return;

    const duplicateSource = getDuplicateSource();

    const initial = window.__createState || {
      name: duplicateSource?.name || '',
      avatar: duplicateSource?.avatar || '',
      cover: duplicateSource?.cover || '',
      headline: duplicateSource?.headline || '',
      personality: duplicateSource?.personality || '',
      greeting: duplicateSource?.greeting || '',
      scenario: duplicateSource?.scenario || '',
      tags: (duplicateSource?.tags || []).join(', '),
      visibility: duplicateSource?.visibility || 'public',
      style: {
        pov: duplicateSource?.style?.pov || 'third',
        length: duplicateSource?.style?.length || 'medium',
        pacing: duplicateSource?.style?.pacing || 'natural',
        tone: duplicateSource?.style?.tone || 'romance',
      },
    };

    window.__createState = initial;

    if (!force) {
      getFormField(form, 'name').value = initial.name;
      getFormField(form, 'avatar').value = initial.avatar;
      getFormField(form, 'cover').value = initial.cover;
      getFormField(form, 'headline').value = initial.headline;
      getFormField(form, 'personality').value = initial.personality;
      getFormField(form, 'greeting').value = initial.greeting;
      getFormField(form, 'scenario').value = initial.scenario;
      getFormField(form, 'tags').value = initial.tags;
      getFormField(form, 'visibility').value = initial.visibility;
      getFormField(form, 'pov').value = initial.style.pov;
      getFormField(form, 'length').value = initial.style.length;
      getFormField(form, 'pacing').value = initial.style.pacing;
      getFormField(form, 'tone').value = initial.style.tone;

      const coverFileInput = getFormField(form, 'coverFile');
      coverFileInput?.addEventListener('change', async () => {
        const file = coverFileInput.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          showToast('이미지 파일만 업로드할 수 있어요');
          coverFileInput.value = '';
          return;
        }
        if (file.size > 1.5 * 1024 * 1024) {
          showToast('썸네일은 1.5MB 이하로 업로드해 주세요');
          coverFileInput.value = '';
          return;
        }

        try {
          const dataUrl = await readFileAsDataUrl(file);
          getFormField(form, 'cover').value = dataUrl;
          syncPreview();
          showToast('썸네일 업로드 완료');
        } catch (error) {
          console.error('[thumbnail-upload]', error);
          showToast('썸네일 업로드에 실패했어요');
        }
      });

      form.addEventListener('input', syncPreview);
      form.addEventListener('change', syncPreview);
      form.addEventListener('reset', () => {
        setTimeout(syncPreview, 0);
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = collectCreateFormData(form);
        const createdCharacter = {
          id: `custom-${Date.now().toString(36)}`,
          ...formData,
          likes: 0,
          chats: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isBuiltin: false,
        };

        const created = getCreatedCharacters();
        setStoredArray(STORAGE_KEYS.createdCharacters, [createdCharacter, ...created]);
        setCharacterConversation(createdCharacter.id, [{
          id: cryptoRandomId(),
          role: 'assistant',
          text: createdCharacter.greeting,
          createdAt: new Date().toISOString(),
        }]);
        setSelectedCharacter(createdCharacter.id);
        showToast('캐릭터를 저장했어요');
        window.location.href = `chat.html?character=${encodeURIComponent(createdCharacter.id)}`;
      });
    }

    syncPreview();

    function syncPreview() {
      const data = collectCreateFormData(form);
      previewCard.innerHTML = renderCreatePreview(data);
    }
  }

  function collectCreateFormData(form) {
    return {
      name: getFormField(form, 'name').value.trim() || '새 캐릭터',
      avatar: getFormField(form, 'avatar').value.trim() || '✨',
      cover: getFormField(form, 'cover').value.trim(),
      headline: getFormField(form, 'headline').value.trim() || '한 줄 소개',
      personality: getFormField(form, 'personality').value.trim(),
      greeting: getFormField(form, 'greeting').value.trim() || '안녕. 우리 이야기, 지금부터 시작해볼까?',
      scenario: getFormField(form, 'scenario').value.trim(),
      tags: normalizeTags(getFormField(form, 'tags').value.trim()),
      visibility: getFormField(form, 'visibility').value,
      style: {
        pov: getFormField(form, 'pov').value,
        length: getFormField(form, 'length').value,
        pacing: getFormField(form, 'pacing').value,
        tone: getFormField(form, 'tone').value,
      },
    };
  }

  function initMyPage(force = false) {
    const favoriteGrid = document.getElementById('favoriteGrid');
    const createdGrid = document.getElementById('createdGrid');
    const recentRoot = document.getElementById('mypageRecentChats');
    if (!favoriteGrid || !createdGrid || !recentRoot) return;

    const favorites = getFavorites();
    const allCharacters = getAllCharacters();
    const favoriteCharacters = allCharacters.filter((character) => favorites.includes(character.id));
    const createdCharacters = getCreatedCharacters();
    const recentChats = getConversationSummaries();

    favoriteGrid.innerHTML = favoriteCharacters.length
      ? favoriteCharacters.map((character) => renderCharacterCard(character)).join('')
      : emptyState('즐겨찾기한 캐릭터가 없어요', '탐색 페이지에서 마음에 드는 캐릭터에 ♥를 눌러보세요.');

    createdGrid.innerHTML = createdCharacters.length
      ? createdCharacters.map((character) => renderCharacterCard(character, { showDelete: true })).join('')
      : emptyState('아직 만든 캐릭터가 없어요', '제작 페이지에서 첫 캐릭터를 만들어보세요.');

    recentRoot.innerHTML = recentChats.length
      ? recentChats.map((summary) => createRecentCard(summary)).join('')
      : emptyState('최근 대화가 없어요', '캐릭터와 한두 번만 대화해도 이곳에 기록됩니다.');

    wireFavoriteButtons(favoriteGrid);
    wireFavoriteButtons(createdGrid);
    wireChatLinks(favoriteGrid);
    wireChatLinks(createdGrid);
    wireDeleteButtons(createdGrid);
    wireProfileModals(favoriteGrid);
    wireProfileModals(createdGrid);

    const statMap = {
      mypageFavoriteCount: favoriteCharacters.length,
      mypageCreatedCount: createdCharacters.length,
      mypageConversationCount: recentChats.length,
    };

    Object.entries(statMap).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = formatCount(value);
    });

    if (!force) {
      document.getElementById('exportDataBtn')?.addEventListener('click', exportUserData);
    }
  }

  function exportUserData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      favorites: getFavorites(),
      createdCharacters: getCreatedCharacters(),
      chats: getChats(),
      stylePrefs: getStoredObject(STORAGE_KEYS.stylePrefs),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'nebula-talk-data.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('내 데이터를 JSON으로 내보냈어요');
  }


  function normalizeBottomNav() {
    const nav = document.querySelector('.mobile-nav');
    if (!nav) return;

    const activeKey = page === 'explore' ? 'home' : page;
    const items = [
      { key: 'home', href: 'index.html', icon: '⌂', label: '홈' },
      { key: 'chat', href: 'chat.html', icon: '◉', label: '대화' },
      { key: 'create', href: 'create.html', icon: '＋', label: '제작' },
      { key: 'mypage', href: 'mypage.html', icon: '◔', label: '마이페이지' },
    ];

    nav.innerHTML = items.map((item) => `
      <a ${item.key === activeKey ? 'class="is-active"' : ''} href="${item.href}">
        <span class="mobile-nav-icon">${item.icon}</span>
        <span class="mobile-nav-label">${item.label}</span>
      </a>
    `).join('');
  }
  function seedInitialSelection() {
    const selected = localStorage.getItem(STORAGE_KEYS.selectedCharacter);
    if (!selected) {
      const first = getAllCharacters()[0];
      if (first) setSelectedCharacter(first.id);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    normalizeBottomNav();
    seedInitialSelection();

    switch (page) {
      case 'home':
        initHomePage();
        break;
      case 'explore':
        initExplorePage();
        break;
      case 'chat':
        initChatPage();
        break;
      case 'create':
        initCreatePage();
        break;
      case 'mypage':
        initMyPage();
        break;
      default:
        break;
    }
  });
})();






























