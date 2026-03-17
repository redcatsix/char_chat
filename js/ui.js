import { GENRES } from './constants.js';
import {
  escapeHtml, formatCount, formatDateTime, getCharacterThumbnail,
} from './utils.js';
import {
  isFavorite, toggleFavorite, findCharacterById, removeCreatedCharacter,
  setSelectedCharacter, getAllCharacters, getCharacterConversation,
  getCharacterActivityTime,
} from './storage.js';
import { showToast } from './utils.js';

export function emptyState(title, description) {
  return `
    <div class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

export function renderAvatarBadge(character, { size = 44, className = 'avatar-badge' } = {}) {
  const thumb = getCharacterThumbnail(character);
  const style = `style="width:${size}px;height:${size}px;"`;
  if (thumb) {
    return `<div class="${className} has-thumb" ${style}><img src="${escapeHtml(thumb)}" alt="${escapeHtml(character?.name || '캐릭터')}" loading="lazy" /></div>`;
  }
  return `<div class="${className}" ${style}>${escapeHtml(character?.avatar || '✨')}</div>`;
}

export function renderCharacterCard(character, { showDelete = false, layout = 'default' } = {}) {
  const favoriteActive = isFavorite(character.id);
  const visibilityClass = character.visibility === 'private' ? 'private' : '';
  const cover = getCharacterThumbnail(character);
  const safeTags = Array.isArray(character.tags) ? character.tags : [];

  if (layout === 'feed') {
    return `
      <article class="card character-card" data-character-card="${escapeHtml(character.id)}">
        <div class="character-thumb">
          ${cover
            ? `<img class="character-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(character.name)}" loading="lazy" />`
            : `<div class="character-cover-fallback"><span>${escapeHtml(character.avatar || '✨')}</span></div>`}
          <span class="chat-count-pill"><span class="pill-dot"></span> ${formatCount(character.chats || 0)}</span>
          <button class="favorite-toggle ${favoriteActive ? 'is-active' : ''}" data-favorite-id="${escapeHtml(character.id)}" type="button" aria-label="즐겨찾기">♥</button>
          <a class="character-tile-link" href="chat.html?character=${encodeURIComponent(character.id)}" data-open-chat-id="${escapeHtml(character.id)}" aria-label="${escapeHtml(character.name)}와 대화"></a>
        </div>
        <div class="character-card-body">
          <strong>${escapeHtml(character.name)}</strong>
          <p>${escapeHtml(character.headline)}</p>
          <div class="tag-list">
            ${safeTags.slice(0, 3).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>
      </article>
    `;
  }

  return `
    <article class="card character-card character-card-detail" data-character-card="${escapeHtml(character.id)}">
      <div class="character-thumb">
        ${cover
          ? `<img class="character-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(character.name)}" loading="lazy" />`
          : `<div class="character-cover-fallback"><span>${escapeHtml(character.avatar || '✨')}</span></div>`}
        <span class="chat-count-pill"><span class="pill-dot"></span> ${formatCount(character.chats || 0)}</span>
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

export function wireFavoriteButtons(scope, refreshPage) {
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

export function wireChatLinks(scope) {
  scope.querySelectorAll('[data-open-chat-id]').forEach((link) => {
    link.addEventListener('click', () => {
      setSelectedCharacter(link.dataset.openChatId);
    });
  });
}

export function wireDeleteButtons(scope, refreshPage) {
  scope.querySelectorAll('[data-delete-character-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.deleteCharacterId;
      const target = findCharacterById(id);
      if (!target || target.isBuiltin) return;
      if (!window.confirm(`'${target.name}' 캐릭터를 삭제할까요?`)) return;
      removeCreatedCharacter(id);
      showToast('캐릭터를 삭제했어요');
      refreshPage();
    });
  });
}

export function wireProfileModals(scope) {
  scope.querySelectorAll('[data-character-card]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-favorite-id]') || e.target.closest('[data-delete-character-id]') || e.target.closest('a') || e.target.closest('button')) return;
      showCharacterProfile(card.dataset.characterCard);
    });
  });
}

export function showCharacterProfile(characterId) {
  const character = findCharacterById(characterId);
  if (!character) return;
  const existing = document.getElementById('characterProfileModal');
  if (existing) existing.remove();
  const cover = getCharacterThumbnail(character);
  const safeTags = Array.isArray(character.tags) ? character.tags : [];
  const modal = document.createElement('div');
  modal.id = 'characterProfileModal';
  modal.className = 'profile-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', `${character.name} 프로필`);
  modal.innerHTML = `
    <div class="profile-modal-backdrop"></div>
    <div class="profile-modal-content">
      <button class="profile-modal-close" type="button" aria-label="닫기">✕</button>
      <div class="profile-modal-cover">
        ${cover
          ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(character.name)}" />`
          : `<div class="character-cover-fallback" style="aspect-ratio:4/3;"><span style="font-size:3rem;">${escapeHtml(character.avatar || '✨')}</span></div>`}
      </div>
      <div class="profile-modal-body">
        <h2 style="margin:0;">${escapeHtml(character.name)}</h2>
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

  const closeModal = () => {
    modal.remove();
    document.removeEventListener('keydown', handleEscape);
  };
  const handleEscape = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', handleEscape);

  modal.querySelector('.profile-modal-backdrop').addEventListener('click', closeModal);
  modal.querySelector('.profile-modal-close').addEventListener('click', closeModal);
  modal.querySelector('a.button').addEventListener('click', () => {
    setSelectedCharacter(character.id);
  });

  const closeBtn = modal.querySelector('.profile-modal-close');
  if (closeBtn) closeBtn.focus();
}

export function renderGenreTabs(containerId, activeGenre, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = GENRES.map((genre) =>
    `<button class="genre-tab ${genre.key === activeGenre ? 'is-active' : ''}" data-genre="${genre.key}" type="button">${escapeHtml(genre.label)}</button>`
  ).join('');
  container.querySelectorAll('[data-genre]').forEach((btn) => {
    btn.addEventListener('click', () => onSelect(btn.dataset.genre));
  });
}

export function filterByGenre(characters, genreKey) {
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

export function createRecentCard(summary) {
  return `
    <article class="recent-chat-card">
      <div class="recent-chat-card-header">
        <div class="character-title" style="display:flex;align-items:center;gap:8px;">
          ${renderAvatarBadge(summary.character, { size: 38 })}
          <div>
            <h3 style="margin:0;font-size:0.92rem;">${escapeHtml(summary.character.name)}</h3>
            <small>${escapeHtml(summary.character.headline)}</small>
          </div>
        </div>
        <small>${escapeHtml(formatDateTime(summary.updatedAt))}</small>
      </div>
      <p>${escapeHtml(summary.preview)}</p>
      <div class="meta-row">
        <span class="meta-pill">입력 ${summary.userTurns}회</span>
        <span class="meta-pill">메시지 ${summary.messageCount}개</span>
      </div>
      <a class="button primary small" href="chat.html?character=${encodeURIComponent(summary.character.id)}">대화 이어가기</a>
    </article>
  `;
}

export function getAllTags() {
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

export function getConversationSummaries() {
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

export function formatMessageText(text) {
  return escapeHtml(text)
    .replace(/\*(.*?)\*/g, '<em class="action">$1</em>')
    .replaceAll('\n', '<br />');
}

export function renderMessages(messages, character, { withTyping = false } = {}) {
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

export function renderChatCharacterList(characters, activeCharacterId) {
  const chats = getAllCharacters().reduce((acc, c) => {
    const history = getCharacterConversation(c.id);
    if (history.length) acc[c.id] = history;
    return acc;
  }, {});

  return characters.map((character) => {
    const history = Array.isArray(chats[character.id]) ? chats[character.id] : [];
    const last = history[history.length - 1];
    return `
      <a class="chat-character-item ${character.id === activeCharacterId ? 'is-active' : ''}" href="chat.html?character=${encodeURIComponent(character.id)}" data-open-chat-id="${escapeHtml(character.id)}">
        ${renderAvatarBadge(character, { size: 40 })}
        <div class="chat-character-meta">
          <strong>${escapeHtml(character.name)}</strong>
          <small>${escapeHtml(last?.text || character.greeting)}</small>
        </div>
      </a>
    `;
  }).join('');
}

export function formatChatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export function renderChatListItems(characters) {
  const allChars = getAllCharacters();
  const items = allChars
    .map((character) => {
      const history = getCharacterConversation(character.id).filter((m) => m.role !== 'system');
      if (history.length === 0) return null;
      const last = history[history.length - 1];
      return { character, last, updatedAt: last.createdAt };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  if (items.length === 0) {
    return `
      <div class="chat-list-empty">
        <p>아직 대화가 없어요</p>
        <a class="button primary small" href="explore.html">캐릭터 탐색하기</a>
      </div>
    `;
  }

  return items
    .filter((item) => {
      if (!characters) return true;
      return characters.some((c) => c.id === item.character.id);
    })
    .map(({ character, last }) => {
      const preview = last.text.length > 40 ? last.text.slice(0, 40) + '...' : last.text;
      const time = formatChatTime(last.createdAt);
      return `
        <button class="chat-list-item" data-chat-id="${escapeHtml(character.id)}" type="button">
          ${renderAvatarBadge(character, { size: 48, className: 'avatar-badge chat-list-avatar' })}
          <div class="chat-list-item-body">
            <div class="chat-list-item-top">
              <strong>${escapeHtml(character.name)}</strong>
              <span class="chat-list-time">${escapeHtml(time)}</span>
            </div>
            <p class="chat-list-preview">${escapeHtml(preview)}</p>
          </div>
        </button>
      `;
    }).join('');
}

export function renderChatHeader(character) {
  const favoriteActive = isFavorite(character.id);
  return `
    <div class="chat-header-main">
      ${renderAvatarBadge(character, { size: 40 })}
      <div>
        <div class="character-title" style="display:flex;align-items:center;gap:6px;">
          <h1>${escapeHtml(character.name)}</h1>
        </div>
        <p style="margin:0;color:var(--muted);font-size:0.84rem;">${escapeHtml(character.headline)}</p>
      </div>
    </div>
    <div class="chat-header-actions">
      <button class="favorite-toggle ${favoriteActive ? 'is-active' : ''}" data-favorite-id="${escapeHtml(character.id)}" type="button" aria-label="즐겨찾기">♥</button>
    </div>
  `;
}

export function renderProfileCard(character) {
  return `
    <div style="display:flex;align-items:center;gap:8px;">
      ${renderAvatarBadge(character, { size: 38 })}
      <div>
        <strong>${escapeHtml(character.name)}</strong>
        <p style="margin:0;color:var(--muted);font-size:0.82rem;">${escapeHtml(character.headline)}</p>
      </div>
    </div>
    <div class="meta-row">
      <span class="meta-pill">♥ ${formatCount(character.likes || 0)}</span>
      <span class="meta-pill">💬 ${formatCount(character.chats || 0)}</span>
    </div>
    <div>
      <strong style="font-size:0.84rem;color:var(--muted);">성격 / 설정</strong>
      <p style="margin:4px 0 0;font-size:0.88rem;">${escapeHtml(character.personality)}</p>
    </div>
  `;
}
