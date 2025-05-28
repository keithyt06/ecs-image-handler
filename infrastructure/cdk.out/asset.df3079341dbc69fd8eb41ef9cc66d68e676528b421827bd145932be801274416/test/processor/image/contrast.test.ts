import * as sharp from 'sharp';
import { ContrastAction } from '../../../src/processor/image/contrast';
import { mkctx } from './utils';

test('quality action validate', () => {
  const action = new ContrastAction();
  const param1 = action.validate('contrast,-50'.split(','));
  expect(param1).toEqual({
    contrast: -50,
  });

  expect(() => {
    action.validate('contrast'.split(','));
  }).toThrowError(/Contrast param error, e.g: contrast,-50/);

  expect(() => {
    action.validate('contrast,xx,22'.split(','));
  }).toThrowError(/Contrast param error, e.g: contrast,-50/);

  expect(() => {
    action.validate('contrast,abc'.split(','));
  }).toThrowError(/Contrast must be between -100 and 100/);


  expect(() => {
    action.validate('contrast,101'.split(','));
  }).toThrowError(/Contrast must be between -100 and 100/);

  expect(() => {
    action.validate('contrast,-101'.split(','));
  }).toThrowError(/Contrast must be between -100 and 100/);


});


test('quality action', async () => {
  const ctx = await mkctx('example.jpg');
  const action = new ContrastAction();
  await action.process(ctx, 'contrast,-50'.split(','));
  const { info } = await ctx.image.toBuffer({ resolveWithObject: true });

  expect(info.format).toBe(sharp.format.jpeg.id);
});