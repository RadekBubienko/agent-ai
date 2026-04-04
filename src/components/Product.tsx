export default function Product() {
  return (
    <section className="mx-auto max-w-5xl space-y-8 bg-white px-6 py-24 text-center">
      <h2 className="text-3xl font-light">
        Fototerapia opracowana przez Davida Schmidta
      </h2>

      <p className="text-lg text-gray-700">
        LifeWave to technologia wykorzystująca sygnały fotoniczne zamiast
        tradycyjnej suplementacji.
      </p>

      <div className="grid gap-6 text-lg md:grid-cols-3">
        <div className="rounded-xl border p-6">bez substancji chemicznych</div>
        <div className="rounded-xl border p-6">bez stymulantów</div>
        <div className="rounded-xl border p-6">bez suplementów</div>
      </div>
    </section>
  );
}
