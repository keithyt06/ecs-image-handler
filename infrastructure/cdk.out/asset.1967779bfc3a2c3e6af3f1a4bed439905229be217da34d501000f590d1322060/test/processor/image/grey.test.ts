import * as sharp from 'sharp';
import { GreyAction } from '../../../src/processor/image/grey';
import { mkctx } from './utils';

test('quality action validate', () => {
  const action = new GreyAction();
  const param1 = action.validate('grey,1'.split(','));
  expect(param1).toEqual({
    grey: true,
  });

  expect(() => {
    action.validate('grey'.split(','));
  }).toThrowError(/Grey param error, e.g: grey,1/);

  expect(() => {
    action.validate('grey,xx,22'.split(','));
  }).toThrowError(/Grey param error, e.g: grey,1/);

  expect(() => {
    action.validate('grey,ab'.split(','));
  }).toThrowError(/Grey must be 0 or 1/);

  expect(() => {
    action.validate('grey,-1'.split(','));
  }).toThrowError(/Grey must be 0 or 1/);


});

test('quality action', async () => {
  const ctx = await mkctx('example.jpg');
  const action = new GreyAction();
  await action.process(ctx, 'grey,1'.split(','));
  const { info } = await ctx.image.toBuffer({ resolveWithObject: true });

  expect(info.format).toBe(sharp.format.jpeg.id);
});


test('quality action', async () => {
  const ctx = await mkctx('example.jpg');
  const action = new GreyAction();
  await action.process(ctx, 'grey,0'.split(','));
  const { info } = await ctx.image.toBuffer({ resolveWithObject: true });

  expect(info.format).toBe(sharp.format.jpeg.id);
});