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
      </div>
    </main>
  );
}
