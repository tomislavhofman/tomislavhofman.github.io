// Fly: a tiny one-button game. Hold to rise, release to fall. Touch the green side of a
// platform to collect it (each piece speeds you up), never touch a red side, the ceiling
// or the floor. Rendered on #dino-game, scores in #score-tracker.
(function () {
    'use strict';

    const canvas = document.getElementById('dino-game');
    const tracker = document.getElementById('score-tracker');
    if (!canvas || !tracker) return;
    const ctx = canvas.getContext('2d');

    /* ---------- constants (logical pixels; the canvas is scaled for the screen) ---------- */
    const W = 700;
    const H = 292;
    const STEP = 1 / 60;                 // fixed physics step, the same on every screen
    const GRAVITY = 0.5;                 // px per step², when not holding
    const LIFT = -0.22;                  // px per step², while holding
    const TAP_BOOST = -3.5;              // instant kick when a hold starts
    const MAX_FALL = 5;
    const MAX_RISE = -5;
    const BALL_R = 9;
    const BALL_X = 80;
    const PLATFORM_H = 8;
    const FACE = 4;                      // drawn thickness of a platform's coloured faces
    const BORDER = 5;                    // drawn thickness of the red ceiling and floor
    const SEGMENT_W = 10;
    const PLATFORM_GAP = 60;
    const START_SPEED = 4;
    const SPEED_PER_PIECE = 0.05;
    const RESTART_DELAY = 600;           // ms after a crash before input restarts
    const BEST_KEY = 'fly.best';

    /* ---------- crisp on high-density screens ---------- */
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.style.touchAction = 'none';

    /* ---------- state ---------- */
    let state;                            // 'ready' | 'playing' | 'over'
    let ball;
    let holding = false;
    let platforms;
    let streaks;                          // decorative speed lines
    let pieces;                           // collected segments flying to the counter
    let speed;
    let time;                             // seconds survived
    let distance;                         // logical px travelled
    let collected;
    let crashAt;
    let crashAnim;                        // 0..1 red-out after a crash
    let best = 0;
    try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) { /* private mode */ }

    function reset() {
        state = 'ready';
        ball = { x: BALL_X, y: H / 2, vy: 0 };
        holding = false;
        platforms = [];
        streaks = [];
        pieces = [];
        speed = START_SPEED;
        time = 0;
        distance = 0;
        collected = 0;
        crashAnim = 0;
        renderScore(true);
    }

    const su = (px) => (px / 2000).toFixed(2);

    /* ---------- input ---------- */
    function press() {
        if (state === 'over') {
            if (performance.now() - crashAt > RESTART_DELAY) reset();
            return;
        }
        if (state === 'ready') state = 'playing';
        if (!holding) ball.vy = TAP_BOOST;
        holding = true;
    }
    function release() { holding = false; }

    // Only take over the space bar while the game is on screen, so the page still scrolls.
    let inView = false;
    new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        if (inView) wake();
    }, { threshold: 0.5 }).observe(canvas);

    document.addEventListener('keydown', (e) => {
        if (e.code !== 'Space' || !inView) return;
        e.preventDefault();
        if (!e.repeat) press();
    });
    document.addEventListener('keyup', (e) => {
        if (e.code !== 'Space' || !inView) return;
        e.preventDefault();
        release();
    });
    // Pointer events cover mouse, touch and pen once each (no double tap from touch + mouse).
    canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        press();
    });
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    /* ---------- simulation ---------- */
    function spawnPlatform() {
        const w = 60 + Math.random() * (W / 3 - 60);
        platforms.push({
            x: W,
            y: 40 + Math.random() * (H - 80),
            w,
            greenOnTop: Math.random() < 0.5,
            taken: new Array(Math.ceil(w / SEGMENT_W)).fill(false),
        });
    }

    function crash() {
        state = 'over';
        holding = false;
        crashAt = performance.now();
        if (distance > best) {
            best = distance;
            try { localStorage.setItem(BEST_KEY, String(Math.round(best))); } catch (_) { /* private mode */ }
        }
    }

    // Segments of platform p under the ball, as [index, centreX].
    function segmentsUnderBall(p) {
        const out = [];
        for (let i = 0; i < p.taken.length; i++) {
            const x1 = p.x + i * SEGMENT_W;
            const x2 = Math.min(x1 + SEGMENT_W, p.x + p.w);
            if (ball.x + BALL_R > x1 && ball.x - BALL_R < x2) out.push([i, (x1 + x2) / 2]);
        }
        return out;
    }

    function touchFace(p, faceY, green) {
        for (const [i, cx] of segmentsUnderBall(p)) {
            if (!green) { crash(); return; }
            if (p.taken[i]) continue;
            p.taken[i] = true;
            pieces.push({ x: cx, y: faceY, t: 0 });
            speed += SPEED_PER_PIECE;
        }
    }

    function step() {
        // Decorative speed streaks run in every state.
        const playing = state === 'playing';
        if (Math.random() < (playing ? 0.15 * (speed / 6) : 0.04)) {
            const n = Math.floor(2 + Math.min(speed / 2, 10));
            for (let i = 0; i < n; i++) {
                if (Math.random() < 0.5) continue;
                const h = 6 + Math.random() * 8;
                streaks.push({ x: W + Math.random() * 40, y: 10 + Math.random() * (H - 20 - h), w: 18 + Math.random() * 18, h,
                    v: (playing ? speed + 2 : 3) + Math.random() * speed * 1.2 });
            }
        }
        for (const s of streaks) s.x -= s.v * (playing ? 1 : 0.5);
        streaks = streaks.filter((s) => s.x + s.w > 0);

        for (const pc of pieces) pc.t += 0.07;
        const arrived = pieces.filter((pc) => pc.t >= 1).length;
        if (arrived) collected += arrived;
        pieces = pieces.filter((pc) => pc.t < 1);

        if (state === 'over') { crashAnim = Math.min(1, crashAnim + STEP / 1.8); return; }
        if (!playing) return;

        time += STEP;
        distance += speed;
        for (const p of platforms) p.x -= speed;
        platforms = platforms.filter((p) => p.x + p.w > 0);
        const last = platforms[platforms.length - 1];
        if (!last || W - (last.x + last.w) > PLATFORM_GAP) spawnPlatform();

        ball.vy = holding ? Math.max(MAX_RISE, ball.vy + LIFT) : Math.min(MAX_FALL, ball.vy + GRAVITY);
        let next = ball.y + ball.vy;

        // Swept collision against each platform face the ball crosses or rests on. The ball is
        // a circle: past a platform's end only the part of the ball that actually reaches over
        // it counts (r), so passing close to a corner is not a hit.
        for (const p of platforms) {
            const dx = Math.max(p.x - ball.x, 0, ball.x - (p.x + p.w));
            if (dx >= BALL_R) continue;
            const r = Math.sqrt(BALL_R * BALL_R - dx * dx);
            const top = p.y;
            const bottom = p.y + PLATFORM_H;
            const bottomOfBall = ball.y + r;
            const topOfBall = ball.y - r;
            if (bottomOfBall <= top + 0.5 && next + r >= top) {               // landing on the top face
                next = top - r;
                ball.vy = 0;
                touchFace(p, top, p.greenOnTop);
            } else if (topOfBall >= bottom - 0.5 && next - r <= bottom) {      // hitting the bottom face
                next = bottom + r;
                ball.vy = 0;
                touchFace(p, bottom, !p.greenOnTop);
            } else if (next + r > top && next - r < bottom) {                  // platform slid into the ball
                const above = ball.y < (top + bottom) / 2;
                next = above ? top - r : bottom + r;
                ball.vy = 0;
                touchFace(p, above ? top : bottom, above ? p.greenOnTop : !p.greenOnTop);
            }
            if (state !== 'playing') return;
        }

        ball.y = next;
        // The red ceiling and floor are BORDER px thick; touching their inner edge ends the run.
        if (ball.y + BALL_R >= H - BORDER || ball.y - BALL_R <= BORDER) {
            ball.y = Math.min(H - BORDER - BALL_R, Math.max(BORDER + BALL_R, ball.y));
            crash();
        }
    }

    /* ---------- drawing ---------- */
    function drawBackground() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#f8fafc');
        g.addColorStop(1, '#e0f2fe');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = BORDER * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(W, 0);
        ctx.moveTo(0, H); ctx.lineTo(W, H);
        ctx.stroke();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#fff';
        for (const s of streaks) ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.globalAlpha = 1;
    }

    function drawPlatforms() {
        // Both faces are drawn inside the platform's box, so what you see is what you hit.
        ctx.lineWidth = FACE;
        for (const p of platforms) {
            const upper = p.y + FACE / 2;
            const lower = p.y + PLATFORM_H - FACE / 2;
            const greenY = p.greenOnTop ? upper : lower;
            const redY = p.greenOnTop ? lower : upper;
            ctx.strokeStyle = '#ef4444';
            ctx.beginPath();
            ctx.moveTo(p.x, redY);
            ctx.lineTo(p.x + p.w, redY);
            ctx.stroke();
            ctx.strokeStyle = '#22c55e';
            ctx.beginPath();
            p.taken.forEach((taken, i) => {
                if (taken) return;
                const x1 = p.x + i * SEGMENT_W;
                ctx.moveTo(x1, greenY);
                ctx.lineTo(Math.min(x1 + SEGMENT_W, p.x + p.w), greenY);
            });
            ctx.stroke();
        }
        // Collected pieces fly to the bottom-left corner.
        for (const pc of pieces) {
            const e = pc.t * pc.t;
            const x = pc.x + (16 - pc.x) * e;
            const y = pc.y + (H - 16 - pc.y) * e;
            ctx.globalAlpha = 1 - pc.t;
            ctx.strokeStyle = '#22c55e';
            ctx.beginPath();
            ctx.moveTo(x - 5, y);
            ctx.lineTo(x + 5, y);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawBall(now) {
        if (state === 'over' && crashAnim >= 1) return;
        const t = now * 0.002;
        const base = BALL_R * 0.75;
        const core = base * (0.85 + 0.18 * Math.sin(t * 2.2));
        const halo = base * 1.8 * (1 + 0.13 * Math.sin(t * 2.2 + 1.2));
        const red = state === 'over';
        let rgb;
        if (red) {
            const k = 1 - crashAnim;
            rgb = [239, Math.round(68 * k), Math.round(68 * k)];
        } else {
            const k = Math.min(1, collected / 100);   // magenta to green as you collect
            rgb = [255 + (34 - 255) * k, 0 + 197 * k, 128 + (94 - 128) * k].map(Math.round);
        }
        const c = rgb.join(',');

        if (state === 'ready') {
            const py = ball.y + BALL_R * 0.85;
            const pad = ctx.createRadialGradient(ball.x, py, 1, ball.x, py, BALL_R * 1.3);
            pad.addColorStop(0, 'rgba(0,255,255,0.45)');
            pad.addColorStop(0.5, 'rgba(0,128,255,0.2)');
            pad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = pad;
            ctx.beginPath();
            ctx.ellipse(ball.x, py, BALL_R * 2.2, BALL_R * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        const glow = ctx.createRadialGradient(ball.x, ball.y, core, ball.x, ball.y, halo);
        glow.addColorStop(0, `rgba(${c},0.32)`);
        glow.addColorStop(0.5, `rgba(${c},0.13)`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, halo, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 4.2;
        ctx.strokeStyle = red ? 'rgba(239,0,0,0.95)' : '#172554';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, base * 1.18, 0, Math.PI * 2);
        ctx.stroke();
        if (!red) {
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = 'rgba(0,255,255,0.45)';
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, base * 1.25, t * 1.2, t * 1.2 + Math.PI * 0.7);
            ctx.stroke();
        }
        const fill = ctx.createRadialGradient(ball.x, ball.y, core * 0.18, ball.x, ball.y, core);
        fill.addColorStop(0, '#fff');
        fill.addColorStop(0.3, red ? '#ffb3b3' : '#b3e6ff');
        fill.addColorStop(1, `rgb(${c})`);
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, core, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawMessage(big, small) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#181c23';
        ctx.strokeStyle = '#22ff55';
        ctx.font = `bold ${small ? 56 : 32}px VT323, Fira Mono, Menlo, monospace`;
        ctx.lineWidth = 2.5;
        ctx.strokeText(big, W / 2, H / 2 - (small ? 10 : 0));
        ctx.fillText(big, W / 2, H / 2 - (small ? 10 : 0));
        if (small) {
            ctx.font = '28px VT323, Fira Mono, Menlo, monospace';
            ctx.lineWidth = 1.5;
            ctx.strokeText(small, W / 2, H / 2 + 24);
            ctx.fillText(small, W / 2, H / 2 + 24);
        }
    }

    function draw(now) {
        drawBackground();
        drawPlatforms();
        drawBall(now);
        if (state === 'ready') drawMessage('Press space or tap to start');
        if (state === 'over') drawMessage('Game Over', `${su(distance)} SU · press space or tap to retry`);
    }

    /* ---------- score bar: rebuilt once, then only the numbers change ---------- */
    let scoreEls = null;
    let lastScore = '';
    function renderScore(force) {
        if (!scoreEls) {
            const item = (cls, title, icon, unit, extra = '') => `
              <span class="score-item ${cls}" title="${title}" ${extra}>
                ${icon ? `<span class="score-icon">${icon}</span>` : ''}
                ${cls === 'fly-dist' ? '<span class="score-label">DIST</span>' : ''}
                <span class="score-value"><span class="n"></span> <span class="u">${unit}</span></span>
              </span>`;
            tracker.innerHTML = item('fly-dist', 'Distance', '🏁', 'SU') + item('fly-qs', 'Pieces collected', '⚡', 'QS')
                + item('fly-time', 'Time', '⏱', 's') + item('fly-best home-game__best', 'Best distance', '', 'SU');
            scoreEls = ['fly-dist', 'fly-qs', 'fly-time', 'fly-best'].map((c) => tracker.querySelector(`.${c} .n`));
            scoreEls[3].insertAdjacentText('beforebegin', 'BEST ');
        }
        const values = [su(distance), String(collected), String(Math.floor(time)), su(best)];
        const key = values.join('|');
        if (!force && key === lastScore) return;
        lastScore = key;
        values.forEach((v, i) => { scoreEls[i].textContent = v; });
    }

    /* ---------- loop: runs only while visible ---------- */
    let rafId = 0;
    let last = 0;
    let acc = 0;
    function frame(now) {
        rafId = 0;
        if (!inView || document.hidden) return;   // sleep until the game is visible again
        acc += Math.min(0.1, (now - last) / 1000);
        last = now;
        while (acc >= STEP) { step(); acc -= STEP; }
        draw(now);
        renderScore(false);
        rafId = requestAnimationFrame(frame);
    }
    function wake() {
        if (rafId || document.hidden) return;
        last = performance.now();
        acc = 0;
        rafId = requestAnimationFrame(frame);
    }
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) holding = false;
        else if (inView) wake();
    });

    reset();
    draw(performance.now());
})();
