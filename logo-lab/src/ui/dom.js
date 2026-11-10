// Tiny DOM helpers (no framework).
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'data') Object.assign(e.dataset, v);
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const I = {
  select: '<path d="M3.5 2l8.5 5.2-3.7.9-1.6 3.6z" fill="currentColor"/>',
  direct: '<path d="M3.5 2l8.5 5.2-3.7.9-1.6 3.6z"/>',
  pen: '<path d="M3 13l1-4.2L9.5 3.300 12.700 6.500 7.200 12zM8.300 4.500l3.200 3.200M3 13l2.600-2.600"/>',
  freehand: '<path d="M2 11c1.500-6 3.500-6.500 4.500-2.500s2.500 3.500 3.500-.5 2.500-4.500 4-3"/>',
  line: '<path d="M3 13L13 3"/><circle cx="3" cy="13" r="1.200" fill="currentColor"/><circle cx="13" cy="3" r="1.200" fill="currentColor"/>',
  rect: '<rect x="2.500" y="3.500" width="11" height="9"/>',
  ellipse: '<ellipse cx="8" cy="8" rx="6" ry="4.200"/>',
  circle: '<circle cx="8" cy="8" r="5.500"/><circle cx="8" cy="8" r=".8" fill="currentColor"/>',
  arc: '<path d="M3 13A10 10 0 0 1 13 3"/><circle cx="13" cy="13" r=".8" fill="currentColor"/>',
  polygon: '<path d="M8 2l5.200 3v6L8 14l-5.200-3V5z"/>',
  star: '<path d="M8 2l1.800 3.900 4.200.5-3.100 2.900.8 4.200L8 11.400l-3.700 2.100.8-4.200L2 6.400l4.200-.5z"/>',
  text: '<path d="M3 4.500V3h10v1.500M8 3v10M6 13h4"/>',
  char: '<path d="M5.500 11l2.500-6.500 2.500 6.500M6.400 9h3.200"/><rect x="2.500" y="2.500" width="11" height="11" stroke-dasharray="2 1.500"/>',
  eye: '<path d="M1.500 8S4 3.500 8 3.500 14.500 8 14.500 8 12 12.500 8 12.500 1.500 8 1.500 8z"/><circle cx="8" cy="8" r="1.800"/>',
  eyeoff: '<path d="M2 2l12 12M4 5.200C2.400 6.400 1.500 8 1.500 8S4 12.500 8 12.500c1 0 1.900-.3 2.700-.7M6.500 3.700c.5-.1 1-.2 1.500-.2 4 0 6.500 4.500 6.500 4.500s-.6 1.100-1.700 2.200"/>',
  lock: '<rect x="3.500" y="7" width="9" height="6.500"/><path d="M5.500 7V5a2.500 2.500 0 0 1 5 0v2"/>',
  unlock: '<rect x="3.500" y="7" width="9" height="6.500"/><path d="M5.500 7V5a2.500 2.500 0 0 1 4.800-1"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  trash: '<path d="M3 4.500h10M6 4.500V3h4v1.500M4.500 4.500l.5 8.500h6l.5-8.500"/>',
  undo: '<path d="M6 3L2.500 6.500 6 10M2.500 6.500H10a3.500 3.500 0 0 1 0 7H7"/>',
  redo: '<path d="M10 3l3.500 3.500L10 10M13.500 6.500H6a3.500 3.500 0 0 0 0 7h3"/>',
  grid: '<path d="M2.500 2.500h11v11h-11zM6.200 2.500v11M9.800 2.500v11M2.500 6.200h11M2.500 9.800h11"/>',
  snap: '<path d="M4 3v5a4 4 0 0 0 8 0V3M4 5.500h2.500M9.500 5.500H12"/>',
  outline: '<circle cx="6.500" cy="8" r="4"/><rect x="7.500" y="5" width="6" height="6"/>',
  star2: '<path d="M8 2l1.800 3.900 4.200.5-3.100 2.900.8 4.200L8 11.400l-3.700 2.100.8-4.200L2 6.400l4.200-.5z"/>',
  alL: '<path d="M2.500 2v12M4.500 4.500h8v2.500h-8zM4.500 9h5v2.500h-5z"/>', alC: '<path d="M8 2v12M4 4.500h8v2.500H4zM5.500 9h5v2.500h-5z"/>', alR: '<path d="M13.500 2v12M3.500 4.500h8v2.500h-8zM6.500 9h5v2.500h-5z"/>',
  alT: '<path d="M2 2.500h12M4.500 4.500h2.500v8H4.500zM9 4.500h2.500v5H9z"/>', alM: '<path d="M2 8h12M4.500 4h2.500v8H4.500zM9 5.500h2.500v5H9z"/>', alB: '<path d="M2 13.500h12M4.500 3.500h2.500v8H4.500zM9 6.500h2.500v5H9z"/>',
  txL: '<path d="M2.500 4h11M2.500 7h7M2.500 10h11M2.500 13h5"/>', txC: '<path d="M2.500 4h11M4.500 7h7M2.500 10h11M5.500 13h5"/>', txR: '<path d="M2.500 4h11M6.500 7h7M2.500 10h11M8.500 13h5"/>',
  layer: '<path d="M8 2.500L14 6 8 9.500 2 6zM2.500 9.500L8 12.700l5.500-3.200"/>',
  compass: '<path d="M8 3L4.500 13.500M8 3l3.500 10.500M5.500 10.500h5"/><circle cx="8" cy="3" r="1" fill="currentColor"/>',
  group: '<rect x="2.500" y="2.500" width="6" height="6"/><rect x="7.500" y="7.500" width="6" height="6"/>',
  front: '<rect x="2.500" y="2.500" width="7" height="7" fill="currentColor"/><rect x="6.500" y="6.500" width="7" height="7"/>',
  back: '<rect x="2.500" y="2.500" width="7" height="7"/><rect x="6.500" y="6.500" width="7" height="7" fill="currentColor"/>',
  up: '<path d="M8 13V3M4 7l4-4 4 4"/>', down: '<path d="M8 3v10M4 9l4 4 4-4"/>',
};
export const icon = (name, filled) => `<svg class="ic" viewBox="0 0 16 16" width="16" height="16" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.200" stroke-linejoin="round" stroke-linecap="round">${I[name] || ''}</svg>`;
