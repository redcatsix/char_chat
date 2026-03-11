import {
  findCharacterById, getAllCharacters, getSelectedCharacter, setSelectedCharacter,
  ensureConversationInitialized, getCharacterConversation, setCharacterConversation,
  getStylePreferences, saveStylePreferences, cryptoRandomId, updateCharacterActivity,
} from '../storage.js';
import { updateAiStatus, showToast, escapeHtml, getFormField } from '../utils.js';
import {
  renderChatCharacterList, renderChatHeader, renderProfileCard,
  renderMessages, wireFavoriteButtons, wireChatLinks, renderAvatarBadge,
} from '../ui.js';
import { requestAssistantReply } from '../api.js';

const state = {
  characterId: null,
  filter: '',
  sending: false,
  deleteMode: false,
  deleteStartIdx: -1,
};
let bound = false;

function closeMenu() {
  const dropdown = document.getElementById('chatMenuDropdown');
  if (dropdown) dropdown.hidden = true;
}

export function initChatPage(force = false, refreshPage) {
  const messagesRoot = document.getElementById('chatMessages');
  if (!messagesRoot) return;

  const characterSearch = document.getElementById('chatCharacterSearch');
  const listRoot = document.getElementById('chatCharacterList');
  const headerRoot = document.getElementById('chatHeader');
  const profileCard = document.getElementById('characterProfileCard');
  const styleForm = document.getElementById('styleForm');
  const composer = document.getElementById('chatComposer');
  const input = document.getElementById('chatInput');
  const chatSidebar = document.getElementById('chatSidebar');
  const chatSidepanel = document.getElementById('chatSidepanel');
  const chatOverlay = document.getElementById('chatOverlay');
  const sidebarToggle = document.getElementById('chatSidebarToggle');
  const settingsToggle = document.getElementById('chatSettingsToggle');
  const chatTopbarInfo = document.getElementById('chatTopbarInfo');
  const menuToggle = document.getElementById('chatMenuToggle');
  const menuDropdown = document.getElementById('chatMenuDropdown');

  if (!state.characterId) {
    state.characterId = getSelectedCharacter();
  }

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

  // Sync form values
  getFormField(styleForm, 'pov').value = style.pov;
  getFormField(styleForm, 'length').value = style.length;
  getFormField(styleForm, 'pacing').value = style.pacing;
  getFormField(styleForm, 'tone').value = style.tone;

  if (!bound) {
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

    characterSearch?.addEventListener('input', () => {
      state.filter = characterSearch.value.trim().toLowerCase();
      renderCharacterList();
    });

    styleForm?.addEventListener('change', () => {
      const nextStyle = Object.fromEntries(new FormData(styleForm).entries());
      saveStylePreferences(character.id, nextStyle);
      showToast('응답 스타일을 저장했어요');
    });

    composer?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (state.sending || state.deleteMode) return;
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
      state.sending = false;
      if (reply) {
        const finalMessages = [
          ...getCharacterConversation(liveCharacter.id),
          { id: cryptoRandomId(), role: 'assistant', text: reply, createdAt: new Date().toISOString() },
        ];
        setCharacterConversation(liveCharacter.id, finalMessages);
        updateCharacterActivity(liveCharacter.id);
      }
      renderMain(false);
      renderCharacterList();
    });

    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        composer.requestSubmit();
      }
    });

    // ── Hamburger menu toggle ──
    menuToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuDropdown) menuDropdown.hidden = !menuDropdown.hidden;
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.chat-menu-wrap')) closeMenu();
    });

    // ── Menu actions ──
    menuDropdown?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-action]');
      if (!item) return;
      closeMenu();

      const action = item.dataset.action;
      const liveCharacter = findCharacterById(state.characterId) || character;

      if (action === 'restart') {
        handleRestart(liveCharacter);
      } else if (action === 'delete-range') {
        enterDeleteMode();
      } else if (action === 'profile') {
        showProfileSelector(liveCharacter);
      }
    });

    bound = true;
  }

  if (characterSearch) {
    characterSearch.value = state.filter || '';
  }

  // ── Restart (새로하기) ──
  function handleRestart(liveCharacter) {
    if (!window.confirm('현재 대화를 버리고 새로 시작할까요?')) return;
    setCharacterConversation(liveCharacter.id, [{
      id: cryptoRandomId(),
      role: 'assistant',
      text: liveCharacter.greeting,
      createdAt: new Date().toISOString(),
    }]);
    state.sending = false;
    renderMain(false);
    renderCharacterList();
    showToast('대화를 새로 시작했어요');
  }

  // ── Delete range mode ──
  function enterDeleteMode() {
    const liveCharacter = findCharacterById(state.characterId) || character;
    const history = getCharacterConversation(liveCharacter.id);

    // Find first user message index (greeting and system messages can't be deleted)
    const firstDeletable = history.findIndex((m) => m.role === 'user');
    if (firstDeletable < 0) {
      showToast('삭제할 대화가 없어요');
      return;
    }

    state.deleteMode = true;
    // Auto-select from firstDeletable to the end
    state.deleteStartIdx = history.length - 1;

    renderDeleteMode(history, liveCharacter);
  }

  function renderDeleteMode(history, liveCharacter) {
    const firstDeletable = history.findIndex((m) => m.role === 'user');
    messagesRoot.classList.add('delete-mode');
    messagesRoot.innerHTML = renderMessages(history, liveCharacter, { withTyping: false });

    // Mark messages in delete range
    const messageEls = messagesRoot.querySelectorAll('.message');
    updateDeleteRangeUI(messageEls, firstDeletable, history);

    // Click messages to set range start
    messageEls.forEach((el, idx) => {
      if (idx < firstDeletable) return; // can't select greeting
      el.addEventListener('click', () => {
        state.deleteStartIdx = idx;
        updateDeleteRangeUI(messageEls, firstDeletable, history);
      });
    });

    // Add delete confirm bar
    let confirmBar = messagesRoot.parentElement.querySelector('.delete-confirm-bar');
    if (!confirmBar) {
      confirmBar = document.createElement('div');
      confirmBar.className = 'delete-confirm-bar';
      confirmBar.innerHTML = `
        <button class="button ghost" data-delete-cancel type="button">취소</button>
        <button class="button primary" style="background:var(--danger);border-color:var(--danger);" data-delete-confirm type="button">대화 삭제</button>
      `;
      composer.parentElement.insertBefore(confirmBar, composer);
    }

    composer.style.display = 'none';

    confirmBar.querySelector('[data-delete-cancel]').onclick = () => exitDeleteMode();
    confirmBar.querySelector('[data-delete-confirm]').onclick = () => {
      const kept = history.slice(0, state.deleteStartIdx);
      if (kept.length === 0) {
        // Keep at least the greeting
        setCharacterConversation(liveCharacter.id, [{
          id: cryptoRandomId(),
          role: 'assistant',
          text: liveCharacter.greeting,
          createdAt: new Date().toISOString(),
        }]);
      } else {
        setCharacterConversation(liveCharacter.id, kept);
      }
      exitDeleteMode();
      renderMain(false);
      renderCharacterList();
      showToast('선택한 대화를 삭제했어요');
    };
  }

  function updateDeleteRangeUI(messageEls, firstDeletable, history) {
    messageEls.forEach((el, idx) => {
      el.classList.remove('in-delete-range', 'delete-range-start');
      if (idx >= state.deleteStartIdx) {
        el.classList.add('in-delete-range');
      }
      if (idx === state.deleteStartIdx) {
        el.classList.add('delete-range-start');
      }
    });
  }

  function exitDeleteMode() {
    state.deleteMode = false;
    state.deleteStartIdx = -1;
    messagesRoot.classList.remove('delete-mode');
    const confirmBar = composer.parentElement.querySelector('.delete-confirm-bar');
    if (confirmBar) confirmBar.remove();
    composer.style.display = '';
  }

  // ── Profile selector ──
  function showProfileSelector(liveCharacter) {
    const existing = document.getElementById('profileSelectorModal');
    if (existing) existing.remove();

    const allChars = getAllCharacters();
    const modal = document.createElement('div');
    modal.id = 'profileSelectorModal';
    modal.className = 'profile-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '대화 프로필 선택');
    modal.innerHTML = `
      <div class="profile-modal-backdrop"></div>
      <div class="profile-modal-content" style="max-width:400px;">
        <button class="profile-modal-close" type="button" aria-label="닫기">✕</button>
        <div class="profile-modal-body">
          <h2 style="margin:0 0 12px;">대화 프로필</h2>
          <p style="color:var(--text-secondary);margin:0 0 16px;font-size:0.9rem;">대화할 캐릭터를 선택하세요</p>
          <div class="profile-selector-list" style="display:grid;gap:8px;max-height:400px;overflow-y:auto;">
            ${allChars.map((c) => `
              <button class="chat-character-item ${c.id === liveCharacter.id ? 'is-active' : ''}" data-select-profile="${escapeHtml(c.id)}" type="button" style="width:100%;text-align:left;border:1px solid var(--border);border-radius:12px;padding:10px;background:${c.id === liveCharacter.id ? 'var(--accent-soft)' : 'var(--panel-soft)'};">
                ${renderAvatarBadge(c, { size: 40 })}
                <div class="chat-character-meta">
                  <strong>${escapeHtml(c.name)}</strong>
                  <p style="margin:0;font-size:0.82rem;color:var(--muted);">${escapeHtml(c.headline)}</p>
                </div>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
      document.removeEventListener('keydown', handleEsc);
    };
    const handleEsc = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handleEsc);

    modal.querySelector('.profile-modal-backdrop').addEventListener('click', closeModal);
    modal.querySelector('.profile-modal-close').addEventListener('click', closeModal);

    modal.querySelectorAll('[data-select-profile]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.selectProfile;
        state.characterId = id;
        setSelectedCharacter(id);
        character = findCharacterById(id) || character;
        ensureConversationInitialized(character);

        const newStyle = getStylePreferences(character);
        getFormField(styleForm, 'pov').value = newStyle.pov;
        getFormField(styleForm, 'length').value = newStyle.length;
        getFormField(styleForm, 'pacing').value = newStyle.pacing;
        getFormField(styleForm, 'tone').value = newStyle.tone;

        closeModal();
        renderMain(false);
        renderCharacterList();
        showToast(`${character.name}(으)로 전환했어요`);
      });
    });
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
    wireFavoriteButtons(headerRoot, refreshPage);

    if (chatTopbarInfo) {
      chatTopbarInfo.innerHTML = `
        ${renderAvatarBadge(liveCharacter, { size: 30, className: 'avatar-badge' })}
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
