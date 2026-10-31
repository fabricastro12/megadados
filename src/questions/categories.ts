/** The six supported categories. Their slugs are stable across imports and environments. */
export const CATEGORIES = [
  { slug: 'arte-literatura', name: 'Arte y literatura', color: '#9B5CFF', icon: 'palette', sortOrder: 1, isActive: true },
  { slug: 'deportes', name: 'Deportes', color: '#FFB31A', icon: 'ball', sortOrder: 2, isActive: true },
  { slug: 'historia', name: 'Historia', color: '#FF6A3D', icon: 'history', sortOrder: 3, isActive: true },
  { slug: 'geografia', name: 'Geografía', color: '#2E8BFF', icon: 'globe', sortOrder: 4, isActive: true },
  { slug: 'ciencia', name: 'Ciencia', color: '#2CC56F', icon: 'atom', sortOrder: 5, isActive: true },
  { slug: 'entretenimiento', name: 'Entretenimiento', color: '#FF5DAA', icon: 'film', sortOrder: 6, isActive: true },
] as const;

export const CATEGORY_SLUGS = ['arte-literatura', 'deportes', 'historia', 'geografia', 'ciencia', 'entretenimiento'] as const;
