// Injects the app's header and bottom navigation into every HTML response
const NAV_LINKS = [
  { page: 'index.html', href: '/', icon: 'event_note', label: 'Log' },
  { page: 'overview.html', href: '/overview', icon: 'monitoring', label: 'Data' },
  { page: 'goals.html', href: '/goals', icon: 'emoji_events', label: 'Goals' },
  { page: 'milestone.html', href: '/milestone', icon: 'military_tech', label: 'Badges' }
];

function renderHeader(pathname) {
  const syncHref = pathname === '/' ? '#sync-controls' : '/#sync-controls';
  return `<header class="topbar">
    <div class="brand">
      <svg class="icon"><use href="/icons/icons.svg#icon-fitness_center"></use></svg>
      MOTSA JIKI
    </div>
    <div style="display: flex; gap: 8px;">
      <a class="icon-btn" href="/help" aria-label="Help and Legal Information">
        <svg class="icon"><use href="/icons/icons.svg#icon-help_outline"></use></svg>
      </a>
      <button class="icon-btn" id="theme-toggle-btn" aria-label="Toggle Theme">
        <svg class="icon" id="theme-icon"><use href="/icons/icons.svg#icon-bedtime"></use></svg>
      </button>
      <a class="icon-btn" href="${syncHref}" aria-label="Sync status">
        <svg class="icon"><use href="/icons/icons.svg#icon-cloud_sync"></use></svg>
      </a>
    </div>
  </header>`;
}

function renderNav() {
  const items = NAV_LINKS.map(n => `
    <a class="nav-item" data-nav-link="${n.page}" href="${n.href}">
      <svg class="icon"><use href="/icons/icons.svg#icon-${n.icon}"></use></svg>${n.label}
    </a>`).join('');
  return `<nav class="bottom-nav">${items}</nav>`;
}

class ChromeInjector {
  constructor(pathname) {
    this.pathname = pathname;
  }
  element(el) {
    el.prepend(renderHeader(this.pathname), { html: true });
    el.append(renderNav(), { html: true });
  }
}

export async function onRequest({ request, next }) {
  const response = await next();

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  if (request.headers.get('X-Motsa-Fragment') === '1') return response;

  const { pathname } = new URL(request.url);
  return new HTMLRewriter()
    .on('body', new ChromeInjector(pathname))
    .transform(response);
}