import SignalExplanation from "@/components/SignalExplanation";
import Product from "@/components/Product";
import PathChoice from "@/components/PathChoice";

export default function HowItWorks() {
  return (
    <main className="flex flex-col text-gray-800">

      <SignalExplanation />

      <Product />

      <div id="wybor">
        <PathChoice />
      </div>

    </main>
  );
}