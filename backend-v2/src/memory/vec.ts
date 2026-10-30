// pgvector's text form. Parameters go up untyped, and PostgreSQL infers
// halfvec or vector from the column or operator, so one format serves both.
export function toVectorLiteral(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? Number(v.toFixed(6)) : 0)).join(',')}]`;
}
