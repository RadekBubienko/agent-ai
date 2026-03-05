export default function Hero() {
  return (
    <section className="min-h-screen flex items-center justify-center bg-black text-white px-6">

      <div className="max-w-3xl text-center space-y-6">

        <h1 className="text-4xl md:text-5xl font-light leading-tight">
          A gdyby Twoje ciało potrzebowało nie kolejnego suplementu…
          <br />
          tylko właściwego sygnału?
        </h1>

        <p className="text-lg text-gray-300">
          Organizm potrafi się regenerować.
          Czasem potrzebuje tylko właściwej informacji.
        </p>

        <a
          href="#problem"
          className="inline-block mt-6 bg-white text-black px-8 py-4 rounded-lg font-medium hover:opacity-90"
        >
          Sprawdź jak to działa
        </a>

      </div>
    </section>
  )
}