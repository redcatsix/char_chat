import { STORAGE_KEYS } from '../constants.js';
import {
  getFavorites, getAllCharacters, getCreatedCharacters, getChats,
  getStoredObject,
} from '../storage.js';
import { formatCount, showToast } from '../utils.js';
import {
  renderCharacterCard, wireFavoriteButtons, wireChatLinks, wireDeleteButtons,
  wireProfileModals, emptyState, createRecentCard, getConversationSummaries,
} from '../ui.js';

export function initMyPage(force = false, refreshPage) {
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

  wireFavoriteButtons(favoriteGrid, refreshPage);
  wireFavoriteButtons(createdGrid, refreshPage);
  wireChatLinks(favoriteGrid);
  wireChatLinks(createdGrid);
  wireDeleteButtons(createdGrid, refreshPage);
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
