'use strict';

(() => {
  const productView = document.getElementById('product-view');
  if (!productView) return;

  const isFinePointer = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

  function safeImageUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, location.href);
      if (url.protocol === 'http:' || url.protocol === 'https:') return raw;
    } catch {}
    const normalized = raw.replace(/^\.\//, '').replace(/^\//, '');
    if (normalized.startsWith('images/products/') && !normalized.includes('..')) return normalized;
    return '';
  }

  function galleryUrls(product) {
    const values = Array.isArray(product?.image_urls) && product.image_urls.length
      ? product.image_urls
      : [product?.image_url];
    const seen = new Set();
    return values.map(safeImageUrl).filter(url => url && !seen.has(url) && seen.add(url));
  }

  function currentProduct() {
    return window.state?.product || (typeof state !== 'undefined' ? state.product : null);
  }

  function enhance() {
    const product = currentProduct();
    const media = productView.querySelector('.product-hero .detail-media');
    if (!product || !media) return;

    const urls = galleryUrls(product);
    if (!urls.length) return;

    const signature = `${product.id}|${urls.join('|')}`;
    if (media.dataset.gallerySignature === signature) return;
    media.dataset.gallerySignature = signature;
    media.classList.add('product-gallery');
    media.tabIndex = 0;
    media.setAttribute('role', 'group');
    media.setAttribute('aria-label', `Galería de imágenes de ${product.name || 'la pala'}`);

    let index = 0;
    let pointerX = 0.5;
    let pointerY = 0.5;

    media.querySelectorAll('.product-gallery-control,.product-gallery-counter,.product-gallery-zoom').forEach(node => node.remove());

    let image = media.querySelector('img');
    if (!image) {
      image = document.createElement('img');
      media.prepend(image);
    }
    image.removeAttribute('data-image-fallbacks');
    image.dataset.imageFallbackBound = 'gallery';
    image.loading = 'eager';

    const zoom = document.createElement('div');
    zoom.className = 'product-gallery-zoom';
    zoom.setAttribute('aria-hidden', 'true');
    media.appendChild(zoom);

    const counter = document.createElement('span');
    counter.className = 'product-gallery-counter';
    counter.setAttribute('aria-live', 'polite');
    media.appendChild(counter);

    const updateZoom = () => {
      zoom.style.backgroundImage = `url("${urls[index].replace(/"/g, '%22')}")`;
      zoom.style.backgroundPosition = `${pointerX * 100}% ${pointerY * 100}%`;
    };

    const show = nextIndex => {
      index = (nextIndex + urls.length) % urls.length;
      media.classList.add('is-changing');
      image.src = urls[index];
      image.alt = urls.length > 1
        ? `${product.name || 'Pala'} — imagen ${index + 1} de ${urls.length}`
        : (product.name || 'Imagen de la pala');
      counter.textContent = urls.length > 1 ? `${index + 1} / ${urls.length}` : '';
      updateZoom();
      requestAnimationFrame(() => media.classList.remove('is-changing'));

      if (urls.length > 1) {
        const preload = new Image();
        preload.src = urls[(index + 1) % urls.length];
      }
    };

    image.addEventListener('error', () => {
      if (urls.length > 1) show(index + 1);
      else media.classList.add('is-missing');
    });

    if (urls.length > 1) {
      const makeButton = (direction, label, glyph) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `product-gallery-control product-gallery-${direction}`;
        button.setAttribute('aria-label', label);
        button.innerHTML = `<span aria-hidden="true">${glyph}</span>`;
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          show(index + (direction === 'next' ? 1 : -1));
          button.focus({preventScroll: true});
        });
        media.appendChild(button);
        return button;
      };
      makeButton('prev', 'Ver imagen anterior', '‹');
      makeButton('next', 'Ver imagen siguiente', '›');
    }

    media.addEventListener('keydown', event => {
      if (urls.length < 2) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
    });

    let touchStartX = null;
    media.addEventListener('touchstart', event => {
      touchStartX = event.touches?.[0]?.clientX ?? null;
    }, {passive: true});
    media.addEventListener('touchend', event => {
      if (touchStartX === null || urls.length < 2) return;
      const endX = event.changedTouches?.[0]?.clientX ?? touchStartX;
      const delta = endX - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) > 45) show(index + (delta < 0 ? 1 : -1));
    }, {passive: true});

    media.addEventListener('pointerenter', () => {
      if (isFinePointer()) media.classList.add('is-zoom-ready');
    });
    media.addEventListener('pointermove', event => {
      if (!isFinePointer()) return;
      const rect = media.getBoundingClientRect();
      pointerX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      pointerY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      zoom.style.left = `${Math.min(rect.width - 82, Math.max(82, event.clientX - rect.left))}px`;
      zoom.style.top = `${Math.min(rect.height - 82, Math.max(82, event.clientY - rect.top))}px`;
      updateZoom();
      media.classList.add('is-zooming');
    });
    media.addEventListener('pointerleave', () => {
      media.classList.remove('is-zooming', 'is-zoom-ready');
    });

    show(0);
  }

  const observer = new MutationObserver(() => requestAnimationFrame(enhance));
  observer.observe(productView, {childList: true, subtree: true});
  window.addEventListener('hashchange', () => requestAnimationFrame(enhance));
  window.addEventListener('ctp:product-gallery-refresh', enhance);

  window.CTPProductGallery = { refresh: enhance };
  enhance();
})();
