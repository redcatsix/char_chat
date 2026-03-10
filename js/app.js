import { seedInitialSelection } from './storage.js';
import { initHomePage } from './pages/home.js';
import { initExplorePage } from './pages/explore.js';
import { initChatPage } from './pages/chat.js';
import { initCreatePage } from './pages/create.js';
import { initMyPage } from './pages/mypage.js';

const page = document.body.dataset.page;

function refreshPage() {
  switch (page) {
    case 'home':
      initHomePage(true, refreshPage);
      break;
    case 'explore':
      initExplorePage(true, refreshPage);
      break;
    case 'chat':
      initChatPage(true, refreshPage);
      break;
    case 'create':
      initCreatePage(true);
      break;
    case 'mypage':
      initMyPage(true, refreshPage);
      break;
    default:
      break;
  }
}

function normalizeBottomNav() {
  const nav = document.querySelector('.mobile-nav');
  if (!nav) return;

  const activeKey = page === 'explore' ? 'home' : page;
  const items = [
    { key: 'home', href: 'index.html', icon: '⌂', label: '홈' },
    { key: 'chat', href: 'chat.html', icon: '◉', label: '대화' },
    { key: 'create', href: 'create.html', icon: '＋', label: '제작' },
    { key: 'mypage', href: 'mypage.html', icon: '◔', label: '마이페이지' },
  ];

  nav.innerHTML = items.map((item) => `
    <a ${item.key === activeKey ? 'class="is-active"' : ''} href="${item.href}">
      <span class="mobile-nav-icon">${item.icon}</span>
      <span class="mobile-nav-label">${item.label}</span>
    </a>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  normalizeBottomNav();
  seedInitialSelection();

  switch (page) {
    case 'home':
      initHomePage(false, refreshPage);
      break;
    case 'explore':
      initExplorePage(false, refreshPage);
      break;
    case 'chat':
      initChatPage(false, refreshPage);
      break;
    case 'create':
      initCreatePage(false);
      break;
    case 'mypage':
      initMyPage(false, refreshPage);
      break;
    default:
      break;
  }
});
