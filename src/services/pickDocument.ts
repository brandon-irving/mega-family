/** Load on demand so older development builds can still use Camera and Photos. */
export async function pickDocument() {
  const picker = await import('expo-document-picker');
  return picker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, base64: false });
}
