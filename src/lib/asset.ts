/** Prefixes a public asset path with the deployment base path (GitHub Pages serves under /<repo>). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const asset = (p: string) => `${BASE_PATH}${p.startsWith("/") ? p : `/${p}`}`;
