import type { MapProviderPort, MapScene } from '../../../../domain/ports/out/MapProviderPort.js';

/** Doble en memoria del proveedor de cartografia: registra las escenas que se le piden. */
export class InMemoryMapProvider implements MapProviderPort {
  readonly rendered: MapScene[] = [];

  constructor(readonly providerName: string = 'in-memory') {}

  async render(scene: MapScene): Promise<void> {
    this.rendered.push(scene);
  }
}
