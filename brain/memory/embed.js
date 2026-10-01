// Constants, not configuration: the schema's vector(3072) columns and every
// imported row depend on this exact model and width, so changing either is a
// migration plus a re-embed, never an env edit.
export const EMBED_MODEL = 'text-embedding-3-large';
export const EMBED_DIMS = 3072;

export function createEmbedder(client) {
  return async function embed(text, signal) {
    // Spoken utterances are short; the cap only guards against pathology.
    const input = String(text || '').slice(0, 500) || '.';
    const response = await client.embeddings.create(
      {
        model: EMBED_MODEL,
        input,
        // Asked for explicitly: left alone the SDK requests base64 and
        // decodes it itself, which mangles a test stub's plain arrays.
        encoding_format: 'float',
        dimensions: EMBED_DIMS,
      },
      signal ? { signal } : undefined,
    );
    const vector = response.data?.[0]?.embedding;
    // Without this the first symptom would be "different vector dimensions"
    // thrown from inside a query, naming neither the model nor the cause.
    if (!Array.isArray(vector) || vector.length !== EMBED_DIMS) {
      throw new Error(`${EMBED_MODEL} returned ${vector?.length ?? 'no'} dimensions, expected ${EMBED_DIMS}`);
    }
    return vector;
  };
}
