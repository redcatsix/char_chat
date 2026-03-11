import { getAllCharacters, getFavorites, getCharacterActivityTime, getUrlQueryParam } from '../storage.js';
import { escapeHtml } from '../utils.js';
import {
  renderCharacterCard, wireFavoriteButtons, wireChatLinks, wireProfileModals,
  renderGenreTabs, filterByGenre, emptyState, getAllTags,
} from '../ui.js';

const state = {
  query: '',
  sort: 'popular',
  activeTags: [],
  genre: 'all',
};
let bound = false;

function renderExploreResults(refreshPage) {
  const grid = document.getElementById('exploreGrid');
  const tagsRoot = document.getElementById('exploreTagFilters');
  const titleEl = document.getElementById('exploreResultTitle');
  if (!grid || !tagsRoot || !titleEl) return;

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
      renderExploreResults(refreshPage);
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
  wireFavoriteButtons(grid, refreshPage);
  wireChatLinks(grid);
  wireProfileModals(grid);
}

function bindEvents(refreshPage) {
  const input = document.getElementById('exploreSearchInput');
  const sortSelect = document.getElementById('exploreSortSelect');
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');

  input?.addEventListener('input', () => {
    state.query = input.value.trim();
    renderExploreResults(refreshPage);
  });

  sortSelect?.addEventListener('change', () => {
    state.sort = sortSelect.value;
    renderExploreResults(refreshPage);
  });

  clearFiltersBtn?.addEventListener('click', () => {
    state.query = '';
    state.activeTags = [];
    state.sort = 'popular';
    state.genre = 'all';
    if (input) input.value = '';
    if (sortSelect) sortSelect.value = 'popular';
    renderGenreTabs('exploreGenreTabs', 'all', onExploreGenre);
    renderExploreResults(refreshPage);
  });

  function onExploreGenre(genre) {
    state.genre = genre;
    renderGenreTabs('exploreGenreTabs', genre, onExploreGenre);
    renderExploreResults(refreshPage);
  }
  renderGenreTabs('exploreGenreTabs', state.genre, onExploreGenre);
}

export function initExplorePage(force = false, refreshPage) {
  const grid = document.getElementById('exploreGrid');
  if (!grid) return;

  // Initialize query from URL on first load
  if (!bound) {
    state.query = getUrlQueryParam('q') || '';
  }

  const input = document.getElementById('exploreSearchInput');
  const sortSelect = document.getElementById('exploreSortSelect');
  if (input) input.value = state.query;
  if (sortSelect) sortSelect.value = state.sort;

  if (!bound) {
    bindEvents(refreshPage);
    bound = true;
  }
  renderExploreResults(refreshPage);
}
