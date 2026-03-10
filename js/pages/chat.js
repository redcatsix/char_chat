import {
  findCharacterById, getAllCharacters, getSelectedCharacter, setSelectedCharacter,
  ensureConversationInitialized, getCharacterConversation, setCharacterConversation,
  getStylePreferences, saveStylePreferences, cryptoRandomId, updateCharacterActivity,
} from '../storage.js';
import { updateAiStatus, showToast, escapeHtml, getFormField } from '../utils.js';
import {
  renderChatCharacterList, renderChatHeader, renderProfileCard,
  renderMessages, wireFavoriteButtons, wireChatLinks,
} from '../ui.js';
import { requestAssistantReply } from '../api.js';

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
    wireFavoriteButtons(headerRoot, refreshPage);

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
