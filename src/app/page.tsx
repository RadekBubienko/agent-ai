import Hero from "@/components/Hero";
import Problem from "@/components/Problem";
import SignalTeaser from "@/components/SignalTeaser";

export default function Home() {
  return (
    <main className="flex flex-col text-gray-800">
      <Hero />
      <Problem />
      <SignalTeaser />
    </main>
  );
}