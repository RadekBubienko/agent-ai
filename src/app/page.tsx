import Hero from "@/components/Hero";
import Problem from "@/components/Problem";
import Signal from "@/components/Signal";
import Product from "@/components/Product";
import PathChoice from "@/components/PathChoice";

export default function Home() {
  return (
    <main className="flex flex-col text-gray-800">
      <Hero />

      <Problem />

      <Signal />

      <Product />

      <PathChoice />

    </main>
  );
}
