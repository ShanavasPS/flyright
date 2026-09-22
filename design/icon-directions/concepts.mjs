// Review concepts only. Nothing in this folder is imported by the app.
// Palette: the FlyRight design-system artifact, synced 2026-09-20, main@02c3dbd.
export const colors = {
  ink: '#0c1b36', navy: '#16345f', navyDeep: '#0b1d3e',
  silver: '#a9b8ce', silverBright: '#e6edf8', porcelain: '#edf2f9',
  background: '#ffffff', dark: '#070f20', tint: '#1e6be0',
};

export const concepts = [
  {
    id: 'a', name: 'Contrail', category: 'The brand, distilled',
    summary: 'A single swept ribbon turns the check into a wing in ascent.',
    rationale: 'Keeps the idea that belongs to FlyRight: departure and reassurance in one continuous shape. A broad leading edge and tapered tail give it presence without surface effects.',
    tradeoff: 'More abstract than a literal aircraft. Best when recognition and a lasting identity matter most.',
    relationship: 'Evolution of the existing contrail-check identity.',
    recommendation: true,
    // One closed silhouette: narrow trailing tip, rounded check heel, swept wing.
    mark: '<path d="M24 53 L43 66 Q46 68 49 65 L77 30 Q79 27 81 29 L75 48 L85 52 Q86 53 84 54 L69 57 L52 76 Q47 82 41 76 Z"/>',
  },
  {
    id: 'b', name: 'Wingform', category: 'A signature of our own',
    summary: 'An italic F, built from the geometry of swept aircraft wings.',
    rationale: 'A compact monogram gives FlyRight a distinct signature beyond the familiar plane symbol. The open cuts and forward lean create movement with very little detail.',
    tradeoff: 'Reads as a brand before it reads as travel. Needs repeated use beside the FlyRight name.',
    relationship: 'Exploration: replaces the contrail check with an F monogram.',
    mark: '<path d="M29 76 L40 29 Q41 26 45 26 H81 L75 40 H52 L49 49 H70 L64 62 H46 L42 76 Z"/>',
  },
  {
    id: 'c', name: 'Orbit', category: 'Your world in motion',
    summary: 'One open orbit flows into an aircraft heading beyond the circle.',
    rationale: 'Connects the icon to the World experience and a lifetime of flights. An open, tapered orbit gives the aircraft a purposeful route without adding a globe grid.',
    tradeoff: 'The most descriptive option, but its orbit carries more detail at very small sizes.',
    relationship: 'Exploration: a route-led identity in the existing navy palette.',
    mark: '<path d="M71 35 C56 22 37 28 29 43 C18 65 36 84 56 80 C71 77 81 64 80 53 C73 69 60 76 47 71 C30 65 28 48 39 38 C47 30 59 30 67 37 Z"/><g transform="translate(72 32) rotate(42) scale(.48) translate(-50 -50)"><path d="M50 20 C53 20 55 24 55 29 V42 L78 57 V64 L55 56 V70 L63 77 V82 L50 78 L37 82 V77 L45 70 V56 L22 64 V57 L45 42 V29 C45 24 47 20 50 20 Z"/></g>',
  },
  {
    id: 'd', name: 'Departure', category: 'Quiet aviation confidence',
    summary: 'A custom aircraft silhouette with one crisp, diagonal attitude.',
    rationale: 'Immediately recognisable as a flight app. A larger, optically centred aircraft, drawn specifically for this icon, replaces the stock plane and surrounding decoration.',
    tradeoff: 'The quickest to understand, but the least distinctive in a category full of aircraft marks.',
    relationship: 'Exploration: retains the aircraft, removes the check motif.',
    mark: '<g transform="rotate(38 50 50)"><path d="M50 20 C53 20 55 24 55 29 V42 L78 57 V64 L55 56 V70 L63 77 V82 L50 78 L37 82 V77 L45 70 V56 L22 64 V57 L45 42 V29 C45 24 47 20 50 20 Z"/></g>',
  },
];

export function iconSvg(id, { mode = 'dark', mask = 'rounded', size = 256, label = true, uid = '' } = {}) {
  const concept = concepts.find(c => c.id === id);
  if (!concept) throw new Error(`Unknown concept: ${id}`);
  const fill = mode === 'dark' ? colors.silverBright : colors.ink;
  const background = mode === 'dark' ? colors.ink : mode === 'mono' ? colors.silverBright : colors.porcelain;
  const clipId = `clip-${id}-${mode}-${mask}-${uid}`;
  const shape = mask === 'circle'
    ? '<circle cx="50" cy="50" r="50"/>'
    : `<rect width="100" height="100" rx="${mask === 'square' ? 0 : 22}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" ${label ? `role="img" aria-label="FlyRight ${concept.name}, ${mode} concept"` : 'aria-hidden="true"'}><defs><clipPath id="${clipId}">${shape}</clipPath></defs><g clip-path="url(#${clipId})"><rect width="100" height="100" fill="${background}"/><g fill="${fill}">${concept.mark}</g></g></svg>`;
}
