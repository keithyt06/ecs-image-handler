import * as sharp from 'sharp';
import { BrightAction } from '../../../src/processor/image/bright';
import { mkctx } from './utils';

test('bright action validate', () => {
  const action = new BrightAction();
  const param1 = action.validate('bright,50'.split(','));
  expect(param1).toEqual({
    bright: 50,
  });
  expect(() => {
    action.validate('bright'.split(','));
  }).toThrowError(/Bright param error, e.g: bright,50/);

  expect(() => {
    action.validate('bright,23,32'.split(','));
  }).toThrowError(/Bright param error, e.g: bright,50/);

  expect(() => {
    action.validate('bright,xx'.split(','));
  }).toThrowError(/Bright must be between -100 and 100/);

  expect(() => {
    action.validate('bright,-101'.split(','));
  }).toThrowError(/Bright must be between -100 and 100/);

  expect(() => {
    action.validate('bright,101'.split(','));
  }).toThrowError(/Bright must be between -100 and 100/);

});


test('bright action', async () => {
  const ctx = await mkctx('example.jpg');
  const action = new BrightAction();
  await action.process(ctx, 'bright,50'.split(','));
  const { info } = await ctx.image.toBuffer({ resolveWithObject: true });

  expect(info.format).toBe(sharp.format.jpeg.id);
});