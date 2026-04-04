import Link from "next/link";

export default function Hero() {
  return (
    <section className="bg-[url(/img/hero-beach.jpg)] bg-cover min-h-[80vh] flex items-center justify-center bg-gradient-to-b from-white to-blue-50 px-6">
      <div className="max-w-4xl text-center space-y-6">
        <h1 className="text-4xl mt-10 md:text-5xl font-light leading-tight">
          Twoje ciało potrafi się regenerować.
          <br />
          Czasem potrzebuje tylko właściwego sygnału.
        </h1>

        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Istnieje technologia wykorzystująca światło ciała do wspierania
          naturalnych procesów regeneracyjnych.
        </p>

        <Link
          href="/jak-to-dziala"
          className="inline-block mt-20 px-8 py-4 rounded-xl bg-blue-600 text-white text-lg hover:bg-blue-700 transition"
        >
          Zobacz jak działa sygnał
        </Link>

        <p className="text-sm text-gray-500">krótkie wyjaśnienie (3 minuty)</p>
      </div>
    </section>
  );
}
