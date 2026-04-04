import Link from "next/link";

export default function SignalTeaser() {
  return (
    <section className="py-20 px-6 bg-gray-50">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <h2 className="text-3xl md:text-4xl font-light leading-snug">
          A gdyby organizmowi przypomnieć,
          <br />
          jak się regenerować?
        </h2>

        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Zamiast dostarczać kolejne substancje z zewnątrz, można wykorzystać
          naturalny sygnał świetlny, który wspiera procesy biologiczne
          organizmu.
        </p>

        <p className="text-gray-600 max-w-xl mx-auto">
          Technologia ta opiera się na zjawisku
          <span className="font-medium"> fotobiomodulacji </span>
          - reakcji organizmu na określone długości fal światła.
        </p>

        <Link
          href="/jak-to-dziala"
          className="inline-block mt-6 px-8 py-4 rounded-xl bg-blue-600 text-white text-lg hover:bg-blue-700 transition"
        >
          Zobacz jak działa ta technologia
        </Link>

        <p className="text-sm text-gray-500">
          krótkie wyjaśnienie (około 3 minut)
        </p>
      </div>
    </section>
  );
}
