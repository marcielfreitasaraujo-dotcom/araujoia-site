/*
 * Movimento por scroll da Araujo.IA: GSAP + ScrollTrigger + Lenis.
 * Melhoria progressiva: sem JS, sem as bibliotecas ou com "reduzir movimento" ativo, nada daqui roda
 * e a página fica no estado final, totalmente legível.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !window.gsap || !window.ScrollTrigger) return;

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  root.classList.add('gsap-on');

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------------------------------------------------------------- rolagem suave (Lenis) */
  var lenis = null;
  if (window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
    if (/[?&]debug-motion/.test(location.search)) window.__lenis = lenis;
  }

  // Trava a rolagem durante a intro e com o questionário aberto.
  function syncLenis() {
    if (!lenis) return;
    var locked = root.classList.contains('intro-lock') || root.classList.contains('lead-open');
    if (locked) lenis.stop(); else lenis.start();
  }
  new MutationObserver(syncLenis).observe(root, { attributes: true, attributeFilter: ['class'] });
  syncLenis();

  // Âncoras do menu: rolagem suave com desconto do cabeçalho.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.hasAttribute('data-lead-cta')) return;
    var id = a.getAttribute('href');
    if (!id || id.length < 2) return;
    var target = id === '#top' ? 0 : $(id);
    if (target === null || typeof target === 'undefined') return;
    e.preventDefault();
    // Seções com cena fixa começam exatamente no topo da tela; as demais descontam o cabeçalho.
    var pinned = id === '#top' || id === '#transformacao' || id === '#solucoes' || id === '#sobre';
    if (lenis) lenis.scrollTo(target, { offset: pinned ? 0 : -84, duration: 1.3 });
    else if (target === 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    else target.scrollIntoView({ behavior: 'smooth' });
  });

  /* ---------------------------------------------------------------- utilitários */
  // Divide o texto em palavras com máscara, preservando elementos internos (ex.: <em>).
  function splitWords(el) {
    if (el.dataset.split === 'done') return;
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    function wrap(textNode) {
      var frag = document.createDocumentFragment();
      textNode.textContent.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        var w = document.createElement('span'); w.className = 'w';
        var wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = part;
        w.appendChild(wi); frag.appendChild(w);
      });
      return frag;
    }
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) { if (c.textContent.trim()) node.replaceChild(wrap(c), c); }
        else if (c.nodeType === 1) walk(c);
      });
    })(el);
    el.dataset.split = 'done';
  }

  function revealWords(words, vars) {
    return gsap.from(words, Object.assign({ yPercent: 110, opacity: 0, rotate: 3, duration: 0.9, ease: 'power4.out', stagger: 0.05 }, vars || {}));
  }

  function revealOnScroll(targets, trigger, vars) {
    return gsap.from(targets, Object.assign({
      y: 36, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, clearProps: 'transform,opacity',
      scrollTrigger: { trigger: trigger, start: 'top 84%', toggleActions: 'play none none none' }
    }, vars || {}));
  }

  // Parallax por camadas: cada elemento com data-depth (0 a 1) se desloca proporcionalmente.
  function parallaxLayers(layers, trigger, distance) {
    layers.forEach(function (layer) {
      var depth = Number(layer.dataset.depth || 0.5);
      gsap.to(layer, { y: distance * depth, ease: 'none', scrollTrigger: { trigger: trigger, start: 'top top', end: 'bottom top', scrub: true } });
    });
  }

  // Texto "decodificando": letras aleatórias até chegar no valor final.
  function scramble(el) {
    if (!el || el.dataset.scrambled) return;
    el.dataset.scrambled = '1';
    var finalText = el.textContent;
    el.setAttribute('aria-label', finalText);
    var chars = '01<>/{}[]#+';
    var state = { p: 0 };
    gsap.to(state, {
      p: 1, duration: 0.9, ease: 'none',
      onUpdate: function () {
        var n = Math.floor(state.p * finalText.length), out = '';
        for (var i = 0; i < finalText.length; i++) {
          out += (i < n || finalText[i] === ' ') ? finalText[i] : chars[(Math.random() * chars.length) | 0];
        }
        el.textContent = out;
      },
      onComplete: function () { el.textContent = finalText; }
    });
  }

  // Camada de pixels do retrato: desenhada UMA vez, com pixels finos e nítidos (sem borrar).
  // O scroll só controla quanto dela aparece (clip-path), junto com a linha do scanner.
  function makePixelLayer(img, canvas) {
    var ctx = canvas.getContext('2d');
    var small = document.createElement('canvas');
    var sctx = small.getContext('2d');
    function draw() {
      if (!img.naturalWidth) return;
      var r = canvas.getBoundingClientRect();
      if (!r.width) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      var cells = 52; // ~52 pixels de largura: o rosto continua reconhecível
      small.width = cells;
      small.height = Math.max(2, Math.round(cells * canvas.height / canvas.width));
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(img, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, canvas.width, canvas.height);
    }
    return { draw: draw };
  }

  /* ---------------------------------------------------------------- preparação (uma vez) */
  $$('[data-split]').forEach(splitWords);

  var isReady = root.classList.contains('is-ready');
  var heroIntro = null;
  var heroEyebrow = $('[data-hero-eyebrow]');

  // Progresso de leitura no cabeçalho.
  var progress = $('[data-progress]');
  if (progress) {
    gsap.to(progress, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });
  }

  // Rótulos das seções "decodificam" ao entrar na tela.
  $$('main .eyebrow').forEach(function (el) {
    if (el.hasAttribute('data-hero-eyebrow')) return;
    ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: function () { scramble(el); } });
  });

  /* ---------------------------------------------------------------- cenas */
  function scene(name, fn) {
    try { fn(); } catch (err) { if (window.console) console.warn('[motion] cena "' + name + '" não iniciou:', err); }
  }

  var mm = gsap.matchMedia();
  // "all" sempre casa, para a versão simplificada (celular) também montar suas cenas.
  mm.add({ desktop: '(min-width: 861px)', all: '(min-width: 0px)' }, function (ctx) {
    var desktop = ctx.conditions.desktop;

    /* HERO: abertura + parallax em camadas + saída presa à tela */
    scene('hero', function () {
      var hero = $('.hero'); if (!hero) return;
      var q = gsap.utils.selector(hero);

      var intro = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
      intro
        .add(revealWords(q('h1 .wi'), { stagger: 0.06 }), 0.15)
        .from(q('[data-hero-fade]'), { y: 22, opacity: 0, duration: 0.8, stagger: 0.1 }, 0.55)
        .from(q('[data-hero-visual]'), { y: 50, scale: 0.94, opacity: 0, duration: 1.2 }, 0.3)
        .from(q('[data-layer]'), { opacity: 0, duration: 1.4, stagger: 0.1 }, 0);
      if (isReady) intro.progress(1); else heroIntro = intro;

      parallaxLayers(q('[data-layer]'), hero, desktop ? 240 : 100);

      gsap.timeline({
        scrollTrigger: { trigger: hero, start: 'top top', end: desktop ? '+=70%' : 'bottom top', scrub: 0.6, pin: desktop }
      })
        .to(q('[data-hero-copy]'), { y: -100, opacity: 0, ease: 'power1.in' }, 0.1)
        .to(q('[data-hero-visual]'), { scale: desktop ? 1.16 : 1.05, y: desktop ? -10 : -30, ease: 'none' }, 0)
        .to(q('[data-scroll-hint]'), { opacity: 0, duration: 0.15 }, 0);
    });

    /* ANTES E DEPOIS: o improviso voa até o quadro organizado */
    scene('transformacao', function () {
      var sec = $('#transformacao'); if (!sec) return;
      var q = gsap.utils.selector(sec);
      revealWords(q('h2 .wi'), { scrollTrigger: { trigger: sec, start: 'top 70%', toggleActions: 'play none none reverse' } });

      if (!desktop) {
        revealOnScroll(q('[data-chaos]'), q('[data-pile]')[0], { rotate: 0 });
        revealOnScroll(q('[data-row]'), q('[data-card]')[0], { x: 30, y: 0 });
        return;
      }
      var card = q('[data-card]')[0];
      var toCard = function (el) {
        var a = el.getBoundingClientRect(), b = card.getBoundingClientRect();
        return { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) };
      };
      var tl = gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top top', end: '+=140%', scrub: 0.8, pin: true, invalidateOnRefresh: true } });
      // fromTo (e não from): com invalidateOnRefresh o estado final precisa estar explícito.
      tl.fromTo(q('[data-row]'), { opacity: 0, x: 40 }, { opacity: 1, x: 0, stagger: 0.25, duration: 0.5 }, 0.35);
      q('[data-chaos]').forEach(function (el, i) {
        tl.to(el, { x: function () { return toCard(el).x; }, y: function () { return toCard(el).y; }, rotate: 0, scale: 0.4, opacity: 0, duration: 0.6, ease: 'power2.in' }, i * 0.12);
      });
      tl.to(card, { boxShadow: '0 0 0 1px #2BD4C0, 0 30px 80px -20px rgba(43,212,192,.55)', duration: 0.4 }, '>-0.2');
    });

    /* SOLUÇÕES: trilho horizontal preso à tela (desktop) */
    scene('solucoes', function () {
      var sec = $('#solucoes'); if (!sec) return;
      var q = gsap.utils.selector(sec);
      revealWords(q('h2 .wi'), { scrollTrigger: { trigger: sec, start: 'top 70%', toggleActions: 'play none none reverse' } });

      if (!desktop) {
        q('[data-panel]').forEach(function (panel) { revealOnScroll(panel, panel); });
        return;
      }
      var track = q('[data-track]')[0];
      var distance = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
      var slide = gsap.to(track, {
        x: function () { return -distance(); }, ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top top', end: function () { return '+=' + distance(); }, scrub: 0.6, pin: true, invalidateOnRefresh: true }
      });
      gsap.to(q('[data-rail-progress]'), {
        scaleX: 1, ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top top', end: function () { return '+=' + distance(); }, scrub: true, invalidateOnRefresh: true }
      });
      q('[data-panel]').forEach(function (panel) {
        gsap.from($$('[data-panel-item]', panel), {
          y: 26, opacity: 0, stagger: 0.08, ease: 'power2.out',
          scrollTrigger: { trigger: panel, containerAnimation: slide, start: 'left 90%', end: 'left 55%', scrub: true }
        });
      });
    });

    /* PROJETOS: cartões entram em perspectiva e a ilustração desliza dentro da moldura */
    scene('projetos', function () {
      var sec = $('#projetos'); if (!sec) return;
      revealWords($$('h2 .wi', sec), { scrollTrigger: { trigger: sec, start: 'top 70%', toggleActions: 'play none none reverse' } });
      $$('.proj', sec).forEach(function (card) {
        gsap.from(card, {
          y: 70, rotateX: desktop ? 10 : 0, opacity: 0, transformPerspective: 1000, duration: 0.9, ease: 'power3.out',
          clearProps: 'transform,opacity', scrollTrigger: { trigger: card, start: 'top 88%', toggleActions: 'play none none none' }
        });
        var svg = $('.frame svg', card);
        if (svg) gsap.fromTo(svg, { yPercent: -6, scale: 1.1 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
    });

    /* PROCESSO: a linha se preenche e cada etapa acende */
    scene('processo', function () {
      var sec = $('#processo'); if (!sec) return;
      revealWords($$('h2 .wi', sec), { scrollTrigger: { trigger: sec, start: 'top 70%', toggleActions: 'play none none reverse' } });
      var steps = $$('.step', sec);
      var heads = steps.map(function (s) { return $('.step-head', s); });
      gsap.set(heads, { '--p': 0 });
      var tl = gsap.timeline({
        scrollTrigger: {
          trigger: $('.steps', sec), start: 'top 72%', end: 'bottom 55%', scrub: 0.6,
          // Cada etapa acende quando a linha chega até ela.
          onUpdate: function (self) {
            steps.forEach(function (s, i) { s.classList.toggle('on', self.progress * (steps.length - 1) >= i - 0.001); });
          }
        }
      });
      heads.forEach(function (h, i) { if (i < heads.length - 1) tl.to(h, { '--p': 1, ease: 'none', duration: 1 }, i); });
      revealOnScroll(steps.map(function (s) { return $('h3', s).parentNode; }), $('.steps', sec), { stagger: 0.12 });
    });

    /* SOBRE: o retrato é "digitalizado" por um scanner, atravessa a tela em pixels finos e é recomposto nítido */
    scene('sobre', function () {
      var sec = $('#sobre'); if (!sec) return;
      var q = gsap.utils.selector(sec);
      var portrait = q('[data-portrait]')[0], img = $('img', portrait), canvas = q('[data-pixel]')[0], scan = q('[data-scan]')[0];
      var A = q('[data-copy-a]')[0], B = q('[data-copy-b]')[0], stage = q('[data-about]')[0];
      var box = $('.portrait-img', portrait);
      img.loading = 'eager';

      var layer = makePixelLayer(img, canvas);
      // cut.s = % da altura já "digitalizada" (0 = foto nítida, 100 = toda em pixels).
      var cut = { s: 0 };
      var applyCut = function () {
        var s = Math.max(0, Math.min(100, cut.s));
        canvas.style.clipPath = 'inset(0 0 ' + (100 - s) + '% 0)';
        scan.style.transform = 'translateY(' + (s / 100 * box.offsetHeight) + 'px)';
        scan.style.opacity = (s > 0.4 && s < 99.6) ? '1' : '0';
      };
      var redraw = function () { layer.draw(); applyCut(); };
      if (img.complete && img.naturalWidth) redraw(); else img.addEventListener('load', redraw, { once: true });
      if (window.__aiaPortraitResize) window.removeEventListener('resize', window.__aiaPortraitResize);
      var t; window.__aiaPortraitResize = function () { clearTimeout(t); t = setTimeout(redraw, 200); };
      window.addEventListener('resize', window.__aiaPortraitResize);

      revealWords($$('h2 .wi', A), { scrollTrigger: { trigger: sec, start: 'top 70%', toggleActions: 'play none none reverse' } });

      if (!desktop) {
        // Celular: sem tela fixa; a foto é recomposta pelo scanner (de baixo para cima) ao entrar na tela.
        cut.s = 100; applyCut();
        gsap.to(cut, { s: 0, ease: 'none', onUpdate: applyCut, scrollTrigger: { trigger: portrait, start: 'top 88%', end: 'top 38%', scrub: 0.5 } });
        revealOnScroll([A, B], A);
        return;
      }

      var dx = function () { return stage.clientWidth - portrait.offsetWidth; };
      gsap.set(B, { opacity: 0 });
      var tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: sec, start: 'top top', end: '+=170%', scrub: 0.5, pin: true, invalidateOnRefresh: true }
      });
      tl.to(A, { opacity: 0, x: 70, duration: 0.5, ease: 'power2.in' }, 0)
        // 1) o scanner desce e transforma a foto em pixels finos
        .to(cut, { s: 100, duration: 0.7, ease: 'power1.inOut', onUpdate: applyCut }, 0.1)
        // 2) a versão em pixels atravessa a tela, com inclinação leve
        .to(portrait, { x: function () { return dx(); }, duration: 1.3, ease: 'power2.inOut' }, 0.8)
        .to(portrait, { rotateY: -7, transformPerspective: 1400, duration: 0.65, ease: 'sine.out' }, 0.8)
        .to(portrait, { rotateY: 0, duration: 0.65, ease: 'sine.in' }, 1.45)
        // 3) no destino o scanner sobe e recompõe a foto nítida
        .to(cut, { s: 0, duration: 0.7, ease: 'power1.inOut', onUpdate: applyCut }, 1.75)
        .fromTo(B, { opacity: 0, x: -70 }, { opacity: 1, x: 0, duration: 0.6, ease: 'power2.out' }, 2.05)
        .to({}, { duration: 0.5 });
    });

    /* DIFERENCIAIS */
    scene('diferenciais', function () {
      var sec = $('#diferenciais'); if (!sec) return;
      revealWords($$('h2 .wi', sec), { scrollTrigger: { trigger: sec, start: 'top 70%', toggleActions: 'play none none reverse' } });
      var grid = $('.diffs', sec);
      gsap.from($$('.diff', sec), {
        y: 50, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out', clearProps: 'transform,opacity',
        scrollTrigger: { trigger: grid, start: 'top 84%', toggleActions: 'play none none none' }
      });
      gsap.from($$('.diff .icon-box', sec), {
        scale: 0.5, rotate: -18, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'back.out(2)', clearProps: 'transform,opacity',
        scrollTrigger: { trigger: grid, start: 'top 80%', toggleActions: 'play none none none' }
      });
    });

    /* CONTATO: a rota se desenha até o destino e o convite aparece */
    scene('contato', function () {
      var sec = $('#contato'); if (!sec) return;
      var q = gsap.utils.selector(sec);
      gsap.from(q('[data-route]'), { scaleY: 0, transformOrigin: '50% 0%', ease: 'none', scrollTrigger: { trigger: sec, start: 'top 92%', end: 'top 42%', scrub: true } });
      gsap.from(q('[data-pin]'), { scale: 0, y: -18, ease: 'back.out(2)', scrollTrigger: { trigger: sec, start: 'top 48%', toggleActions: 'play none none reverse' } });
      revealWords(q('h2 .wi'), { scrollTrigger: { trigger: sec, start: 'top 52%', toggleActions: 'play none none reverse' } });
      gsap.from(q('.cta-box'), {
        y: 60, scale: 0.96, opacity: 0, duration: 0.9, ease: 'power3.out', clearProps: 'transform,opacity',
        scrollTrigger: { trigger: sec, start: 'top 58%', toggleActions: 'play none none none' }
      });
    });
  });

  /* ---------------------------------------------------------------- ciclo de vida */
  function onReady() {
    isReady = true;
    syncLenis();
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    ScrollTrigger.refresh();
    if (heroIntro) heroIntro.play();
    scramble(heroEyebrow);
  }
  if (isReady) onReady(); else window.addEventListener('aia:ready', onReady, { once: true });

  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
})();
