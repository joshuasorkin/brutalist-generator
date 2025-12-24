/**
 * Prompt vocabulary for brutalist architecture image generation.
 * All arrays of terms used to construct varied prompts.
 */

// Prefix applied to all building types in prompt construction
export const BUILDING_PREFIX = 'brutalist';

export const BUILDING_TYPES = [
  'civic center',
  'residential tower block',
  'museum of contemporary art',
  'monastery',
  'university library',
  'government headquarters',
  'concert hall',
  'railway station',
  'shopping complex',
  'hospital',
  'embassy',
  'apartment megastructure',
  'courthouse',
  'house of worship',
  'parliament building',
  'bus terminal',
  'sports arena',
  'power station',
  'research facility',
  'generic bureaucratic building',
  'observatory',
  'television broadcast center',
  'offshore platform',
  'naval outpost',
  'lighthouse complex',
];

export const LIGHTING_CONDITIONS = [
  'overcast sky',
  'foggy morning',
  'foggy night with distant lights',
  'golden hour sunlight',
  'harsh midday sun with deep shadows',
  'blue hour twilight',
  'dramatic storm clouds',
  'diffused light through haze',
  'pale winter light',
  'soft dawn light',
  'moonlit night scene',
  'backlit silhouette',
  'dappled light through clouds',
];

export const STYLISTIC_ELEMENTS = [
  'raw board-formed concrete texture',
  'monolithic geometric forms',
  'high contrast shadows',
  'film grain aesthetic',
  'weathered concrete patina',
  'repetitive window patterns',
  'cantilevered volumes',
  'exposed structural elements',
  'massive concrete pillars',
  'brutalist stairways and walkways',
  'geometric skylights',
  'deep recessed windows',
  'angular concrete balconies',
  'textured concrete panels',
  'imposing scale against human figures',
  'dramatic negative space',
  'fortress-like walls',
  'monumental entrance portal',
];

export const MASSING_ARCHETYPES = [
  'stacked slab megastructure',
  'stepped ziggurat massing',
  'cantilevered podium with tower',
  'monolithic block with carved voids',
  'terraced cascade of concrete plates',
  'ring atrium with heavy buttresses',
  'skybridge-linked volumes',
  'fortress-like perimeter block',
  'inverted pyramid form',
  'clustered tower composition',
];

export const CONCRETE_EXPRESSIONS = [
  'board-formed concrete with visible shuttering marks',
  'bush-hammered concrete finish',
  'ribbed concrete with tie-hole grid',
  'raw cast-in-place concrete with exposed aggregate',
  'weathered concrete with water staining',
  'textured precast concrete panels',
  'smooth poured concrete surfaces',
  'corrugated concrete cladding',
];

export const FENESTRATION_PATTERNS = [
  'deep punched window openings',
  'narrow vertical slot windows',
  'repetitive modular window grid',
  'recessed ribbon glazing under deep overhangs',
  'clerestory band windows',
  'concrete brise-soleil sun shading',
  'irregular asymmetric window placement',
  'massive floor-to-ceiling glazing bays',
];

export const CONTEXTS = [
  'in a stark civic plaza with broad steps',
  'on a coastal cliff with sea mist',
  'in a dense urban canyon between towers',
  'in an alpine valley under heavy clouds',
  'on the edge of a desert plateau',
  'beside a concrete riverwalk',
  'at the center of a university campus',
  'in an empty concrete landscape',
  'surrounded by overgrown vegetation',
  'in a sparse industrial zone',
  'overlooking a grey cityscape',
  'amid other brutalist structures',
];

export const CAMERA_ANGLES = [
  'low-angle heroic perspective',
  'dramatic worms-eye view looking up',
  'eye-level documentary framing',
  'aerial perspective from above',
  'three-quarter architectural view',
  'Dutch angle tilt',
  'distant establishing shot',
  'symmetrical centered composition',
  'tilt-shift miniature effect',
];

export const REGIONAL_STYLES = [
  'Soviet brutalist style',
  'British brutalist tradition',
  'Japanese metabolist influence',
  'Brazilian concrete modernism',
  'Yugoslav monument aesthetic',
  'Eastern European socialist architecture',
  'Scandinavian concrete minimalism',
  'American institutional brutalism',
  'French béton brut style',
];

export const CONDITIONS = [
  'pristine and newly constructed',
  'slightly weathered with age',
  'aged with concrete staining and patina',
  'partially overgrown with moss and lichen',
  'showing dignified signs of urban wear',
  'rain-soaked with wet reflections',
  'sun-bleached and dusty',
];

export const PHOTO_STYLES = [
  '35mm architectural photography',
  'medium format film photograph',
  '1970s documentary photography style',
  'contemporary fine art photography',
  'muted desaturated color palette',
  'high dynamic range photograph',
  'subtle Kodak Portra color rendering',
  'cool daylight color balance',
];

export const MUTATIONS = [
  'extreme fog with diffuse contrast',
  'light rain with wet surfaces',
  'heavy atmospheric haze',
  'dramatic long shadows',
  'minimalist empty foreground',
  'fresh snow dusting',
];

export const BASE_PROMPT_SUFFIX =
  'architectural photography, professional composition, ' +
  'no text, no watermarks, highly detailed, photorealistic';
