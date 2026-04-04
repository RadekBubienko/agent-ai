import ScrollCTA from "@/components/ScrollCTA";
import VideoPlayer from "@/components/VideoPlayer";
import ViewCounter from "@/components/ViewCounter";

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
        <h1 className="mt-12 text-3xl font-light">Pierwsze wprowadzenie</h1>

        <p className="text-gray-300">
          Dziękujemy za zapis. Wysłaliśmy również materiały na Twój email.
        </p>

        <p className="text-gray-300">
          Obejrzyj krótkie wyjaśnienie technologii, o której właśnie
          przeczytałeś.
        </p>

        <ViewCounter />
        <VideoPlayer />

        <p className="mb-5 text-right text-sm text-gray-400">
          Kliknij, aby włączyć dźwięk
        </p>

        <p className="text-sm text-gray-400">
          W międzyczasie sprawdź również wiadomość, którą wysłaliśmy na Twój
          email.
        </p>

        <section className="mt-12 mb-12 grid gap-8 text-left md:grid-cols-3">
          <div className="rounded-xl border border-gray-700 p-6">
            <h3 className="mb-2 text-lg font-semibold">Dlaczego to działa</h3>
            <p className="text-sm leading-relaxed text-gray-400">
              Organizm reaguje nie tylko na substancje, ale również na sygnały.
              Niektóre technologie wykorzystują światło i bodźce fizyczne, aby
              aktywować naturalne procesy biologiczne.
            </p>
          </div>

          <div className="rounded-xl border border-gray-700 p-6">
            <h3 className="mb-2 text-lg font-semibold">
              Kto stworzył tę technologię
            </h3>
            <p className="text-sm leading-relaxed text-gray-400">
              Rozwiązanie zostało opracowane przez naukowca i wynalazcę
              zajmującego się komunikacją biologiczną oraz fototerapią.
              Technologia jest rozwijana od wielu lat w środowisku badań nad
              regeneracją organizmu.
            </p>
          </div>

          <div className="rounded-xl border border-gray-700 p-6">
            <h3 className="mb-2 text-lg font-semibold">
              Co możesz zrobić dalej
            </h3>
            <p className="text-sm leading-relaxed text-gray-400">
              Jeśli chcesz dowiedzieć się więcej, sprawdź materiały wysłane na
              Twój email lub przejdź do kolejnego kroku, aby zobaczyć, jak ta
              technologia jest stosowana w praktyce.
            </p>
          </div>
        </section>

        <ScrollCTA />
      </div>
    </main>
  );
}
