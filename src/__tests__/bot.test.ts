import { makeBot } from '../bot';

describe('bot', () => {
  it('exports makeBot', () => {
    const b = makeBot();
    expect(b).toBeDefined();
  });
});
