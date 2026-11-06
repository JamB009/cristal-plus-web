// Species names (index = dex number) from data/pokemon.json.

export async function loadNames(url = 'data/pokemon.json', fetchFn = globalThis.fetch) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return (await res.json()).names;
}

export function nameOf(names, species) {
  return species > 0 && species < names.length ? names[species] : `#${species}`;
}
