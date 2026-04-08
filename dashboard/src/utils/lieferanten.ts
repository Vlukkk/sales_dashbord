import type { CatalogData, Product } from '../types';

const LIEFERANT_ALIASES: Record<string, string> = {
  'top gold': 'Top Gold',
};

function normalizedLieferantKey(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function normalizeLieferantName(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return null;
  }

  return LIEFERANT_ALIASES[normalizedLieferantKey(trimmed)] ?? trimmed;
}

function normalizeProduct(product: Product): Product {
  return {
    ...product,
    lieferant: normalizeLieferantName(product.lieferant),
  };
}

export function normalizeCatalogData(catalog: CatalogData): CatalogData {
  const products = Object.fromEntries(
    Object.entries(catalog.products).map(([sku, product]) => [sku, normalizeProduct(product)]),
  );
  const lieferanten = [...new Set(
    Object.values(products)
      .map((product) => product.lieferant)
      .filter((value): value is string => Boolean(value)),
  )].sort((left, right) => left.localeCompare(right));

  return {
    ...catalog,
    products,
    lieferanten,
  };
}
