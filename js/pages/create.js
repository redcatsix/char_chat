import { THUMBNAIL_MAX_BYTES } from '../constants.js';
import {
  findCharacterById, getCreatedCharacters, setSelectedCharacter,
  setCharacterConversation, cryptoRandomId, getUrlQueryParam,
  getAllCharacters, removeCreatedCharacter,
} from '../storage.js';
import { STORAGE_KEYS } from '../constants.js';
import { setStoredArray } from '../storage.js';
import {
  escapeHtml, showToast, normalizeTags, getFormField, readFileAsDataUrl,
  getCharacterThumbnail,
} from '../utils.js';
import { saveCoverImage } from '../image-store.js';
import { renderAvatarBadge } from '../ui.js';

let bound = false;
let pendingCoverDataUrl = null;

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

function renderCharacterGrid() {
  const characters = getAllCharacters();

  if (characters.length === 0) {
    return `
      <div class="chat-list-empty">
        <p>아직 캐릭터가 없어요</p>
        <p style="font-size:0.82rem;color:var(--muted);">상단 + 버튼으로 새 캐릭터를 만들어보세요</p>
      </div>
    `;
  }

  return characters.map((character) => {
    const thumb = getCharacterThumbnail(character);
    return `
      <button class="create-card" data-card-id="${escapeHtml(character.id)}" type="button">
        <div class="create-card-thumb">
          ${thumb
            ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(character.name)}" loading="lazy" />`
            : `<div class="create-card-fallback"><span>${escapeHtml(character.avatar || '✨')}</span></div>`}
        </div>
        <div class="create-card-name">${escapeHtml(character.name)}</div>
      </button>
    `;
  }).join('');
}

function showCharacterActionSheet(character, { onEdit, onDelete, onChat }) {
  const existing = document.getElementById('characterActionSheet');
  if (existing) existing.remove();

  const thumb = getCharacterThumbnail(character);
  const safeTags = Array.isArray(character.tags) ? character.tags : [];

  const sheet = document.createElement('div');
  sheet.id = 'characterActionSheet';
  sheet.className = 'profile-modal';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML = `
    <div class="profile-modal-backdrop"></div>
    <div class="profile-modal-content" style="max-width:480px;">
      <button class="profile-modal-close" type="button" aria-label="닫기">✕</button>
      ${thumb
        ? `<div class="profile-modal-cover"><img src="${escapeHtml(thumb)}" alt="${escapeHtml(character.name)}" /></div>`
        : `<div class="profile-modal-cover"><div class="character-cover-fallback" style="aspect-ratio:4/3;"><span style="font-size:3rem;">${escapeHtml(character.avatar || '✨')}</span></div></div>`}
      <div class="profile-modal-body">
        <h2 style="margin:0;">${escapeHtml(character.name)}</h2>
        <p style="color:var(--text-secondary);margin:0;">${escapeHtml(character.headline)}</p>
        ${safeTags.length ? `<div class="tag-list">${safeTags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="profile-modal-section">
          <strong>성격 / 설정</strong>
          <p>${escapeHtml(character.personality || '설정이 없습니다.')}</p>
        </div>
        <div class="action-sheet-buttons">
          <a class="button primary" data-action="chat" href="chat.html?character=${encodeURIComponent(character.id)}" style="text-align:center;">대화하기</a>
          ${!character.isBuiltin ? `<button class="button ghost" data-action="edit" type="button">편집</button>` : ''}
          ${!character.isBuiltin ? `<button class="button ghost" data-action="delete" type="button" style="color:var(--danger);border-color:rgba(244,63,94,0.3);">삭제</button>` : ''}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(sheet);

  const closeSheet = () => {
    sheet.remove();
    document.removeEventListener('keydown', handleEsc);
  };
  const handleEsc = (e) => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', handleEsc);

  sheet.querySelector('.profile-modal-backdrop').addEventListener('click', closeSheet);
  sheet.querySelector('.profile-modal-close').addEventListener('click', closeSheet);

  sheet.querySelector('[data-action="chat"]')?.addEventListener('click', () => {
    setSelectedCharacter(character.id);
    closeSheet();
  });

  sheet.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
    closeSheet();
    onEdit(character);
  });

  sheet.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
    if (!window.confirm(`'${character.name}' 캐릭터를 삭제할까요?`)) return;
    closeSheet();
    onDelete(character);
  });
}

export function initCreatePage(force = false) {
  const listView = document.getElementById('createListView');
  const formView = document.getElementById('createFormView');
  const grid = document.getElementById('createCharacterGrid');
  const form = document.getElementById('createCharacterForm');
  const createNewBtn = document.getElementById('createNewBtn');
  const formBackBtn = document.getElementById('createFormBackBtn');
  const formTitle = document.getElementById('createFormTitle');
  const submitBtn = document.getElementById('createSubmitBtn');

  if (!listView || !formView || !form) return;

  function showListView() {
    listView.hidden = false;
    formView.hidden = true;
    renderGrid();
  }

  function showFormView(editCharacter = null) {
    listView.hidden = true;
    formView.hidden = false;
    pendingCoverDataUrl = null;

    if (editCharacter) {
      formTitle.textContent = '캐릭터 편집';
      submitBtn.textContent = '저장';
      getFormField(form, 'editId').value = editCharacter.id;
      getFormField(form, 'name').value = editCharacter.name || '';
      getFormField(form, 'avatar').value = editCharacter.avatar || '';
      getFormField(form, 'cover').value = (editCharacter.cover || '').replace(/^idb:.*$/, '');
      getFormField(form, 'headline').value = editCharacter.headline || '';
      getFormField(form, 'personality').value = editCharacter.personality || '';
      getFormField(form, 'greeting').value = editCharacter.greeting || '';
      getFormField(form, 'scenario').value = editCharacter.scenario || '';
      getFormField(form, 'tags').value = (editCharacter.tags || []).join(', ');
      getFormField(form, 'visibility').value = editCharacter.visibility || 'public';
      getFormField(form, 'pov').value = editCharacter.style?.pov || 'third';
      getFormField(form, 'length').value = editCharacter.style?.length || 'medium';
      getFormField(form, 'pacing').value = editCharacter.style?.pacing || 'natural';
      getFormField(form, 'tone').value = editCharacter.style?.tone || 'romance';
    } else {
      formTitle.textContent = '새 캐릭터 만들기';
      submitBtn.textContent = '저장하고 대화 시작';
      getFormField(form, 'editId').value = '';
      form.reset();
    }
  }

  function renderGrid() {
    grid.innerHTML = renderCharacterGrid();
    grid.querySelectorAll('[data-card-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const character = findCharacterById(card.dataset.cardId);
        if (!character) return;
        showCharacterActionSheet(character, {
          onEdit: (c) => showFormView(c),
          onDelete: (c) => {
            removeCreatedCharacter(c.id);
            showToast('캐릭터를 삭제했어요');
            renderGrid();
          },
          onChat: () => {},
        });
      });
    });
  }

  if (!bound) {
    createNewBtn?.addEventListener('click', () => showFormView(null));
    formBackBtn?.addEventListener('click', () => showListView());

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
        pendingCoverDataUrl = dataUrl;
        getFormField(form, 'cover').value = '__pending_upload__';
        showToast('썸네일 업로드 완료');
      } catch (error) {
        console.error('[thumbnail-upload]', error);
        showToast('썸네일 업로드에 실패했어요');
      }
    });

    form.addEventListener('reset', () => {
      pendingCoverDataUrl = null;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = collectCreateFormData(form);
      const editId = getFormField(form, 'editId').value;

      if (editId) {
        // ── Edit existing character ──
        const created = getCreatedCharacters().map((c) => {
          if (c.id !== editId) return c;
          const updated = {
            ...c,
            ...formData,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        });

        if (pendingCoverDataUrl) {
          try {
            await saveCoverImage(editId, pendingCoverDataUrl);
            const idx = created.findIndex((c) => c.id === editId);
            if (idx >= 0) created[idx].cover = `idb:${editId}`;
          } catch { /* ignore */ }
          pendingCoverDataUrl = null;
        }

        setStoredArray(STORAGE_KEYS.createdCharacters, created);
        showToast('캐릭터를 수정했어요');
        showListView();
      } else {
        // ── Create new character ──
        const createdCharacter = {
          id: `custom-${Date.now().toString(36)}`,
          ...formData,
          likes: 0,
          chats: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isBuiltin: false,
        };

        if (pendingCoverDataUrl && createdCharacter.cover === '__pending_upload__') {
          try {
            await saveCoverImage(createdCharacter.id, pendingCoverDataUrl);
            createdCharacter.cover = `idb:${createdCharacter.id}`;
          } catch {
            createdCharacter.cover = '';
          }
          pendingCoverDataUrl = null;
        }

        const existing = getCreatedCharacters();
        setStoredArray(STORAGE_KEYS.createdCharacters, [createdCharacter, ...existing]);
        setCharacterConversation(createdCharacter.id, [{
          id: cryptoRandomId(),
          role: 'assistant',
          text: createdCharacter.greeting,
          createdAt: new Date().toISOString(),
        }]);
        setSelectedCharacter(createdCharacter.id);
        showToast('캐릭터를 저장했어요');
        window.location.href = `chat.html?character=${encodeURIComponent(createdCharacter.id)}`;
      }
    });

    bound = true;
  }

  // Initial routing
  const duplicateId = getUrlQueryParam('duplicate');
  const duplicateSource = duplicateId ? findCharacterById(duplicateId) : null;

  if (duplicateSource) {
    showFormView(duplicateSource);
    getFormField(form, 'editId').value = ''; // duplicate, not edit
  } else {
    showListView();
  }
}
