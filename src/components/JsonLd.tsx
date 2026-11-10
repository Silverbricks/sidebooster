/** Structured data (schema.org JSON-LD). Only describe what the page visibly shows — never invent ratings, stock or prices. */
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
