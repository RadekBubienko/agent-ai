import Link from "next/link";

export default function Signal() {
  return (
    <section className="py-20 px-6 bg-gray-50">
      <div className="max-w-3xl mx-auto text-center space-y-6">
        <h2 className="text-3xl font-light">
          A gdyby organizmowi przypomnieć jak działać?
        </h2>

        <p className="text-gray-600">
          Zamiast dostarczać kolejne substancje z zewnątrz, można wykorzystać
          sygnał świetlny, który wspiera naturalne procesy biologiczne.
        </p>

        <p className="text-gray-600">
          Technologia ta opiera się na zjawisku
          <strong> fotobiomodulacji</strong>.
        </p>

        <Link
          href="/jak-to-dziala"
          className="ui-pressable mt-6 inline-block rounded-xl bg-blue-600 px-8 py-4 text-lg text-white transition hover:bg-blue-700"
        >
          Obejrzyj krótkie wideo
        </Link>
      </div>
    </section>
  );
}
