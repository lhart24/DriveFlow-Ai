const BASE64_CANDIDATE =
  /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{16,}={0,2}(?![A-Za-z0-9+/_=-])/g;

export function containsBase64EncodedText(value: string): boolean {
  for (const match of value.matchAll(BASE64_CANDIDATE)) {
    const encoded = match[0].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(encoded, 'base64');
    const canonical = decoded.toString('base64');

    if (
      canonical.replace(/=+$/, '') !== encoded.replace(/=+$/, '') ||
      (encoded.includes('=') && canonical !== encoded)
    ) {
      continue;
    }

    const text = decoded.toString('utf8');
    const characters = [...text];
    if (
      Buffer.from(text, 'utf8').equals(decoded) &&
      characters.length >= 8 &&
      characters.filter((character) => /[\p{L}\p{N}\p{P}\p{S}\p{Z}\t\r\n]/u.test(character)).length /
        characters.length >= 0.9
    ) {
      return true;
    }
  }

  return false;
}
