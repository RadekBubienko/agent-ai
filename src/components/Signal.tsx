export default function Signal() {
  return (
    <section className="py-24 bg-gray-50 px-6">

      <div className="max-w-4xl mx-auto text-center space-y-10">

        <h2 className="text-3xl font-light">
          Technologia sygnału biologicznego
        </h2>

        <p className="text-lg text-gray-700">
          Zamiast dostarczać substancje —
          niektóre technologie wysyłają do organizmu sygnał,
          który uruchamia naturalne reakcje biologiczne.
        </p>

        <div className="grid md:grid-cols-3 gap-8">

          <div className="p-6 border rounded-xl">
            1 → ciało odbiera sygnał
          </div>

          <div className="p-6 border rounded-xl">
            2 → uruchamia reakcję
          </div>

          <div className="p-6 border rounded-xl">
            3 → organizm reaguje
          </div>

        </div>

      </div>

    </section>
  )
}