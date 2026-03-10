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
    return String(value || "")
      .split(/[,#\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  function characterId(item, index) {
    return String(item?.id || item?.characterId || item?.slug || `character-${index + 1}`);
  }

  function findCharacter(list, id) {
    const target = String(id || "");
    return list.find((item, index) => characterId(item, index) === target) || null;
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function generateId(name) {
    const base = slugify(name) || "character";
    const time = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 7);
    return `${base}-${time}-${rand}`;
  }

  function setPreview(url, wrap, img) {
    const src = String(url || "").trim();
    if (!src) {
      wrap.style.display = "none";
      img.removeAttribute("src");
      return;
    }
    img.src = src;
    wrap.style.display = "block";
  }

  function mount() {
    const form = document.getElementById("characterCreateForm");
    if (!form) return;

    const title = document.getElementById("createFormTitle");
    const name = document.getElementById("characterName");
    const description = document.getElementById("characterDescription");
    const persona = document.getElementById("characterPersona");
    const greeting = document.getElementById("characterGreeting");
    const tags = document.getElementById("characterTags");
    const thumbnailUrl = document.getElementById("thumbnailUrl");
    const thumbnailFile = document.getElementById("thumbnailFile");
    const visibility = document.getElementById("characterVisibility");
    const previewWrap = document.getElementById("thumbnailPreviewWrap");
    const previewImage = document.getElementById("thumbnailPreview");
    const submitButton = document.getElementById("createSubmitButton");
    const cancelButton = document.querySelector("[data-action='cancel-create']");

    if (
      !name ||
      !description ||
      !persona ||
      !greeting ||
      !tags ||
      !thumbnailUrl ||
      !thumbnailFile ||
      !visibility ||
      !previewWrap ||
      !previewImage ||
      !submitButton
    ) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const editId = params.get("edit");
    const duplicateId = params.get("duplicate");

    const characters = loadCharacters();
    let mode = "create";
    let baseCharacter = null;

    if (editId) {
      mode = "edit";
      baseCharacter = findCharacter(characters, editId);
    } else if (duplicateId) {
      mode = "duplicate";
      baseCharacter = findCharacter(characters, duplicateId);
    }

    if (mode === "edit" && title) {
      title.textContent = "캐릭터 수정";
      submitButton.textContent = "저장";
    } else if (mode === "duplicate" && title) {
      title.textContent = "캐릭터 복제 생성";
      submitButton.textContent = "복제 생성";
    }

    if (baseCharacter) {
      name.value = String(baseCharacter.name || baseCharacter.title || "");
      description.value = String(baseCharacter.description || baseCharacter.summary || "");
      persona.value = String(baseCharacter.persona || baseCharacter.prompt || baseCharacter.systemPrompt || "");
      greeting.value = String(baseCharacter.greeting || baseCharacter.firstMessage || "");
      tags.value = normalizeTags(baseCharacter.tags).join(", ");
      thumbnailUrl.value = String(baseCharacter.thumbnail || baseCharacter.avatar || baseCharacter.image || "");
      visibility.value = String(baseCharacter.visibility || "public") === "private" ? "private" : "public";
      setPreview(thumbnailUrl.value, previewWrap, previewImage);

      if (mode === "duplicate" && name.value) {
        name.value = `${name.value} 복제본`;
      }
    }

    thumbnailUrl.addEventListener("input", () => {
      setPreview(thumbnailUrl.value, previewWrap, previewImage);
    });

    thumbnailFile.addEventListener("change", () => {
      const file = thumbnailFile.files && thumbnailFile.files[0];
      if (!file || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const data = typeof reader.result === "string" ? reader.result : "";
        thumbnailUrl.value = data;
        setPreview(data, previewWrap, previewImage);
      };
      reader.readAsDataURL(file);
    });

    if (cancelButton) {
      cancelButton.addEventListener("click", () => {
        location.href = "create.html";
      });
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const characterName = String(name.value || "").trim();
      if (!characterName) {
        alert("캐릭터 이름을 입력해 주세요.");
        name.focus();
        return;
      }

      const now = new Date().toISOString();
      const id = mode === "edit" && baseCharacter ? characterId(baseCharacter, 0) : generateId(characterName);
      const payload = {
        ...(baseCharacter || {}),
        id,
        characterId: id,
        slug: slugify(characterName) || id,
        name: characterName,
        title: characterName,
        description: String(description.value || "").trim(),
        summary: String(description.value || "").trim(),
        persona: String(persona.value || "").trim(),
        prompt: String(persona.value || "").trim(),
        systemPrompt: String(persona.value || "").trim(),
        greeting: String(greeting.value || "").trim(),
        firstMessage: String(greeting.value || "").trim(),
        tags: normalizeTags(tags.value),
        thumbnail: String(thumbnailUrl.value || "").trim(),
        avatar: String(thumbnailUrl.value || "").trim(),
        image: String(thumbnailUrl.value || "").trim(),
        visibility: visibility.value === "private" ? "private" : "public",
        provider: "deepinfra",
        model: "deepseek-ai/DeepSeek-V3.2",
        updatedAt: now,
        createdAt: mode === "edit" && baseCharacter?.createdAt ? baseCharacter.createdAt : now
      };

      const current = loadCharacters();
      let next;
      if (mode === "edit" && baseCharacter) {
        const target = characterId(baseCharacter, 0);
        next = current.map((item, index) => {
          if (characterId(item, index) === target) return payload;
          return item;
        });
      } else {
        next = [payload].concat(current);
      }

      saveCharacters(next);
      location.href = "create.html";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();

