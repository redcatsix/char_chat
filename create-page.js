(function () {
  "use strict";

  const STORAGE_KEYS = [
    "nebula_characters",
    "nebulatalk_characters",
    "nebulatalk.characters",
    "char_chat_characters",
    "characters"
  ];

  function parseJson(value) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  function resolveStorageKey() {
    for (const key of STORAGE_KEYS) {
      const parsed = parseJson(localStorage.getItem(key) || "");
      if (Array.isArray(parsed)) return key;
    }
    return STORAGE_KEYS[0];
  }

  function loadCharacters() {
    for (const key of STORAGE_KEYS) {
      const parsed = parseJson(localStorage.getItem(key) || "");
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  }

  function saveCharacters(next) {
    localStorage.setItem(resolveStorageKey(), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("characters:updated", { detail: { characters: next } }));
  }

  function normalizeTags(value) {
    if (Array.isArray(value)) return value.map((tag) => String(tag || "").trim()).filter(Boolean);
    return String(value || "")
      .split(/[,#\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function normalizeCharacter(item, index) {
    const id = String(item?.id || item?.characterId || item?.slug || `character-${index + 1}`);
    const name = String(item?.name || item?.title || "").trim();
    const description = String(item?.description || item?.summary || item?.persona || "").trim();
    const tags = normalizeTags(item?.tags);
    const thumbnail = String(item?.thumbnail || item?.avatar || item?.image || "").trim();
    const slug = String(item?.slug || id);

    return {
      raw: item,
      id,
      slug,
      name,
      description,
      tags,
      thumbnail
    };
  }

  function isValidCharacter(character) {
    if (!character.name) return false;
    const lowered = character.name.replace(/\s+/g, "").toLowerCase();
    if (lowered === "새캐릭터만들기" || lowered === "newcharacter") return false;
    return true;
  }

  function createPlaceholderImage() {
    return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='520' height='320'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23dbeafe'/><stop offset='1' stop-color='%23e2e8f0'/></linearGradient></defs><rect width='100%' height='100%' fill='url(%23g)'/></svg>";
  }

  function createNewCardElement() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "new-card";
    button.innerHTML = `
      <div class="new-inner">
        <div class="plus">+</div>
        <p class="new-label">새 캐릭터 만들기</p>
      </div>
    `;
    button.addEventListener("click", () => {
      location.href = "create-new.html";
    });
    return button;
  }

  function createCharacterCardElement(character) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "char-card";
    button.dataset.characterId = character.id;

    const image = document.createElement("img");
    image.className = "thumb";
    image.alt = `${character.name} 썸네일`;
    image.loading = "lazy";
    image.src = character.thumbnail || createPlaceholderImage();

    const body = document.createElement("div");
    body.className = "body";

    const name = document.createElement("h3");
    name.className = "name";
    name.textContent = character.name;

    const desc = document.createElement("p");
    desc.className = "desc";
    desc.textContent = character.description || "캐릭터 소개가 아직 없습니다.";

    const tag = document.createElement("p");
    tag.className = "tag";
    tag.textContent = character.tags.length ? `#${character.tags[0]}` : "#캐릭터";

    body.appendChild(name);
    body.appendChild(desc);
    body.appendChild(tag);

    button.appendChild(image);
    button.appendChild(body);
    return button;
  }

  function mount() {
    const grid = document.getElementById("createGrid");
    const emptyNote = document.getElementById("emptyNote");
    const sheet = document.getElementById("sheet");
    const sheetTitle = document.getElementById("sheetTitle");
    const sheetDesc = document.getElementById("sheetDesc");
    const sheetChat = document.getElementById("sheetChat");
    const sheetEdit = document.getElementById("sheetEdit");
    const sheetDelete = document.getElementById("sheetDelete");

    if (
      !grid ||
      !emptyNote ||
      !sheet ||
      !sheetTitle ||
      !sheetDesc ||
      !sheetChat ||
      !sheetEdit ||
      !sheetDelete
    ) {
      return;
    }

    let selectedId = "";

    function closeSheet() {
      selectedId = "";
      sheet.classList.remove("open");
      sheet.setAttribute("aria-hidden", "true");
    }

    function openSheet(character) {
      selectedId = character.id;
      sheetTitle.textContent = character.name;
      sheetDesc.textContent = character.description || "편집 또는 삭제할 수 있습니다.";
      sheet.classList.add("open");
      sheet.setAttribute("aria-hidden", "false");
    }

    function render() {
      const characters = loadCharacters()
        .map(normalizeCharacter)
        .filter(isValidCharacter);

      grid.innerHTML = "";
      grid.appendChild(createNewCardElement()); // always only one

      for (const character of characters) {
        const card = createCharacterCardElement(character);
        card.addEventListener("click", () => openSheet(character));
        grid.appendChild(card);
      }

      emptyNote.hidden = characters.length > 0;
    }

    sheet.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.matches("[data-action='close'], .sheet-bg")) closeSheet();
    });

    sheetChat.addEventListener("click", () => {
      if (!selectedId) return;
      location.href = `chat.html?character=${encodeURIComponent(selectedId)}`;
    });

    sheetEdit.addEventListener("click", () => {
      if (!selectedId) return;
      location.href = `create-new.html?edit=${encodeURIComponent(selectedId)}`;
    });

    sheetDelete.addEventListener("click", () => {
      if (!selectedId) return;
      const current = loadCharacters();
      const next = current.filter((item, index) => {
        const id = String(item?.id || item?.characterId || item?.slug || `character-${index + 1}`);
        return id !== selectedId;
      });
      saveCharacters(next);
      closeSheet();
      render();
    });

    window.addEventListener("storage", render);
    window.addEventListener("characters:updated", render);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();

