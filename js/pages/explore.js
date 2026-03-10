import { getAllCharacters, getFavorites, getCharacterActivityTime, getUrlQueryParam } from '../storage.js';
import { escapeHtml } from '../utils.js';
import {
  renderCharacterCard, wireFavoriteButtons, wireChatLinks, wireProfileModals,
  renderGenreTabs, filterByGenre, emptyState, getAllTags,
} from '../ui.js';

export function initExplorePage(force = false, refreshPage) {
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
    wireFavoriteButtons(grid, refreshPage);
    wireChatLinks(grid);
    wireProfileModals(grid);
  }

  renderExploreResults();
}
