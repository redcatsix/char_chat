import {
  findCharacterById, getAllCharacters, getSelectedCharacter, setSelectedCharacter,
  ensureConversationInitialized, getCharacterConversation, setCharacterConversation,
  getStylePreferences, saveStylePreferences, cryptoRandomId, updateCharacterActivity,
  getOnboardingSession, saveOnboardingSession, clearOnboardingSession,
} from '../storage.js';
import { updateAiStatus, showToast, escapeHtml, getFormField } from '../utils.js';
import {
  renderChatCharacterList, renderChatHeader, renderProfileCard,
  renderMessages, wireFavoriteButtons, wireChatLinks, renderWorldSummaryCard,
} from '../ui.js';
import { requestAssistantReply } from '../api.js';

function createMessage(role, text) {
  return {
    id: cryptoRandomId(),
    role,
    text,
    createdAt: new Date().toISOString(),
  };
}

function isFreshConversation(history, character) {
  if (!Array.isArray(history) || history.length === 0) return true;
  if (history.length !== 1) return false;
  const [first] = history;
  return first.role === 'assistant' && first.text === character.greeting;
}

function getOnboardingUserDisplayText(onboardingState, input) {
  if (!input) return '';
  if (input.userInputType === 'button') {
    const choices = Array.isArray(onboardingState?.choices) ? onboardingState.choices : [];
    const selected = choices.find((choice) => choice.id === input.selectedChoiceId);
    return selected?.label || selected?.value || '';
  }
  return (input.directInputText || '').trim();
}

function hasWorldSummary(onboardingState) {
  if (!onboardingState?.complete) return false;
  return Object.values(onboardingState.worldSummary || {}).some((value) => typeof value === 'string' && value.trim());
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
  const resetChatBtn = document.getElementById('resetChatBtn');
  const chatSidebar = document.getElementById('chatSidebar');
  const chatSidepanel = document.getElementById('chatSidepanel');
  const chatOverlay = document.getElementById('chatOverlay');
  const sidebarToggle = document.getElementById('chatSidebarToggle');
  const settingsToggle = document.getElementById('chatSettingsToggle');
  const chatTopbarInfo = document.getElementById('chatTopbarInfo');
  const worldSummaryCard = document.getElementById('worldSummaryCard');
  const onboardingPanel = document.getElementById('onboardingPanel');
  const onboardingQuestion = document.getElementById('onboardingQuestion');
  const onboardingChoices = document.getElementById('onboardingChoices');
  const onboardingDirectForm = document.getElementById('onboardingDirectForm');
  const onboardingDirectInput = document.getElementById('onboardingDirectInput');
  const onboardingRetryBtn = document.getElementById('onboardingRetryBtn');

  if (!styleForm || !composer || !input || !characterSearch || !listRoot || !headerRoot || !profileCard) return;

  const state = window.__chatState || {
    characterId: getSelectedCharacter(),
    filter: '',
    sending: false,
    onboarding: null,
    onboardingError: '',
    pendingOnboardingInput: null,
  };
  window.__chatState = state;

  function getLiveCharacter() {
    return findCharacterById(state.characterId) || getAllCharacters()[0] || null;
  }

  let character = getLiveCharacter();
  if (!character) return;

  function closePanels() {
    chatSidebar?.classList.remove('is-open');
    chatSidepanel?.classList.remove('is-open');
    chatOverlay?.classList.remove('is-active');
  }

  function readStyleFormValues() {
    return Object.fromEntries(new FormData(styleForm).entries());
  }

  function applyStyleFormValues(style) {
    getFormField(styleForm, 'pov').value = style.pov;
    getFormField(styleForm, 'length').value = style.length;
    getFormField(styleForm, 'pacing').value = style.pacing;
    getFormField(styleForm, 'tone').value = style.tone;
  }

  function persistOnboardingSession(characterId, onboardingState) {
    if (!onboardingState || typeof onboardingState !== 'object') {
      state.onboarding = null;
      clearOnboardingSession(characterId);
      return;
    }

    state.onboarding = onboardingState;
    saveOnboardingSession(characterId, onboardingState);
  }

  function toggleComposerByOnboarding() {
    const isActive = Boolean(state.onboarding?.active && !state.onboarding?.complete);
    composer.classList.toggle('is-hidden', isActive);
    input.disabled = isActive;
  }

  function renderWorldSummary() {
    if (!worldSummaryCard) return;
    if (!hasWorldSummary(state.onboarding)) {
      worldSummaryCard.classList.add('is-hidden');
      worldSummaryCard.innerHTML = '';
      return;
    }

    worldSummaryCard.classList.remove('is-hidden');
    worldSummaryCard.innerHTML = renderWorldSummaryCard(state.onboarding.worldSummary);
  }

  function renderOnboardingPanel() {
    if (!onboardingPanel || !onboardingQuestion || !onboardingChoices || !onboardingRetryBtn) return;
    const isActive = Boolean(state.onboarding?.active && !state.onboarding?.complete);
    onboardingPanel.classList.toggle('is-hidden', !isActive);

    if (!isActive) {
      onboardingQuestion.textContent = '';
      onboardingChoices.innerHTML = '';
      onboardingRetryBtn.classList.add('is-hidden');
      onboardingRetryBtn.textContent = '마지막 요청 재시도';
      return;
    }

    onboardingQuestion.textContent = state.onboarding.question || '다음 설정을 골라주세요.';
    const choices = Array.isArray(state.onboarding.choices) ? state.onboarding.choices : [];
    onboardingChoices.innerHTML = choices.map((choice) => `
      <button
        class="onboarding-choice-btn"
        type="button"
        data-onboarding-choice-id="${escapeHtml(choice.id)}"
        ${state.sending ? 'disabled' : ''}
      >
        ${escapeHtml(choice.label)}
      </button>
    `).join('');

    onboardingChoices.querySelectorAll('[data-onboarding-choice-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (state.sending) return;
        const selectedChoiceId = button.dataset.onboardingChoiceId;
        if (!selectedChoiceId) return;
        await submitOnboardingTurn({
          userInputType: 'button',
          selectedChoiceId,
          directInputText: '',
        });
      });
    });

    if (onboardingDirectInput) {
      onboardingDirectInput.disabled = state.sending || state.onboarding.allowDirectInput === false;
      onboardingDirectInput.placeholder = state.onboarding.allowDirectInput === false
        ? '직접 입력이 잠시 비활성화되었습니다'
        : '직접 입력 (예: 알아서 설정해줘)';
    }

    onboardingRetryBtn.classList.toggle('is-hidden', !state.onboardingError || !state.pendingOnboardingInput);
    onboardingRetryBtn.textContent = state.onboardingError
      ? `재시도: ${state.onboardingError}`
      : '마지막 요청 재시도';
  }

  function renderCharacterList() {
    const items = getAllCharacters().filter((item) => {
      const searchable = [item.name, item.headline, ...item.tags].join(' ').toLowerCase();
      return !state.filter || searchable.includes(state.filter);
    });
    listRoot.innerHTML = renderChatCharacterList(items, state.characterId);
    wireChatLinks(listRoot);
    listRoot.querySelectorAll('[data-open-chat-id]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const nextId = link.dataset.openChatId;
        if (!nextId) return;
        activateCharacter(nextId, { closeSidePanels: true });
      });
    });
  }

  function renderMain(withTyping) {
    const liveCharacter = getLiveCharacter();
    if (!liveCharacter) return;

    character = liveCharacter;
    state.characterId = liveCharacter.id;
    setSelectedCharacter(liveCharacter.id);
    history.replaceState({}, '', `chat.html?character=${encodeURIComponent(liveCharacter.id)}`);

    headerRoot.innerHTML = renderChatHeader(liveCharacter);
    profileCard.innerHTML = renderProfileCard(liveCharacter);
    wireFavoriteButtons(headerRoot, refreshPage);

    if (chatTopbarInfo) {
      chatTopbarInfo.innerHTML = `
        <div class="message-avatar" style="width:28px;height:28px;border-radius:8px;font-size:0.85rem;">${escapeHtml(liveCharacter.avatar || '✨')}</div>
        <strong>${escapeHtml(liveCharacter.name)}</strong>
      `;
    }

    const historyMessages = getCharacterConversation(liveCharacter.id);
    messagesRoot.innerHTML = renderMessages(historyMessages, liveCharacter, { withTyping });
    requestAnimationFrame(() => {
      messagesRoot.scrollTo({ top: messagesRoot.scrollHeight, behavior: 'smooth' });
    });

    renderWorldSummary();
    renderOnboardingPanel();
    toggleComposerByOnboarding();
  }

  async function submitOnboardingTurn(input = null) {
    if (state.sending) return false;
    const liveCharacter = getLiveCharacter();
    if (!liveCharacter) return false;

    const style = readStyleFormValues();
    const messages = getCharacterConversation(liveCharacter.id);
    const onboardingState = state.onboarding || getOnboardingSession(liveCharacter.id) || null;
    const currentOnboarding = onboardingState || null;

    state.sending = true;
    state.onboardingError = '';
    if (input) state.pendingOnboardingInput = input;
    renderMain(true);

    try {
      const response = await requestAssistantReply({
        character: liveCharacter,
        messages,
        userMessage: input?.directInputText || '',
        style,
        mode: 'onboarding',
        onboardingState: currentOnboarding,
        userInputType: input?.userInputType || 'text',
        selectedChoiceId: input?.selectedChoiceId || '',
        directInputText: input?.directInputText || '',
      });

      const nextMessages = [...messages];
      const userDisplayText = getOnboardingUserDisplayText(currentOnboarding, input);
      if (userDisplayText) {
        nextMessages.push(createMessage('user', userDisplayText));
      }
      nextMessages.push(createMessage('assistant', response.reply));
      setCharacterConversation(liveCharacter.id, nextMessages);
      updateCharacterActivity(liveCharacter.id);

      const nextOnboarding = response.onboarding && typeof response.onboarding === 'object'
        ? response.onboarding
        : null;
      persistOnboardingSession(liveCharacter.id, nextOnboarding);

      state.pendingOnboardingInput = null;
      state.onboardingError = '';
      state.sending = false;

      if (state.onboarding?.complete) {
        showToast('세계관 설정이 완료됐어요. 이제 자유 대화를 이어가세요.');
      }

      renderMain(false);
      renderCharacterList();
      return true;
    } catch (error) {
      state.sending = false;
      state.onboardingError = '요청 실패';
      showToast(error?.message || '온보딩 요청에 실패했어요. 재시도 버튼을 눌러주세요.');
      renderMain(false);
      return false;
    }
  }

  async function maybeStartOnboarding() {
    const liveCharacter = getLiveCharacter();
    if (!liveCharacter) return;

    const historyMessages = getCharacterConversation(liveCharacter.id);
    const savedOnboarding = getOnboardingSession(liveCharacter.id);
    state.onboarding = savedOnboarding;

    if (savedOnboarding?.active) {
      renderMain(false);
      return;
    }

    if (!savedOnboarding && isFreshConversation(historyMessages, liveCharacter)) {
      await submitOnboardingTurn(null);
    }
  }

  async function activateCharacter(nextCharacterId, { closeSidePanels = false } = {}) {
    const target = findCharacterById(nextCharacterId);
    if (!target) return;

    state.characterId = target.id;
    state.onboarding = getOnboardingSession(target.id);
    state.onboardingError = '';
    state.pendingOnboardingInput = null;

    setSelectedCharacter(target.id);
    ensureConversationInitialized(target);
    applyStyleFormValues(getStylePreferences(target));

    if (closeSidePanels) closePanels();
    renderCharacterList();
    renderMain(false);
    await maybeStartOnboarding();
  }

  ensureConversationInitialized(character);
  const initialStyle = getStylePreferences(character);
  applyStyleFormValues(initialStyle);
  state.onboarding = getOnboardingSession(character.id);
  state.onboardingError = '';
  updateAiStatus('waiting', '연결 대기');

  if (!force) {
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
      const liveCharacter = getLiveCharacter();
      if (!liveCharacter) return;
      const nextStyle = readStyleFormValues();
      saveStylePreferences(liveCharacter.id, nextStyle);
      showToast('응답 스타일을 저장했어요');
    });

    composer.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (state.sending) return;
      if (state.onboarding?.active && !state.onboarding.complete) {
        showToast('먼저 세계관 설정 온보딩을 완료해 주세요.');
        return;
      }

      const value = input.value.trim();
      if (!value) return;

      const liveCharacter = getLiveCharacter();
      if (!liveCharacter) return;

      const currentStyle = readStyleFormValues();
      saveStylePreferences(liveCharacter.id, currentStyle);

      const messages = getCharacterConversation(liveCharacter.id);
      const nextMessages = [...messages, createMessage('user', value)];
      setCharacterConversation(liveCharacter.id, nextMessages);
      input.value = '';
      state.sending = true;
      renderMain(true);

      const response = await requestAssistantReply({
        character: liveCharacter,
        messages: nextMessages,
        userMessage: value,
        style: currentStyle,
        mode: 'chat',
        onboardingState: state.onboarding,
      });

      const finalMessages = [
        ...getCharacterConversation(liveCharacter.id),
        createMessage('assistant', response.reply),
      ];
      setCharacterConversation(liveCharacter.id, finalMessages);
      updateCharacterActivity(liveCharacter.id);
      persistOnboardingSession(liveCharacter.id, response.onboarding || state.onboarding);
      state.sending = false;
      renderMain(false);
      renderCharacterList();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        composer.requestSubmit();
      }
    });

    onboardingDirectForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!onboardingDirectInput || state.sending) return;
      const value = onboardingDirectInput.value.trim();
      if (!value) return;

      const success = await submitOnboardingTurn({
        userInputType: 'text',
        selectedChoiceId: '',
        directInputText: value,
      });
      if (success) onboardingDirectInput.value = '';
    });

    onboardingRetryBtn?.addEventListener('click', async () => {
      if (!state.pendingOnboardingInput || state.sending) return;
      await submitOnboardingTurn(state.pendingOnboardingInput);
    });

    resetChatBtn?.addEventListener('click', async () => {
      const liveCharacter = getLiveCharacter();
      if (!liveCharacter) return;
      if (!window.confirm('현재 캐릭터와의 대화를 초기 상태로 되돌릴까요?')) return;

      setCharacterConversation(liveCharacter.id, [createMessage('assistant', liveCharacter.greeting)]);
      clearOnboardingSession(liveCharacter.id);
      state.onboarding = null;
      state.onboardingError = '';
      state.pendingOnboardingInput = null;
      state.sending = false;
      renderMain(false);
      renderCharacterList();
      showToast('대화를 초기화했어요');
      await maybeStartOnboarding();
    });
  } else {
    characterSearch.value = state.filter || '';
    applyStyleFormValues(getStylePreferences(character));
  }

  renderCharacterList();
  renderMain(state.sending);
  maybeStartOnboarding();
}
