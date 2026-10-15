/**
 * GitHub Image Preview
 * 点击 GitHub 上的图片原地预览，支持缩放、平移、下载与多图切换。
 * 通过捕获阶段事件委托实现，适配 GitHub 的 SPA 动态渲染。
 */
(() => {
  'use strict';

  // ---------- 图片 URL 识别 ----------
  const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;
  // 指向文件的「页面」路由（点击应打开文件页，而非直接按图片直链加载）
  const FILE_PAGE_RE = /\/(blob|tree|blame)\//;
  // GitHub 图片 CDN（camo 代理等 URL 可能不带扩展名）
  const IMAGE_CDN_RE = /(camo|user-images|media)\.githubusercontent\.com/i;

  function hasImageExtension(url) {
    return IMAGE_EXT_RE.test(url.split(/[?#]/)[0]);
  }

  function isDirectImageUrl(url) {
    if (!url) return false;
    if (FILE_PAGE_RE.test(url)) return false;
    return hasImageExtension(url) || IMAGE_CDN_RE.test(url);
  }

  // ---------- 图片信息解析 ----------
  // 判断一个 <a> 是否代表「可预览的图片链接」，返回预览信息或 null
  function resolveAnchor(a) {
    if (!a || !a.href) return null;
    const img = a.querySelector('img');
    // 只处理「内嵌 <img>」的链接（即真正的图片链接）；纯文本链接不拦截
    if (!img) return null;

    // 1) href 本身就是图片直链（上传截图、raw 直链、CDN 等）→ 用 href（通常是原图）
    if (isDirectImageUrl(a.href)) {
      return { url: a.href, alt: img.alt || '', anchor: a };
    }

    // 2) href 是指向图片文件的页面（如 /blob/ 路径），但里面包着同一张图的 <img>
    //    例如仓库内相对路径图片：<a href=".../blob/main/x.png"><img src=".../raw/main/x.png"></a>
    //    此时取 <img> 的实际 src 作为预览源；用「href 也以图片扩展名结尾」避免误伤普通链接
    if (hasImageExtension(a.href)) {
      const src = img.currentSrc || img.src || '';
      if (src && isDirectImageUrl(src)) {
        return { url: src, alt: img.alt || '', anchor: a };
      }
    }
    return null;
  }

  function resolvePreviewable(target) {
    return target instanceof Element ? resolveAnchor(target.closest('a')) : null;
  }

  function collectImages() {
    const items = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const info = resolveAnchor(a);
      if (info) items.push(info);
    }
    return items;
  }

  // ---------- 灯箱状态 ----------
  const MIN_SCALE = 1;
  const MAX_SCALE = 5;
  let ui = null;
  const state = { items: [], index: 0, scale: 1, tx: 0, ty: 0 };
  let pan = null;

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  // 工具栏按钮图标（Feather 风格，MIT 协议）
  const SVG_ATTRS = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    zoomIn: `<svg viewBox="0 0 24 24" ${SVG_ATTRS} aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
    zoomOut: `<svg viewBox="0 0 24 24" ${SVG_ATTRS} aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
    reset: `<svg viewBox="0 0 24 24" ${SVG_ATTRS} aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
    download: `<svg viewBox="0 0 24 24" ${SVG_ATTRS} aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    open: `<svg viewBox="0 0 24 24" ${SVG_ATTRS} aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`
  };

  function button(className, ariaLabel, iconSvg, text) {
    const b = el('button', className);
    b.type = 'button';
    b.setAttribute('aria-label', ariaLabel);
    if (iconSvg) {
      const icon = el('span', 'gh-ip-icon');
      icon.innerHTML = iconSvg;
      const label = el('span', 'gh-ip-label');
      label.textContent = text;
      b.append(icon, label);
    } else {
      b.textContent = text;
    }
    return b;
  }

  function ensureUI() {
    if (ui) return;

    const backdrop = el('div', 'gh-ip-backdrop');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.tabIndex = -1;
    backdrop.hidden = true;

    const spinner = el('div', 'gh-ip-spinner');
    const img = el('img', 'gh-ip-image');
    img.alt = '';
    img.draggable = false;

    const close = button('gh-ip-close', '关闭', null, '×');
    const prev = button('gh-ip-prev', '上一张', null, '‹');
    const next = button('gh-ip-next', '下一张', null, '›');

    const toolbar = el('div', 'gh-ip-toolbar');
    const zoomIn = button('gh-ip-zoom-in', '放大', ICONS.zoomIn, '放大');
    const zoomOut = button('gh-ip-zoom-out', '缩小', ICONS.zoomOut, '缩小');
    const reset = button('gh-ip-reset', '复位到原始尺寸', ICONS.reset, '1:1');
    const download = button('gh-ip-download', '下载原图', ICONS.download, '下载');
    const openNew = button('gh-ip-open', '在新标签页打开', ICONS.open, '新标签页打开');
    toolbar.append(zoomIn, zoomOut, reset, download, openNew);

    const caption = el('div', 'gh-ip-caption');
    const counter = el('div', 'gh-ip-counter');

    backdrop.append(spinner, img, close, prev, next, toolbar, caption, counter);
    document.documentElement.appendChild(backdrop);

    // 事件绑定
    close.addEventListener('click', closeLightbox);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeLightbox();
    });
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    zoomIn.addEventListener('click', () => setScale(state.scale * 1.25));
    zoomOut.addEventListener('click', () => setScale(state.scale / 1.25));
    reset.addEventListener('click', () => setScale(1));
    download.addEventListener('click', downloadCurrent);
    openNew.addEventListener('click', openCurrentNewTab);

    img.addEventListener('load', markLoaded);
    img.addEventListener('error', onImageError);
    img.addEventListener('wheel', onWheel, { passive: false });
    img.addEventListener('dblclick', () => setScale(state.scale === 1 ? 2 : 1));
    img.addEventListener('pointerdown', onPointerDown);
    img.addEventListener('pointermove', onPointerMove);
    img.addEventListener('pointerup', onPointerUp);
    img.addEventListener('pointercancel', onPointerUp);
    img.addEventListener('mouseenter', () => {
      if (!caption.hidden) caption.classList.add('visible');
    });
    img.addEventListener('mouseleave', () => {
      if (!caption.classList.contains('error')) caption.classList.remove('visible');
    });

    ui = { backdrop, img, spinner, close, prev, next, caption, counter };
  }

  function markLoaded() {
    ui.spinner.hidden = true;
    ui.img.classList.add('loaded');
  }

  function onImageError() {
    ui.spinner.hidden = true;
    ui.caption.textContent = '图片加载失败';
    ui.caption.hidden = false;
    ui.caption.classList.add('visible', 'error');
  }

  function applyTransform() {
    ui.img.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
    ui.img.style.cursor = pan ? 'grabbing' : state.scale > 1 ? 'grab' : 'zoom-in';
  }

  function setScale(scale) {
    state.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    if (state.scale === 1) {
      state.tx = 0;
      state.ty = 0;
    }
    applyTransform();
  }

  function onWheel(e) {
    e.preventDefault();
    setScale(state.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }

  function onPointerDown(e) {
    if (state.scale <= 1) return;
    e.preventDefault();
    pan = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origTx: state.tx,
      origTy: state.ty
    };
    ui.img.setPointerCapture(e.pointerId);
    applyTransform();
  }

  function onPointerMove(e) {
    if (!pan || e.pointerId !== pan.pointerId) return;
    state.tx = pan.origTx + (e.clientX - pan.startX);
    state.ty = pan.origTy + (e.clientY - pan.startY);
    applyTransform();
  }

  function onPointerUp(e) {
    if (pan && e.pointerId === pan.pointerId) {
      pan = null;
      applyTransform();
    }
  }

  function lockScroll(lock) {
    document.documentElement.style.overflow = lock ? 'hidden' : '';
    document.body.style.overflow = lock ? 'hidden' : '';
  }

  function open(info) {
    ensureUI();
    let items = collectImages();
    let index = items.findIndex((it) => it.anchor === info.anchor);
    if (index === -1) index = items.findIndex((it) => it.url === info.url);
    if (index === -1) {
      items = [info];
      index = 0;
    }
    state.items = items;
    state.index = index;
    showCurrent();
  }

  function showCurrent() {
    const item = state.items[state.index];
    if (!item) return;
    state.scale = 1;
    state.tx = 0;
    state.ty = 0;
    pan = null;
    applyTransform();

    ui.img.classList.remove('loaded');
    ui.img.alt = item.alt || '';
    ui.spinner.hidden = false;
    ui.img.src = item.url;
    // 同一 URL 复用时 load 不会再次触发，主动补齐
    if (ui.img.complete && ui.img.naturalWidth > 0) markLoaded();

    ui.caption.textContent = item.alt || '';
    ui.caption.hidden = !item.alt;
    ui.caption.classList.remove('visible', 'error');
    ui.prev.hidden = state.items.length <= 1;
    ui.next.hidden = state.items.length <= 1;
    ui.counter.textContent = `${state.index + 1} / ${state.items.length}`;
    ui.counter.hidden = state.items.length <= 1;

    ui.backdrop.hidden = false;
    lockScroll(true);
    ui.backdrop.focus();
  }

  function step(delta) {
    const n = state.items.length;
    if (n <= 1) return;
    state.index = (state.index + delta + n) % n;
    showCurrent();
  }

  function currentItem() {
    return state.items[state.index] || null;
  }

  function closeLightbox() {
    if (!ui || ui.backdrop.hidden) return;
    ui.backdrop.hidden = true;
    lockScroll(false);
    state.scale = 1;
    state.tx = 0;
    state.ty = 0;
    pan = null;
    ui.img.removeAttribute('src');
  }

  function filenameFromUrl(url) {
    try {
      const name = new URL(url).pathname.split('/').pop();
      if (name && IMAGE_EXT_RE.test(name)) return decodeURIComponent(name);
    } catch (_) { /* ignore */ }
    return 'image';
  }

  async function downloadCurrent() {
    const item = currentItem();
    if (!item) return;
    try {
      const res = await fetch(item.url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filenameFromUrl(item.url);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (_) {
      openInNewTab(item.url); // 跨域受限时降级：新标签页打开
    }
  }

  function openInNewTab(url) {
    // 在点击事件里直接 window.open 携带用户激活，不会被弹窗拦截器拦截。
    // 注意：不要传 'noopener' 特性——它会让 window.open 恒返回 null，
    // 导致误判为「被拦截」再走 <a> 降级，一次打开两个标签页。
    const win = window.open(url, '_blank');
    if (win) {
      win.opener = null; // 切断反向引用，等效 noopener
      return;
    }
    // 被拦截时降级：尝试 <a> 触发（个别浏览器行为不同）
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function openCurrentNewTab() {
    const item = currentItem();
    if (item) openInNewTab(item.url);
  }

  // ---------- 点击拦截 ----------
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const info = resolvePreviewable(e.target);
    if (!info) return;
    e.preventDefault();
    e.stopPropagation();
    open(info);
  }, true);

  // ---------- 键盘 ----------
  document.addEventListener('keydown', (e) => {
    if (!ui || ui.backdrop.hidden) return;
    switch (e.key) {
      case 'Escape':
        closeLightbox();
        break;
      case 'ArrowLeft':
        step(-1);
        break;
      case 'ArrowRight':
        step(1);
        break;
      case '+':
      case '=':
        setScale(state.scale * 1.25);
        break;
      case '-':
      case '_':
        setScale(state.scale / 1.25);
        break;
      case '0':
        setScale(1);
        break;
      default:
        return;
    }
    e.preventDefault();
  });
})();
