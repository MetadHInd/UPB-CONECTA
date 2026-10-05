import type { ClockPort } from '../../../../domain/ports/out/ClockPort.js';

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}

/** Reloj que las pruebas adelantan para cruzar el periodo de expiracion. */
export class ManualClock implements ClockPort {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}
