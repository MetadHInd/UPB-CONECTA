import { describe, expect, it } from 'vitest';
import { CampusFailureKind } from '../../src/contexts/campus/application/CampusResults.js';
import { FilterPointsOfInterest } from '../../src/contexts/campus/application/FilterPointsOfInterest.js';
import { GetCampusMap } from '../../src/contexts/campus/application/GetCampusMap.js';
import { SelectBuildingLevel } from '../../src/contexts/campus/application/SelectBuildingLevel.js';
import type { CampusCatalog } from '../../src/contexts/campus/domain/entities/CampusCatalog.js';
import { InvalidCampusCatalogError, assertValidCampusCatalog } from '../../src/contexts/campus/domain/services/CampusCatalogValidation.js';
import { ALL_POI_CATEGORIES, PoiCategory } from '../../src/contexts/campus/domain/value-objects/PoiCategory.js';
import { InMemoryCampusCatalogRepository } from '../../src/contexts/campus/infrastructure/adapters/out/memory/InMemoryCampusCatalogRepository.js';
import { InMemoryMapProvider } from '../../src/contexts/campus/infrastructure/adapters/out/memory/InMemoryMapProvider.js';
import { loadCampusCatalog } from '../../src/contexts/campus/infrastructure/config/JsonCampusCatalogLoader.js';

const seed = loadCampusCatalog();

function build(catalog: CampusCatalog = seed, mapProvider = new InMemoryMapProvider()) {
  const repo = new InMemoryCampusCatalogRepository([catalog]);
  return {
    mapProvider,
    getMap: new GetCampusMap({ catalog: repo, mapProvider }),
    filter: new FilterPointsOfInterest({ catalog: repo, mapProvider }),
    selectLevel: new SelectBuildingLevel({ catalog: repo, mapProvider })
  };
}

function must<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result as Extract<T, { ok: true }>;
}

describe('HU-25 — mapa interactivo del campus (RF-37, RF-41, RNF-06, RNF-42)', () => {
  describe('criterio 1 — el campus se presenta con bloques, edificios y niveles', () => {
    it('devuelve el campus de Bucaramanga con su estructura completa', async () => {
      const result = must(await build().getMap.execute({ campusId: 'bucaramanga' }));

      expect(result.name).toContain('Bucaramanga');
      expect(result.blocks.length).toBeGreaterThan(1);
      const buildings = result.blocks.flatMap((b) => b.buildings);
      expect(buildings.length).toBeGreaterThan(1);
      expect(buildings.every((b) => b.levels.length >= 1)).toBe(true);
      expect(result.pointsOfInterest.length).toBe(seed.pointsOfInterest.length);
    });

    it('pide al proveedor dibujar el campus con sus marcadores', async () => {
      const h = build();
      await h.getMap.execute({ campusId: 'bucaramanga' });
      expect(h.mapProvider.rendered).toHaveLength(1);
      expect(h.mapProvider.rendered[0]).toMatchObject({ campusId: 'bucaramanga', focus: null });
    });

    it('un campus inexistente se rechaza sin llamar al proveedor', async () => {
      const h = build();
      const result = await h.getMap.execute({ campusId: 'medellin' });
      expect(result).toMatchObject({ ok: false, error: CampusFailureKind.CAMPUS_NOT_FOUND });
      expect(h.mapProvider.rendered).toHaveLength(0);
    });

    it('el catalogo semilla cubre las siete categorias pedidas', () => {
      const present = new Set(seed.pointsOfInterest.map((p) => p.category));
      expect([...present].sort()).toEqual([...ALL_POI_CATEGORIES].sort());
    });
  });

  describe('criterio 3 — mostrar u ocultar categorias de puntos de interes', () => {
    it.each(ALL_POI_CATEGORIES)('mostrar solo %s deja unicamente esa categoria', async (category) => {
      const result = must(await build().filter.execute({ campusId: 'bucaramanga', visibleCategories: [category] }));
      expect(result.pointsOfInterest.length).toBeGreaterThan(0);
      expect(result.pointsOfInterest.every((p) => p.category === category)).toBe(true);
    });

    it('ocultar una categoria la quita y conserva las demas', async () => {
      const visible = ALL_POI_CATEGORIES.filter((c) => c !== PoiCategory.PARKING);
      const result = must(await build().filter.execute({ campusId: 'bucaramanga', visibleCategories: visible }));
      expect(result.pointsOfInterest.some((p) => p.category === PoiCategory.PARKING)).toBe(false);
      expect(result.pointsOfInterest.some((p) => p.category === PoiCategory.CAFETERIA)).toBe(true);
    });

    it('todo oculto no deja ningun marcador', async () => {
      const h = build();
      const result = must(await h.filter.execute({ campusId: 'bucaramanga', visibleCategories: [] }));
      expect(result.pointsOfInterest).toEqual([]);
      expect(h.mapProvider.rendered.at(-1)?.markers).toEqual([]);
    });

    it('rechaza una categoria desconocida', async () => {
      const result = await build().filter.execute({ campusId: 'bucaramanga', visibleCategories: ['cajero'] });
      expect(result).toMatchObject({ ok: false, error: CampusFailureKind.UNKNOWN_CATEGORY });
    });

    it('el modulo tambien acepta categorias visibles al cargar', async () => {
      const result = must(await build().getMap.execute({ campusId: 'bucaramanga', visibleCategories: ['biblioteca'] }));
      expect(result.pointsOfInterest.map((p) => p.category)).toEqual(['biblioteca']);
      expect(result.visibleCategories).toEqual(['biblioteca']);
      expect(result.categories).toEqual(ALL_POI_CATEGORIES);
      expect(await build().getMap.execute({ campusId: 'bucaramanga', visibleCategories: ['x'] })).toMatchObject({ ok: false });
    });

    it('campus inexistente al filtrar', async () => {
      expect(await build().filter.execute({ campusId: 'x', visibleCategories: [] })).toMatchObject({ ok: false, error: CampusFailureKind.CAMPUS_NOT_FOUND });
    });
  });

  describe('criterio 4 — alternar entre niveles de un edificio', () => {
    it('un edificio con varios niveles permite pasar de uno a otro y cada nivel muestra sus puntos', async () => {
      const h = build();
      const nivel0 = must(await h.selectLevel.execute({ campusId: 'bucaramanga', buildingId: 'edificio-aulas-a', levelId: 'n0' }));
      const nivel2 = must(await h.selectLevel.execute({ campusId: 'bucaramanga', buildingId: 'edificio-aulas-a', levelId: 'n2' }));

      expect(nivel0.canSwitchLevel).toBe(true);
      expect(nivel0.levels.map((l) => l.id)).toEqual(['n0', 'n1', 'n2', 'n3']);
      expect(nivel0.pointsOfInterest.length).toBeGreaterThan(0);
      expect(nivel0.pointsOfInterest.every((p) => p.levelId === 'n0')).toBe(true);
      expect(nivel2.pointsOfInterest.every((p) => p.levelId === 'n2')).toBe(true);
      expect(nivel0.pointsOfInterest.map((p) => p.id)).not.toEqual(nivel2.pointsOfInterest.map((p) => p.id));
      expect(h.mapProvider.rendered.at(-1)?.focus).toEqual({ buildingId: 'edificio-aulas-a', levelId: 'n2' });
    });

    it('sin nivel indicado abre el mas bajo y respeta las categorias visibles', async () => {
      const result = must(
        await build().selectLevel.execute({ campusId: 'bucaramanga', buildingId: 'edificio-aulas-a', visibleCategories: ['servicio-sanitario'] })
      );
      expect(result.level.id).toBe('n0');
      expect(result.pointsOfInterest.every((p) => p.category === PoiCategory.RESTROOM)).toBe(true);
    });

    it('un edificio de un solo nivel no ofrece alternar', async () => {
      const result = must(await build().selectLevel.execute({ campusId: 'bucaramanga', buildingId: 'edificio-cafeteria' }));
      expect(result.canSwitchLevel).toBe(false);
    });

    it('rechaza campus, edificio, nivel o categoria inexistentes', async () => {
      const h = build();
      expect(await h.selectLevel.execute({ campusId: 'x', buildingId: 'a' })).toMatchObject({ error: CampusFailureKind.CAMPUS_NOT_FOUND });
      expect(await h.selectLevel.execute({ campusId: 'bucaramanga', buildingId: 'a' })).toMatchObject({ error: CampusFailureKind.BUILDING_NOT_FOUND });
      expect(await h.selectLevel.execute({ campusId: 'bucaramanga', buildingId: 'edificio-aulas-a', levelId: 'n9' })).toMatchObject({
        error: CampusFailureKind.LEVEL_NOT_FOUND
      });
      expect(await h.selectLevel.execute({ campusId: 'bucaramanga', buildingId: 'edificio-aulas-a', visibleCategories: ['x'] })).toMatchObject({
        error: CampusFailureKind.UNKNOWN_CATEGORY
      });
    });
  });

  describe('criterio 5 — sustituir el proveedor de cartografia no toca el catalogo ni el dominio', () => {
    it('con dos proveedores distintos el catalogo y la respuesta son identicos', async () => {
      const a = build(seed, new InMemoryMapProvider('proveedor-a'));
      const b = build(seed, new InMemoryMapProvider('proveedor-b'));
      const before = JSON.stringify(seed);

      const resultA = await a.getMap.execute({ campusId: 'bucaramanga' });
      const resultB = await b.getMap.execute({ campusId: 'bucaramanga' });

      expect(resultA).toEqual(resultB);
      expect(JSON.stringify(seed)).toBe(before);
      expect(a.mapProvider.rendered).toEqual(b.mapProvider.rendered);
    });

    it('el catalogo no contiene nada propio de un proveedor: solo el vocabulario del dominio', () => {
      const text = JSON.stringify(seed).toLowerCase();
      for (const vendor of ['google', 'mapbox', 'osm', 'openstreetmap', 'tile', 'style', 'layer']) expect(text).not.toContain(vendor);
    });

    it('un proveedor solo recibe tipos del dominio y no puede alterar el catalogo', async () => {
      const mutating = new InMemoryMapProvider('mutante');
      const h = build(seed, mutating);
      await h.getMap.execute({ campusId: 'bucaramanga' });
      const scene = mutating.rendered[0]!;
      expect(scene.markers.every((m) => seed.pointsOfInterest.includes(m))).toBe(true);
    });
  });

  describe('integridad del catalogo', () => {
    const base = (): { -readonly [K in keyof CampusCatalog]: CampusCatalog[K] } => structuredClone(seed) as never;

    it('el catalogo semilla es valido', () => {
      expect(assertValidCampusCatalog(seed)).toBe(seed);
    });

    it('rechaza referencias rotas, duplicados y coordenadas invalidas, todo junto', () => {
      const bad = base();
      const poi = bad.pointsOfInterest as unknown as Record<string, unknown>[];
      poi[0] = { ...poi[0], buildingId: 'no-existe' };
      poi[1] = { ...poi[1], levelId: 'n99' };
      poi[2] = { ...poi[2], id: poi[3]!['id'] };
      poi[3] = { ...poi[3], coordinates: { latitude: 200, longitude: 0 } };
      poi[4] = { ...poi[4], category: 'cajero' };
      poi[10] = { ...poi[10], levelId: 'n0' };
      (bad as { center: unknown }).center = { latitude: Number.NaN, longitude: 0 };
      const blocks = bad.blocks as unknown as { id: string; buildings: { levels: unknown[]; coordinates: unknown }[] }[];
      blocks[1] = { ...blocks[1]!, id: blocks[0]!.id };
      blocks[0]!.buildings[0]!.coordinates = { latitude: 0, longitude: 500 };
      blocks[2]!.buildings[0] = { ...blocks[2]!.buildings[0]!, levels: [] };

      let error: unknown;
      try {
        assertValidCampusCatalog(bad);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(InvalidCampusCatalogError);
      expect((error as InvalidCampusCatalogError).issues.length).toBeGreaterThanOrEqual(8);
    });

    it('un punto al aire libre no puede llevar nivel; el repositorio no acepta catalogos invalidos', () => {
      const bad = base();
      const poi = bad.pointsOfInterest as unknown as Record<string, unknown>[];
      poi[10] = { ...poi[10], levelId: 'n0' };
      expect(() => new InMemoryCampusCatalogRepository([bad])).toThrow(InvalidCampusCatalogError);
    });
  });
});
