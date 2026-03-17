import {
  findCharacterById, getAllCharacters, getSelectedCharacter, setSelectedCharacter,
  ensureConversationInitialized, getCharacterConversation, setCharacterConversation,
  getStylePreferences, saveStylePreferences, cryptoRandomId, updateCharacterActivity,
  getSelectedModel, setSelectedModel, resolveIdbCovers,
} from '../storage.js';
import { MODEL_OPTIONS } from '../constants.js';
import { updateAiStatus, showToast, escapeHtml, getFormField } from '../utils.js';
import {
  renderChatCharacterList, renderChatHeader, renderProfileCard,
  renderMessages, wireFavoriteButtons, renderAvatarBadge, renderChatListItems,
} from '../ui.js';
import { requestAssistantReply } from '../api.js';

const state = {
  characterId: null,
  filter: '',
  sending: false,
  deleteMode: false,
  deleteStartIdx: -1,
  view: 'list', // 'list' | 'room'
};
let bound = false;

export function initChatPage(force = false, refreshPage) {
  // DOM refs - list view
  const chatListView = document.getElementById('chatListView');
  const chatRoomView = document.getElementById('chatRoomView');
  const chatListItems = document.getElementById('chatListItems');
  const chatListSearchToggle = document.getElementById('chatListSearchToggle');
  const chatListSearchWrap = document.getElementById('chatListSearchWrap');
  const chatListSearchInput = document.getElementById('chatListSearchInput');

  // DOM refs - room view
  const messagesRoot = document.getElementById('chatMessages');
  const headerRoot = document.getElementById('chatHeader');
  const profileCard = document.getElementById('characterProfileCard');
  const styleForm = document.getElementById('styleForm');
  const composer = document.getElementById('chatComposer');
  const input = document.getElementById('chatInput');
  const chatSidepanel = document.getElementById('chatSidepanel');
  const chatOverlay = document.getElementById('chatOverlay');
  const settingsToggle = document.getElementById('chatSettingsToggle');
  const sidepanelClose = document.getElementById('chatSidepanelClose');
  const chatTopbarInfo = document.getElementById('chatTopbarInfo');
  const chatBackBtn = document.getElementById('chatBackBtn');

  // DOM refs - model select
  const modelSelect = document.getElementById('modelSelect');
  const modelDesc = document.getElementById('modelDesc');
  const chatNoticeHead = document.querySelector('.chat-notice-head strong');

  // Populate model dropdown
  if (modelSelect && modelSelect.options.length === 0) {
    MODEL_OPTIONS.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      modelSelect.appendChild(opt);
    });
    modelSelect.value = getSelectedModel();
    updateModelDesc();
  }

  function updateModelDesc() {
    const selected = MODEL_OPTIONS.find((m) => m.id === (modelSelect?.value || getSelectedModel()));
    if (modelDesc) modelDesc.textContent = selected?.desc || '';
    if (chatNoticeHead) {
      chatNoticeHead.innerHTML = `${selected?.label || 'AI'} <code>${selected?.id || ''}</code>`;
    }
  }

  if (!chatListView || !chatRoomView) return;

  let character = null;

  // ── View switching ──
  function showListView() {
    state.view = 'list';
    chatListView.hidden = false;
    chatRoomView.hidden = true;
    closePanels();
    renderChatList();
    // Update URL without character param
    const url = new URL(window.location);
    url.searchParams.delete('character');
    window.history.replaceState({}, '', url);
  }

  async function showRoomView(characterId) {
    const c = findCharacterById(characterId);
    if (!c) return;

    state.view = 'room';
    state.characterId = characterId;
    character = c;
    setSelectedCharacter(characterId);
    ensureConversationInitialized(character);

    chatListView.hidden = true;
    chatRoomView.hidden = false;

    // Resolve IndexedDB cover images before rendering
    await resolveIdbCovers([character]);

    // Sync style form
    const style = getStylePreferences(character);
    updateAiStatus('waiting', '연결 대기');
    getFormField(styleForm, 'pov').value = style.pov;
    getFormField(styleForm, 'length').value = style.length;
    getFormField(styleForm, 'pacing').value = style.pacing;
    getFormField(styleForm, 'tone').value = style.tone;

    renderRoom(false);

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('character', characterId);
    window.history.replaceState({}, '', url);
  }

  function closePanels() {
    chatSidepanel?.classList.remove('is-open');
    chatOverlay?.classList.remove('is-active');
  }

  // ── Chat list rendering ──
  async function renderChatList() {
    const allChars = getAllCharacters();
    await resolveIdbCovers(allChars);
    let filtered = null;
    if (state.filter) {
      filtered = allChars.filter((c) => {
        const searchable = [c.name, c.headline, ...c.tags].join(' ').toLowerCase();
        return searchable.includes(state.filter);
      });
    }
    chatListItems.innerHTML = renderChatListItems(filtered);

    // Wire up click handlers
    chatListItems.querySelectorAll('[data-chat-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showRoomView(btn.dataset.chatId);
      });
    });
  }

  // ── Chat room rendering ──
  function renderRoom(withTyping) {
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

  // ── Bind events (once) ──
  if (!bound) {
    // List view events
    chatListSearchToggle?.addEventListener('click', () => {
      const isHidden = chatListSearchWrap.hidden;
      chatListSearchWrap.hidden = !isHidden;
      if (!isHidden) {
        chatListSearchInput.value = '';
        state.filter = '';
        renderChatList();
      } else {
        chatListSearchInput.focus();
      }
    });

    chatListSearchInput?.addEventListener('input', () => {
      state.filter = chatListSearchInput.value.trim().toLowerCase();
      renderChatList();
    });

    // Room view events
    chatBackBtn?.addEventListener('click', () => {
      if (state.deleteMode) exitDeleteMode();
      showListView();
    });

    settingsToggle?.addEventListener('click', () => {
      chatSidepanel?.classList.add('is-open');
      chatOverlay?.classList.add('is-active');
    });

    sidepanelClose?.addEventListener('click', closePanels);
    chatOverlay?.addEventListener('click', closePanels);

    modelSelect?.addEventListener('change', () => {
      setSelectedModel(modelSelect.value);
      updateModelDesc();
      showToast('AI 모델을 변경했어요');
    });

    styleForm?.addEventListener('change', () => {
      const nextStyle = Object.fromEntries(new FormData(styleForm).entries());
      if (character) saveStylePreferences(character.id, nextStyle);
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
      renderRoom(true);

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
      renderRoom(false);
    });

    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        composer.requestSubmit();
      }
    });

    // Asterisk button — insert * at cursor or wrap selection with *...*
    const asteriskBtn = document.getElementById('asteriskBtn');
    asteriskBtn?.addEventListener('click', () => {
      if (!input) return;
      input.focus();
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const text = input.value;

      if (start !== end) {
        // Wrap selected text with *...*
        const selected = text.slice(start, end);
        const replacement = `*${selected}*`;
        input.value = text.slice(0, start) + replacement + text.slice(end);
        input.selectionStart = start;
        input.selectionEnd = start + replacement.length;
      } else {
        // Insert single * at cursor
        input.value = text.slice(0, start) + '*' + text.slice(start);
        input.selectionStart = input.selectionEnd = start + 1;
      }
    });

    // ── Sidepanel actions (replaces hamburger menu) ──
    chatSidepanel?.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;

      const action = actionBtn.dataset.action;
      const liveCharacter = findCharacterById(state.characterId) || character;
      closePanels();

      if (action === 'restart') {
        handleRestart(liveCharacter);
      } else if (action === 'delete-range') {
        enterDeleteMode();
      } else if (action === 'profile') {
        showProfileSelector(liveCharacter);
      }
    });

    // Browser back button
    window.addEventListener('popstate', () => {
      const params = new URLSearchParams(window.location.search);
      const charId = params.get('character');
      if (charId) {
        showRoomView(charId);
      } else {
        showListView();
      }
    });

    bound = true;
  }

  // ── Restart ──
  function handleRestart(liveCharacter) {
    if (!window.confirm('현재 대화를 버리고 새로 시작할까요?')) return;
    setCharacterConversation(liveCharacter.id, [{
      id: cryptoRandomId(),
      role: 'assistant',
      text: liveCharacter.greeting,
      createdAt: new Date().toISOString(),
    }]);
    state.sending = false;
    renderRoom(false);
    showToast('대화를 새로 시작했어요');
  }

  // ── Delete range mode ──
  function enterDeleteMode() {
    const liveCharacter = findCharacterById(state.characterId) || character;
    const history = getCharacterConversation(liveCharacter.id);
    const firstDeletable = history.findIndex((m) => m.role === 'user');
    if (firstDeletable < 0) {
      showToast('삭제할 대화가 없어요');
      return;
    }

    state.deleteMode = true;
    state.deleteStartIdx = history.length - 1;
    renderDeleteMode(history, liveCharacter);
  }

  function renderDeleteMode(history, liveCharacter) {
    const firstDeletable = history.findIndex((m) => m.role === 'user');
    messagesRoot.classList.add('delete-mode');
    messagesRoot.innerHTML = renderMessages(history, liveCharacter, { withTyping: false });

    const messageEls = messagesRoot.querySelectorAll('.message');
    updateDeleteRangeUI(messageEls, firstDeletable, history);

    messageEls.forEach((el, idx) => {
      if (idx < firstDeletable) return;
      el.addEventListener('click', () => {
        state.deleteStartIdx = idx;
        updateDeleteRangeUI(messageEls, firstDeletable, history);
      });
    });

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
      renderRoom(false);
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
        closeModal();
        showRoomView(id);
        showToast(`${findCharacterById(id)?.name || '캐릭터'}(으)로 전환했어요`);
      });
    });
  }

  // ── Initial routing ──
  // Only enter room if ?character= param is explicitly set (from external link)
  // Clicking "대화" in bottom nav goes to chat.html without params → show list
  const params = new URLSearchParams(window.location.search);
  const explicitCharId = params.get('character');

  if (explicitCharId && findCharacterById(explicitCharId)) {
    showRoomView(explicitCharId);
  } else {
    showListView();
  }
}
