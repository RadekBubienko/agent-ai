export default function Product() {
  return (
    <section className="py-24 px-6 max-w-5xl mx-auto text-center space-y-8">

      <h2 className="text-3xl font-light">
        Fototerapia opracowana przez Davida Schmidta
      </h2>

      <p className="text-lg text-gray-700">
        LifeWave to technologia wykorzystująca sygnały fotoniczne
        zamiast tradycyjnej suplementacji.
      </p>

      <div className="grid md:grid-cols-3 gap-6 text-lg">

        <div className="p-6 border rounded-xl">
          bez substancji chemicznych
        </div>

        <div className="p-6 border rounded-xl">
          bez stymulantów
        </div>

        <div className="p-6 border rounded-xl">
          bez suplementów
        </div>

      </div>

    </section>
  )
}