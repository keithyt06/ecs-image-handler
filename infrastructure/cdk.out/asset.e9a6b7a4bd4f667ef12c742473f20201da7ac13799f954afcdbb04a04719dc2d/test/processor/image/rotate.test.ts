import * as sharp from 'sharp';
import { RotateAction } from '../../../src/processor/image/rotate';
import { mkctx } from './utils';

test('quality action validate', () => {
  const action = new RotateAction();
  const param1 = action.validate('rotate,90'.split(','));
  expect(param1).toEqual({
    degree: 90,
  });

  expect(() => {
    action.validate('rotate'.split(','));
  }).toThrowError(/Rotate param error, e.g: rotate,90/);


  expect(() => {
    action.validate('rotate,33,abc'.split(','));
  }).toThrowError(/Rotate param error, e.g: rotate,90/);

  expect(() => {
    action.validate('rotate,abc'.split(','));
  }).toThrowError(/Rotate must be between 0 and 360/);
  expect(() => {
    action.validate('rotate,361'.split(','));
  }).toThrowError(/Rotate must be between 0 and 360/);
  expect(() => {
    action.validate('rotate,-1'.split(','));
  }).toThrowError(/Rotate must be between 0 and 360/);

});


test('quality action', async () => {
  const ctx = await mkctx('example.jpg');
  const action = new RotateAction();
  await action.process(ctx, 'interlace,1'.split(','));
  const { info } = await ctx.image.toBuffer({ resolveWithObject: true });
  expect(info.format).toBe(sharp.format.jpeg.id);
});
