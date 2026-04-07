import type { ParsedAmazName } from '../types';

export function parseAmazName(name: string | null): ParsedAmazName {
  const empty: ParsedAmazName = {
    fullName: name || '',
    metalType: null,
    metalAlloy: null,
    length: null,
    width: null,
    weight: null,
    subType: null,
  };
  if (!name) return empty;

  const metalMatch = name.match(/(Gelbgold|Weißgold|Weissgold|Rosegold|Roségold|Silber|Platin)\s*([\d/\s]+\s*K(?:arat)?)?/i);
  const lengthMatch = name.match(/(?:Länge|Lange)\s*([\d,.]+)\s*(?:cm|mm)/i);
  const widthMatch = name.match(/Breite\s*([\d,.]+)\s*(?:mm|cm)/i);
  const weightMatch = name.match(/Gewicht\s*(?:ca\.?\s*)?([\d,.]+)\s*g/i);
  const alloyMatch = name.match(/(\d+)\s*(?:\/\s*\d+\s*)?(?:K|Karat)/i);

  const parts = name.split(',').map((p) => p.trim());
  const subType = parts.length > 1 ? parts[1] : null;

  return {
    fullName: name,
    metalType: metalMatch ? metalMatch[1] : null,
    metalAlloy: alloyMatch ? alloyMatch[0].trim() : null,
    length: lengthMatch ? lengthMatch[1] : null,
    width: widthMatch ? widthMatch[1] : null,
    weight: weightMatch ? weightMatch[1] : null,
    subType,
  };
}
