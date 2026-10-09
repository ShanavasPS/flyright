import { fitWithin, MAX_PHOTO_EDGE, photoFormat } from './photo-normalize';

jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));

describe('fitWithin', () => {
  it('leaves a picture that already fits alone', () => {
    expect(fitWithin(4032, 3024)).toBeNull();
    expect(fitWithin(MAX_PHOTO_EDGE, 100)).toBeNull();
  });

  it('scales a 48 MP photo to the long edge, keeping its shape', () => {
    expect(fitWithin(8064, 6048)).toEqual({ width: 4096, height: 3072 });
    expect(fitWithin(6048, 8064)).toEqual({ width: 3072, height: 4096 });
  });

  it('scales a panorama by its long side', () => {
    expect(fitWithin(16000, 3000)).toEqual({ width: 4096, height: 768 });
  });

  it('ignores a size it cannot know', () => {
    expect(fitWithin(0, 100)).toBeNull();
    expect(fitWithin(NaN, NaN)).toBeNull();
  });
});

describe('photoFormat', () => {
  it('reads the bytes, not the name', () => {
    expect(photoFormat(new Uint8Array([255, 216, 255, 225]))).toBe('jpeg');
    expect(photoFormat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('png');
    expect(photoFormat(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99]))).toBe('other');
    expect(photoFormat(new Uint8Array())).toBe('other');
  });
});
