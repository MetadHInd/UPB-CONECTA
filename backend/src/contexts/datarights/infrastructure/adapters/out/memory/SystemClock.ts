import type { ClockPort } from '../../../../domain/ports/out/ClockPort.js';

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
