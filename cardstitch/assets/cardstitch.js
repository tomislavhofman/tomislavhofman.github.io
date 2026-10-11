/* CardStitch landing page — vanilla JS, no dependencies.
 * 1. Hero demo: a port of the app's OnboardingDialog animation
 *    (flip front -> back, crop, join, stitch), same timings and easing.
 * 2. Output lab: filename + border/watermark preview.
 * 3. Stepped scroll reveal.
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ */
  /* 1. Onboarding animation                                             */
  /* ------------------------------------------------------------------ */

  // OnboardingDialog.kt timings (ms)
  var FAST_MS = 25, SLOW_MS = 70, WORD_MS = 45, HOLD_MS = 1600, CROP_HOLD_MS = 1200, DELETE_MS = 80, TYPE_BACK_MS = 100;
  var PREFIX = 'Take a photo of the ', FRONT = 'FRONT', BACK = 'BACK', WE_CROP = 'We crop them', WE_STITCH = 'We stitch them';

  // Compose FastOutSlowInEasing = cubic-bezier(0.4, 0, 0.2, 1)
  function bezier(x1, y1, x2, y2) {
    function a(p1, p2) { return 1 - 3 * p2 + 3 * p1; }
    function b(p1, p2) { return 3 * p2 - 6 * p1; }
    function c(p1) { return 3 * p1; }
    function calc(t, p1, p2) { return ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t; }
    function slope(t, p1, p2) { return 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1); }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var s = slope(t, x1, x2);
        if (Math.abs(s) < 1e-6) break;
        t -= (calc(t, x1, x2) - x) / s;
      }
      return calc(t, y1, y2);
    };
  }
  var ease = bezier(0.4, 0, 0.2, 1);

  function initDemo() {
    var stage = document.querySelector('[data-demo-stage]');
    if (!stage) return;
    var front = stage.querySelector('[data-demo-front]');
    var back = stage.querySelector('[data-demo-back]');
    var canvas = stage.querySelector('[data-demo-fx]');
    var captionEl = document.querySelector('[data-demo-caption]');
    var fileEl = document.querySelector('[data-demo-file]');
    var toggle = document.querySelector('[data-demo-toggle]');
    var ctx = canvas.getContext('2d');

    var flip = { v: 0 }, stitch = { v: 0 }, crop = { v: 0 }, join = { v: 0 }, solid = { v: 0 };
    var caption = { text: '', visible: 0 };

    // Virtual clock: only advances while playing and on screen.
    var vt = 0, last = null, userPaused = false, onScreen = true, tasks = [];
    function playing() { return !userPaused && onScreen && !document.hidden; }

    function wait(ms) {
      return new Promise(function (resolve) {
        var end = vt + ms;
        tasks.push(function (now) { if (now >= end) { resolve(); return true; } return false; });
      });
    }
    function animateTo(anim, target, ms) {
      return new Promise(function (resolve) {
        var from = anim.v, start = vt;
        tasks.push(function (now) {
          var p = Math.min(1, (now - start) / ms);
          anim.v = from + (target - from) * ease(p);
          if (p >= 1) { resolve(); return true; }
          return false;
        });
      });
    }
    function snapTo(anim, v) { anim.v = v; }

    function commonPrefixLen(a, b) {
      var n = Math.min(a.length, b.length), i = 0;
      while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
      return i;
    }
    async function typeText(full, fastPrefixLen, fastMs, slowMs) {
      var common = commonPrefixLen(caption.text, full);
      caption.text = full;
      caption.visible = common;
      for (var i = common + 1; i <= full.length; i++) {
        caption.visible = i;
        await wait((i - 1) < fastPrefixLen ? fastMs : slowMs);
      }
    }
    async function backspaceTo(target, perCharMs) {
      while (caption.visible > target) {
        caption.visible -= 1;
        await wait(perCharMs);
      }
    }

    async function loop() {
      var frontCaption = PREFIX + FRONT, backCaption = PREFIX + BACK;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        snapTo(flip, 0); snapTo(stitch, 0); snapTo(crop, 0); snapTo(join, 0); snapTo(solid, 0);
        await typeText(frontCaption, PREFIX.length, FAST_MS, SLOW_MS);
        await wait(HOLD_MS);

        await Promise.all([
          animateTo(flip, 180, 800),
          (async function () {
            await backspaceTo(PREFIX.length, DELETE_MS);
            await typeText(backCaption, 0, TYPE_BACK_MS, TYPE_BACK_MS);
          })()
        ]);

        await wait(HOLD_MS);

        await Promise.all([
          animateTo(flip, 0, 600),
          animateTo(stitch, 1, 600),
          animateTo(crop, 1, 600),
          typeText(WE_CROP, 0, WORD_MS, WORD_MS)
        ]);

        await wait(CROP_HOLD_MS);

        await animateTo(join, 1, 400);

        await Promise.all([
          animateTo(crop, 0, 600),
          animateTo(solid, 1, 600),
          typeText(WE_STITCH, 0, WORD_MS, WORD_MS)
        ]);

        await wait(HOLD_MS);

        await Promise.all([
          animateTo(stitch, 0, 600),
          animateTo(solid, 0, 600)
        ]);
      }
    }

    // ---- rendering ----
    var W = 0, H = 0, dpr = 1;
    function resize() {
      var r = stage.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    var cssVars = { tf: null, rf: null, of: null, tb: null, rb: null, ob: null };
    function setVar(el, name, key, value) {
      if (cssVars[key] === value) return;
      cssVars[key] = value;
      el.style.setProperty(name, value);
    }

    // Partial clockwise perimeter from the top-left corner, like PathMeasure.getSegment on addRect.
    function partialRect(x0, y0, x1, y1, progress) {
      var corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
      var len = 2 * ((x1 - x0) + (y1 - y0)) * progress;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (var i = 0; i < 4 && len > 0; i++) {
        var a = corners[i], b = corners[i + 1];
        var seg = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
        var t = Math.min(1, len / seg);
        ctx.lineTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        len -= seg;
      }
      ctx.stroke();
    }

    function render() {
      var stitchAmount = stitch.v, flipAngle = flip.v;
      var separation = (62 - 12 * join.v) * stitchAmount; // in dp of the 232×140 stage

      setVar(front, '--tx', 'tf', (-separation).toFixed(3));
      setVar(front, '--ry', 'rf', flipAngle.toFixed(2));
      setVar(front, '--o', 'of', flipAngle <= 90 ? '1' : '0');
      setVar(back, '--tx', 'tb', separation.toFixed(3));
      setVar(back, '--ry', 'rb', (stitchAmount > 0 ? 0 : flipAngle - 180).toFixed(2));
      setVar(back, '--o', 'ob', (stitchAmount > 0 || flipAngle > 90) ? '1' : '0');

      var shown = caption.text.slice(0, caption.visible);
      if (captionEl.textContent !== shown) captionEl.textContent = shown;
      if (fileEl) fileEl.style.setProperty('--file-o', solid.v.toFixed(3));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var u = W / 232;
      var sepPx = separation * u, cardW = 84 * u, cardH = 118 * u, pad = 8 * u;
      var cx = W / 2, cy = H / 2;

      if (crop.v > 0) {
        ctx.strokeStyle = '#C7D6E3'; // AppColors.TextSecondary
        ctx.lineWidth = 2 * u;
        ctx.setLineDash([3.6 * u, 2.2 * u]);
        [cx - sepPx, cx + sepPx].forEach(function (x) {
          partialRect(x - cardW / 2 - pad, cy - cardH / 2 - pad, x + cardW / 2 + pad, cy + cardH / 2 + pad, crop.v);
        });
      }
      if (solid.v > 0) {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(56, 176, 0, ' + solid.v.toFixed(3) + ')'; // AppColors.GuideActive
        ctx.lineWidth = 3 * u;
        var left = cx - sepPx - cardW / 2 - pad, right = cx + sepPx + cardW / 2 + pad;
        ctx.strokeRect(left, cy - cardH / 2 - pad, right - left, cardH + 2 * pad);
      }
    }

    function frame(ts) {
      if (last === null) last = ts;
      var dt = Math.min(ts - last, 64);
      last = ts;
      if (playing()) {
        vt += dt;
        // Finished tasks resolve their promises; follow-up steps queue new tasks from microtasks.
        tasks = tasks.filter(function (t) { return !t(vt); });
      }
      render();
      requestAnimationFrame(frame);
    }

    function setFinalState() {
      flip.v = 0; stitch.v = 1; crop.v = 0; join.v = 1; solid.v = 1;
      caption.text = WE_STITCH; caption.visible = WE_STITCH.length;
    }

    resize();
    if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); render(); }).observe(stage);
    else window.addEventListener('resize', function () { resize(); render(); });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
      }, { threshold: 0.05 }).observe(stage);
    }

    var started = false;
    function start() {
      if (started) return;
      started = true;
      loop();
      requestAnimationFrame(frame);
    }

    function setToggle(paused) {
      toggle.setAttribute('aria-pressed', paused ? 'true' : 'false');
      toggle.querySelector('.device__toggle-text').textContent = paused ? 'Play' : 'Pause';
      toggle.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    }

    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', function () {
        if (!started) { userPaused = false; setToggle(false); start(); return; }
        userPaused = !userPaused;
        setToggle(userPaused);
      });
    }

    if (reduceMotion) {
      // Final state, no autoplay; the user can still press Play.
      setFinalState();
      render();
      if (toggle) setToggle(true);
    } else {
      if (toggle) setToggle(false);
      start();
    }
  }

  /* ------------------------------------------------------------------ */
  /* 2. Output lab                                                       */
  /* ------------------------------------------------------------------ */
  function initLab() {
    var form = document.querySelector('[data-lab-form]');
    if (!form) return;
    var fileOut = document.querySelector('[data-lab-file]');
    var stitched = document.querySelector('[data-lab-stitched]');
    var wmEl = document.querySelector('[data-lab-wm]');
    var wmHint = document.querySelector('[data-lab-wm-hint]');
    var desc = document.querySelector('[data-lab-desc]');
    var wmInput = form.querySelector('input[name="wm"]');

    // Same rules as FileNameBuilder: name -> lowercase a-z0-9, number -> first digit run.
    var sample = { name: 'Sparkbit', number: '042/198' };
    var order = ['name', 'number', 'condition', 'date'];
    var now = new Date();
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    var date = pad2(now.getDate()) + pad2(now.getMonth() + 1) + now.getFullYear();

    function update() {
      var enabled = {};
      form.querySelectorAll('input[name="block"]').forEach(function (i) { enabled[i.value] = i.checked; });
      var sep = (form.querySelector('input[name="sep"]:checked') || {}).value || '';
      var cond = (form.querySelector('input[name="cond"]:checked') || {}).value || '';
      var border = (form.querySelector('input[name="border"]:checked') || {}).value || 'white';
      var wm = wmInput.value.trim();

      var values = {
        name: sample.name.normalize('NFD').replace(/[̀-ͯ]+/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40),
        number: ((sample.number.match(/\d+/) || [''])[0]).slice(0, 5),
        condition: cond.replace(/[^A-Za-z0-9]/g, ''),
        date: date
      };
      var base = order.filter(function (k) { return enabled[k] && values[k]; })
        .map(function (k) { return values[k]; }).join(sep);
      fileOut.textContent = (base || 'card_' + now.getTime()) + '.jpg';

      stitched.setAttribute('data-border', border);
      var hasBorder = border !== 'none';
      var hasWm = hasBorder && wm.length > 0;
      stitched.classList.toggle('has-wm', hasWm);
      wmEl.textContent = wm;
      wmInput.disabled = !hasBorder;
      wmHint.textContent = hasBorder ? 'Sits in the border, never over the card.' : 'Requires border.';

      desc.textContent = 'Stitched front and back' +
        (hasBorder ? ' with a ' + border + ' border' : ' without a border') +
        (hasWm ? ' and the watermark ' + wm + ' in the bottom border.' : '.');
    }
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();
  }

  /* ------------------------------------------------------------------ */
  /* 3. Scroll reveal                                                    */
  /* ------------------------------------------------------------------ */
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }

  initReveal();
  initLab();
  initDemo();
})();
