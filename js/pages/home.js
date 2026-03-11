import { MAX_FEATURED } from '../constants.js';
import { getAllCharacters } from '../storage.js';
import {
  renderCharacterCard, wireFavoriteButtons, wireChatLinks, wireProfileModals,
  renderGenreTabs, filterByGenre, emptyState,
} from '../ui.js';

const state = { genre: 'all' };
let bound = false;

function renderHomeGrid(refreshPage) {
  const featuredGrid = document.getElementById('featuredGrid');
  if (!featuredGrid) return;

  const characters = getAllCharacters()
    .filter((c) => c.visibility !== 'private')
    .sort((a, b) => (b.likes + b.chats) - (a.likes + a.chats));
  const filtered = filterByGenre(characters, state.genre);
  const featured = filtered.slice(0, MAX_FEATURED);
  featuredGrid.innerHTML = featured.length
    ? featured.map((character) => renderCharacterCard(character, { layout: 'feed' })).join('')
    : emptyState('이 장르에 해당하는 캐릭터가 없어요', '다른 장르를 선택해 보세요.');
  wireFavoriteButtons(featuredGrid, refreshPage);
  wireChatLinks(featuredGrid);
  wireProfileModals(featuredGrid);
}

function render(refreshPage) {
  function onGenreSelect(genre) {
    state.genre = genre;
    renderGenreTabs('genreTabs', genre, onGenreSelect);
    renderHomeGrid(refreshPage);
  }
  renderGenreTabs('genreTabs', state.genre, onGenreSelect);
  renderHomeGrid(refreshPage);
}

function bindEvents() {
  // Search overlay toggle
  const searchToggle = document.getElementById('searchToggleBtn');
  const searchOverlay = document.getElementById('searchOverlay');
  const searchClose = document.getElementById('searchCloseBtn');
  const searchInput = document.getElementById('heroSearchInput');

  searchToggle?.addEventListener('click', () => {
    if (searchOverlay) {
      searchOverlay.hidden = false;
      searchInput?.focus();
    }
  });

  searchClose?.addEventListener('click', () => {
    if (searchOverlay) searchOverlay.hidden = true;
  });

  document.getElementById('heroSearchForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = searchInput?.value?.trim() || '';
    const nextUrl = query ? `explore.html?q=${encodeURIComponent(query)}` : 'explore.html';
    window.location.href = nextUrl;
  });
}

export function initHomePage(force = false, refreshPage) {
  const featuredGrid = document.getElementById('featuredGrid');
  if (!featuredGrid) return;

  if (!bound) {
    bindEvents();
    bound = true;
  }
  render(refreshPage);
}
