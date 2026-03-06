import VideoPlayer from "@/components/VideoPlayer";
export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};
export default function VideoPage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      <div className="max-w-3xl w-full text-center space-y-8">
        <h1 className="text-3xl font-light">Pierwsze wprowadzenie</h1>
        <p className="text-gray-300">
          Dziękujemy za zapis. Wysłaliśmy również materiały na Twój email.
        </p>
        <p className="text-gray-300">
          Obejrzyj krótkie wyjaśnienie technologii, o której właśnie
          przeczytałeś.
        </p>

        <VideoPlayer />

        <p className="text-sm text-gray-500">🔊 Kliknij aby włączyć dźwięk</p>
        <p className="text-sm text-gray-500">
          W międzyczasie sprawdź również wiadomość, którą wysłaliśmy na Twój
          email.
        </p>
        <section className="grid md:grid-cols-3 gap-8 mt-12 mb-12 text-left">
          <div className="p-6 border border-gray-700 rounded-xl">
            <h3 className="text-lg font-semibold mb-2">Dlaczego to działa</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Organizm reaguje nie tylko na substancje, ale również na sygnały.
              Niektóre technologie wykorzystują światło i bodźce fizyczne, aby
              aktywować naturalne procesy biologiczne.
            </p>
          </div>

          <div className="p-6 border border-gray-700 rounded-xl">
            <h3 className="text-lg font-semibold mb-2">
              Kto stworzył tę technologię
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Rozwiązanie zostało opracowane przez naukowca i wynalazcę
              zajmującego się komunikacją biologiczną oraz fototerapią.
              Technologia jest rozwijana od wielu lat w środowisku badań nad
              regeneracją organizmu.
            </p>
          </div>

          <div className="p-6 border border-gray-700 rounded-xl">
            <h3 className="text-lg font-semibold mb-2">
              Co możesz zrobić dalej
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Jeśli chcesz dowiedzieć się więcej, sprawdź materiały wysłane na
              Twój email lub przejdź do kolejnego kroku, aby zobaczyć jak ta
              technologia jest stosowana w praktyce.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
