// ==UserScript==
// @name         c411-theme
// @namespace    https://github.com/CaptnAdhok/send2seed
// @version      1.0.0
// @description  Thème de couleur pour C411 (accent + fond) et désactivation du thème Halloween.
// @author       CaptnAdhok
// @match        https://*.c411.org/*
// @match        https://c411.org/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // Recoloration de l'accent C411 (palette emerald + variables)
  // ============================================================

  const SHADES = { 50: 0.96, 100: 0.91, 200: 0.82, 300: 0.71, 400: 0.61, 500: 0.53, 600: 0.46, 700: 0.39, 800: 0.32, 900: 0.27, 950: 0.17 };
  const GREEN_HUE_MIN = 85;
  const GREEN_HUE_MAX = 185;
  const SKIP_VAR_RE = /^--color-(green|lime|emerald)-/;
  const COLORISH_RE = /oklch|rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b/;
  const DIRECT_PROP_RE = /background|border|outline|fill|stroke|shadow|accent|ring|caret|decoration/i;

  let currentAccent = GM_getValue('accentColor', '') || null;
  let accentStyleEl = null;
  let hueShiftStyleEl = null;
  let rebuildTimer = null;

  function hexToHsl(hex) {
    const m = hex.replace('#', '');
    const r = parseInt(m.slice(0, 2), 16) / 255;
    const g = parseInt(m.slice(2, 4), 16) / 255;
    const b = parseInt(m.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s, l];
  }

  function hslToHex(h, s, l) {
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
      return Math.round(v * 255).toString(16).padStart(2, '0');
    };
    return '#' + f(0) + f(8) + f(4);
  }

  function shadeHex(hex, lightness) {
    const [h, s] = hexToHsl(hex);
    const sat = Math.min(1, s * 1.15 + 0.08);
    return hslToHex(h, sat, lightness);
  }

  function srgbToOklchHue(hex) {
    const m = hex.replace('#', '');
    const lin = (i) => {
      let c = parseInt(m.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const r = lin(0), g = lin(2), b = lin(4);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const A = 1.9779984951 * l - 2.4285932050 * mm + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * mm - 0.8086757660 * s;
    return (Math.atan2(B, A) * 180 / Math.PI + 360) % 360;
  }

  function isGreenHue(h) {
    return h >= GREEN_HUE_MIN && h <= GREEN_HUE_MAX;
  }

  function shiftValueColors(value, hslHue, oklchHue) {
    let touched = false;
    let out = value;

    out = out.replace(/oklch\(\s*([0-9.]+%?)?\s*([0-9.]+%?)?\s*([0-9.]+)(?:deg)?\s*(?:\/\s*[0-9.]+%?)?\s*\)/g,
      (m, L, C, H) => {
        if (!isGreenHue(parseFloat(H))) return m;
        touched = true;
        return 'oklch(' + (L || '') + ' ' + (C || '') + ' ' + oklchHue.toFixed(1) + ')';
      });

    out = out.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (m, h) => {
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const [hue, s, l] = hexToHsl(h);
      if (!isGreenHue(hue)) return m;
      touched = true;
      return hslToHex(hslHue, s, l);
    });

    out = out.replace(/rgba?\(\s*(\d+)[\s,]+\s*(\d+)[\s,]+\s*(\d+)\s*(?:[,/]\s*([0-9.]+%?)\s*)?\)/g,
      (m, r, g, b, a) => {
        const [hue, s, l] = hexToHsl(
          [r, g, b].map((n) => Math.max(0, Math.min(255, +n)).toString(16).padStart(2, '0')).join('')
        );
        if (!isGreenHue(hue)) return m;
        touched = true;
        const S = Math.round(s * 100), L = Math.round(l * 100);
        return 'hsl(' + hslHue + ' ' + S + '% ' + L + '%' + (a ? ' / ' + a : '') + ')';
      });

    out = out.replace(/hsla?\(\s*([0-9.]+)(?:deg)?\s*[, ]\s*([0-9.]+)%\s*[, ]\s*([0-9.]+)%\s*(?:[,/]\s*([0-9.]+%?)\s*)?\)/g,
      (m, h, s, l, a) => {
        if (!isGreenHue(parseFloat(h))) return m;
        touched = true;
        return 'hsl(' + hslHue + ' ' + s + '% ' + l + '%' + (a ? ' / ' + a : '') + ')';
      });

    return touched ? out : null;
  }

  function walkRules(rules, media, visit) {
    for (const rule of rules) {
      try {
        if (rule.styleSheet && rule.cssRules) {
          walkRules(rule.cssRules, media, visit);
        } else if (rule.media && rule.cssRules) {
          walkRules(rule.cssRules, rule.media.mediaText || media, visit);
        } else if (rule.cssRules) {
          walkRules(rule.cssRules, media, visit);
        } else if (rule.style) {
          visit(rule, media);
        }
      } catch (e) { /* cross-origin or unsupported */ }
    }
  }

  function collectShifted(hslHue, oklchHue) {
    const varNames = new Set();
    const blocks = new Map();
    const seen = new Set();

    for (const sheet of document.styleSheets) {
      const owner = sheet.ownerNode;
      if (owner && typeof owner.id === 'string' && owner.id.startsWith('send2seed-')) continue;
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      walkRules(rules, '', (rule, media) => {
        const sel = rule.selectorText || '';
        if (!sel || sel.includes('send2seed')) return;
        const style = rule.style;
        if (!style) return;
        const text = style.cssText || '';
        const decls = text.split(';');
        for (const decl of decls) {
          const idx = decl.indexOf(':');
          if (idx < 1) continue;
          const prop = decl.slice(0, idx).trim();
          const value = decl.slice(idx + 1).trim();
          if (!prop || !value) continue;
          if (prop.startsWith('--')) {
            if (!SKIP_VAR_RE.test(prop)) varNames.add(prop);
            continue;
          }
          if (!DIRECT_PROP_RE.test(prop)) continue;
          if (!COLORISH_RE.test(value)) continue;
          const shifted = shiftValueColors(value, hslHue, oklchHue);
          if (!shifted) continue;
          const key = (media || '') + '\u0000' + sel + '\u0000' + prop;
          if (seen.has(key)) continue;
          seen.add(key);
          const gk = (media || '') + '\u0000' + sel;
          if (!blocks.has(gk)) blocks.set(gk, { media: media || '', sel, props: [] });
          blocks.get(gk).props.push(prop + ': ' + shifted + ' !important;');
        }
      });
    }

    const rootCs = getComputedStyle(document.documentElement);
    for (let i = 0; i < rootCs.length; i++) {
      const prop = rootCs[i];
      if (typeof prop === 'string' && prop.startsWith('--')) varNames.add(prop);
    }

    const vars = [];
    for (const name of varNames) {
      if (SKIP_VAR_RE.test(name)) continue;
      let v = '';
      try { v = rootCs.getPropertyValue(name).trim(); } catch (e) { continue; }
      if (!v || !COLORISH_RE.test(v)) continue;
      const shifted = shiftValueColors(v, hslHue, oklchHue);
      if (shifted) vars.push(name + ': ' + shifted + ' !important;');
    }
    return { blocks, vars };
  }

  function rebuildHueShift() {
    if (hueShiftStyleEl) { hueShiftStyleEl.remove(); hueShiftStyleEl = null; }
    if (!currentAccent) return;
    const hslHue = hexToHsl(currentAccent)[0];
    const oklchHue = srgbToOklchHue(currentAccent);
    let data;
    try { data = collectShifted(hslHue, oklchHue); } catch (e) { return; }
    let css = '';
    if (data.vars.length) css += ':root {\n' + data.vars.join('\n') + '\n}\n';
    if (currentAccent) css += '.nuxt-loading-indicator { background: ' + currentAccent + ' !important; }\n';
    const byMedia = new Map();
    for (const g of data.blocks.values()) {
      if (!byMedia.has(g.media)) byMedia.set(g.media, []);
      byMedia.get(g.media).push(g.sel + ' { ' + g.props.join(' ') + ' }');
    }
    for (const [media, bl] of byMedia) {
      if (media) css += '@media ' + media + ' { ' + bl.join(' ') + ' }\n';
      else css += bl.join('\n') + '\n';
    }
    if (!css) return;
    hueShiftStyleEl = document.createElement('style');
    hueShiftStyleEl.id = 'send2seed-hueshift';
    hueShiftStyleEl.textContent = css;
    (document.head || document.documentElement).appendChild(hueShiftStyleEl);
  }

  function scheduleHueShift(delay) {
    if (!currentAccent) return;
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuildHueShift, delay || 100);
  }

  function applyAccent(hex) {
    currentAccent = hex || null;
    if (accentStyleEl) { accentStyleEl.remove(); accentStyleEl = null; }
    if (currentAccent) {
      const decls = Object.entries(SHADES)
        .map(([shade, l]) => `--color-emerald-${shade}: ${shadeHex(currentAccent, l)} !important;`)
        .join('\n    ');
      accentStyleEl = document.createElement('style');
      accentStyleEl.id = 'send2seed-accent';
      accentStyleEl.textContent = `:root {\n    ${decls}\n  }`;
      (document.head || document.documentElement).appendChild(accentStyleEl);
    }
    scheduleHueShift(50);
  }

  function initAccent() {
    applyAccent(currentAccent);
    window.addEventListener('DOMContentLoaded', () => {
      scheduleHueShift(200);
      [500, 1200, 2500, 4500].forEach((d) => setTimeout(() => scheduleHueShift(0), d));
    }, { once: true });
    window.addEventListener('load', () => {
      scheduleHueShift(200);
      [800, 2000, 4000].forEach((d) => setTimeout(() => scheduleHueShift(0), d));
    }, { once: true });

    const mo = new MutationObserver((muts) => {
      for (const mu of muts) {
        if (mu.type === 'attributes' && mu.target === document.documentElement) {
          scheduleHueShift(50);
          continue;
        }
        for (const n of mu.addedNodes) {
          if (n.nodeType !== 1) continue;
          const id = n.id || '';
          if (typeof id === 'string' && id.startsWith('send2seed-')) continue;
          const tag = n.tagName;
          if (tag === 'STYLE' || tag === 'LINK' || n.querySelector?.('style, link[rel="stylesheet"]')) {
            scheduleHueShift(700);
            return;
          }
        }
      }
    });
    const startMo = () => {
      if (document.head) mo.observe(document.head, { childList: true, subtree: true });
      if (document.documentElement) {
        mo.observe(document.documentElement, { childList: true, subtree: false });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      }
    };
    if (document.head) startMo();
    else window.addEventListener('DOMContentLoaded', startMo, { once: true });
  }

  // ============================================================
  // Thème Halloween (classe .theme-halloween posée par le site)
  // ============================================================

  let halloweenOffStyleEl = null;
  let halloweenBtn = null;

  function isHalloweenOff() {
    return !!GM_getValue('halloweenOff', false);
  }

  function applyHalloweenOff(off) {
    const html = document.documentElement;
    if (!html) return;
    if (off) {
      html.classList.remove('theme-halloween');
      for (const img of document.querySelectorAll('img.halloween-logo')) {
        img.src = img.src.replace('logo-halloween-md.webp', 'logo-md.png');
        img.classList.remove('halloween-logo');
      }
      if (!halloweenOffStyleEl) {
        halloweenOffStyleEl = document.createElement('style');
        halloweenOffStyleEl.id = 'send2seed-hwoff';
        halloweenOffStyleEl.textContent =
          '.theme-halloween .hw-decor { display: none !important; } ' +
          '.hw-decor { display: none !important; } ' +
          'img.halloween-logo { filter: none !important; }';
        (document.head || document.documentElement).appendChild(halloweenOffStyleEl);
      }
    } else {
      if (halloweenOffStyleEl) { halloweenOffStyleEl.remove(); halloweenOffStyleEl = null; }
      if (!html.classList.contains('theme-halloween')) html.classList.add('theme-halloween');
      for (const img of document.querySelectorAll('header img[src*="logo-md"]')) {
        if (img.src.includes('halloween')) continue;
        img.src = img.src.replace('logo-md.png', 'logo-halloween-md.webp');
        img.classList.add('halloween-logo');
      }
    }
    if (halloweenBtn) {
      halloweenBtn.style.opacity = off ? '.5' : '1';
      halloweenBtn.title = off ? 'Réactiver le thème Halloween' : 'Désactiver le thème Halloween';
    }
  }

  function toggleHalloween() {
    const off = !isHalloweenOff();
    GM_setValue('halloweenOff', off);
    applyHalloweenOff(off);
    toast(off ? '🎃 Thème Halloween désactivé' : '🎃 Thème Halloween activé');
  }

  function initHalloween() {
    if (isHalloweenOff()) {
      const run = () => applyHalloweenOff(true);
      if (document.documentElement) run();
      window.addEventListener('DOMContentLoaded', run, { once: true });
      window.addEventListener('load', run, { once: true });
      [1000, 2500, 5000].forEach((d) => setTimeout(run, d));
    }
    const mo = new MutationObserver(() => {
      if (!isHalloweenOff()) return;
      const html = document.documentElement;
      if (html && html.classList.contains('theme-halloween')) {
        applyHalloweenOff(true);
        return;
      }
      if (document.querySelector('img.halloween-logo')) {
        applyHalloweenOff(true);
      }
    });
    const start = () => {
      if (document.documentElement) mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (document.body) mo.observe(document.body, { childList: true, subtree: true });
      else window.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }), { once: true });
    };
    if (document.body || document.documentElement) start();
    else window.addEventListener('DOMContentLoaded', start, { once: true });
  }

  // ============================================================
  // Panneaux déroulants + boutons flottants
  // ============================================================

  const PRESETS = [
    ['Bleu', '#3b82f6'], ['Indigo', '#6366f1'], ['Violet', '#8b5cf6'],
    ['Rose', '#ec4899'], ['Orange', '#f97316'], ['Cyan', '#06b6d4'],
  ];

  let panelEl = null;
  let openPanelId = null;

  function makePanelHead(title) {
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;';
    const label = document.createElement('div');
    label.style.cssText = 'font-weight:600;font-size:14px;';
    label.textContent = title;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Fermer';
    closeBtn.style.cssText =
      'width:26px;height:26px;border:none;border-radius:6px;background:transparent;color:#8a8b92;' +
      'cursor:pointer;font-size:14px;line-height:1;padding:0;';
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#e8e8ea'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#8a8b92'; });
    closeBtn.addEventListener('click', closePanel);
    head.append(label, closeBtn);
    return head;
  }

  function openPanel(id, build) {
    if (panelEl && openPanelId === id) { closePanel(); return; }
    closePanel();
    openPanelId = id;
    panelEl = document.createElement('div');
    panelEl.id = 'send2seed-panel';
    panelEl.style.cssText =
      'position:fixed;bottom:76px;right:20px;background:#1e1f24;color:#e8e8ea;' +
      'border:1px solid #3a3b42;border-radius:12px;padding:18px;width:280px;max-width:calc(100vw - 40px);' +
      'box-shadow:0 8px 40px rgba(0,0,0,.5);z-index:2147483647;font-family:system-ui,sans-serif;' +
      'transform-origin:bottom right;transform:translateY(8px) scale(.95);opacity:0;' +
      'transition:transform .18s ease,opacity .18s ease;';
    build(panelEl);
    document.body.appendChild(panelEl);
    requestAnimationFrame(() => {
      panelEl.style.transform = 'translateY(0) scale(1)';
      panelEl.style.opacity = '1';
    });
  }

  function closePanel() {
    if (!panelEl) return;
    const el = panelEl;
    panelEl = null;
    openPanelId = null;
    el.style.transform = 'translateY(8px) scale(.95)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }

  function accentPanel(box) {
    box.appendChild(makePanelHead('Couleur d\'accent'));

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;';
    for (const [name, hex] of PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.style.cssText =
        'padding:8px;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:' + hex +
        ';color:#fff;cursor:pointer;font-size:13px;';
      b.addEventListener('click', () => { GM_setValue('accentColor', hex); applyAccent(hex); });
      grid.appendChild(b);
    }
    box.appendChild(grid);

    const customRow = document.createElement('div');
    customRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:14px;';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = GM_getValue('accentColor', '#3b82f6');
    colorInput.style.cssText = 'width:40px;height:30px;padding:0;border:1px solid #4a4b52;border-radius:6px;background:none;cursor:pointer;flex:0 0 auto;direction:rtl;';
    colorInput.addEventListener('input', () => { GM_setValue('accentColor', colorInput.value); applyAccent(colorInput.value); });
    const customLabel = document.createElement('span');
    customLabel.style.cssText = 'font-size:13px;color:#b6b7bd;';
    customLabel.textContent = 'Couleur libre :';
    customRow.append(colorInput, customLabel);
    box.appendChild(customRow);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = '↺ Retour au vert d\'origine';
    resetBtn.style.cssText = 'width:100%;padding:8px;border:1px solid #4a4b52;border-radius:6px;color:#e8e8ea;background:transparent;cursor:pointer;font-size:13px;';
    resetBtn.addEventListener('click', () => {
      GM_setValue('accentColor', '');
      if (accentStyleEl) { accentStyleEl.remove(); accentStyleEl = null; }
      if (hueShiftStyleEl) { hueShiftStyleEl.remove(); hueShiftStyleEl = null; }
      currentAccent = null;
      closePanel();
      toast('🎨 Retour au vert — rechargement de la page…');
      setTimeout(() => location.reload(), 350);
    });
    box.appendChild(resetBtn);
  }

  function addFab() {
    if (document.getElementById('send2seed-fab')) return;
    const wrap = document.createElement('div');
    wrap.id = 'send2seed-fab';
    wrap.style.cssText =
      'position:fixed;bottom:20px;right:20px;display:flex;gap:8px;z-index:2147483646;';

    function makeFab(icon, title, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = title;
      b.textContent = icon;
      b.style.cssText =
        'width:44px;height:44px;border-radius:50%;' +
        'border:1px solid rgba(255,255,255,.25);background:rgba(30,31,36,.85);color:#fff;font-size:19px;' +
        'cursor:pointer;display:flex;align-items:center;justify-content:center;' +
        'backdrop-filter:blur(6px);box-shadow:0 4px 16px rgba(0,0,0,.35);transition:transform .15s;' +
        'padding:0;line-height:1;';
      b.addEventListener('mouseenter', () => { b.style.transform = 'scale(1.1)'; });
      b.addEventListener('mouseleave', () => { b.style.transform = 'scale(1)'; });
      b.addEventListener('click', onClick);
      return b;
    }

    wrap.append(
      makeFab('🎨', 'Couleur d\'accent', () => openPanel('accent', accentPanel)),
      (() => {
        const b = makeFab('🎃', 'Désactiver le thème Halloween', toggleHalloween);
        b.id = 'send2seed-fab-halloween';
        halloweenBtn = b;
        if (isHalloweenOff()) { b.style.opacity = '.5'; b.title = 'Réactiver le thème Halloween'; }
        return b;
      })()
    );
    document.body.appendChild(wrap);
    initHalloween();

    document.addEventListener('click', (e) => {
      if (!panelEl) return;
      if (panelEl.contains(e.target) || wrap.contains(e.target)) return;
      closePanel();
    }, true);
  }

  let toastEl = null;
  function toast(msg) {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.style.cssText =
      'position:fixed;bottom:84px;right:20px;background:#111;color:#fff;padding:14px 20px;border-radius:8px;' +
      'z-index:2147483647;font-family:system-ui,sans-serif;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,.4);';
    toastEl.textContent = msg;
    document.body.appendChild(toastEl);
    setTimeout(() => toastEl && toastEl.remove(), 4000);
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('🎨 Couleur de l\'accent C411', () => openPanel('accent', accentPanel));
    GM_registerMenuCommand('🎃 Halloween on/off', toggleHalloween);
  }

  initAccent();
  window.addEventListener('DOMContentLoaded', addFab, { once: true });
  window.addEventListener('DOMContentLoaded', () => setTimeout(addFab, 500), { once: true });
  window.addEventListener('load', () => setTimeout(addFab, 200), { once: true });

})();
