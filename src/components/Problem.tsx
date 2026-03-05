export default function Problem() {
  return (
    <section 
    id="problem"
    className="py-24 px-6 max-w-6xl mx-auto text-center">

      <h2 className="text-3xl font-light mb-12">
        Większość rozwiązań zdrowotnych działa na zasadzie „dodawania”
      </h2>

      <div className="grid md:grid-cols-3 gap-8 text-lg">

        <div className="p-6 border rounded-xl">
          więcej suplementów
        </div>

        <div className="p-6 border rounded-xl">
          więcej tabletek
        </div>

        <div className="p-6 border rounded-xl">
          więcej składników
        </div>

      </div>

      <p className="mt-12 text-xl max-w-2xl mx-auto">
        A co jeśli problem nie leży w braku składników…
        tylko w komunikacji organizmu?
      </p>

    </section>
  )
}