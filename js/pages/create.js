import { THUMBNAIL_MAX_BYTES, STYLE_LABELS } from '../constants.js';
import {
  findCharacterById, getCreatedCharacters, setSelectedCharacter,
  setCharacterConversation, cryptoRandomId, getUrlQueryParam,
} from '../storage.js';
import { STORAGE_KEYS } from '../constants.js';
import { setStoredArray } from '../storage.js';
import {
  escapeHtml, showToast, normalizeTags, getFormField, readFileAsDataUrl,
} from '../utils.js';

function labelPov(value) {
  return STYLE_LABELS.pov[value] || '3인칭';
}

function labelLength(value) {
  return STYLE_LABELS.length[value] || '보통';
}

function labelPacing(value) {
  return STYLE_LABELS.pacing[value] || '자연스럽게';
}

function labelTone(value) {
  return STYLE_LABELS.tone[value] || '로맨틱';
}

function renderCreatePreview(data) {
  return `
    <div class="character-title">
      <div class="avatar-badge">${escapeHtml(data.avatar || '✨')}</div>
      <div>
        <strong>${escapeHtml(data.name || '새 캐릭터')}</strong>
        <p>${escapeHtml(data.headline || '한 줄 소개가 여기에 표시됩니다.')}</p>
      </div>
    </div>
    ${data.cover
      ? `<div class="preview-cover"><img src="${escapeHtml(data.cover)}" alt="${escapeHtml(data.name || '캐릭터')}" loading="lazy" /></div>`
      : ''}
    <div class="tag-list">
      ${(data.tags.length ? data.tags : ['#태그예시']).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}
    </div>
    <div>
      <strong>성격 / 설정</strong>
      <p>${escapeHtml(data.personality || '성격과 말투, 관계성, 세계관 등을 적어 주세요.')}</p>
    </div>
    <div>
      <strong>첫 인사</strong>
      <div class="preview-chat">${escapeHtml(data.greeting || '안녕. 네가 여기 오길 기다리고 있었어.').replaceAll('\n', '<br />')}</div>
    </div>
    <div class="meta-row">
      <span class="meta-pill">${data.visibility === 'private' ? '비공개' : '공개'}</span>
      <span class="meta-pill">${escapeHtml(labelPov(data.style.pov))}</span>
      <span class="meta-pill">${escapeHtml(labelLength(data.style.length))}</span>
      <span class="meta-pill">${escapeHtml(labelPacing(data.style.pacing))}</span>
      <span class="meta-pill">${escapeHtml(labelTone(data.style.tone))}</span>
    </div>
    <p>${escapeHtml(data.scenario || '시나리오를 입력하면 캐릭터의 대화 맥락을 더 분명하게 줄 수 있습니다.')}</p>
  `;
}

function collectCreateFormData(form) {
  return {
    name: getFormField(form, 'name').value.trim() || '새 캐릭터',
    avatar: getFormField(form, 'avatar').value.trim() || '✨',
    cover: getFormField(form, 'cover').value.trim(),
    headline: getFormField(form, 'headline').value.trim() || '한 줄 소개',
    personality: getFormField(form, 'personality').value.trim(),
    greeting: getFormField(form, 'greeting').value.trim() || '안녕. 우리 이야기, 지금부터 시작해볼까?',
    scenario: getFormField(form, 'scenario').value.trim(),
    tags: normalizeTags(getFormField(form, 'tags').value.trim()),
    visibility: getFormField(form, 'visibility').value,
    style: {
      pov: getFormField(form, 'pov').value,
      length: getFormField(form, 'length').value,
      pacing: getFormField(form, 'pacing').value,
      tone: getFormField(form, 'tone').value,
    },
  };
}

export function initCreatePage(force = false) {
  const form = document.getElementById('createCharacterForm');
  const previewCard = document.getElementById('createPreviewCard');
  if (!form || !previewCard) return;

  const duplicateId = getUrlQueryParam('duplicate');
  const duplicateSource = duplicateId ? findCharacterById(duplicateId) : null;

  const initial = window.__createState || {
    name: duplicateSource?.name || '',
    avatar: duplicateSource?.avatar || '',
    cover: duplicateSource?.cover || '',
    headline: duplicateSource?.headline || '',
    personality: duplicateSource?.personality || '',
    greeting: duplicateSource?.greeting || '',
    scenario: duplicateSource?.scenario || '',
    tags: (duplicateSource?.tags || []).join(', '),
    visibility: duplicateSource?.visibility || 'public',
    style: {
      pov: duplicateSource?.style?.pov || 'third',
      length: duplicateSource?.style?.length || 'medium',
      pacing: duplicateSource?.style?.pacing || 'natural',
      tone: duplicateSource?.style?.tone || 'romance',
    },
  };

  window.__createState = initial;

  if (!force) {
    getFormField(form, 'name').value = initial.name;
    getFormField(form, 'avatar').value = initial.avatar;
    getFormField(form, 'cover').value = initial.cover;
    getFormField(form, 'headline').value = initial.headline;
    getFormField(form, 'personality').value = initial.personality;
    getFormField(form, 'greeting').value = initial.greeting;
    getFormField(form, 'scenario').value = initial.scenario;
    getFormField(form, 'tags').value = initial.tags;
    getFormField(form, 'visibility').value = initial.visibility;
    getFormField(form, 'pov').value = initial.style.pov;
    getFormField(form, 'length').value = initial.style.length;
    getFormField(form, 'pacing').value = initial.style.pacing;
    getFormField(form, 'tone').value = initial.style.tone;

    const coverFileInput = getFormField(form, 'coverFile');
    coverFileInput?.addEventListener('change', async () => {
      const file = coverFileInput.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('이미지 파일만 업로드할 수 있어요');
        coverFileInput.value = '';
        return;
      }
      if (file.size > THUMBNAIL_MAX_BYTES) {
        showToast('썸네일은 1.5MB 이하로 업로드해 주세요');
        coverFileInput.value = '';
        return;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        getFormField(form, 'cover').value = dataUrl;
        syncPreview();
        showToast('썸네일 업로드 완료');
      } catch (error) {
        console.error('[thumbnail-upload]', error);
        showToast('썸네일 업로드에 실패했어요');
      }
    });

    form.addEventListener('input', syncPreview);
    form.addEventListener('change', syncPreview);
    form.addEventListener('reset', () => {
      setTimeout(syncPreview, 0);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = collectCreateFormData(form);
      const createdCharacter = {
        id: `custom-${Date.now().toString(36)}`,
        ...formData,
        likes: 0,
        chats: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isBuiltin: false,
      };

      const created = getCreatedCharacters();
      setStoredArray(STORAGE_KEYS.createdCharacters, [createdCharacter, ...created]);
      setCharacterConversation(createdCharacter.id, [{
        id: cryptoRandomId(),
        role: 'assistant',
        text: createdCharacter.greeting,
        createdAt: new Date().toISOString(),
      }]);
      setSelectedCharacter(createdCharacter.id);
      showToast('캐릭터를 저장했어요');
      window.location.href = `chat.html?character=${encodeURIComponent(createdCharacter.id)}`;
    });
  }

  syncPreview();

  function syncPreview() {
    const data = collectCreateFormData(form);
    previewCard.innerHTML = renderCreatePreview(data);
  }
}
