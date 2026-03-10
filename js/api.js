import { DEFAULT_STYLE } from './constants.js';
import { updateAiStatus, showToast, pickRandom, getStyleValueOrFallback } from './utils.js';

export function generateMockReply(character, userMessage, style) {
  const snippet = userMessage.trim().replace(/\s+/g, ' ').slice(0, 22);
  const address = {
    romance: ['조용히 미소를 지으며', '한 박자 늦게 시선을 맞추며', '낮게 웃음을 흘리며'],
    slice: ['편안하게 어깨를 풀고', '가볍게 웃으며', '조금 가까이 기대며'],
    mystery: ['주변을 한번 살피고', '의미심장한 표정으로', '낮게 목소리를 낮추며'],
    fantasy: ['공기 끝에 마력이 번지듯', '희미한 빛이 감도는 듯', '장난스러운 마법처럼'],
    soft: ['조심스럽게 숨을 고르고', '다정하게 눈을 맞추며', '너를 안심시키듯 천천히'],
  };

  const openers = {
    first: [`나는 잠깐 생각에 잠겼다.`, `나는 네 말을 곱씹으며 숨을 고른다.`, `나는 천천히 고개를 끄덕였다.`],
    second: [`네가 말을 꺼낸 순간 분위기가 조금 달라졌다.`, `네 쪽으로 시선을 돌리자 공기가 달라진다.`, `네 표정에서 먼저 답이 보이는 것 같았다.`],
    third: [`${character.name}은 잠시 침묵하다가 입을 열었다.`, `${character.name}은 시선을 살짝 내리며 말을 이었다.`, `${character.name}은 눈빛을 가다듬고 천천히 대답했다.`],
  };

  const bodyMap = {
    romance: [
      `네가 말한 "${snippet || '그 이야기'}"는 생각보다 오래 마음에 남을 것 같아.`,
      `이런 순간엔 서두르지 않는 편이 좋아. 우리 둘만의 속도로 가 보자.`,
      `나는 지금 이 대화를 그냥 흘려보내고 싶지 않아.`,
    ],
    slice: [
      `좋아, 그럼 너무 거창하게 생각하지 말고 지금 기분부터 하나씩 풀어보자.`,
      `네가 편하면 일상적인 얘기부터 해도 돼. 그런 대화가 의외로 오래 남거든.`,
      `오늘 있었던 일 중 제일 마음에 걸린 장면이 뭐였는지 들려줘.`,
    ],
    mystery: [
      `표면만 보면 단순해 보여도, 보통 중요한 건 그 뒤에 숨어 있지.`,
      `네가 짚은 "${snippet || '그 단서'}"는 그냥 지나치면 안 될 것 같아.`,
      `조금만 더 들여다보면 뜻밖의 연결점이 나올지도 몰라.`,
    ],
    fantasy: [
      `이야기가 시작되는 소리가 들리는 것 같네. 세계관이 네 말에 반응하고 있어.`,
      `지금 선택 하나로 흐름이 크게 달라질 수 있어. 그래서 더 흥미롭고.`,
      `원하면 내가 이 장면을 조금 더 선명하게 열어줄게.`,
    ],
    soft: [
      `괜찮아. 급하게 말하지 않아도 돼. 네 속도에 맞춰서 들을게.`,
      `"${snippet || '그 마음'}"를 입 밖으로 꺼낸 것만으로도 이미 큰걸 해낸 거야.`,
      `조금 더 편하게, 숨 돌리듯 이야기해도 괜찮아.`,
    ],
  };

  const closersByPacing = {
    fast: ['바로 다음 장면으로 넘어가 볼까?', '좋아, 그럼 지금 바로 움직이자.', '이미 흐름은 시작됐어.'],
    natural: ['네가 원하면 여기서 조금 더 이어가도 좋아.', '다음 이야기는 네 선택에 달렸어.', '이제 네가 어떤 말을 꺼낼지 궁금해.'],
    slow: ['서두르지 말자. 이 장면은 천천히 음미하는 편이 더 어울려.', '조금 더 머무르면서 감정을 정리해보자.', '지금은 한 장면씩 천천히 쌓아 올리는 게 좋아.'],
  };

  const lengthCount = { short: 2, medium: 3, long: 4 };

  const tone = getStyleValueOrFallback(style, 'tone');
  const pov = getStyleValueOrFallback(style, 'pov');
  const pacing = getStyleValueOrFallback(style, 'pacing');
  const length = getStyleValueOrFallback(style, 'length');

  const segments = [];
  segments.push(pickRandom(openers[pov]));
  segments.push(`${pickRandom(address[tone])}, ${pickRandom(bodyMap[tone])}`);

  if ((lengthCount[length] || 3) >= 3) {
    segments.push(buildCharacterSpecificLine(character, tone));
  }

  if ((lengthCount[length] || 3) >= 4) {
    segments.push(`그리고 솔직히 말하면, 지금 이 장면은 ${character.name}답게 더 깊어질 여지가 있어.`);
  }

  segments.push(pickRandom(closersByPacing[pacing]));

  return segments.join(' ');
}

function buildCharacterSpecificLine(character, tone) {
  if (tone === 'mystery') {
    return `${character.name}의 직감으로는 아직 드러나지 않은 핵심이 하나 더 있어. 네가 다음 단서를 어떻게 다루느냐가 중요해.`;
  }
  if (tone === 'fantasy') {
    return `${character.scenario ? character.scenario.split('.')[0] : '이 세계는 아직 숨겨 둔 장면이 많아'}라는 설정이 지금 더 생생하게 살아나는 느낌이야.`;
  }
  if (tone === 'soft') {
    return `${character.name}은 너를 다그치기보다 옆에서 호흡을 맞춰 주는 쪽을 택할 거야.`;
  }
  if (tone === 'slice') {
    return `${character.name}이라면 특별한 사건보다도 지금 여기의 공기와 표정을 먼저 기억해 둘 것 같아.`;
  }
  return `${character.name}은 감정을 쉽게 드러내지 않지만, 지금만큼은 네 말에 분명히 반응하고 있어.`;
}

export async function requestAssistantReply(character, messages, userMessage, style) {
  updateAiStatus('checking', 'AI 연결 확인 중');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character, messages, style }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Chat API request failed.');
    }

    if (typeof payload?.reply !== 'string' || !payload.reply.trim()) {
      throw new Error('Chat API returned an invalid response.');
    }

    updateAiStatus('online', 'DeepInfra 연결됨');
    return payload.reply.trim();
  } catch (error) {
    console.error('[chat-api]', error);
    updateAiStatus('fallback', '백업 응답 모드');
    showToast('API 오류로 목업 응답을 사용해요');
    await new Promise((resolve) => setTimeout(resolve, 500));
    return generateMockReply(character, userMessage, style);
  }
}
