import { describe, expect, it } from 'vitest';
import { describePointEntry, feeFor, quoteWithPoints } from './points';

const settings = { feePercentBps: 500, feeFixedNgwee: 0 };

describe('feeFor', () => {
  it('matches compute_fee, rounding half up', () => {
    expect(feeFor(5000, settings)).toBe(250);
    expect(feeFor(1010, settings)).toBe(51); // 50.5
    expect(feeFor(1009, settings)).toBe(50); // 50.45
    expect(feeFor(0, settings)).toBe(0);
    expect(feeFor(1000, { feePercentBps: 0, feeFixedNgwee: 300 })).toBe(300);
  });
});

describe('quoteWithPoints', () => {
  it('takes what the points are worth off the price and fee', () => {
    expect(quoteWithPoints({ subtotalNgwee: 5000, balance: 100, pointValueNgwee: 15, settings })).toEqual({
      fee: 250,
      due: 5250,
      points: 100,
      discount: 1500,
      total: 3750,
    });
  });

  it('never uses more points than the order needs', () => {
    const q = quoteWithPoints({ subtotalNgwee: 5000, balance: 10000, pointValueNgwee: 15, settings });
    expect(q.points).toBe(350);
    expect(q.discount).toBe(5250);
    expect(q.total).toBe(0);
  });

  it('uses nothing on a free pass or with no points', () => {
    expect(quoteWithPoints({ subtotalNgwee: 0, balance: 100, pointValueNgwee: 15, settings }).points).toBe(0);
    expect(quoteWithPoints({ subtotalNgwee: 5000, balance: 0, pointValueNgwee: 15, settings }).total).toBe(5250);
  });
});

describe('describePointEntry', () => {
  it('names the event when there is one', () => {
    expect(describePointEntry({ kind: 'attended', eventName: 'Rooftop' })).toBe('Checked in at Rooftop');
    expect(describePointEntry({ kind: 'pass_discount', eventName: null })).toBe('Spent on a pass');
  });
});
