import { MAX_FEATURED, MAX_RECENT_HOME, MAX_TOP_TAGS } from '../constants.js';
import { getAllCharacters, getCreatedCharacters } from '../storage.js';
import { escapeHtml, formatCount } from '../utils.js';
import {
  renderCharacterCard, wireFavoriteButtons, wireChatLinks, wireProfileModals,
  renderGenreTabs, filterByGenre, emptyState, createRecentCard,
  getAllTags, getConversationSummaries,
} from '../ui.js';

export function initHomePage(force = false, refreshPage) {
  const featuredGrid = document.getElementById('featuredGrid');
  if (!featuredGrid) return;

  const homeState = window.__homeState || { genre: 'all' };
  window.__homeState = homeState;

  function renderHomeGrid() {
    const characters = getAllCharacters().sort((a, b) => (b.likes + b.chats) - (a.likes + a.chats));
    const filtered = filterByGenre(characters, homeState.genre);
    const featured = filtered.slice(0, MAX_FEATURED);
    featuredGrid.innerHTML = featured.length
      ? featured.map((character) => renderCharacterCard(character, { layout: 'feed' })).join('')
      : emptyState('이 장르에 해당하는 캐릭터가 없어요', '다른 장르를 선택해 보세요.');
    wireFavoriteButtons(featuredGrid, refreshPage);
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
  const topTags = getAllTags().slice(0, MAX_TOP_TAGS);
  if (tagsRoot) {
    tagsRoot.innerHTML = topTags
      .map(({ tag, count }) => `<a class="tag-pill" href="explore.html?q=${encodeURIComponent(tag)}">${escapeHtml(tag)} <span class="meta-muted">${count}</span></a>`)
      .join('');
  }

  const recentRoot = document.getElementById('recentChats');
  const summaries = getConversationSummaries();
  if (recentRoot) {
    recentRoot.innerHTML = summaries.length
      ? summaries.slice(0, MAX_RECENT_HOME).map((summary) => createRecentCard(summary)).join('')
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
