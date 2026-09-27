export default async function Home() {
  const res = await fetch(`${process.env.API_URL}/products`, { cache: "no-store" });
  const products = await res.json();
  return <main>{products.map((p: { id: string; name: string }) => <a key={p.id} href={`/p/${p.id}`}>{p.name}</a>)}</main>;
}
