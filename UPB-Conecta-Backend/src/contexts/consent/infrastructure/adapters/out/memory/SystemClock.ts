import type { ClockPort } from '../../../../domain/ports/out/ClockPort.js';

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}

/** Reloj determinista para pruebas. */
export class FixedClock implements ClockPort {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
