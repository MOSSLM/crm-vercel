import { canonicalizeUrl } from './displayHelpers';

describe('canonicalizeUrl', () => {
  it('normalizes protocol and www', () => {
    expect(canonicalizeUrl('http://WWW.Example.com/')).toBe('https://example.com');
  });

  it('removes query, hash and trailing slash', () => {
    expect(canonicalizeUrl('https://example.com/path/?a=1#section')).toBe('https://example.com/path');
  });
});
