const test = require('node:test');
const assert = require('node:assert');
const {
  animationFrames,
  animationInitialStyle,
  transitionFrames
} = require('./effects.js');

test('slide and zoom transitions end at the normal slide position', () => {
  assert.deepStrictEqual(transitionFrames('slide-left'), [
    { opacity: 0, transform: 'translateX(10%)' },
    { opacity: 1, transform: 'translateX(0)' }
  ]);
  assert.deepStrictEqual(transitionFrames('zoom'), [
    { opacity: 0, transform: 'scale(0.92)' },
    { opacity: 1, transform: 'scale(1)' }
  ]);
});

test('object effects provide matching initial and animation states', () => {
  assert.deepStrictEqual(animationInitialStyle('slide-in-left'), {
    opacity: '0',
    transform: 'translateX(-80px)'
  });
  assert.deepStrictEqual(animationFrames('slide-in-left'), [
    { opacity: 0, transform: 'translateX(-80px)' },
    { opacity: 1, transform: 'translateX(0)' }
  ]);
  assert.deepStrictEqual(animationFrames('pulse'), [
    { opacity: 1, transform: 'scale(1)' },
    { opacity: 1, transform: 'scale(1.08)', offset: 0.5 },
    { opacity: 1, transform: 'scale(1)' }
  ]);
});
