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
import { getUser, logout, initGoogleAuth, renderGoogleButton, onAuthChange } from '../auth.js';

let bound = false;

function renderProfile() {
  const guestEl = document.getElementById('mypageGuest');
  const userEl = document.getElementById('mypageUser');
  if (!guestEl || !userEl) return;

  const user = getUser();
  if (user) {
    guestEl.hidden = true;
    userEl.hidden = false;
    const avatar = document.getElementById('mypageUserAvatar');
    const name = document.getElementById('mypageUserName');
    const email = document.getElementById('mypageUserEmail');
    if (avatar) { avatar.src = user.picture; avatar.alt = user.name; }
    if (name) name.textContent = user.name;
    if (email) email.textContent = user.email;
  } else {
    guestEl.hidden = false;
    userEl.hidden = true;
    const btnWrap = document.getElementById('googleLoginBtn');
    if (btnWrap && !btnWrap.hasChildNodes()) {
      renderGoogleButton(btnWrap);
    }
  }
}

function render(refreshPage) {
  renderProfile();
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

function importUserData() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('invalid format');

      if (Array.isArray(data.favorites)) {
        localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(data.favorites));
      }
      if (Array.isArray(data.createdCharacters)) {
        localStorage.setItem(STORAGE_KEYS.createdCharacters, JSON.stringify(data.createdCharacters));
      }
      if (data.chats && typeof data.chats === 'object') {
        // Store as per-character keys
        for (const [id, messages] of Object.entries(data.chats)) {
          if (Array.isArray(messages)) {
            localStorage.setItem(`${STORAGE_KEYS.chats}:${id}`, JSON.stringify(messages));
          }
        }
      }
      if (data.stylePrefs && typeof data.stylePrefs === 'object') {
        localStorage.setItem(STORAGE_KEYS.stylePrefs, JSON.stringify(data.stylePrefs));
      }

      showToast('데이터를 성공적으로 가져왔어요');
      window.location.reload();
    } catch (error) {
      console.error('[import]', error);
      showToast('올바른 JSON 파일이 아니에요');
    }
  });
  fileInput.click();
}

function bindEvents() {
  document.getElementById('exportDataBtn')?.addEventListener('click', exportUserData);
  document.getElementById('importDataBtn')?.addEventListener('click', importUserData);
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    logout();
    showToast('로그아웃 되었습니다');
  });
}

export function initMyPage(force = false, refreshPage) {
  const favoriteGrid = document.getElementById('favoriteGrid');
  if (!favoriteGrid) return;

  if (!bound) {
    bindEvents();
    // Load Google Client ID from server config
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        if (cfg.googleClientId) {
          window.GOOGLE_CLIENT_ID = cfg.googleClientId;
          initGoogleAuth();
        }
      })
      .catch(() => {});
    // Re-render on auth state changes
    onAuthChange(() => render(refreshPage));
    bound = true;
  }
  render(refreshPage);
}
