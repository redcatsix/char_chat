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

  const activeKey = page;
  const items = [
    { key: 'home', href: 'index.html', icon: '<svg viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/></svg>', label: '홈' },
    { key: 'chat', href: 'chat.html', icon: '<svg viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>', label: '대화' },
    { key: 'create', href: 'create.html', icon: '<svg viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>', label: '제작' },
    { key: 'mypage', href: 'mypage.html', icon: '<svg viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>', label: '마이페이지' },
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
